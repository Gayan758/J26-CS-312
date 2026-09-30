const axios = require("axios");
const config = require("../config");
const ehrDatabase = require("./ehrDatabase");

// Campus geofence boundaries
const GEOFENCES = {
  "sliit-malabe": {
    id: "sliit-malabe",
    name: "SLIIT Malabe Campus (Main Perimeter)",
    campusKey: "SLIIT_MALABE",
    centerLat: 6.9147,
    centerLon: 79.9733,
    radiusKm: 0.40
  },
  "seylan-tower-1": {
    id: "seylan-tower-1",
    name: "Seylan Tower 1 Clinic, Colombo",
    campusKey: "SEYLAN_TOWER_1",
    centerLat: 6.9147,
    centerLon: 79.8460,
    radiusKm: 0.25
  }
};

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371.0;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

class StaffTrackingService {
  /**
   * Ingests high-accuracy GPS fix from Flutter mobile app via OsmAnd protocol (Port 5055 / HTTP)
   * Format: ?id={deviceId}&lat={lat}&lon={lon}&timestamp={timestamp}&speed={speed}&altitude={alt}&accuracy={acc}&batt={batt}&sos={bool}
   */
  async handleOsmAndIngest(payload) {
    const { id, lat, lon, timestamp, speed, altitude, accuracy, batt, sos } = payload;
    if (!id || lat === undefined || lon === undefined) {
      throw new Error("Missing mandatory OsmAnd parameters (id, lat, lon).");
    }

    const device = ehrDatabase.getStaffDeviceById(id);
    if (!device) {
      // Auto-register mobile test terminal if not present
      ehrDatabase.upsertStaffDevice({
        deviceId: id,
        doctorId: "doc-external",
        doctorName: `Staff Device (${id})`,
        deviceName: `Clinical Phone (${id})`,
        osmandProtocolId: id,
        consentGiven: true,
        consentTimestamp: new Date().toISOString(),
        trackingEnabled: true,
        sosActive: Boolean(sos),
        batteryLevel: batt ? parseFloat(batt) : 100
      });
    }

    const currentDevice = ehrDatabase.getStaffDeviceById(id);

    // Privacy rule: If tracking is disabled and NOT in SOS emergency, do not record continuous trajectory
    if (!currentDevice.trackingEnabled && !sos) {
      return {
        status: "IGNORED_PRIVACY_TOGGLE",
        message: "Staff tracking is toggled OFF by doctor. Trajectory fix ignored."
      };
    }

    // Update live position
    const updatedDevice = ehrDatabase.updateDevicePosition(id, {
      lat: parseFloat(lat),
      lon: parseFloat(lon),
      speed: speed ? parseFloat(speed) : 0,
      altitude: altitude ? parseFloat(altitude) : 0,
      accuracy: accuracy ? parseFloat(accuracy) : 10,
      timestamp: timestamp ? new Date(parseInt(timestamp) * 1000 || timestamp).toISOString() : new Date().toISOString(),
      batteryLevel: batt ? parseFloat(batt) : currentDevice.batteryLevel,
      sos: Boolean(sos)
    });

    // Check geofence boundary exit (specifically SLIIT Malabe Campus)
    const malabe = GEOFENCES["sliit-malabe"];
    const distanceKm = haversineDistance(malabe.centerLat, malabe.centerLon, parseFloat(lat), parseFloat(lon));
    const isOutsideMalabe = distanceKm > malabe.radiusKm;

    let geofenceAlert = null;
    if (isOutsideMalabe) {
      geofenceAlert = await this.evaluateGeofenceExit({
        deviceId: currentDevice.deviceId,
        doctorId: currentDevice.doctorId,
        doctorName: currentDevice.doctorName,
        geofenceId: malabe.id,
        geofenceName: malabe.name,
        latitude: parseFloat(lat),
        longitude: parseFloat(lon),
        distanceKm,
        timestamp: updatedDevice.lastPosition.timestamp
      });
    }

    return {
      status: "SUCCESS",
      device: updatedDevice,
      distanceFromMalabeKm: parseFloat(distanceKm.toFixed(3)),
      isOutsideMalabe,
      geofenceAlert
    };
  }

