const { ethers } = require("ethers");
const config = require("../config");

const ACCESS_AUDIT_LOG_ABI = [
  "function logAccess(bytes32 accessDecisionId, address requester, bytes32 patientIdHash, string riskLevel, string decision, bool isBreakGlass) external returns (uint256)",
  "event AccessLogged(bytes32 indexed accessDecisionId, address indexed requester, bytes32 indexed patientIdHash, uint256 timestamp, string riskLevel, string decision, bool isBreakGlass)"
];

class AuditService {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.ethRpcUrl);
    this.signer = new ethers.Wallet(config.ethSignerKey, this.provider);
    this.contract = null;

    if (config.accessAuditLogAddress && ethers.isAddress(config.accessAuditLogAddress)) {
      this.contract = new ethers.Contract(config.accessAuditLogAddress, ACCESS_AUDIT_LOG_ABI, this.signer);
    }

    this.mockAuditLedger = [];
  }

  setContractAddress(address) {
    this.contract = new ethers.Contract(address, ACCESS_AUDIT_LOG_ABI, this.signer);
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

    // Structured JSON log for off-chain observability (never logging PHI or decryption keys)
    console.log(JSON.stringify({
      level: "AUDIT",
      event: "ACCESS_DECISION_LOGGED",
      ...logEntry
    }));

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
      console.warn("[AuditService] On-chain logAccess failed, saving to local audit ledger:", err.message);
    }

    this.mockAuditLedger.push(logEntry);
    return logEntry;
  }

  getAuditLogs() {
    return this.mockAuditLedger;
  }

  async logAccess(params) {
    return this.logDecision(params);
  }
}

module.exports = new AuditService();
