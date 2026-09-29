const { ethers } = require("ethers");
const jwt = require("jsonwebtoken");
const config = require("../config");

const BREAK_GLASS_REGISTRY_ABI = [
  "function activateBreakGlass(bytes32 patientId, string justification) external returns (bytes32)",
  "function isTokenValid(bytes32 tokenId) external view returns (bool)",
  "function getToken(bytes32 tokenId) external view returns (bytes32, address, bytes32, uint256, uint256, string, bool)",
  "event BreakGlassActivated(address indexed doctor, bytes32 indexed patientId, bytes32 indexed tokenId, uint256 expiresAt, string justification)"
];

class BreakGlassService {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.ethRpcUrl);
    this.signer = new ethers.Wallet(config.ethSignerKey, this.provider);
    this.contract = null;

    if (config.breakGlassRegistryAddress && ethers.isAddress(config.breakGlassRegistryAddress)) {
      this.contract = new ethers.Contract(config.breakGlassRegistryAddress, BREAK_GLASS_REGISTRY_ABI, this.signer);
    }

    this.mockTokens = new Map();
  }

  setContractAddress(address) {
    this.contract = new ethers.Contract(address, BREAK_GLASS_REGISTRY_ABI, this.signer);
  }

  async activateEmergencyOverride({ doctorAddress, patientId, justification }) {
    if (!justification || justification.trim().length < 10) {
      throw new Error("Emergency justification must be at least 10 characters.");
    }

    const patientIdBytes32 = ethers.keccak256(ethers.toUtf8Bytes(patientId));
    let tokenId;
    let expiresAt = Math.floor(Date.now() / 1000) + 1800; // 30 minutes default

    try {
      if (this.contract) {
        const tx = await this.contract.activateBreakGlass(patientIdBytes32, justification);
        const receipt = await tx.wait();

        const event = receipt.logs
          .map(log => {
            try { return this.contract.interface.parseLog(log); } catch { return null; }
          })
          .find(parsed => parsed && parsed.name === "BreakGlassActivated");

        if (event && event.args) {
          tokenId = event.args.tokenId;
          expiresAt = Number(event.args.expiresAt);
        }
      }
    } catch (err) {
      console.warn("[BreakGlassService] On-chain activateBreakGlass failed, falling back to mock:", err.message);
    }

    if (!tokenId) {
      tokenId = ethers.keccak256(
        ethers.toUtf8Bytes(`${doctorAddress}:${patientId}:${Date.now()}:${justification}`)
      );
      this.mockTokens.set(tokenId, {
        tokenId,
        doctor: doctorAddress,
        patientId,
        expiresAt,
        justification,
        revoked: false
      });
    }

    // Issue short-lived JWT scoped to patient and tokenId
    const tokenPayload = {
      sub: doctorAddress,
      patient_id: patientId,
      token_id: tokenId,
      scope: "EMERGENCY_OVERRIDE_READ",
      exp: expiresAt
    };

    const emergencyJwt = jwt.sign(tokenPayload, config.jwtSecret);

    return {
      tokenId,
      jwt: emergencyJwt,
      expiresAt,
      justification
    };
  }

  async isTokenValid(tokenId) {
    try {
      if (this.contract) {
        return await this.contract.isTokenValid(tokenId);
      }
    } catch (err) {
      console.warn("[BreakGlassService] On-chain isTokenValid failed, using mock:", err.message);
    }

    const mock = this.mockTokens.get(tokenId);
    if (!mock || mock.revoked) return false;
    return Math.floor(Date.now() / 1000) <= mock.expiresAt;
  }

  verifyJwt(emergencyJwt) {
    try {
      return jwt.verify(emergencyJwt, config.jwtSecret);
    } catch (err) {
      throw new Error(`Invalid or expired emergency token: ${err.message}`);
    }
  }
}

module.exports = new BreakGlassService();
