const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const BCRYPT_SALT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 12;

class PasswordService {
  /**
   * Enforces OWASP ASVS Level 2 password policy:
   * - Minimum 12 characters
   * - Must contain at least one uppercase letter
   * - Must contain at least one lowercase letter
   * - Must contain at least one digit
   * - Must contain at least one special character
   */
  validatePasswordPolicy(password) {
    if (!password || typeof password !== "string") {
      return {
        valid: false,
        error: "Password must be a non-empty string."
      };
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return {
        valid: false,
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
      };
    }

    if (!/[A-Z]/.test(password)) {
      return {
        valid: false,
        error: "Password must contain at least one uppercase letter (A-Z)."
      };
    }

    if (!/[a-z]/.test(password)) {
      return {
        valid: false,
        error: "Password must contain at least one lowercase letter (a-z)."
      };
    }

    if (!/[0-9]/.test(password)) {
      return {
        valid: false,
        error: "Password must contain at least one numerical digit (0-9)."
      };
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      return {
        valid: false,
        error: "Password must contain at least one special symbol (e.g. !@#$%^&*)."
      };
    }

    return { valid: true, error: null };
  }

  /**
   * Hashes a password using bcrypt with cost factor 12.
   */
  async hashPassword(password) {
    const policy = this.validatePasswordPolicy(password);
    if (!policy.valid) {
      throw new Error(policy.error);
    }
    return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  }

  /**
   * Timing-safe verification of plaintext password against stored hash or legacy value.
   */
  async comparePassword(plaintext, storedHashOrPlain) {
    if (!plaintext || !storedHashOrPlain) return false;

    // Check if stored value is a bcrypt hash ($2a$ or $2b$)
    if (storedHashOrPlain.startsWith("$2a$") || storedHashOrPlain.startsWith("$2b$")) {
      return bcrypt.compare(plaintext, storedHashOrPlain);
    }

    // Legacy plaintext support with timing-safe SHA-256 buffer comparison
    const plainBuf = crypto.createHash("sha256").update(plaintext).digest();
    const storedBuf = crypto.createHash("sha256").update(storedHashOrPlain).digest();
    return crypto.timingSafeEqual(plainBuf, storedBuf);
  }

  /**
   * Returns true if the stored value is not a bcrypt hash with cost factor >= 12.
   */
  needsRehash(storedHash) {
    if (!storedHash) return true;
    if (!storedHash.startsWith("$2a$") && !storedHash.startsWith("$2b$")) return true;
    
    // Check cost factor in bcrypt prefix (e.g. $2a$12$...)
    const parts = storedHash.split("$");
    if (parts.length >= 3) {
      const cost = parseInt(parts[2], 10);
      if (isNaN(cost) || cost < BCRYPT_SALT_ROUNDS) return true;
    }
    return false;
  }
}

module.exports = new PasswordService();