  /**
   * Geofence exit evaluator triggered by Traccar webhook or OsmAnd position check
   * Evaluates secondary GPS departure risk via Python Risk Engine
   */
  async evaluateGeofenceExit(eventData) {
    const {
      deviceId,
      doctorId,
      doctorName,
      geofenceId,
      geofenceName,
      latitude,
      longitude,
      distanceKm,
      timestamp
    } = eventData;

    let riskResponse = null;

    // Call Python Risk Engine /gps-risk
    try {
      const response = await axios.post(`${config.riskEngineUrl}/gps-risk`, {
        doctor_id: doctorId,
        timestamp: timestamp || new Date().toISOString(),
        latitude,
        longitude,
        reference_campus: "SLIIT_MALABE",
        geofence_id: geofenceId || "sliit-malabe"
      }, { timeout: 3000 });

      riskResponse = response.data;
    } catch (err) {
      // Local high-fidelity fallback implementing exact distance + SLST time formula
      riskResponse = this._localGpsRiskFallback({
        doctorId,
        latitude,
        longitude,
        timestamp: timestamp || new Date().toISOString()
      });
    }

    const {
      distance_km,
      gps_risk_score,
      risk_level,
      notify_security,
      security_reason
    } = riskResponse;

    // Record geofence exit risk event in database
    const savedEvent = ehrDatabase.recordGeofenceEvent({
      deviceId,
      doctorId,
      doctorName,
      geofenceId,
      geofenceName,
      eventType: "GEOFENCE_EXIT",
      latitude,
      longitude,
      distanceFromBaseKm: distance_km,
      calculatedRiskScore: gps_risk_score,
      riskLevel: risk_level,
      securityNotified: notify_security,
      securityReason: security_reason
    });

    // Record audit log entry
    ehrDatabase.recordSafetyAudit({
      actorId: "system-traccar-geofence",
      actorName: "Traccar Geofence Service",
      actorRole: "Automated Dispatch Monitor",
      action: "GEOFENCE_EXIT_ALERT",
      targetDoctorId: doctorId,
      justification: `Automated geofence departure alert: ${doctorName} exited ${geofenceName} (${distance_km} km, Risk: ${risk_level})`
    });

    return {
      event: savedEvent,
      risk_score: gps_risk_score,
      risk_level,
      notify_security,
      security_reason
    };
  }

  _localGpsRiskFallback({ doctorId, latitude, longitude, timestamp }) {
    const malabe = GEOFENCES["sliit-malabe"];
    const distKm = haversineDistance(malabe.centerLat, malabe.centerLon, latitude, longitude);
    const isOutside = distKm > malabe.radiusKm;

    let r_dist = 0.05;
    if (distKm > 25.0) r_dist = 0.90;
    else if (distKm > 10.0) r_dist = 0.75;
    else if (distKm > 2.0) r_dist = 0.60;
    else if (distKm > 0.4) r_dist = 0.30;

    // Time in SLST (UTC+5:30)
    const date = new Date(timestamp);
    const slstDate = new Date(date.getTime() + (330 * 60 * 1000));
    const minutes = slstDate.getUTCHours() * 60 + slstDate.getUTCMinutes();
    const isShift = minutes >= 510 && minutes <= 1020;

    let r_tod = 0.30;
    if (isShift) r_tod = 0.65;
    else if (minutes > 1200 || minutes < 360) r_tod = 0.75;
    else if (minutes > 1020 && minutes <= 1200) r_tod = 0.25;

    const gps_risk = isOutside ? parseFloat((0.60 * r_dist + 0.40 * r_tod).toFixed(3)) : 0.05;
    let risk_level = "LOW";
    if (gps_risk >= 0.85) risk_level = "CRITICAL";
    else if (gps_risk >= 0.65) risk_level = "HIGH";
    else if (gps_risk >= 0.30) risk_level = "MEDIUM";

    const notify_security = isOutside && (risk_level === "HIGH" || risk_level === "CRITICAL");
    const security_reason = notify_security
      ? `Staff Alert: Doctor ${doctorId} departed SLIIT Malabe Campus (${distKm.toFixed(2)} km off-site). Risk: ${gps_risk.toFixed(2)} (${risk_level}).`
      : null;

    return {
      doctor_id: doctorId,
      timestamp,
      latitude,
      longitude,
      reference_campus: "SLIIT_MALABE",
      distance_km: parseFloat(distKm.toFixed(3)),
      is_outside_geofence: isOutside,
      distance_risk_score: r_dist,
      time_of_day_risk_score: r_tod,
      gps_risk_score: gps_risk,
      risk_level,
      notify_security,
      security_reason
    };
  }

