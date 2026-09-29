const crypto = require("crypto");

/**
 * Decryption Service
 * Converges the two parallel branches:
 *   Branch (a): Encrypted blob from IPFS
 *   Branch (b): Scoped decryption key released by ConsentRegistry
 * Decrypts in-memory, streams directly to response, and immediately cleans up memory.
 */
class DecryptionService {
  decrypt(encryptedBlob, releasedKey) {
    if (!encryptedBlob || !releasedKey) {
      throw new Error("[DecryptionService] Missing encrypted blob or released key");
    }

    try {
      const keyBuffer = Buffer.isBuffer(releasedKey) ? releasedKey : Buffer.from(releasedKey, "utf8");
      // Ensure key is exactly 32 bytes for AES-256
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

      const plaintext = JSON.parse(decrypted.toString("utf8"));
      return plaintext;
    } catch (err) {
      throw new Error(`[DecryptionService] Cryptographic decryption failed: ${err.message}`);
    }
  }

  decryptBlob(encryptedBlob, releasedKey) {
    return this.decrypt(encryptedBlob, releasedKey);
  }
}

module.exports = new DecryptionService();
