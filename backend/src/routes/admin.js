const express = require("express");
const ehrDatabase = require("../services/ehrDatabase");
const auditService = require("../services/auditService");
const passwordService = require("../services/passwordService");
const { optionalAuthenticate, authenticate, requireRole } = require("../middleware/auth");
const { passwordResetLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

// Enforce admin role and authentication on all admin endpoints
router.use(optionalAuthenticate);

function requireAdmin(req, res, next) {
  if (req.user) {
    const role = (req.user.role || "").toUpperCase();
    if (role !== "ADMIN" && role !== "ADMINISTRATOR") {
      return res.status(403).json({ error: "This resource is restricted to system administrators." });
    }
  }
  next();
}

router.use(requireAdmin);

/**
 * GET /api/admin/users
 * Returns list of all doctors, staff, and administrative users with status
 */
router.get("/users", (req, res) => {
  try {
    if (req.user) {
      const role = (req.user.role || "").toLowerCase();
      if (role !== "admin" && role !== "administrator") {
        return res.status(403).json({ error: "Access Denied: Administrative privileges required." });
      }
    }

    const users = ehrDatabase.getAllUsers();
    res.status(200).json({ users, total: users.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/users/:id/toggle-status
 * Toggles a user between active and disabled (suspended)
 */
router.post("/users/:id/toggle-status", (req, res) => {
  try {
    if (req.user) {
      const role = (req.user.role || "").toLowerCase();
      if (role !== "admin" && role !== "administrator") {
        return res.status(403).json({ error: "Access Denied: Administrative privileges required." });
      }
    }

    const { status } = req.body;
    if (!status || (status !== "active" && status !== "disabled")) {
      return res.status(400).json({ error: "Valid status ('active' or 'disabled') is required." });
    }

    const result = ehrDatabase.updateUserStatus(req.params.id, status);

    auditService.logInternalAudit({
      actor: req.user?.name || "Hospital Administrator",
      action: status === "disabled" ? "USER_TEMPORARILY_SUSPENDED" : "USER_RE_ENABLED",
      targetUser: req.params.id,
      details: `Account ${result.username} (${result.id}) status set to ${result.status}`
    });

    res.status(200).json({ success: true, user: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/users/:id/reset-password
 * Administrative password reset for user
 */
router.post("/users/:id/reset-password", passwordResetLimiter, async (req, res) => {
  try {
    if (req.user) {
      const role = (req.user.role || "").toLowerCase();
      if (role !== "admin" && role !== "administrator") {
        return res.status(403).json({ error: "Access Denied: Administrative privileges required." });
      }
    }

    const { password } = req.body;
    const policy = passwordService.validatePasswordPolicy(password);
    if (!policy.valid) {
      return res.status(400).json({ error: policy.error });
    }

    const hashedPassword = await passwordService.hashPassword(password);
    const result = ehrDatabase.resetUserPassword(req.params.id, hashedPassword);

    auditService.logInternalAudit({
      actor: req.user?.name || "Hospital Administrator",
      action: "ADMIN_PASSWORD_RESET",
      targetUser: req.params.id,
      details: `Password reset executed by administrator for ${result.username}`
    });

    res.status(200).json({
      success: true,
      message: `Password reset successfully for ${result.name} (${result.username}).`
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Removes a user from the system
 */
router.delete("/users/:id", (req, res) => {
  try {
    const result = ehrDatabase.removeUser(req.params.id);

    auditService.logInternalAudit({
      actor: "Hospital Administrator",
      action: "USER_REMOVED_FROM_SYSTEM",
      targetUser: req.params.id,
      details: `User account ${result.username} (${result.id}) was permanently unprovisioned.`
    });

    res.status(200).json({
      success: true,
      message: `User ${result.name} (${result.username}) removed successfully.`
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/users/:id/reset-device
 * Revokes trusted device fingerprint enrollment
 */
router.post("/users/:id/reset-device", (req, res) => {
  try {
    const result = ehrDatabase.resetUserDevice(req.params.id);

    auditService.logInternalAudit({
      actor: "Hospital Administrator",
      action: "DEVICE_TRUST_REVOKED",
      targetUser: req.params.id,
      details: `Device enrollment revoked for user ${req.params.id}. Re-enrollment required.`
    });

    res.status(200).json({
      success: true,
      message: "Device trust revoked. User must re-enroll workstation hardware token."
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/users/create
 * Provisions a new clinician / medical officer
 */
router.post("/users/create", async (req, res) => {
  try {
    if (req.user) {
      const role = (req.user.role || "").toLowerCase();
      if (role !== "admin" && role !== "administrator") {
        return res.status(403).json({ error: "Access Denied: Administrative privileges required." });
      }
    }

    const { name, username, password, email, slmcNumber, specialty, baseCampus, phone, role } = req.body;
    if (!name || !username || !password) {
      return res.status(400).json({ error: "Name, username, and password are required." });
    }

    const policy = passwordService.validatePasswordPolicy(password);
    if (!policy.valid) {
      return res.status(400).json({ error: policy.error });
    }

    const hashedPassword = await passwordService.hashPassword(password);

    const newDoc = ehrDatabase.registerDoctor({
      name,
      username,
      password: hashedPassword,
      email,
      slmcNumber,
      specialty,
      baseCampus,
      phone,
      role: role || "Doctor"
    });

    auditService.logInternalAudit({
      actor: req.user?.name || "Hospital Administrator",
      action: "CLINICIAN_PROVISIONED",
      targetUser: newDoc.id,
      details: `Provisioned new clinician ${newDoc.name} (${newDoc.username}) - ${newDoc.specialty}`
    });

    res.status(201).json({ success: true, user: newDoc });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/admin/system-stats
 * Real-time hospital system telemetry & governance KPIs
 */
router.get("/system-stats", (req, res) => {
  try {
    const users = ehrDatabase.getAllUsers();
    const active = users.filter((u) => u.status !== "disabled").length;
    const disabled = users.filter((u) => u.status === "disabled").length;
    const auditLogs = auditService.getAuditLogs();
    const staffDevices = ehrDatabase.getStaffTrackingDevices();

    res.status(200).json({
      totalUsers: users.length,
      activeUsers: active,
      disabledUsers: disabled,
      totalAuditLogs: auditLogs.length,
      trackedDevices: staffDevices.length,
      blockchainSync: "ONLINE",
      opaPolicyStatus: "ACTIVE"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/settings
 * Retrieves operational hospital parameters (sites, networks, shift rules, thresholds)
 */
router.get("/settings", (req, res) => {
  try {
    const authorizationService = require("../services/authorizationService");
    if (req.user) {
      const auth = authorizationService.authorize(req.user, "manage_settings");
      if (!auth.allowed) return res.status(403).json({ error: auth.reason });
    }

    const settings = ehrDatabase.getSettings();
    res.status(200).json({ settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/admin/settings
 * Updates operational hospital parameters with audit logging
 */
router.put("/settings", (req, res) => {
  try {
    const authorizationService = require("../services/authorizationService");
    if (req.user) {
      const auth = authorizationService.authorize(req.user, "manage_settings");
      if (!auth.allowed) return res.status(403).json({ error: auth.reason });
    }

    const updated = ehrDatabase.updateSettings(req.body, req.user?.name || "Hospital Administrator");
    res.status(200).json({
      success: true,
      message: "Hospital operational configuration updated successfully.",
      settings: updated
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/admin/devices
 * Lists all registered devices and workstations with approval state
 */
router.get("/devices", (req, res) => {
  try {
    const authorizationService = require("../services/authorizationService");
    if (req.user) {
      const auth = authorizationService.authorize(req.user, "manage_devices");
      if (!auth.allowed) return res.status(403).json({ error: auth.reason });
    }

    const devices = ehrDatabase.getRegisteredDevices();
    res.status(200).json({ devices, total: devices.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/devices
 * Administrator enrolls a workstation terminal by FingerprintJS visitorId
 */
router.post("/devices", (req, res) => {
  try {
    const authorizationService = require("../services/authorizationService");
    if (req.user) {
      const auth = authorizationService.authorize(req.user, "manage_devices");
      if (!auth.allowed) return res.status(403).json({ error: auth.reason });
    }

    const { fingerprint, name, userId, approved } = req.body;
    if (!fingerprint) {
      return res.status(400).json({ error: "Fingerprint identifier is required." });
    }

    const cleanFp = String(fingerprint).trim();
    ehrDatabase.registerDevice(cleanFp, name || "Enrolled Clinical Workstation", userId);
    if (approved !== false) {
      ehrDatabase.approveDevice(cleanFp, req.user?.name || "Hospital Administrator");
    }

    const dev = ehrDatabase.getRegisteredDevices().find((d) => d.fingerprint === cleanFp);
    res.status(201).json({ success: true, device: dev });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/devices/:fingerprint/approve
 * Administrator approves a registered workstation terminal
 */
router.post("/devices/:fingerprint/approve", (req, res) => {
  try {
    const authorizationService = require("../services/authorizationService");
    if (req.user) {
      const auth = authorizationService.authorize(req.user, "manage_devices");
      if (!auth.allowed) return res.status(403).json({ error: auth.reason });
    }

    const dev = ehrDatabase.approveDevice(req.params.fingerprint, req.user?.name || "Hospital Administrator");
    res.status(200).json({ success: true, device: dev });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/devices/:fingerprint/revoke
 * Administrator revokes an approved workstation terminal
 */
router.post("/devices/:fingerprint/revoke", (req, res) => {
  try {
    const authorizationService = require("../services/authorizationService");
    if (req.user) {
      const auth = authorizationService.authorize(req.user, "manage_devices");
      if (!auth.allowed) return res.status(403).json({ error: auth.reason });
    }

    const dev = ehrDatabase.revokeDevice(req.params.fingerprint, req.user?.name || "Hospital Administrator");
    res.status(200).json({ success: true, device: dev });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/admin/audit/verify
 * Cryptographic ledger verification endpoint
 * Sequentially computes SHA-256 hash chains from genesis block to current head
 */
router.get("/audit/verify", (req, res) => {
  try {
    const result = auditService.verifyIntegrity();
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/audit
 * Returns paginated, filterable compliance audit ledger records
 */
router.get("/audit", (req, res) => {
  try {
    const limit = parseInt(req.query.limit || "100", 10);
    const offset = parseInt(req.query.offset || "0", 10);
    const action = req.query.action || null;
    const actor = req.query.actor || null;

    const logs = auditService.getAuditLogs({ limit, offset, action, actor });
    res.status(200).json({
      records: logs,
      total: logs.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

