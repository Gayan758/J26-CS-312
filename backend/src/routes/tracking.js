const express = require("express");
const router = express.Router();
const ehrDatabase = require("../services/ehrDatabase");
const staffTrackingService = require("../services/staffTrackingService");
const { optionalAuthenticate } = require("../middleware/auth");

/**
 * GET /api/tracking/devices
 * Lists registered staff devices, live coordinates, consent, and SOS status (Admin Only)
 */
router.get("/devices", optionalAuthenticate, (req, res) => {
  try {
    if (req.user) {
      const role = (req.user.role || "").toUpperCase();
      if (role !== "ADMIN" && role !== "ADMINISTRATOR") {
        return res.status(403).json({ error: "This resource is restricted to system administrators." });
      }
    }

    // Section 9: Viewing the live staff-location map is audited
    ehrDatabase.recordSafetyAudit({
      actorId: req.user?.id || req.user?.sub || "admin",
      actorName: req.user?.name || "Hospital Administrator",
      actorRole: req.user?.role || "ADMIN",
      action: "VIEW_STAFF_MAP",
      justification: "Administrative staff location overview inspection"
    });

    const devices = ehrDatabase.getStaffDevices();
    return res.json({ devices });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tracking/my-history
 * Doctor self-service transparency: view own tracked positions and events (MedGuard Section 9)
 */
router.get("/my-history", optionalAuthenticate, (req, res) => {
  try {
    const doctorId = req.user?.id || req.user?.doctorId || req.user?.sub || req.query.doctorId;
    if (!doctorId) {
      return res.status(400).json({ error: "Doctor identification required." });
    }
    const result = ehrDatabase.getDoctorPositionHistory(doctorId);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tracking/retention-prune
 * Auto-delete raw position history older than 30-90 days (MedGuard Section 9)
 */
router.post("/retention-prune", optionalAuthenticate, (req, res) => {
  try {
    if (req.user) {
      const role = (req.user.role || "").toUpperCase();
      if (role !== "ADMIN" && role !== "ADMINISTRATOR") {
        return res.status(403).json({ error: "This resource is restricted to system administrators." });
      }
    }
    const days = parseInt(req.body?.days || req.query?.days, 10) || 60;
    const result = ehrDatabase.pruneOldPositionHistory(days);
    return res.json({ status: "SUCCESS", ...result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tracking/events
 * Returns recent geofence risk events and security dispatch logs
 */
router.get("/events", (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const events = ehrDatabase.getGeofenceEvents(limit);
    return res.json({ events });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tracking/audit-logs
 * Role-restricted audit trail for staff location lookups
 */
router.get("/audit-logs", optionalAuthenticate, (req, res) => {
  try {
    if (req.user) {
      const role = (req.user.role || "").toUpperCase();
      if (role !== "ADMIN" && role !== "ADMINISTRATOR") {
        return res.status(403).json({ error: "This resource is restricted to system administrators." });
      }
    }
    const limit = parseInt(req.query.limit, 10) || 50;
    const logs = ehrDatabase.getSafetyAuditLogs(limit);
    return res.json({ logs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tracking/geofence-webhook
 * Traccar standard webhook receiver for geofence exit/enter notifications
 */
router.post("/geofence-webhook", async (req, res) => {
  try {
    const body = req.body || {};
    const eventType = body.type || body.event || "geofenceExit";
    const deviceUniqueId = body.device?.uniqueId || body.deviceId || body.id;
    if (!deviceUniqueId) {
      return res.status(400).json({ error: "Device identifier is required." });
    }

    const geofenceName = body.geofence?.name || body.geofenceName || "Hospital Campus Perimeter";
    const geofenceId = body.geofence?.id || body.geofenceId || "hospital-perimeter";

    const lat = body.position?.latitude || body.latitude || body.lat;
    const lon = body.position?.longitude || body.longitude || body.lon;
    if (lat === undefined || lon === undefined) {
      return res.status(400).json({ error: "Valid latitude and longitude coordinates are required." });
    }

    const timestamp = body.position?.serverTime || body.timestamp || new Date().toISOString();

    const device = ehrDatabase.getStaffDeviceById(deviceUniqueId);
    if (!device) {
      return res.status(404).json({ error: `No registered staff device found for ID: ${deviceUniqueId}` });
    }

    const evaluation = await staffTrackingService.evaluateGeofenceExit({
      deviceId: device.deviceId,
      doctorId: device.doctorId,
      doctorName: device.doctorName,
      geofenceId,
      geofenceName,
      latitude: parseFloat(lat),
      longitude: parseFloat(lon),
      distanceKm: body.distanceKm,
      timestamp
    });

    return res.status(200).json({
      status: "SUCCESS",
      message: `Geofence event processed for ${device.doctorName}. Risk evaluated: ${evaluation.risk_level}.`,
      evaluation
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tracking/osmand-ingest
 * Ingestion endpoint for OsmAnd protocol from Flutter app (or HTTP GET with query params)
 */
const handleOsmAnd = async (req, res) => {
  try {
    const payload = { ...req.query, ...req.body };
    const result = await staffTrackingService.handleOsmAndIngest(payload);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

router.get("/osmand-ingest", handleOsmAnd);
router.post("/osmand-ingest", handleOsmAnd);

/**
 * POST /api/tracking/consent
 * Doctor explicit opt-in / opt-out for continuous GPS tracking
 */
router.post("/consent", (req, res) => {
  try {
    const { doctorId, consentGiven } = req.body;
    if (!doctorId) return res.status(400).json({ error: "Doctor ID is required." });

    const updatedDevice = staffTrackingService.updateConsent(doctorId, consentGiven);
    return res.status(200).json({
      status: "SUCCESS",
      message: `Staff GPS tracking consent updated to ${consentGiven ? "OPT-IN" : "OPT-OUT"}.`,
      device: updatedDevice
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tracking/toggle
 * Doctor toggles tracking on/off (doctor privacy control)
 */
router.post("/toggle", (req, res) => {
  try {
    const { doctorId, enabled } = req.body;
    if (!doctorId) return res.status(400).json({ error: "Doctor ID is required." });

    const updatedDevice = staffTrackingService.toggleTracking(doctorId, enabled);
    return res.status(200).json({
      status: "SUCCESS",
      message: `Staff tracking ${enabled ? "resumed" : "paused (privacy mode)"}.`,
      device: updatedDevice
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/tracking/sos
 * Triggers Panic / Emergency SOS Distress Beacon
 */
router.post("/sos", (req, res) => {
  try {
    const { doctorId, lat, lon } = req.body;
    if (!doctorId) return res.status(400).json({ error: "Doctor ID is required." });

    const event = staffTrackingService.triggerSOS(doctorId, lat && lon ? { lat: parseFloat(lat), lon: parseFloat(lon) } : null);
    return res.status(200).json({
      status: "EMERGENCY_SOS_ACTIVE",
      message: "Emergency SOS beacon broadcasted to hospital security dispatch.",
      event
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tracking/sos/cancel
 * Resolves Panic / Emergency SOS Distress Beacon
 */
router.post("/sos/cancel", (req, res) => {
  try {
    const { doctorId } = req.body;
    const result = staffTrackingService.cancelSOS(doctorId);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
