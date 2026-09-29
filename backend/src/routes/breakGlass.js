const express = require("express");
const crypto = require("crypto");
const breakGlassService = require("../services/breakGlassService");
const consentService = require("../services/consentService");
const ipfsService = require("../services/ipfsService");
const decryptionService = require("../services/decryptionService");
const auditService = require("../services/auditService");
const { breakGlassLimiter, validateDoctorIdentity } = require("../middleware/auth");

const router = express.Router();

/**
 * POST /api/break-glass/activate
 * Emergency Red Alert Protocol (RAP) trigger
 */
router.post("/break-glass/activate", breakGlassLimiter, validateDoctorIdentity, async (req, res, next) => {
  try {
    const { doctor_address, patient_id, justification } = req.body;

    if (!patient_id) {
      return res.status(400).json({ error: "Missing required patient_id" });
    }

    if (!justification || justification.trim().length < 10) {
      return res.status(400).json({ error: "Mandatory emergency justification must be at least 10 characters." });
    }

    // 1. Activate on-chain BreakGlassRegistry token
    const activation = await breakGlassService.activateEmergencyOverride({
      doctorAddress: doctor_address,
      patientId: patient_id,
      justification: justification.trim()
    });

    const accessDecisionId = "0x" + crypto.randomBytes(32).toString("hex");

    // 2. Always log break-glass activation to AccessAuditLog
    await auditService.logDecision({
      accessDecisionId,
      requester: doctor_address,
      patientId: patient_id,
      riskLevel: "HIGH",
      decision: "BREAK_GLASS_ACTIVATE",
      isBreakGlass: true
    });

    return res.status(200).json({
      status: "EMERGENCY_OVERRIDE_ACTIVE",
      token_id: activation.tokenId,
      token: activation.jwt,
      expires_at: activation.expiresAt,
      justification: activation.justification
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/break-glass/access-record
 * Access and decrypt record under an active Break-Glass emergency token
 */
router.post("/break-glass/access-record", async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"] || req.body.token;
    if (!authHeader) {
      return res.status(401).json({ error: "Missing emergency authorization token" });
    }

    const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;

    // 1. Verify cryptographic JWT signature and scope
    const decoded = breakGlassService.verifyJwt(token);
    if (decoded.scope !== "EMERGENCY_OVERRIDE_READ") {
      return res.status(403).json({ error: "Token does not have emergency override read scope" });
    }

    // 2. Check on-chain BreakGlassRegistry to ensure token is still valid (not expired or revoked)
    const isValidOnChain = await breakGlassService.isTokenValid(decoded.token_id);
    if (!isValidOnChain) {
      return res.status(403).json({ error: "Emergency override token has expired or been revoked" });
    }

    const accessDecisionId = "0x" + crypto.randomBytes(32).toString("hex");

    // 3. Log access under break-glass token (always logged as isBreakGlass: true)
    await auditService.logDecision({
      accessDecisionId,
      requester: decoded.sub,
      patientId: decoded.patient_id,
      riskLevel: "EMERGENCY_OVERRIDE",
      decision: "BREAK_GLASS_READ",
      isBreakGlass: true
    });

    // 4. Converge through the hash-lookup + key-release + decrypt flow
    // Break-Glass skips risk scoring, not key custody!
    const [encryptedBlob, releasedKey] = await Promise.all([
      ipfsService.fetchEncryptedBlob(decoded.patient_id),
      consentService.releaseDecryptionKey(decoded.sub, decoded.patient_id, accessDecisionId)
    ]);

    const plaintextRecord = decryptionService.decrypt(encryptedBlob, releasedKey);

    return res.status(200).json({
      status: "EMERGENCY_OVERRIDE_READ",
      access_decision_id: accessDecisionId,
      patient_id: decoded.patient_id,
      record: plaintextRecord
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
