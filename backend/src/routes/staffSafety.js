const express = require("express");
const router = express.Router();
const ehrDatabase = require("../services/ehrDatabase");
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
 * GET /api/staff-safety/devices
 * Live doctor positions from Traccar with trusted campus perimeters (Admin only)
 */
router.get("/devices", (req, res) => {
  try {
    // Audited access to live staff locations
    ehrDatabase.recordSafetyAudit({
      actorId: req.user?.id || req.user?.sub || "admin",
      actorName: req.user?.name || "Hospital Administrator",
      actorRole: req.user?.role || "ADMIN",
      action: "VIEW_STAFF_MAP",
      justification: "Administrative staff location overview inspection"
    });

    const devices = ehrDatabase.getStaffDevices();
    res.status(200).json({ devices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/staff-safety/events
 * Geofence risk events and alarms
 */
router.get("/events", (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const events = ehrDatabase.getGeofenceEvents(limit);
    res.status(200).json({ events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/staff-safety/audit-logs
 * Safety audit logs
 */
router.get("/audit-logs", (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const logs = ehrDatabase.getSafetyAuditLogs(limit);
    res.status(200).json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
