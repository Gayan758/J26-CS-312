const { ethers } = require("ethers");
const config = require("../config");

const ACCESS_AUDIT_LOG_ABI = [
  "function logAccess(bytes32 accessDecisionId, address requester, bytes32 patientIdHash, string riskLevel, string decision, bool isBreakGlass) external returns (uint256)",
  "event AccessLogged(bytes32 indexed accessDecisionId, address indexed requester, bytes32 indexed patientIdHash, uint256 timestamp, string riskLevel, string decision, bool isBreakGlass)"
];

class AuditService {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.ethRpcUrl);
    this.signer = null;
    this.contract = null;

    if (config.ethSignerKey) {
      try {
        this.signer = new ethers.Wallet(config.ethSignerKey, this.provider);
      } catch (e) {
        this.signer = null;
      }
    }

    if (this.signer && config.accessAuditLogAddress && ethers.isAddress(config.accessAuditLogAddress)) {
      this.contract = new ethers.Contract(config.accessAuditLogAddress, ACCESS_AUDIT_LOG_ABI, this.signer);
    }

    this.mockAuditLedger = [];
  }

  setContractAddress(address) {
    if (this.signer && address && ethers.isAddress(address)) {
      this.contract = new ethers.Contract(address, ACCESS_AUDIT_LOG_ABI, this.signer);
    }
  }

  async logDecision({
    accessDecisionId,
    requester,
    patientId,
    riskLevel,
    decision,
    isBreakGlass = false
  }) {
    const patientIdHash = ethers.keccak256(ethers.toUtf8Bytes(patientId));
    const decisionIdBytes32 = ethers.isHexString(accessDecisionId, 32)
      ? accessDecisionId
      : ethers.keccak256(ethers.toUtf8Bytes(accessDecisionId));

    const logEntry = {
      accessDecisionId: decisionIdBytes32,
      requester: requester || ethers.ZeroAddress,
      patientIdHash,
      timestamp: Math.floor(Date.now() / 1000),
      riskLevel: String(riskLevel).toUpperCase(),
      decision: String(decision).toUpperCase(),
      isBreakGlass: Boolean(isBreakGlass)
    };

    try {
      if (this.contract) {
        const tx = await this.contract.logAccess(
          logEntry.accessDecisionId,
          logEntry.requester,
          logEntry.patientIdHash,
          logEntry.riskLevel,
          logEntry.decision,
          logEntry.isBreakGlass
        );
        const receipt = await tx.wait();
        logEntry.txHash = receipt.hash;
      }
    } catch (err) {
      // Local ledger fallback
    }

    this.mockAuditLedger.push(logEntry);
    return logEntry;
  }

  getAuditLogs() {
    return this.mockAuditLedger;
  }

  logInternalAudit(entry) {
    const record = {
      accessDecisionId: "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
      requester: entry.actorAddress || ethers.ZeroAddress,
      patientIdHash: ethers.ZeroHash,
      timestamp: Math.floor(Date.now() / 1000),
      riskLevel: "ADMIN",
      decision: entry.action || "ADMIN_ACTION",
      isBreakGlass: false,
      details: entry.details || "",
      actor: entry.actor || "Hospital Administrator"
    };
    this.mockAuditLedger.unshift(record);
    return record;
  }

  async logAccess(params) {
    return this.logDecision(params);
  }
}

module.exports = new AuditService();
