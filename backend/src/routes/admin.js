const express = require("express");
const ehrDatabase = require("../services/ehrDatabase");
const auditService = require("../services/auditService");

const router = express.Router();

/**
 * GET /api/admin/users
 * Returns list of all doctors, staff, and administrative users with status
 */
router.get("/users", (req, res) => {
  try {
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
    const { status } = req.body;
    if (!status || (status !== "active" && status !== "disabled")) {
      return res.status(400).json({ error: "Valid status ('active' or 'disabled') is required." });
    }

    const result = ehrDatabase.updateUserStatus(req.params.id, status);

    auditService.logInternalAudit({
      actor: "Hospital Administrator",
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
router.post("/users/:id/reset-password", (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }

    const result = ehrDatabase.resetUserPassword(req.params.id, password);

    auditService.logInternalAudit({
      actor: "Hospital Administrator",
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
router.post("/users/create", (req, res) => {
  try {
    const { name, username, password, email, slmcNumber, specialty, baseCampus, phone, role } = req.body;
    if (!name || !username || !password) {
      return res.status(400).json({ error: "Name, username, and password are required." });
    }

    const newDoc = ehrDatabase.registerDoctor({
      name,
      username,
      password,
      email,
      slmcNumber,
      specialty,
      baseCampus,
      phone,
      role: role || "Doctor"
    });

    auditService.logInternalAudit({
      actor: "Hospital Administrator",
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

module.exports = router;
