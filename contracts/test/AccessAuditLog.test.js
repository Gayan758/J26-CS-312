const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AccessAuditLog & ConsentRegistry Key Release", function () {
  let accessAuditLog;
  let consentRegistry;
  let owner;
  let doctor;
  let unauthorized;

  const patientId = ethers.keccak256(ethers.toUtf8Bytes("patient-123"));
  const accessDecisionId = ethers.keccak256(ethers.toUtf8Bytes("decision-001"));
  const sampleKey = ethers.toUtf8Bytes("aes-256-secret-patient-encryption-key");

  beforeEach(async function () {
    [owner, doctor, unauthorized] = await ethers.getSigners();

    const AccessAuditLog = await ethers.getContractFactory("AccessAuditLog");
    accessAuditLog = await AccessAuditLog.deploy();

    const ConsentRegistry = await ethers.getContractFactory("ConsentRegistry");
    consentRegistry = await ConsentRegistry.deploy();
  });

  describe("AccessAuditLog", function () {
    it("should append access records and emit AccessLogged event", async function () {
      const patientIdHash = ethers.keccak256(patientId);

      const tx = await accessAuditLog.logAccess(
        accessDecisionId,
        doctor.address,
        patientIdHash,
        "LOW",
        "ALLOW",
        false
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          return accessAuditLog.interface.parseLog(log).name === "AccessLogged";
        } catch {
          return false;
        }
      });

      expect(event).to.not.be.undefined;
      const parsed = accessAuditLog.interface.parseLog(event);
      expect(parsed.args.accessDecisionId).to.equal(accessDecisionId);
      expect(parsed.args.requester).to.equal(doctor.address);
      expect(parsed.args.patientIdHash).to.equal(patientIdHash);
      expect(parsed.args.riskLevel).to.equal("LOW");
      expect(parsed.args.decision).to.equal("ALLOW");
      expect(parsed.args.isBreakGlass).to.equal(false);

      expect(await accessAuditLog.getRecordCount()).to.equal(1);

      const record = await accessAuditLog.getRecord(0);
      expect(record.accessDecisionId).to.equal(accessDecisionId);
      expect(record.requester).to.equal(doctor.address);
      expect(record.patientIdHash).to.equal(patientIdHash);
      expect(record.riskLevel).to.equal("LOW");
      expect(record.decision).to.equal("ALLOW");
      expect(record.isBreakGlass).to.equal(false);
    });

    it("should log break-glass access attempts correctly", async function () {
      const patientIdHash = ethers.keccak256(patientId);

      await accessAuditLog.logAccess(
        accessDecisionId,
        doctor.address,
        patientIdHash,
        "HIGH",
        "BREAK_GLASS",
        true
      );

      const record = await accessAuditLog.getRecord(0);
      expect(record.isBreakGlass).to.equal(true);
      expect(record.decision).to.equal("BREAK_GLASS");
    });

    it("should reject logging from unauthorized recorders", async function () {
      const patientIdHash = ethers.keccak256(patientId);
      let reverted = false;
      try {
        await accessAuditLog.connect(unauthorized).logAccess(
          accessDecisionId,
          doctor.address,
          patientIdHash,
          "LOW",
          "ALLOW",
          false
        );
      } catch (err) {
        reverted = true;
        expect(err.message).to.include("AccessAuditLog: caller not authorized");
      }
      expect(reverted, "Expected call to revert").to.be.true;
    });
  });

  describe("ConsentRegistry Key Release", function () {
    it("should register patient key and update consent", async function () {
      await consentRegistry.registerPatientKey(patientId, sampleKey);
      await consentRegistry.setConsent(doctor.address, patientId, true);

      expect(await consentRegistry.hasValidConsent(doctor.address, patientId)).to.be.true;
    });

    it("should emit DecryptionKeyReleased event when key is released", async function () {
      await consentRegistry.registerPatientKey(patientId, sampleKey);
      await consentRegistry.setConsent(doctor.address, patientId, true);

      const tx = await consentRegistry.releaseDecryptionKey(
        doctor.address,
        patientId,
        accessDecisionId
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          return consentRegistry.interface.parseLog(log).name === "DecryptionKeyReleased";
        } catch {
          return false;
        }
      });

      expect(event).to.not.be.undefined;
      const parsed = consentRegistry.interface.parseLog(event);
      expect(parsed.args.doctor).to.equal(doctor.address);
      expect(parsed.args.patientId).to.equal(patientId);
      expect(parsed.args.accessDecisionId).to.equal(accessDecisionId);
    });

    it("should reject releaseDecryptionKey if called by unauthorized party", async function () {
      await consentRegistry.registerPatientKey(patientId, sampleKey);

      let reverted = false;
      try {
        await consentRegistry.connect(unauthorized).releaseDecryptionKey(
          doctor.address,
          patientId,
          accessDecisionId
        );
      } catch (err) {
        reverted = true;
        expect(err.message).to.include("ConsentRegistry: caller not authorized");
      }
      expect(reverted, "Expected call to revert").to.be.true;
    });
  });
});
