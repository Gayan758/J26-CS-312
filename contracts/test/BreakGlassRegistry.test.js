const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("BreakGlassRegistry", function () {
  let breakGlassRegistry;
  let owner;
  let doctor;
  let patient;

  const patientId = ethers.keccak256(ethers.toUtf8Bytes("patient-trauma-456"));
  const validJustification = "Patient unconscious in ER, GCS 4, acute intracranial hemorrhage suspected.";
  const shortJustification = "Emerg!";

  const MAX_DURATION = 3600; // 60 minutes
  const DEFAULT_DURATION = 1800; // 30 minutes

  beforeEach(async function () {
    [owner, doctor, patient] = await ethers.getSigners();

    const BreakGlassRegistry = await ethers.getContractFactory("BreakGlassRegistry");
    breakGlassRegistry = await BreakGlassRegistry.deploy(MAX_DURATION, DEFAULT_DURATION);
  });

  it("should activate break-glass and emit BreakGlassActivated", async function () {
    const tx = await breakGlassRegistry.connect(doctor).activateBreakGlass(
      patientId,
      validJustification
    );

    const receipt = await tx.wait();
    const event = receipt.logs.find(log => {
      try {
        return breakGlassRegistry.interface.parseLog(log).name === "BreakGlassActivated";
      } catch {
        return false;
      }
    });

    expect(event).to.not.be.undefined;
    const parsed = breakGlassRegistry.interface.parseLog(event);
    expect(parsed.args.doctor).to.equal(doctor.address);
    expect(parsed.args.patientId).to.equal(patientId);
    expect(parsed.args.justification).to.equal(validJustification);

    const tokenId = parsed.args.tokenId;
    expect(await breakGlassRegistry.isTokenValid(tokenId)).to.be.true;
  });

  it("should reject break-glass if justification is shorter than 10 characters", async function () {
    let reverted = false;
    try {
      await breakGlassRegistry.connect(doctor).activateBreakGlass(patientId, shortJustification);
    } catch (err) {
      reverted = true;
      expect(err.message).to.include("BreakGlassRegistry: justification must be at least 10 chars");
    }
    expect(reverted, "Expected call to revert").to.be.true;
  });

  it("should auto-invalidate token after expiration time without requiring cron", async function () {
    const tx = await breakGlassRegistry.connect(doctor).activateBreakGlass(
      patientId,
      validJustification
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => {
      try {
        return breakGlassRegistry.interface.parseLog(log).name === "BreakGlassActivated";
      } catch {
        return false;
      }
    });
    const tokenId = breakGlassRegistry.interface.parseLog(event).args.tokenId;

    expect(await breakGlassRegistry.isTokenValid(tokenId)).to.be.true;

    // Fast-forward time by 1801 seconds (past DEFAULT_DURATION)
    await time.increase(DEFAULT_DURATION + 1);

    expect(await breakGlassRegistry.isTokenValid(tokenId)).to.be.false;
  });

  it("should allow doctor or owner to revoke an active emergency token early", async function () {
    const tx = await breakGlassRegistry.connect(doctor).activateBreakGlass(
      patientId,
      validJustification
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => {
      try {
        return breakGlassRegistry.interface.parseLog(log).name === "BreakGlassActivated";
      } catch {
        return false;
      }
    });
    const tokenId = breakGlassRegistry.interface.parseLog(event).args.tokenId;

    expect(await breakGlassRegistry.isTokenValid(tokenId)).to.be.true;

    await breakGlassRegistry.connect(doctor).revokeToken(tokenId);

    expect(await breakGlassRegistry.isTokenValid(tokenId)).to.be.false;

    const tokenData = await breakGlassRegistry.getToken(tokenId);
    expect(tokenData.revoked).to.be.true;
  });
});
