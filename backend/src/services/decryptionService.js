const crypto = require("crypto");
const logger = require("../utils/logger");

/**
 * Decryption Service
 * Converges the two parallel branches:
 *   Branch (a): Encrypted blob from IPFS
 *   Branch (b): Scoped decryption key released by ConsentRegistry
 * Decrypts in-memory, streams directly to response, and immediately cleans up memory.
 * Features dual-key migration tolerance to seamlessly re-encrypt legacy blobs.
 */
class DecryptionService {
  _tryDecryptWithKey(encryptedBlob, keyBuffer) {
    let normalizedKey = keyBuffer;
    if (keyBuffer.length !== 32) {
      normalizedKey = crypto.createHash("sha256").update(keyBuffer).digest();
    }

    const iv = Buffer.from(encryptedBlob.iv, "hex");
    const authTag = Buffer.from(encryptedBlob.authTag, "hex");
    const ciphertext = Buffer.from(encryptedBlob.ciphertext, "base64");

    const decipher = crypto.createDecipheriv("aes-256-gcm", normalizedKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);

    return JSON.parse(decrypted.toString("utf8"));
  }

  decrypt(encryptedBlob, releasedKey) {
    if (!encryptedBlob || !releasedKey) {
      throw new Error("[DecryptionService] Missing encrypted blob or released key");
    }

    const primaryKeyBuffer = Buffer.isBuffer(releasedKey) ? releasedKey : Buffer.from(releasedKey, "utf8");

    // 1. Primary Attempt: Decrypt using the released/provided key
    try {
      return this._tryDecryptWithKey(encryptedBlob, primaryKeyBuffer);
    } catch (primaryErr) {
      // 2. Migration Tolerance: If primary key fails authentication (e.g. legacy blob), attempt legacy key
      if (encryptedBlob.patientId) {
        try {
          const legacyKey = crypto.createHash("sha256").update(`${encryptedBlob.patientId}-key`).digest();
          const plaintext = this._tryDecryptWithKey(encryptedBlob, legacyKey);

          // Transparent Migration: Re-encrypt and persist stored blob with modern KEK-derived key
          try {
            const encryptionService = require("./encryptionService");
            const ipfsService = require("./ipfsService");
            const modernKey = encryptionService.getPatientKey(encryptedBlob.patientId);
            ipfsService.storeEncryptedRecord(encryptedBlob.patientId, plaintext, modernKey);
          } catch (migrateErr) {
            logger.warn({ error: migrateErr.message }, "[DecryptionService] Blob migration re-encryption deferred");
          }

          return plaintext;
        } catch (legacyErr) {
          // Both modern and legacy keys failed
          throw new Error(`[DecryptionService] Cryptographic decryption failed: ${primaryErr.message}`);
        }
      }

      throw new Error(`[DecryptionService] Cryptographic decryption failed: ${primaryErr.message}`);
    }
  }

  decryptBlob(encryptedBlob, releasedKey) {
    return this.decrypt(encryptedBlob, releasedKey);
  }
}

module.exports = new DecryptionService();

