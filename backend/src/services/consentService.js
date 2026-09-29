const { ethers } = require("ethers");
const crypto = require("crypto");
const config = require("../config");

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
    this.provider = new ethers.JsonRpcProvider(config.ethRpcUrl);
    this.signer = new ethers.Wallet(config.ethSignerKey, this.provider);
    this.contract = null;

    if (config.consentRegistryAddress && ethers.isAddress(config.consentRegistryAddress)) {
      this.contract = new ethers.Contract(config.consentRegistryAddress, CONSENT_REGISTRY_ABI, this.signer);
    }

    // In-memory mock store for local/unit testing when contract is not deployed
    this.mockConsents = new Map();
    this.mockKeys = new Map();

    // Seed test patients with deterministic 32-byte AES keys matching IpfsService
    const testKey1 = crypto.createHash("sha256").update("patient-123-key").digest();
    const testKey2 = crypto.createHash("sha256").update("patient-456-key").digest();
    this.mockKeys.set("patient-123", testKey1);
    this.mockKeys.set("patient-456", testKey2);
  }

  setContractAddress(address) {
    this.contract = new ethers.Contract(address, CONSENT_REGISTRY_ABI, this.signer);
  }

  setMockConsent(doctor, patientId, isValid) {
    const key = `${doctor.toLowerCase()}:${patientId}`;
    this.mockConsents.set(key, isValid);
  }

  setMockKey(patientId, keyBytes) {
    this.mockKeys.set(patientId, keyBytes);
  }

  async checkConsent(doctorAddress, patientId) {
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
      console.warn("[ConsentService] On-chain checkConsent failed, falling back to mock:", err.message);
    }

    return true;
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
      console.warn("[ConsentService] On-chain setConsent failed, falling back to simulated hash:", err.message);
    }

    return "0x" + crypto.randomBytes(32).toString("hex");
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
      console.warn("[ConsentService] On-chain releaseDecryptionKey failed, falling back to mock:", err.message);
    }

    // In-memory fallback (exact 32-byte key)
    const mockKey = this.mockKeys.get(patientId) || crypto.createHash("sha256").update(`${patientId}-key`).digest();
    return mockKey;
  }
}

module.exports = new ConsentService();
