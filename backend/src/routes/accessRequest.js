const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const config = require("../config");
const consentService = require("../services/consentService");
const riskService = require("../services/riskService");
const policyService = require("../services/policyService");
const auditService = require("../services/auditService");
const ipfsService = require("../services/ipfsService");
const decryptionService = require("../services/decryptionService");
const { accessRequestLimiter, validateDoctorIdentity } = require("../middleware/auth");

const router = express.Router();

/**
 * POST /api/access-request
 * Core RiskBAC Evaluation and Two-Branch Decryption Flow
 */
router.post("/access-request", accessRequestLimiter, validateDoctorIdentity, async (req, res, next) => {
  try {
    const {
      doctor_address,
      patient_id,
      requested_record_id,
      requested_record_sensitivity = "medium",
      device_fingerprint = "sha256:default-enrolled-device",
      ip_address,
      timestamp
    } = req.body;

    if (!patient_id) {
      return res.status(400).json({ error: "Missing required patient_id" });
    }

    const accessDecisionId = "0x" + crypto.randomBytes(32).toString("hex");
    const clientIp = ip_address || req.ip || req.headers["x-forwarded-for"] || "10.0.1.10";
    const requestTime = timestamp || new Date().toISOString();

    // 2. Parallel: Check Consent (on-chain) AND gather context signals
    const [consentValid, riskScoreData] = await Promise.all([
      consentService.checkConsent(doctor_address, patient_id),
      riskService.scoreRequest({
        userId: doctor_address,
        timestamp: requestTime,
        ipAddress: clientIp,
        deviceFingerprint: device_fingerprint,
        requestedPatientId: patient_id,
        requestedRecordSensitivity: requested_record_sensitivity
      })
    ]);

    const { risk_score, risk_level, signal_breakdown } = riskScoreData;

    // 4. Call Policy Decision Layer (OPA with { consent_valid, risk_level })
    const decision = await policyService.decide({
      consentValid,
      riskLevel: risk_level
    });

    // 5. Always log decision to AccessAuditLog contract
    await auditService.logDecision({
      accessDecisionId,
      requester: doctor_address,
      patientId: patient_id,
      riskLevel: risk_level,
      decision: decision,
      isBreakGlass: false
    });

    // 6. Branch on Policy Decision
    if (decision === "ALLOW") {
      // TWO PARALLEL BRANCHES:
      // (a) File hash lookup -> IPFS encrypted blob fetch
      // (b) ConsentRegistry key release scoped to accessDecisionId
      const [encryptedBlob, releasedKey] = await Promise.all([
        ipfsService.fetchEncryptedBlob(patient_id),
        consentService.releaseDecryptionKey(doctor_address, patient_id, accessDecisionId)
      ]);

      // Converge both branches into single Decryption step
      const plaintextRecord = decryptionService.decrypt(encryptedBlob, releasedKey);

      return res.status(200).json({
        status: "ALLOW",
        access_decision_id: accessDecisionId,
        risk_score,
        risk_level,
        signal_breakdown,
        record: plaintextRecord
      });
    }

    if (decision === "MFA_REQUIRED") {
      const emailService = require("../services/emailService");
      const ehrDatabase = require("../services/ehrDatabase");
      const doctor = ehrDatabase.getDoctorById(doctor_address);
      const doctorEmail = (doctor && doctor.email) ? doctor.email : "alice.vance@sliit.lk";

      // Dispatch 2FA OTP email
      let emailDispatch = null;
      try {
        emailDispatch = await emailService.send2FAOtp(
          doctor_address,
          doctorEmail,
          doctor ? doctor.name : "Attending Physician",
          {
            reason: `RiskBAC Medium Risk Step-Up (Score: ${risk_score})`,
            network: ip_address || "External Network",
            fingerprint: device_fingerprint || "Workstation Enclave"
          }
        );
      } catch (err) {
        console.warn("[AccessRequest] Error dispatching 2FA email:", err.message);
      }

      // Return step-up challenge token
      const challengeToken = jwt.sign(
        {
          sub: doctor_address,
          patient_id,
          requested_record_id,
          access_decision_id: accessDecisionId,
          scope: "MFA_CHALLENGE"
        },
        config.mfaSecret,
        { expiresIn: "5m" }
      );

      return res.status(200).json({
        status: "MFA_REQUIRED",
        access_decision_id: accessDecisionId,
        challenge_token: challengeToken,
        risk_score,
        risk_level,
        signal_breakdown,
        email_masked: emailDispatch ? emailDispatch.maskedEmail : "d***r@hospital.lk",
        message: "Step-up Multi-Factor Authentication required to access record. OTP dispatched to registered email."
      });
    }

    // Default: BLOCK (generic 403 response without leaking signals)
    return res.status(403).json({
      error: "Access Denied by Policy",
      message: "Access to requested health record was blocked by the access control policy."
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/mfa-verify
 * Verifies Step-up MFA and completes the two-branch decryption flow
 */
router.post("/mfa-verify", async (req, res, next) => {
  try {
    const { challenge_token, otp } = req.body;

    if (!challenge_token || !otp) {
      return res.status(400).json({ error: "Missing challenge_token or otp code" });
    }

    let payload;
    try {
      payload = jwt.verify(challenge_token, config.mfaSecret);
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired MFA challenge token" });
    }

    const emailService = require("../services/emailService");
    const verification = emailService.verify2FAOtp(payload.sub, otp);

    if (!verification.valid) {
      await auditService.logDecision({
        accessDecisionId: payload.access_decision_id,
        requester: payload.sub,
        patientId: payload.patient_id,
        riskLevel: "MEDIUM",
        decision: "MFA_FAILED",
        isBreakGlass: false
      });
      return res.status(403).json({ error: verification.error || "Invalid MFA verification code" });
    }

    // MFA Passed: log verification
    await auditService.logDecision({
      accessDecisionId: payload.access_decision_id,
      requester: payload.sub,
      patientId: payload.patient_id,
      riskLevel: "MEDIUM",
      decision: "MFA_VERIFIED",
      isBreakGlass: false
    });

    // Execute the parallel two-branch decryption flow
    const [encryptedBlob, releasedKey] = await Promise.all([
      ipfsService.fetchEncryptedBlob(payload.patient_id),
      consentService.releaseDecryptionKey(payload.sub, payload.patient_id, payload.access_decision_id)
    ]);

    const plaintextRecord = decryptionService.decrypt(encryptedBlob, releasedKey);

    return res.status(200).json({
      status: "ALLOW",
      access_decision_id: payload.access_decision_id,
      mfa_verified: true,
      record: plaintextRecord
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