  triggerSOS(doctorId, position) {
    const device = ehrDatabase.getStaffDeviceById(doctorId);
    if (device) {
      device.sosActive = true;
      if (position) {
        device.lastPosition = { ...device.lastPosition, ...position, timestamp: new Date().toISOString() };
      }
      ehrDatabase.upsertStaffDevice(device);
    }

    const event = ehrDatabase.recordGeofenceEvent({
      deviceId: device?.deviceId || `dev-${doctorId}`,
      doctorId,
      doctorName: device?.doctorName || "Doctor",
      geofenceId: "sos-emergency",
      geofenceName: "Emergency SOS Distress Beacon",
      eventType: "SOS_TRIGGERED",
      latitude: position?.lat || null,
      longitude: position?.lon || null,
      distanceFromBaseKm: 0.0,
      calculatedRiskScore: 0.99,
      riskLevel: "CRITICAL",
      securityNotified: true,
      securityReason: `EMERGENCY SOS: Panic beacon activated by ${device?.doctorName || doctorId}! Immediate dispatch requested.`
    });

    ehrDatabase.recordSafetyAudit({
      actorId: doctorId,
      actorName: device?.doctorName || "Doctor",
      actorRole: "Clinical Staff Member",
      action: "SOS_TRIGGERED",
      targetDoctorId: doctorId,
      justification: "Staff emergency SOS beacon triggered"
    });

    return event;
  }

  cancelSOS(doctorId) {
    const device = ehrDatabase.getStaffDeviceById(doctorId);
    if (device) {
      device.sosActive = false;
      ehrDatabase.upsertStaffDevice(device);
    }
    return { status: "SUCCESS", message: "SOS distress signal resolved." };
  }

  updateConsent(doctorId, consentGiven) {
    const device = ehrDatabase.getStaffDeviceById(doctorId);
    if (!device) throw new Error(`Staff device not found for doctor: ${doctorId}`);

    device.consentGiven = Boolean(consentGiven);
    device.consentTimestamp = new Date().toISOString();
    device.trackingEnabled = Boolean(consentGiven);
    ehrDatabase.upsertStaffDevice(device);

    ehrDatabase.recordSafetyAudit({
      actorId: doctorId,
      actorName: device.doctorName,
      actorRole: "Clinical Staff Member",
      action: "UPDATE_STAFF_CONSENT",
      targetDoctorId: doctorId,
      justification: `Doctor updated GPS tracking consent: ${consentGiven ? "OPT-IN" : "OPT-OUT"}`
    });

    return device;
  }

  toggleTracking(doctorId, enabled) {
    const device = ehrDatabase.getStaffDeviceById(doctorId);
    if (!device) throw new Error(`Staff device not found for doctor: ${doctorId}`);
    if (!device.consentGiven && enabled) {
      throw new Error("Cannot enable tracking without signed staff safety consent.");
    }

    device.trackingEnabled = Boolean(enabled);
    ehrDatabase.upsertStaffDevice(device);
    return device;
  }
}

module.exports = new StaffTrackingService();
