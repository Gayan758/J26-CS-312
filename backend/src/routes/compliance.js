const express = require("express");
const router = express.Router();
const auditService = require("../services/auditService");
const { optionalAuthenticate } = require("../middleware/auth");

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(403).json({ error: "This resource is restricted to system administrators." });
  }
  const role = (req.user.role || "").toUpperCase();
  if (role !== "ADMIN" && role !== "ADMINISTRATOR") {
    return res.status(403).json({ error: "This resource is restricted to system administrators." });
  }
  next();
}

router.use(optionalAuthenticate);
router.use(requireAdmin);

/**
 * GET /api/compliance/audit-logs
 * Hospital Compliance & Audit - Admin only
 */
router.get("/audit-logs", (req, res) => {
  try {
    const logs = auditService.getAuditLogs();
    res.status(200).json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/compliance/verify
 * Verification of blockchain audit ledger integrity
 */
router.get("/verify", (req, res) => {
  try {
    const verification = auditService.verifyIntegrity();
    res.status(200).json(verification);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/compliance/overview
 */
router.get("/overview", (req, res) => {
  try {
    const logs = auditService.getAuditLogs();
    res.status(200).json({
      totalDecisions: logs.length,
      breakGlassDecisions: logs.filter((l) => l.isBreakGlass).length,
      allowDecisions: logs.filter((l) => l.decision === "ALLOW").length,
      blockDecisions: logs.filter((l) => l.decision === "BLOCK").length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
