const crypto = require("crypto");
const emailService = require("./emailService");

// Standard Base32 Alphabet (RFC 4648)
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(input) {
  const cleanInput = input.toUpperCase().replace(/=+$/, "").replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (let i = 0; i < cleanInput.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleanInput[i]);
    if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

class TwoFactorService {
  constructor() {
    // In-memory store for active challenges: key -> { type, otpHash, attempts, maxAttempts, expiresAt, context }
    this.challenges = new Map();
  }

  // ==========================================
  // 1. RFC 6238 TOTP (Authenticator App)
  // ==========================================

  /**
   * Generates a new cryptographically secure 20-byte base32 TOTP secret and otpauth URI.
   */
  generateTotpSecret(accountName = "clinician@hospital.lk", issuer = "MedGuard EHR") {
    const randomBytes = crypto.randomBytes(20);
    const secret = base32Encode(randomBytes);
    const encodedIssuer = encodeURIComponent(issuer);
    const encodedAccount = encodeURIComponent(accountName);
    const otpauthUri = `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;

    return {
      secret,
      otpauthUri,
      otpauthUrl: otpauthUri
    };
  }

  /**
   * Generates a 6-digit TOTP code for a given timestamp counter.
   */
  _computeTotp(secretBase32, counter) {
    const key = base32Decode(secretBase32);
    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64BE(BigInt(counter));

    const hmac = crypto.createHmac("sha1", key).update(buffer).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const otp = (binary % 1000000).toString().padStart(6, "0");
    return otp;
  }

  generateTotpCode(secretBase32, timestamp = Date.now()) {
    const counter = Math.floor(timestamp / 1000 / 30);
    return this._computeTotp(secretBase32, counter);
  }

  /**
   * Verifies an RFC 6238 TOTP token with a ±1 window (tolerating ±30s clock drift).
   * Supports either (token, secret) or (secret, token) argument order.
   * Uses timingSafeEqual to prevent timing attacks.
   */
  verifyTotp(arg1, arg2) {
    if (!arg1 || !arg2) return false;
    let token = String(arg1).trim();
    let secret = String(arg2).trim();
    if (!/^[0-9]{6}$/.test(token) && /^[0-9]{6}$/.test(secret)) {
      const temp = token;
      token = secret;
      secret = temp;
    }
    if (!/^[0-9]{6}$/.test(token)) return false;

    const currentCounter = Math.floor(Date.now() / 1000 / 30);
    const inputBuf = Buffer.from(token);

    // Window: -1, 0, +1 time steps (±30 seconds)
    for (let offset = -1; offset <= 1; offset++) {
      const expectedCode = this._computeTotp(secret, currentCounter + offset);
      const expectedBuf = Buffer.from(expectedCode);

      if (inputBuf.length === expectedBuf.length && crypto.timingSafeEqual(inputBuf, expectedBuf)) {
        return true;
      }
    }

    return false;
  }

  // ==========================================
  // 2. Email OTP Challenge with Rate Limiting
  // ==========================================

  /**
   * Issues a new 6-digit email OTP challenge.
   * Rate limited: 3 attempts allowed, 5-minute TTL.
   */
  async issueEmailOtpChallenge(userId, recipientEmail, userName = "Clinician", context = {}) {
    const cleanUserId = String(userId).toLowerCase();
    const cleanEmail = (recipientEmail || "").trim().toLowerCase();

    // Generate cryptographically secure random 6-digit OTP (100000 to 999999)
    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes TTL

    const challenge = {
      type: "EMAIL_OTP",
      userId: cleanUserId,
      email: cleanEmail,
      otpHash,
      attempts: 0,
      maxAttempts: 3,
      expiresAt,
      context
    };

    this.challenges.set(cleanUserId, challenge);

    // Dispatch via nodemailer email service
    await emailService.send2FAOtp(cleanUserId, cleanEmail, userName, context);

    return {
      success: true,
      maskedEmail: emailService.maskEmail(cleanEmail),
      expiresAt: new Date(expiresAt).toISOString()
    };
  }

  /**
   * Verifies an email OTP challenge.
   * Rate limited to max 3 attempts. Upon 3 failures, challenge is revoked.
   */
  verifyEmailOtp(userId, code) {
    const cleanUserId = String(userId).toLowerCase();
    const challenge = this.challenges.get(cleanUserId);

    if (!challenge) {
      return {
        valid: false,
        error: "No active verification challenge found. Please request a new verification code."
      };
    }

    if (Date.now() > challenge.expiresAt) {
      this.challenges.delete(cleanUserId);
      return {
        valid: false,
        error: "Verification code has expired (5-minute limit exceeded). Please request a new code."
      };
    }

    challenge.attempts += 1;

    if (challenge.attempts > challenge.maxAttempts) {
      this.challenges.delete(cleanUserId);
      return {
        valid: false,
        error: "Too many failed attempts. For security, this verification code has been revoked. Please request a new code."
      };
    }

    const inputCode = String(code || "").trim();
    if (!/^[0-9]{6}$/.test(inputCode)) {
      return {
        valid: false,
        remainingAttempts: challenge.maxAttempts - challenge.attempts,
        error: "Verification code must be exactly 6 numerical digits."
      };
    }

    const inputHash = crypto.createHash("sha256").update(inputCode).digest("hex");
    const inputBuf = Buffer.from(inputHash);
    const expectedBuf = Buffer.from(challenge.otpHash);

    const isMatch = inputBuf.length === expectedBuf.length && crypto.timingSafeEqual(inputBuf, expectedBuf);

    if (!isMatch) {
      const remaining = challenge.maxAttempts - challenge.attempts;
      if (remaining <= 0) {
        this.challenges.delete(cleanUserId);
        return {
          valid: false,
          error: "Incorrect code. Maximum verification attempts exceeded. Code has been revoked."
        };
      }
      return {
        valid: false,
        remainingAttempts: remaining,
        error: `Incorrect verification code. ${remaining} attempt(s) remaining.`
      };
    }

    // Success: single-use invalidation
    this.challenges.delete(cleanUserId);
    return {
      valid: true,
      userId: challenge.userId,
      email: challenge.email,
      context: challenge.context
    };
  }

  /**
   * Testing helper to inspect active OTP when NODE_ENV !== "production".
   */
  _getOtpForTest(userId) {
    if (process.env.NODE_ENV !== "production") {
      const emailStored = emailService.getStoredOtpForTest(userId);
      if (emailStored) return emailStored;
    }
    return null;
  }
}

module.exports = new TwoFactorService();
