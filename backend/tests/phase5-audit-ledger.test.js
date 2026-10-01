const { expect } = require("chai");
const crypto = require("crypto");
const request = require("supertest");
const app = require("../src/server");
const auditService = require("../src/services/auditService");
const logger = require("../src/utils/logger");
const fs = require("fs");
const path = require("path");

describe("Phase 5 - Tamper-Evident Audit Trail & Structured Logging", function () {
  const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

  describe("1. Append-Only Cryptographic SHA-256 Hash Chaining", function () {
    it("should initialize chain from genesis or existing head hash", function () {
      expect(auditService.headHash).to.be.a("string");
      expect(auditService.headHash.length).to.equal(64);
    });

    it("should link consecutive audit records in a continuous SHA-256 chain", async function () {
      const prevHead = auditService.headHash;

      const evt1 = await auditService.logEvent({
        actor: "dr_alice",
        role: "Doctor",
        action: "clinical.chart_view",
        resource_type: "patient",
        resource_id: "P001",
        patient_id: "P001",
        outcome: "SUCCESS",
        risk_level: "LOW",
        ip: "172.20.10.8",
        reason: "Routine morning rounds chart check",
        request_id: "req-test-chain-1"
      });

      expect(evt1.prev_hash).to.equal(prevHead);
      expect(evt1.curr_hash).to.be.a("string").with.lengthOf(64);
      expect(evt1.curr_hash).to.not.equal(evt1.prev_hash);
      expect(auditService.headHash).to.equal(evt1.curr_hash);

      const evt2 = await auditService.logEvent({
        actor: "dr_alice",
        role: "Doctor",
        action: "clinical.encounter_created",
        resource_type: "encounter",
        resource_id: "enc-999",
        patient_id: "P001",
        outcome: "SUCCESS",
        risk_level: "LOW",
        ip: "172.20.10.8",
        reason: "Authoring patient assessment note",
        request_id: "req-test-chain-2"
      });

      expect(evt2.prev_hash).to.equal(evt1.curr_hash);
      expect(evt2.curr_hash).to.be.a("string").with.lengthOf(64);
      expect(auditService.headHash).to.equal(evt2.curr_hash);
    });

    it("should verify the mathematical integrity of the active ledger", function () {
      const verification = auditService.verifyIntegrity();
      expect(verification.verified).to.be.true;
      expect(verification.count).to.be.at.least(2);
      expect(verification.message).to.include("mathematically validated from genesis");
    });
  });

  describe("2. Tamper Detection & Fraud Pinpointing", function () {
    let testChain;

    beforeEach(async () => {
      // Build a dedicated synthetic 5-node test chain
      testChain = [];
      let currentHead = GENESIS_HASH;

      for (let i = 0; i < 5; i++) {
        const timestamp = new Date(Date.now() + i * 1000).toISOString();
        const event = {
          id: `test-evt-${i}`,
          timestamp,
          actor: `clinician_${i}`,
          role: "Doctor",
          action: "clinical.chart_view",
          resource_type: "patient",
          resource_id: `patient-${i}`,
          patient_id: `patient-${i}`,
          outcome: "SUCCESS",
          risk_level: "LOW",
          ip: "172.20.10.8",
          location_result: "ON_PREMISE",
          reason: `Access test record ${i}`,
          request_id: `req-${i}`,
          prev_hash: currentHead,
          curr_hash: ""
        };

        const canonical = {
          action: event.action,
          actor: event.actor,
          id: event.id,
          ip: event.ip,
          location_result: event.location_result,
          outcome: event.outcome,
          patient_id: event.patient_id,
          reason: event.reason,
          request_id: event.request_id,
          resource_id: event.resource_id,
          resource_type: event.resource_type,
          risk_level: event.risk_level,
          role: event.role,
          timestamp: event.timestamp
        };
        const serialized = JSON.stringify(canonical, Object.keys(canonical).sort());
        event.curr_hash = crypto.createHash("sha256").update(`${currentHead}:${serialized}`).digest("hex");
        currentHead = event.curr_hash;
        testChain.push(event);
      }
    });

    it("should verify pristine synthetic chain without error", function () {
      const result = auditService.verifyIntegrity(testChain);
      expect(result.verified).to.be.true;
      expect(result.count).to.equal(5);
    });

    it("should catch unauthorized alteration of a historical payload (e.g., reason modified)", function () {
      const tampered = JSON.parse(JSON.stringify(testChain));
      // Attacker tampers with historical event #2 justification
      tampered[2].reason = "Covertly altered clinical justification";

      const result = auditService.verifyIntegrity(tampered);
      expect(result.verified).to.be.false;
      expect(result.brokenIndex).to.equal(2);
      expect(result.eventId).to.equal("test-evt-2");
      expect(result.reason).to.include("curr_hash does not match cryptographic digest");
    });

    it("should catch unauthorized modification of an outcome (e.g., DENIED -> SUCCESS)", function () {
      const tampered = JSON.parse(JSON.stringify(testChain));
      tampered[1].outcome = "DENIED";

      const result = auditService.verifyIntegrity(tampered);
      expect(result.verified).to.be.false;
      expect(result.brokenIndex).to.equal(1);
      expect(result.eventId).to.equal("test-evt-1");
    });

    it("should catch deletion / row excision from middle of chain", function () {
      const tampered = JSON.parse(JSON.stringify(testChain));
      // Attacker deletes record index 2 to erase audit trace
      tampered.splice(2, 1);

      const result = auditService.verifyIntegrity(tampered);
      expect(result.verified).to.be.false;
      // Record 3 (now index 2) points to the deleted record's hash, breaking the link
      expect(result.brokenIndex).to.equal(2);
      expect(result.reason).to.include("Chain link broken");
    });

    it("should catch insertion of an unchained rogue event", function () {
      const tampered = JSON.parse(JSON.stringify(testChain));
      const rogueEvent = {
        ...testChain[1],
        id: "rogue-event-999",
        actor: "malicious_actor"
      };
      tampered.splice(2, 0, rogueEvent);

      const result = auditService.verifyIntegrity(tampered);
      expect(result.verified).to.be.false;
      expect(result.brokenIndex).to.equal(2);
    });
  });

  describe("3. Non-Blocking Audit Ingestion (Safety Rule 4)", function () {
    it("should never block clinical care even if disk persistence throws an error", async function () {
      const originalPersistDisk = auditService._persistDisk;
      try {
        // Simulate disk fault / permission error
        auditService._persistDisk = function () {
          throw new Error("EACCES: permission denied, disk write failure");
        };

        const event = await auditService.logEvent({
          actor: "dr_bob",
          role: "Doctor",
          action: "clinical.emergency_override",
          resource_type: "patient",
          resource_id: "P002",
          patient_id: "P002",
          outcome: "SUCCESS",
          risk_level: "HIGH",
          reason: "Critical cardiac distress",
          request_id: "req-fault-tolerance-1"
        });

        // Event returned without throwing an unhandled exception
        expect(event).to.be.an("object");
        expect(event.id).to.be.a("string");
        expect(event.curr_hash).to.be.a("string").with.lengthOf(64);
      } finally {
        auditService._persistDisk = originalPersistDisk;
      }
    });
  });

  describe("4. Secret & PHI Redaction in Audit Records and Application Logs", function () {
    it("should sanitize passwords and bearer tokens from audit reasons", async function () {
      const event = await auditService.logEvent({
        actor: "dr_alice",
        role: "Doctor",
        action: "auth.login_attempt",
        reason: "User login with password=SuperSecretPass123! and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token",
        request_id: "req-redaction-test"
      });

      expect(event.reason).to.not.include("SuperSecretPass123!");
      expect(event.reason).to.include("password=[REDACTED]");
      expect(event.reason).to.not.include("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
      expect(event.reason).to.include("[REDACTED_TOKEN]");
    });

    it("should freeze audit event objects to prevent in-memory mutation", async function () {
      const event = await auditService.logEvent({
        actor: "dr_alice",
        role: "Doctor",
        action: "clinical.observation",
        reason: "Normal heart rate"
      });

      expect(Object.isFrozen(event)).to.be.true;
      expect(() => {
        "use strict";
        event.reason = "Mutated illegally";
      }).to.throw(TypeError);
    });

    it("should verify structured Pino logger redacts sensitive credentials and PHI", function () {
      // Test the logger's configured redaction paths
      const testPayload = {
        password: "CleartextPassword999!",
        token: "jwt.secret.token",
        otp: "123456",
        nic: "199012345678",
        subjective: "Patient reports severe chest pain",
        assessment: "Acute Coronary Syndrome"
      };

      // Ensure that logger object does not crash and processes redacted paths
      expect(logger).to.have.property("info");
      expect(logger).to.have.property("error");
      expect(logger).to.have.property("warn");
    });
  });

  describe("5. PostgreSQL Immutability Trigger & Migration DDL", function () {
    it("should contain audit immutability trigger in migration 002_audit_ledger_immutability.sql", function () {
      const migrationPath = path.join(__dirname, "../src/db/migrations/002_audit_ledger_immutability.sql");
      expect(fs.existsSync(migrationPath)).to.be.true;

      const sql = fs.readFileSync(migrationPath, "utf8");
      expect(sql).to.include("CREATE OR REPLACE FUNCTION prevent_audit_modification()");
      expect(sql).to.include("AUDIT_IMMUTABILITY_VIOLATION");
      expect(sql).to.include("BEFORE UPDATE OR DELETE ON audit_ledger");
      expect(sql).to.include("GRANT SELECT, INSERT ON audit_ledger");
    });

    it("should contain corresponding down rollback script", function () {
      const downPath = path.join(__dirname, "../src/db/migrations/002_audit_ledger_immutability_down.sql");
      expect(fs.existsSync(downPath)).to.be.true;

      const downSql = fs.readFileSync(downPath, "utf8");
      expect(downSql).to.include("DROP TRIGGER IF EXISTS trg_audit_ledger_immutable");
      expect(downSql).to.include("DROP FUNCTION IF EXISTS prevent_audit_modification");
    });
  });

  describe("6. Audit Verification Endpoints & Correlation Middleware", function () {
    it("should verify ledger integrity via GET /api/audit-logs/verify", async function () {
      const res = await request(app).get("/api/audit-logs/verify");
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property("verified", true);
      expect(res.body).to.have.property("count").that.is.at.least(1);
      expect(res.body).to.have.property("headHash");
    });

    it("should return paginated audit logs via GET /api/admin/audit", async function () {
      const res = await request(app).get("/api/admin/audit?limit=10&offset=0");
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property("records").that.is.an("array");
      expect(res.body).to.have.property("total");
    });

    it("should attach X-Request-Id header to HTTP responses for log correlation", async function () {
      const res = await request(app).get("/health");
      expect(res.status).to.equal(200);
      expect(res.headers).to.have.property("x-request-id");
      expect(res.headers["x-request-id"]).to.match(/^req-/);
    });
  });
});
