const crypto = require("crypto");

class EncryptionService {
  constructor() {
    this.algorithm = "aes-256-gcm";
    this.ivLength = 12; // 96 bits for GCM
    this.tagLength = 16; // 128 bits authentication tag
    this._initMasterKeys();
  }

  _initMasterKeys() {
    const isProd = process.env.NODE_ENV === "production";
    const rawKek = process.env.MASTER_ENCRYPTION_KEY;
    const rawHmacSecret = process.env.IDENTIFIER_HMAC_SECRET;

    if (rawKek) {
      if (rawKek.length !== 64) {
        throw new Error("MASTER_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).");
      }
      this.kek = Buffer.from(rawKek, "hex");
    } else {
      if (isProd) {
        throw new Error("Production halt: MASTER_ENCRYPTION_KEY environment variable is mandatory for medical PHI encryption.");
      }
      // Deterministic development fallback key
      this.kek = crypto.createHash("sha256").update("medguard-dev-master-kek-2026").digest();
    }

    if (rawHmacSecret) {
      this.hmacSecret = Buffer.from(rawHmacSecret, "utf-8");
    } else {
      if (isProd) {
        throw new Error("Production halt: IDENTIFIER_HMAC_SECRET environment variable is mandatory for searchable patient blind index.");
      }
      this.hmacSecret = Buffer.from("medguard-dev-searchable-blind-index-salt", "utf-8");
    }
  }

  /**
   * Generates a unique, cryptographically random 256-bit Data Encryption Key (DEK) for a patient.
   */
  generateDek() {
    return crypto.randomBytes(32);
  }

  /**
   * Derives a cryptographically secure 256-bit AES-GCM record key for a patient using the Master KEK.
   * Eliminates predictable static keys (OWASP ASVS V6).
   */
  getPatientKey(patientId) {
    if (!patientId) throw new Error("patientId is required for key derivation.");
    return crypto.createHmac("sha256", this.kek).update(`medguard-patient-record-dek:${patientId}`).digest();
  }

  /**
   * Encrypts a DEK using the Master Key Encryption Key (KEK) using AES-256-GCM.
   */
  encryptDek(dek) {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, this.kek, iv);
    const encrypted = Buffer.concat([cipher.update(dek), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString("hex"),
      iv: iv.toString("hex"),
      tag: tag.toString("hex")
    };
  }

  /**
   * Decrypts an encrypted DEK using the Master KEK.
   */
  decryptDek(encryptedDek) {
    if (!encryptedDek || !encryptedDek.ciphertext || !encryptedDek.iv || !encryptedDek.tag) {
      throw new Error("Invalid encrypted DEK structure.");
    }

    const iv = Buffer.from(encryptedDek.iv, "hex");
    const tag = Buffer.from(encryptedDek.tag, "hex");
    const decipher = crypto.createDecipheriv(this.algorithm, this.kek, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedDek.ciphertext, "hex")),
      decipher.final()
    ]);

    return decrypted;
  }

  /**
   * Encrypts plaintext data using a patient-specific DEK with AES-256-GCM.
   */
  encryptField(plaintext, dek) {
    if (plaintext === null || plaintext === undefined) return null;
    const strValue = typeof plaintext === "object" ? JSON.stringify(plaintext) : String(plaintext);
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, dek, iv);
    const encrypted = Buffer.concat([cipher.update(strValue, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString("hex"),
      iv: iv.toString("hex"),
      tag: tag.toString("hex")
    };
  }

  /**
   * Decrypts ciphertext using the patient's DEK with authenticated AES-256-GCM verification.
   */
  decryptField(encryptedObj, dek) {
    if (!encryptedObj) return null;
    if (typeof encryptedObj === "string") {
      // Legacy plaintext support during migration
      return encryptedObj;
    }

    const { ciphertext, iv, tag } = encryptedObj;
    if (!ciphertext || !iv || !tag) return null;

    const decipher = crypto.createDecipheriv(
      this.algorithm,
      dek,
      Buffer.from(iv, "hex")
    );
    decipher.setAuthTag(Buffer.from(tag, "hex"));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "hex")),
      decipher.final()
    ]);

    const resultStr = decrypted.toString("utf8");
    try {
      return JSON.parse(resultStr);
    } catch {
      return resultStr;
    }
  }

  /**
   * Computes a deterministic HMAC-SHA256 blind index hash for exact-match searches.
   * Protects patient identifiers (e.g. NIC) against cleartext exposure in database indexes.
   */
  computeBlindIndex(identifier) {
    if (!identifier) return null;
    const normalized = String(identifier).trim().toUpperCase();
    return crypto.createHmac("sha256", this.hmacSecret).update(normalized).digest("hex");
  }

  /**
   * Encrypts sensitive medical fields on a patient record before storage.
   */
  encryptPatientRecord(patient, rawDek = null) {
    const dek = rawDek || this.generateDek();
    const encryptedDek = this.encryptDek(dek);

    const encryptedPatient = {
      ...patient,
      nicHash: patient.nic ? this.computeBlindIndex(patient.nic) : null,
      encryptedDek,
      // Encrypt sensitive demographic & contact PHI fields
      nicEncrypted: patient.nic ? this.encryptField(patient.nic, dek) : null,
      phoneEncrypted: patient.phone ? this.encryptField(patient.phone, dek) : null
    };

    // When writing to encrypted persistence, clear raw PHI
    delete encryptedPatient.nic;
    delete encryptedPatient.phone;

    return {
      encryptedRecord: encryptedPatient,
      dek
    };
  }

  /**
   * Decrypts sensitive medical fields on an encrypted patient record upon authorized release.
   */
  decryptPatientRecord(encryptedPatient, explicitDek = null) {
    if (!encryptedPatient) return null;

    let dek = explicitDek;
    if (!dek && encryptedPatient.encryptedDek) {
      dek = this.decryptDek(encryptedPatient.encryptedDek);
    }

    if (!dek) {
      // Record not encrypted or key unavailable; return as-is
      return encryptedPatient;
    }

    const decrypted = { ...encryptedPatient };
    if (encryptedPatient.nicEncrypted) {
      decrypted.nic = this.decryptField(encryptedPatient.nicEncrypted, dek);
    }
    if (encryptedPatient.phoneEncrypted) {
      decrypted.phone = this.decryptField(encryptedPatient.phoneEncrypted, dek);
    }

    return decrypted;
  }
}

module.exports = new EncryptionService();
