const axios = require("axios");
const config = require("../config");

const TRUSTED_LOCATIONS = [
  {
    name: "SLIIT Malabe Campus",
    lat: 6.9147,
    lng: 79.9733,
    safeRadiusMeters: 300
  }
];

const MAX_RISK_DISTANCE_METERS = 5000;

function toRad(d) {
  return (d * Math.PI) / 180;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function distanceToRiskScore(distanceMeters, safeRadiusMeters) {
  if (distanceMeters <= safeRadiusMeters) return 0;
  const effectiveDistance = distanceMeters - safeRadiusMeters;
  const effectiveMax = MAX_RISK_DISTANCE_METERS - safeRadiusMeters;
  return Math.min(1, effectiveDistance / effectiveMax);
}

function isWithinTrustedShift(serverTimestamp = new Date()) {
  const t = new Date(
    serverTimestamp.toLocaleString("en-US", { timeZone: "Asia/Colombo" })
  );
  const minutes = t.getHours() * 60 + t.getMinutes();
  return minutes >= 8 * 60 + 30 && minutes <= 17 * 60;
}

async function getLatestPosition(traccarDeviceId) {
  if (!traccarDeviceId) return null;

  // 1. Query real Traccar REST API endpoint (${TRACCAR_BASE}/api/positions?deviceId=...)
  const traccarBase = (config.traccarApiUrl || process.env.TRACCAR_API_URL || "").replace(/\/+$/, "");
  if (traccarBase) {
    try {
      const auth = (config.traccarUser && config.traccarPass) ? {
        username: config.traccarUser,
        password: config.traccarPass
      } : undefined;

      const url = `${traccarBase}/api/positions?deviceId=${encodeURIComponent(traccarDeviceId)}`;
      const response = await axios.get(url, {
        auth,
        timeout: 3000,
        headers: { Accept: "application/json" }
      });

      const positions = response.data;
      if (Array.isArray(positions)) {
        if (positions.length === 0) {
          // Traccar returns zero positions for device -> no position found (R_l = 1.0)
          return null;
        }
        const latest = positions[positions.length - 1];
        return {
          latitude: latest.latitude,
          longitude: latest.longitude,
          fixTime: latest.fixTime || latest.deviceTime || latest.serverTime
        };
      }
    } catch (err) {
      // Traccar server unreachable or API error; fallback to stored device position
    }
  }

  // 2. Telemetry database fallback
  const ehrDatabase = require("./ehrDatabase");
  const device = ehrDatabase.getStaffDeviceById(traccarDeviceId);
  if (device && device.lastPosition) {
    return {
      latitude: device.lastPosition.lat,
      longitude: device.lastPosition.lon,
      fixTime: device.lastPosition.timestamp
    };
  }
  return null;
}

async function computeLocationRisk(traccarDeviceId, directPosition = null) {
  const position = directPosition || (await getLatestPosition(traccarDeviceId));

  if (
    !position ||
    position.latitude === undefined ||
    position.longitude === undefined ||
    position.latitude === null ||
    position.longitude === null
  ) {
    return { R_l: 1.0, locationName: "Unknown", stale: true, distanceMeters: null };
  }

  const fixTimeMs = position.fixTime ? new Date(position.fixTime).getTime() : Date.now();
  const ageSeconds = (Date.now() - fixTimeMs) / 1000;
  if (ageSeconds > 15 * 60) {
    return { R_l: 0.9, locationName: "Stale/Unknown", stale: true, distanceMeters: null };
  }

  let best = null;
  for (const loc of TRUSTED_LOCATIONS) {
    const d = haversineMeters(
      parseFloat(position.latitude),
      parseFloat(position.longitude),
      loc.lat,
      loc.lng
    );
    if (!best || d < best.distanceMeters) {
      best = {
        locationName: loc.name,
        distanceMeters: d,
        safeRadiusMeters: loc.safeRadiusMeters
      };
    }
  }

  const score = distanceToRiskScore(best.distanceMeters, best.safeRadiusMeters);

  return {
    R_l: parseFloat(score.toFixed(4)),
    locationName: best.locationName,
    distanceMeters: Math.round(best.distanceMeters),
    stale: false
  };
}

module.exports = {
  TRUSTED_LOCATIONS,
  MAX_RISK_DISTANCE_METERS,
  haversineMeters,
  distanceToRiskScore,
  isWithinTrustedShift,
  getLatestPosition,
  computeLocationRisk
};
