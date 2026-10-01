const { ethers } = require("ethers");
const crypto = require("crypto");
const config = require("../config");
const logger = require("../utils/logger");

// ABI for ConsentRegistry
const CONSENT_REGISTRY_ABI = [
  "function hasValidConsent(address doctor, bytes32 patientId) external view returns (bool)",
  "function setConsent(address doctor, bytes32 patientId, bool isValid) external",
  "function releaseDecryptionKey(address doctor, bytes32 patientId, bytes32 accessDecisionId) external returns (bytes memory)",
  "event DecryptionKeyReleased(address indexed doctor, bytes32 indexed patientId, bytes32 indexed accessDecisionId, bytes key)",
  "event ConsentUpdated(address indexed doctor, bytes32 indexed patientId, bool isValid)"
];

class ConsentService {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.contract = null;

    if (config.ethSignerKey && config.ethSignerKey.length === 66 && config.consentRegistryAddress && ethers.isAddress(config.consentRegistryAddress)) {
      try {
        this.provider = new ethers.JsonRpcProvider(config.ethRpcUrl, undefined, { staticNetwork: true });
        this.signer = new ethers.Wallet(config.ethSignerKey, this.provider);
        this.contract = new ethers.Contract(config.consentRegistryAddress, CONSENT_REGISTRY_ABI, this.signer);
      } catch {
        this.contract = null;
      }
    }

    // In-memory store when contract is not deployed
    this.mockConsents = new Map();
    this.mockKeys = new Map();
  }

  setContractAddress(address) {
    if (this.signer && address && ethers.isAddress(address)) {
      this.contract = new ethers.Contract(address, CONSENT_REGISTRY_ABI, this.signer);
    }
  }

  setMockConsent(doctor, patientId, isValid) {
    const key = `${doctor.toLowerCase()}:${patientId}`;
    this.mockConsents.set(key, isValid);
  }

  setMockKey(patientId, keyBytes) {
    this.mockKeys.set(patientId, keyBytes);
  }

  async checkConsent(doctorAddress, patientId) {
    if (!doctorAddress) return false;
    const key = `${doctorAddress.toLowerCase()}:${patientId}`;
    if (this.mockConsents.has(key)) {
      return this.mockConsents.get(key);
    }

    try {
      if (this.contract) {
        const patientIdBytes32 = ethers.keccak256(ethers.toUtf8Bytes(patientId));
        return await this.contract.hasValidConsent(doctorAddress, patientIdBytes32);
      }
    } catch (err) {
      // On-chain check failed
    }

    return false;
  }

  async setConsent(doctorAddress, patientId, isValid) {
    const key = `${doctorAddress.toLowerCase()}:${patientId}`;
    this.mockConsents.set(key, isValid);

    try {
      if (this.contract) {
        const patientIdBytes32 = ethers.keccak256(ethers.toUtf8Bytes(patientId));
        const tx = await this.contract.setConsent(doctorAddress, patientIdBytes32, isValid);
        const receipt = await tx.wait();
        return receipt.hash || tx.hash;
      }
    } catch (err) {
      logger.warn({ error: err.message }, "[ConsentService] On-chain setConsent failed");
    }

    return null;
  }

  async releaseDecryptionKey(doctorAddress, patientId, accessDecisionId) {
    try {
      if (this.contract) {
        const patientIdBytes32 = ethers.keccak256(ethers.toUtf8Bytes(patientId));
        const decisionIdBytes32 = ethers.isHexString(accessDecisionId, 32)
          ? accessDecisionId
          : ethers.keccak256(ethers.toUtf8Bytes(accessDecisionId));

        const tx = await this.contract.releaseDecryptionKey(doctorAddress, patientIdBytes32, decisionIdBytes32);
        const receipt = await tx.wait();

        // Extract key from event
        const event = receipt.logs
          .map(log => {
            try { return this.contract.interface.parseLog(log); } catch { return null; }
          })
          .find(parsed => parsed && parsed.name === "DecryptionKeyReleased");

        if (event && event.args && event.args.key) {
          return Buffer.from(ethers.getBytes(event.args.key));
        }
      }
    } catch (err) {
      logger.warn({ error: err.message }, "[ConsentService] On-chain releaseDecryptionKey failed, falling back to local");
    }

    // In-memory fallback (exact 32-byte key)
    const encryptionService = require("./encryptionService");
    const mockKey = this.mockKeys.get(patientId) || encryptionService.getPatientKey(patientId);
    return mockKey;
  }
}

module.exports = new ConsentService();
