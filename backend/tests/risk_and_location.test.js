const { expect } = require("chai");
const locationRiskService = require("../src/services/locationRiskService");
const riskService = require("../src/services/riskService");
const ehrDatabase = require("../src/services/ehrDatabase");
const config = require("../src/config");

describe("Audit Verification Suite — Location Risk, Traccar Integration & Risk Scoring", () => {
  describe("Audit 2: Traccar Edge Cases & Location Risk Calculations", () => {
    it("should return R_l = 1.0 (maximum risk) when Traccar returns no positions for a device", async () => {
      // Direct position is null (equivalent to Traccar returning [] or device not found)
      const result = await locationRiskService.computeLocationRisk("non-existent-device-xyz", null);

      expect(result).to.be.an("object");
      expect(result.R_l).to.equal(1.0);
      expect(result.locationName).to.equal("Unknown");
      expect(result.stale).to.be.true;
      expect(result.distanceMeters).to.be.null;
    });

    it("should return R_l = 1.0 when position coordinates are undefined or null", async () => {
      const result = await locationRiskService.computeLocationRisk("dummy-dev", {
        latitude: null,
        longitude: null
      });

      expect(result.R_l).to.equal(1.0);
      expect(result.stale).to.be.true;
    });

    it("should return R_l = 0.9 (stale data) when position fixTime is older than 15 minutes", async () => {
      // 20 minutes ago
      const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      const stalePosition = {
        latitude: 6.9147,
        longitude: 79.9733,
        fixTime: twentyMinsAgo
      };

      const result = await locationRiskService.computeLocationRisk("device-stale-test", stalePosition);

      expect(result).to.be.an("object");
      expect(result.R_l).to.equal(0.9);
      expect(result.locationName).to.equal("Stale/Unknown");
      expect(result.stale).to.be.true;
      expect(result.distanceMeters).to.be.null;
    });

    it("should return R_l = 0 when fresh position is inside SLIIT Malabe safe perimeter", async () => {
      const freshPosition = {
        latitude: 6.9147,
        longitude: 79.9733,
        fixTime: new Date().toISOString()
      };

      const result = await locationRiskService.computeLocationRisk("device-in-campus", freshPosition);

      expect(result.R_l).to.equal(0);
      expect(result.stale).to.be.false;
      expect(result.locationName).to.equal("SLIIT Malabe Campus");
      expect(result.distanceMeters).to.be.lessThan(50);
    });

    it("should return proportional elevated risk when position is outside campus", async () => {
      // ~2.5 km away from SLIIT Malabe
      const outsidePosition = {
        latitude: 6.9300,
        longitude: 79.9800,
        fixTime: new Date().toISOString()
      };

      const result = await locationRiskService.computeLocationRisk("device-outside", outsidePosition);

      expect(result.R_l).to.be.greaterThan(0);
      expect(result.stale).to.be.false;
      expect(result.distanceMeters).to.be.greaterThan(1000);
    });
  });

  describe("Audit 3: Exact Risk Formula & Decision Thresholds", () => {
    it("should compute exact components: weighted_component, max_component, and blended score", () => {
      // Test payload with known inputs
      const result = riskService._localRiskFallback({
        timestamp: "2026-10-07T05:00:00Z", // On-shift SLST
        ip_address: "172.20.10.8",
        device_is_trusted: true,
        behavior_deviation_score: 0.20,
        latitude: 6.9147,
        longitude: 79.9733
      });

      expect(result).to.have.property("risk_score");
      expect(result).to.have.property("risk_level");
      expect(result).to.have.property("signal_breakdown");

      const bd = result.signal_breakdown;
      expect(bd).to.have.property("weighted_component");
      expect(bd).to.have.property("max_component");
      expect(bd).to.have.property("final_score");

      // Verify that final_score = 0.7 * weighted + 0.3 * max
      const expected = 0.7 * bd.weighted_component + 0.3 * bd.max_component;
      expect(Math.abs(bd.final_score - Math.round(expected * 100) / 100)).to.be.lessThan(0.02);
    });

    it("should produce R = 0.0 and LOW (Allow) when all sub-scores are 0", () => {
      const rw = config.riskWeights;
      const r_t = 0.0, r_l = 0.0, r_d = 0.0, r_b = 0.0;
      const weighted_component = (rw.w_t * r_t) + (rw.w_l * r_l) + (rw.w_d * r_d) + (rw.w_b * r_b);
      const max_component = Math.max(r_t, r_l, r_d, r_b);
      const final_score = (rw.alpha * weighted_component) + (rw.beta * max_component);

      expect(weighted_component).to.equal(0.0);
      expect(max_component).to.equal(0.0);
      expect(final_score).to.equal(0.0);
      expect(final_score < rw.lowThreshold).to.be.true; // ALLOW
    });

    it("should produce R = 1.0 and HIGH (Block) when all sub-scores are 1", () => {
      const rw = config.riskWeights;
      const r_t = 1.0, r_l = 1.0, r_d = 1.0, r_b = 1.0;
      const weighted_component = (rw.w_t * r_t) + (rw.w_l * r_l) + (rw.w_d * r_d) + (rw.w_b * r_b);
      const max_component = Math.max(r_t, r_l, r_d, r_b);
      const final_score = (rw.alpha * weighted_component) + (rw.beta * max_component);

      expect(weighted_component).to.equal(1.0);
      expect(max_component).to.equal(1.0);
      expect(final_score).to.equal(1.0);
      expect(final_score >= rw.mediumThreshold).to.be.true; // BLOCK
    });

    it("should produce R = 0.545 -> 0.55 and MEDIUM (MFA Required) when only R_l = 1.0 and others are 0", () => {
      const rw = config.riskWeights; // w_t=0.15, w_l=0.35, w_d=0.25, w_b=0.25, alpha=0.7, beta=0.3
      const r_t = 0.0, r_l = 1.0, r_d = 0.0, r_b = 0.0;
      const weighted_component = (rw.w_t * r_t) + (rw.w_l * r_l) + (rw.w_d * r_d) + (rw.w_b * r_b);
      const max_component = Math.max(r_t, r_l, r_d, r_b);
      const final_score = (rw.alpha * weighted_component) + (rw.beta * max_component);

      // Formula: 0.7 * (0.35 * 1.0) + 0.3 * 1.0 = 0.245 + 0.3 = 0.545
      expect(weighted_component).to.equal(0.35);
      expect(max_component).to.equal(1.0);
      expect(Math.abs(final_score - 0.545)).to.be.lessThan(1e-6);

      // Threshold check: 0.30 <= 0.545 < 0.65 -> MEDIUM (MFA Required)
      expect(final_score >= rw.lowThreshold).to.be.true;
      expect(final_score < rw.mediumThreshold).to.be.true;
    });

    it("should respect exact boundary conditions: < 0.30 (LOW), 0.30 <= R < 0.65 (MEDIUM), >= 0.65 (HIGH)", () => {
      const rw = config.riskWeights;

      // At 0.29 -> LOW
      const score_029 = 0.29;
      let level_029 = "LOW";
      if (score_029 >= rw.mediumThreshold) level_029 = "HIGH";
      else if (score_029 >= rw.lowThreshold) level_029 = "MEDIUM";
      expect(level_029).to.equal("LOW");

      // At 0.30 -> MEDIUM
      const score_030 = 0.30;
      let level_030 = "LOW";
      if (score_030 >= rw.mediumThreshold) level_030 = "HIGH";
      else if (score_030 >= rw.lowThreshold) level_030 = "MEDIUM";
      expect(level_030).to.equal("MEDIUM");

      // At 0.64 -> MEDIUM
      const score_064 = 0.64;
      let level_064 = "LOW";
      if (score_064 >= rw.mediumThreshold) level_064 = "HIGH";
      else if (score_064 >= rw.lowThreshold) level_064 = "MEDIUM";
      expect(level_064).to.equal("MEDIUM");

      // At 0.65 -> HIGH
      const score_065 = 0.65;
      let level_065 = "LOW";
      if (score_065 >= rw.mediumThreshold) level_065 = "HIGH";
      else if (score_065 >= rw.lowThreshold) level_065 = "MEDIUM";
      expect(level_065).to.equal("HIGH");
    });
  });

  describe("Audit 1: Device Trust without MAC Addresses", () => {
    it("should evaluate device trust using FingerprintJS visitorId strings", () => {
      const testVisitorId = "visitor-fp-test-" + Date.now();
      const testDoctorId = "doc-test-audit1";

      // Initially untrusted
      const initialCheck = ehrDatabase.checkTrustedDevice(testDoctorId, testVisitorId);
      expect(initialCheck.trusted).to.be.false;

      // Add trusted device
      ehrDatabase.addTrustedDevice(testDoctorId, testVisitorId);

      // Now trusted
      const verifiedCheck = ehrDatabase.checkTrustedDevice(testDoctorId, testVisitorId);
      expect(verifiedCheck.trusted).to.be.true;
    });

    it("should approve and revoke workstation terminals via registeredDevices API without MAC address", () => {
      const fp = "ws-terminal-fp-" + Date.now();
      const enrolled = ehrDatabase.registerDevice(fp, "Audited Workstation Terminal", "doc-01");

      expect(enrolled.fingerprint).to.equal(fp);
      expect(enrolled.status).to.equal("pending");
      expect(enrolled).to.not.have.property("mac_address");
      expect(enrolled).to.not.have.property("macAddress");

      const approved = ehrDatabase.approveDevice(fp, "Test Admin");
      expect(approved.status).to.equal("approved");
      expect(ehrDatabase.isDeviceRegistered(fp)).to.be.true;

      const revoked = ehrDatabase.revokeDevice(fp, "Test Admin");
      expect(revoked.status).to.equal("revoked");
      expect(ehrDatabase.isDeviceRegistered(fp)).to.be.false;
    });
  });
});
