const { expect } = require("chai");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const encryptionService = require("../src/services/encryptionService");
const decryptionService = require("../src/services/decryptionService");
const ipfsService = require("../src/services/ipfsService");
const ehrDatabase = require("../src/services/ehrDatabase");
const { getAvailableMigrations } = require("../../scripts/db-migrate");
const { verifyChecksum } = require("../../scripts/db-restore");

describe("Phase 3 - Database, Storage, Migrations & Field Encryption", function () {
  const testPatientId = "patient-p3-test";
  const testNic = "199012345678";
  const testPhone = "+94771234567";

  describe("1. Master KEK & AES-256-GCM Envelope Encryption", function () {
    it("should derive deterministic 256-bit patient keys using Master KEK", function () {
      const key1 = encryptionService.getPatientKey(testPatientId);
      const key2 = encryptionService.getPatientKey(testPatientId);
      const diffKey = encryptionService.getPatientKey("patient-different-id");

      expect(Buffer.isBuffer(key1)).to.be.true;
      expect(key1.length).to.equal(32);
      expect(key1.toString("hex")).to.equal(key2.toString("hex"));
      expect(key1.toString("hex")).to.not.equal(diffKey.toString("hex"));
    });

    it("should encrypt and unwrap patient DEKs using Master KEK", function () {
      const rawDek = encryptionService.generateDek();
      expect(rawDek.length).to.equal(32);

      const encryptedDek = encryptionService.encryptDek(rawDek);
      expect(encryptedDek).to.have.property("ciphertext");
      expect(encryptedDek).to.have.property("iv");
      expect(encryptedDek).to.have.property("tag");

      const unwrapped = encryptionService.decryptDek(encryptedDek);
      expect(unwrapped.toString("hex")).to.equal(rawDek.toString("hex"));
    });

    it("should encrypt and decrypt demographic fields (NIC, Phone) using patient DEK", function () {
      const dek = encryptionService.generateDek();
      const encryptedField = encryptionService.encryptField(testPhone, dek);

      expect(encryptedField).to.have.property("ciphertext");
      expect(encryptedField).to.have.property("iv");
      expect(encryptedField).to.have.property("tag");

      const decryptedPhone = encryptionService.decryptField(encryptedField, dek);
      expect(decryptedPhone).to.equal(testPhone);
    });

    it("should reject tampered ciphertext with cryptographic authentication error", function () {
      const dek = encryptionService.generateDek();
      const encrypted = encryptionService.encryptField("Confidential Clinical Note", dek);

      // Tamper with the ciphertext
      const tamperedCiphertext = Buffer.from(encrypted.ciphertext, "hex");
      tamperedCiphertext[0] ^= 0xff; // Flip bits
      const tamperedObj = {
        ...encrypted,
        ciphertext: tamperedCiphertext.toString("hex")
      };

      expect(() => {
        encryptionService.decryptField(tamperedObj, dek);
      }).to.throw();
    });
  });

  describe("2. Searchable Blind Index (HMAC-SHA256)", function () {
    it("should compute deterministic blind index hashes for exact-match searching", function () {
      const hash1 = encryptionService.computeBlindIndex("199012345678");
      const hash2 = encryptionService.computeBlindIndex("199012345678");
      const hashDiff = encryptionService.computeBlindIndex("198598765432");

      expect(hash1).to.be.a("string");
      expect(hash1.length).to.equal(64);
      expect(hash1).to.equal(hash2);
      expect(hash1).to.not.equal(hashDiff);
    });

    it("should normalize identifiers for whitespace and case before hashing", function () {
      const hashA = encryptionService.computeBlindIndex("  199012345678V  ");
      const hashB = encryptionService.computeBlindIndex("199012345678v");
      expect(hashA).to.equal(hashB);
    });

    it("should lookup patient by blind index through ehrDatabase.getPatientByIdentifier", function () {
      const dummyId = `patient-blind-${Date.now()}`;
      const uniqueNic = `999${Date.now()}V`;

      ehrDatabase.addPatient({
        id: dummyId,
        name: "Blind Index Test Subject",
        nic: uniqueNic,
        bloodGroup: "B+"
      });

      const foundByNic = ehrDatabase.getPatientByIdentifier(uniqueNic);
      expect(foundByNic).to.not.be.null;
      expect(foundByNic.id).to.equal(dummyId);
      expect(foundByNic.nicHash).to.equal(encryptionService.computeBlindIndex(uniqueNic));

      // Clean up test patient so database retains only synthetic patients
      ehrDatabase.deletePatient(dummyId);
    });
  });

  describe("3. Dual-Key Migration Tolerance & Transparent Re-encryption", function () {
    it("should seamlessly decrypt legacy blobs encrypted with static key and re-encrypt with KEK key", function () {
      const legacyId = `legacy-patient-${Date.now()}`;
      const legacyKey = crypto.createHash("sha256").update(`${legacyId}-key`).digest();
      const modernKey = encryptionService.getPatientKey(legacyId);

      const clinicalRecord = {
        id: legacyId,
        patientName: "Legacy Subject",
        bloodGroup: "O-",
        allergies: ["Sulfa"]
      };

      // Store blob encrypted with legacy key
      const legacyBlob = ipfsService.storeEncryptedRecord(legacyId, clinicalRecord, legacyKey);

      // Decrypt using DecryptionService providing modern key as primary
      // System must detect GCM auth failure on primary key, fall back to legacy key, and migrate stored blob
      const decrypted = decryptionService.decrypt(legacyBlob, modernKey);
      expect(decrypted.patientName).to.equal("Legacy Subject");
      expect(decrypted.bloodGroup).to.equal("O-");

      // Verify that stored blob on disk has been migrated to modern key
      const updatedBlob = ipfsService.blobStore.get(legacyId);
      expect(updatedBlob).to.not.be.undefined;

      // Verify modern key now directly decrypts the updated blob without fallback
      const directDecrypted = decryptionService._tryDecryptWithKey(updatedBlob, modernKey);
      expect(directDecrypted.patientName).to.equal("Legacy Subject");

      // Clean up test file
      const legacyFile = path.join(__dirname, `../data/ipfs_storage/${legacyId}.json`);
      if (fs.existsSync(legacyFile)) {
        try { fs.unlinkSync(legacyFile); } catch {}
      }
    });
  });

  describe("4. PostgreSQL Migration DDL & Runner Tooling", function () {
    it("should discover valid migration files in repository", function () {
      const migrations = getAvailableMigrations();
      expect(migrations).to.be.an("array");
      expect(migrations.length).to.be.greaterThan(0);

      const m1 = migrations.find(m => m.version === "001");
      expect(m1).to.not.be.undefined;
      expect(m1.upFile).to.equal("001_initial_schema.sql");
      expect(m1.downFile).to.equal("001_initial_schema_down.sql");
    });

    it("should contain all required production tables in 001_initial_schema.sql", function () {
      const schemaSql = fs.readFileSync(
        path.join(__dirname, "../src/db/migrations/001_initial_schema.sql"),
        "utf8"
      );

      const requiredTables = [
        "schema_migrations",
        "users",
        "patients",
        "encounters",
        "prescriptions",
        "vitals",
        "audit_ledger",
        "break_glass_events",
        "staff_devices"
      ];

      for (const table of requiredTables) {
        expect(schemaSql).to.include(`CREATE TABLE IF NOT EXISTS ${table}`);
      }

      // Verify field encryption and blind index columns
      expect(schemaSql).to.include("nic_hash VARCHAR(64) UNIQUE");
      expect(schemaSql).to.include("nic_encrypted JSONB");
      expect(schemaSql).to.include("encrypted_dek JSONB");
    });
  });

  describe("5. Database Backup & Tamper-Evident Verification", function () {
    const backupDir = path.join(__dirname, "../../backups");

    it("should verify SHA-256 checksum for existing backup archives", function () {
      if (!fs.existsSync(backupDir)) return this.skip();

      const files = fs.readdirSync(backupDir).filter(f => f.endsWith(".json"));
      if (files.length === 0) return this.skip();

      const testFile = path.join(backupDir, files[0]);
      const result = verifyChecksum(testFile);
      expect(result.ok).to.be.true;
      expect(result.hash).to.be.a("string");
    });

    it("should detect corrupted or tampered backup files via checksum mismatch", function () {
      const tempJson = path.join(backupDir, "temp-test-tamper.json");
      const tempSha = path.join(backupDir, "temp-test-tamper.sha256");

      fs.writeFileSync(tempJson, JSON.stringify({ test: "original data" }), "utf8");
      const validHash = crypto.createHash("sha256").update(fs.readFileSync(tempJson)).digest("hex");
      fs.writeFileSync(tempSha, `${validHash}  temp-test-tamper.json\n`, "utf8");

      // Verify original matches
      expect(verifyChecksum(tempJson).ok).to.be.true;

      // Tamper with JSON file
      fs.writeFileSync(tempJson, JSON.stringify({ test: "tampered malicious data" }), "utf8");

      // Verify checksum now fails
      const tamperedResult = verifyChecksum(tempJson);
      expect(tamperedResult.ok).to.be.false;
      expect(tamperedResult.reason).to.include("Checksum mismatch");

      // Clean up temp test files
      if (fs.existsSync(tempJson)) fs.unlinkSync(tempJson);
      if (fs.existsSync(tempSha)) fs.unlinkSync(tempSha);
    });
  });

  describe("6. Legacy Account Security & Non-Destructive Disablement", function () {
    it("should identify legacy accounts without altering data during DRY RUN", function () {
      const dbPath = path.join(__dirname, "../data/ehr_database.json");
      const rawBefore = fs.readFileSync(dbPath, "utf8");

      // Run cleanup script in default DRY RUN mode
      const { execSync } = require("child_process");
      const output = execSync("node scripts/ops/cleanup-legacy.js", {
        cwd: path.join(__dirname, "../.."),
        encoding: "utf8"
      });

      expect(output).to.include("DRY RUN");
      expect(output).to.not.include("EXECUTION SUCCESS");

      // File must be completely untouched
      const rawAfter = fs.readFileSync(dbPath, "utf8");
      expect(rawBefore).to.equal(rawAfter);
    });
  });
});
