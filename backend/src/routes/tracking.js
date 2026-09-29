const express = require("express");
const router = express.Router();
const ehrDatabase = require("../services/ehrDatabase");
const staffTrackingService = require("../services/staffTrackingService");

/**
 * GET /api/tracking/devices
 * Lists registered staff devices, live coordinates, consent, and SOS status
 */
router.get("/devices", (req, res) => {
  try {
    const devices = ehrDatabase.getStaffDevices();
    return res.json({ devices });
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
router.get("/audit-logs", (req, res) => {
  try {
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
    // Supports Traccar native webhook payload or standard JSON
    const eventType = body.type || body.event || "geofenceExit";
    const deviceUniqueId = body.device?.uniqueId || body.deviceId || body.id || "alice_vance_mobile";
    const geofenceName = body.geofence?.name || body.geofenceName || "SLIIT Malabe Campus (Main Perimeter)";
    const geofenceId = body.geofence?.id || body.geofenceId || "sliit-malabe";

    const lat = body.position?.latitude || body.latitude || body.lat || 6.9421;
    const lon = body.position?.longitude || body.longitude || body.lon || 79.9912;
    const timestamp = body.position?.serverTime || body.timestamp || new Date().toISOString();

    const device = ehrDatabase.getStaffDeviceById(deviceUniqueId) || {
      deviceId: deviceUniqueId,
      doctorId: "doc-001",
      doctorName: "Dr. Alice Vance, MD"
    };

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
      message: `Geofence exit processed for ${device.doctorName}. Risk evaluated: ${evaluation.risk_level}.`,
      evaluation
    });
  } catch (err) {
    console.error("[TrackingWebhook] Error processing geofence webhook:", err);
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

/**
 * POST /api/tracking/simulate-exit
 * Developer / Viva Presentation Helper: Simulates Dr. Alice Vance moving outside Malabe to Kaduwela
 * Triggers automated geofence webhook, calls Python Risk Engine, and flags security dispatch
 */
router.post("/simulate-exit", async (req, res) => {
  try {
    const doctorId = req.body.doctorId || "doc-001";
    const doctor = ehrDatabase.getStaffDeviceById(doctorId);
    const targetName = doctor ? doctor.doctorName : "Dr. Alice Vance, MD";

    // Kaduwela Junction coordinates: ~ 4.2 km outside SLIIT Malabe Campus
    const kaduwelaLat = 6.9421;
    const kaduwelaLon = 79.9912;
    const now = new Date().toISOString();

    // 1. Update position in database
    ehrDatabase.updateDevicePosition(doctor ? doctor.deviceId : "dev-alice-01", {
      lat: kaduwelaLat,
      lon: kaduwelaLon,
      speed: 38.5,
      altitude: 16.0,
      accuracy: 6.0,
      timestamp: now,
      batteryLevel: 78
    });

    // 2. Trigger automated geofence exit pipeline
    const evaluation = await staffTrackingService.evaluateGeofenceExit({
      deviceId: doctor ? doctor.deviceId : "dev-alice-01",
      doctorId,
      doctorName: targetName,
      geofenceId: "sliit-malabe",
      geofenceName: "SLIIT Malabe Campus (Main Perimeter)",
      latitude: kaduwelaLat,
      longitude: kaduwelaLon,
      timestamp: now
    });

    return res.status(200).json({
      status: "SUCCESS",
      simulatedLocation: {
        name: "Kaduwela Junction (Outer Ring)",
        lat: kaduwelaLat,
        lon: kaduwelaLon,
        distanceFromCampusKm: evaluation.event.distanceFromBaseKm
      },
      evaluation
    });
  } catch (err) {
    console.error("[SimulateExit] Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
