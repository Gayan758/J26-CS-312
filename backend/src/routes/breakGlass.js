const express = require("express");
const crypto = require("crypto");
const breakGlassService = require("../services/breakGlassService");
const consentService = require("../services/consentService");
const ipfsService = require("../services/ipfsService");
const decryptionService = require("../services/decryptionService");
const auditService = require("../services/auditService");
const { breakGlassLimiter, validateDoctorIdentity, optionalAuthenticate } = require("../middleware/auth");

const router = express.Router();

/**
 * POST /api/break-glass/activate
 * Emergency Red Alert Protocol (RAP) trigger
 */
router.post("/break-glass/activate", breakGlassLimiter, optionalAuthenticate, validateDoctorIdentity, async (req, res, next) => {
  try {
    const { doctor_address, justification } = req.body;
    const patientId = req.body.patientId || req.body.patient_id;

    if (req.user) {
      const role = (req.user.role || "").toLowerCase();
      if (role === "admin" || role === "administrator" || role === "patient") {
        return res.status(403).json({ error: "Access Denied: Only licensed physicians may trigger Emergency Break-Glass override." });
      }
    }

    if (!patientId) {
      return res.status(400).json({ error: "Patient ID and a justification (min. 20 chars) are required." });
    }

    if (!justification || justification.trim().length < 20) {
      return res.status(400).json({
        error: "Patient ID and a mandatory emergency justification (min. 20 chars, at least 15 characters required) are required."
      });
    }

    const doctorAddress = doctor_address || req.doctor?.address || req.user?.address || req.user?.ethereumAddress || req.user?.id;

    // 1. Activate on-chain BreakGlassRegistry token
    const activation = await breakGlassService.activateEmergencyOverride({
      doctorAddress,
      patientId,
      justification: justification.trim()
    });

    const accessDecisionId = "0x" + crypto.randomBytes(32).toString("hex");

    // 2. Fetch encrypted blob for THIS EXACT patientId (no divergence)
    const encryptedBlob = await ipfsService.fetchEncryptedBlob(patientId);
    if (!encryptedBlob) {
      return res.status(404).json({ error: `No record found for patient ID ${patientId}.` });
    }

    // 3. Release decryption key for THIS EXACT patientId
    const releasedKey = await consentService.releaseDecryptionKey(
      doctorAddress,
      patientId,
      accessDecisionId
    );

    // 4. Decrypt blob
    const plaintextRecord = decryptionService.decrypt(encryptedBlob, releasedKey);

    // 5. Log audit decision with THIS EXACT patientId
    await auditService.logDecision({
      accessDecisionId,
      requester: doctorAddress,
      patientId: patientId,
      riskLevel: "CRITICAL",
      decision: "BREAK_GLASS_ACTIVATE",
      isBreakGlass: true,
      details: `EMERGENCY OVERRIDE (RAP): ${justification.trim()}`
    });

    return res.status(200).json({
      status: "EMERGENCY_OVERRIDE_ACTIVE",
      token_id: activation.tokenId,
      token: activation.jwt,
      expires_at: activation.expiresAt,
      tokenExpiresAt: activation.expiresAt,
      justification: activation.justification,
      record: plaintextRecord
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

/**
 * GET /api/break-glass/review-queue
 * Retrieves pending and completed break-glass incidents for compliance review
 */
router.get("/break-glass/review-queue", optionalAuthenticate, (req, res) => {
  try {
    const authorizationService = require("../services/authorizationService");
    const authCheck = authorizationService.authorize(req.user, "read_audit_logs");
    if (!authCheck.allowed) {
      return res.status(403).json({ error: authCheck.reason });
    }

    const ehrDatabase = require("../services/ehrDatabase");
    const queue = ehrDatabase.getBreakGlassReviewQueue();
    return res.status(200).json({ reviewQueue: queue, total: queue.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/break-glass/:id/review
 * Compliance officer or administrator reviews an emergency break-glass event
 */
router.post("/break-glass/:id/review", optionalAuthenticate, (req, res) => {
  try {
    const ehrDatabase = require("../services/ehrDatabase");
    const authorizationService = require("../services/authorizationService");
    const event = ehrDatabase.getBreakGlassReviewQueue().find(e => e.id === req.params.id || e.tokenId === req.params.id);

    if (!event) {
      return res.status(404).json({ error: "Break-glass incident not found." });
    }

    const authCheck = authorizationService.authorize(req.user, "review_break_glass", event);
    if (!authCheck.allowed) {
      return res.status(403).json({ error: authCheck.reason, code: authCheck.code });
    }

    const { decision, notes } = req.body;
    if (!decision || (decision !== "JUSTIFIED" && decision !== "APPROVED" && decision !== "MISUSE_FLAGGED")) {
      return res.status(400).json({ error: "Valid review decision ('JUSTIFIED', 'APPROVED', or 'MISUSE_FLAGGED') is required." });
    }

    const updated = ehrDatabase.recordBreakGlassReview(
      event.id,
      req.user || { name: "Compliance Reviewer", username: "compliance" },
      decision,
      notes
    );

    auditService.logEvent({
      actor: req.user?.username || req.user?.name || "Compliance Reviewer",
      role: req.user?.role || "Compliance",
      action: "break_glass.reviewed",
      resource_type: "break_glass",
      resource_id: event.id,
      patient_id: event.patientId,
      outcome: decision,
      ip: req.ip,
      request_id: req.id,
      reason: `Incident review completed: ${decision} - ${notes || "No notes provided"}`
    });

    return res.status(200).json({
      status: "SUCCESS",
      message: `Break-glass event ${event.id} reviewed successfully.`,
      event: updated
    });
  } catch (err) {
    if (err.code === "CONFLICT_OF_INTEREST") {
      return res.status(403).json({ error: err.message, code: err.code });
    }
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;

