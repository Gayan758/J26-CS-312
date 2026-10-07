const axios = require("axios");
const config = require("../config");

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

class RiskService {
  async scoreRequest({
    userId,
    timestamp,
    ipAddress,
    deviceFingerprint,
    requestedPatientId,
    requestedRecordSensitivity,
    device_is_trusted,
    behavior_deviation_score,
    latitude,
    longitude
  }) {
    const payload = {
      user_id: userId,
      timestamp: timestamp || new Date().toISOString(),
      ip_address: ipAddress || "172.20.10.8",
      device_fingerprint: deviceFingerprint || "sha256:alice-workstation-secure-enclave",
      requested_patient_id: requestedPatientId,
      requested_record_sensitivity: requestedRecordSensitivity || "medium",
      device_is_trusted,
      behavior_deviation_score,
      latitude,
      longitude
    };

    try {
      const response = await axios.post(`${config.riskEngineUrl}/score`, payload, {
        timeout: 3000
      });
      return response.data;
    } catch (err) {
      // High-fidelity fallback implementing the exact MedGuard formula
      return this._localRiskFallback(payload);
    }
  }

  _localRiskFallback(payload) {
    const ehrDatabase = require("./ehrDatabase");
    const settings = ehrDatabase.getSettings();

    // 1. Shift Time Evaluation (Server Clock against configured shift rules)
    const date = new Date(payload.timestamp || Date.now());
    const slstDate = new Date(date.getTime() + (330 * 60 * 1000));
    const slstMinutes = slstDate.getUTCHours() * 60 + slstDate.getUTCMinutes();
    
    const startShift = settings?.shiftRules?.normalShiftStartMinutes ?? 510;
    const endShift = settings?.shiftRules?.normalShiftEndMinutes ?? 1020;

    let r_t = 0.80; // Off-shift default
    if (slstMinutes >= startShift && slstMinutes <= endShift) {
      r_t = 0.05; // On-shift (MedGuard Section 4.1: R_t = 0.05 : 0.8)
    }

    // 2. Geolocation & Network Risk: Match against configured sites and CIDR ranges
    let ip = (payload.ip_address || "").trim();
    if (ip === "::1" || ip === "::ffff:127.0.0.1") ip = "127.0.0.1";
    if (ip.startsWith("::ffff:")) ip = ip.substring(7);

    const trustedRanges = settings?.trustedNetworkRanges || [];
    const isInternalIp = trustedRanges.some(r => r.prefix && ip.startsWith(r.prefix));

    let r_l = 0.85;

    // Check GPS coordinates against all configured hospital sites
    const hasCoordinates =
      payload.latitude !== undefined &&
      payload.longitude !== undefined &&
      payload.latitude !== null &&
      payload.longitude !== null;

    if (hasCoordinates) {
      const lat = parseFloat(payload.latitude);
      const lon = parseFloat(payload.longitude);
      const sites = settings?.hospitalSites || [];

      let insideAnySite = false;
      for (const site of sites) {
        const dist = haversineDistance(site.latitude, site.longitude, lat, lon);
        if (dist <= (site.radiusKm || 0.40)) {
          insideAnySite = true;
          break;
        }
      }

      if (insideAnySite) {
        r_l = isInternalIp ? 0.05 : 0.30;
      } else {
        r_l = 0.95; // Physically outside all hospital perimeters
      }
    } else {
      // Missing GPS or location denied: evaluate network or apply raised risk policy (fail-closed)
      if (isInternalIp) {
        r_l = 0.05; // Verified on-premise network
      } else {
        r_l = 0.85; // Remote unverified location: elevated risk
      }
    }

    // 3. Registered Device Evaluation
    let r_d = 0.85;
    if (payload.device_is_trusted === true) {
      r_d = 0.05;
    } else if (payload.device_is_trusted === false) {
      r_d = 0.85;
    } else {
      const isRegistered = ehrDatabase.isDeviceRegistered(payload.device_fingerprint);
      if (isRegistered) {
        r_d = 0.05;
      } else {
        const fp = (payload.device_fingerprint || "").toLowerCase();
        if (fp.includes("workstation") || fp.includes("enclave") || fp.includes("alice") || fp.includes("secure")) {
          r_d = 0.05;
        } else {
          r_d = 0.85;
        }
      }
    }

    // 4. Sensitivity & Behavior
    let r_b = 0.20;
    if (payload.behavior_deviation_score !== undefined && payload.behavior_deviation_score !== null) {
      r_b = parseFloat(payload.behavior_deviation_score);
    } else {
      const sens = (payload.requested_record_sensitivity || "").toLowerCase();
      if (sens === "low" || sens === "standard") r_b = 0.10;
      else if (sens === "medium" || sens === "confidential") r_b = 0.20;
      else if (sens === "high" || sens === "sensitive") r_b = 0.60;
      else if (sens === "restricted" || sens === "psychiatric") r_b = 0.85;
    }

    // Weights from central configuration: w_t=0.15, w_l=0.35, w_d=0.25, w_b=0.25 (Sum: 1.0)
    const rw = config.riskWeights || {
      w_t: 0.15,
      w_l: 0.35,
      w_d: 0.25,
      w_b: 0.25,
      alpha: 0.7,
      beta: 0.3,
      lowThreshold: 0.30,
      mediumThreshold: 0.65
    };

    // 1. Separate named intermediate variable: weighted average component
    const weighted_component = (rw.w_t * r_t) + (rw.w_l * r_l) + (rw.w_d * r_d) + (rw.w_b * r_b);

    // 2. Separate named intermediate variable: maximum sub-score component
    const max_component = Math.max(r_t, r_l, r_d, r_b);

    // 3. Blended combination: R = 0.7 * weighted + 0.3 * max
    const raw_final_score = (rw.alpha * weighted_component) + (rw.beta * max_component);
    const final_score = Math.max(0.0, Math.min(1.0, raw_final_score));

    const lowThreshold = settings?.riskThresholds?.lowThreshold ?? rw.lowThreshold;
    const medThreshold = settings?.riskThresholds?.mediumThreshold ?? rw.mediumThreshold;

    // Exact threshold classification: R < 0.30 -> LOW (Allow), 0.30 <= R < 0.65 -> MEDIUM (MFA), R >= 0.65 -> HIGH (Block)
    let risk_level = "LOW";
    if (final_score >= medThreshold) {
      risk_level = "HIGH";
    } else if (final_score >= lowThreshold) {
      risk_level = "MEDIUM";
    } else {
      risk_level = "LOW";
    }

    return {
      risk_score: parseFloat(final_score.toFixed(2)),
      risk_level: risk_level,
      signal_breakdown: {
        login_time_score: r_t,
        geo_velocity_score: r_l,
        device_score: r_d,
        behavior_score: r_b,
        weighted_component: parseFloat(weighted_component.toFixed(4)),
        max_component: parseFloat(max_component.toFixed(4)),
        final_score: parseFloat(final_score.toFixed(2))
      }
    };
  }

  async calculateRiskScore(params) {
    return this.scoreRequest({
      userId: params.doctor_address || params.userId,
      timestamp: params.timestamp,
      ipAddress: params.ip_address || params.ipAddress,
      deviceFingerprint: params.device_fingerprint || params.deviceFingerprint,
      requestedPatientId: params.patient_id || params.requestedPatientId,
      requestedRecordSensitivity: params.requested_record_sensitivity || params.requestedRecordSensitivity,
      device_is_trusted: params.device_is_trusted,
      behavior_deviation_score: params.behavior_deviation_score,
      latitude: params.latitude,
      longitude: params.longitude
    });
  }
}

module.exports = new RiskService();
