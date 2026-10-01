const express = require("express");
const jwt = require("jsonwebtoken");
const config = require("../config");
const passwordService = require("../services/passwordService");
const sessionService = require("../services/sessionService");
const twoFactorService = require("../services/twoFactorService");
const { authenticate, loginLimiter } = require("../middleware/auth");

const router = express.Router();

// Trusted Shift Hours (08:30–17:00, Asia/Colombo timezone)
function isWithinTrustedShift(serverTimestamp = new Date()) {
  const hospitalTime = new Date(serverTimestamp.toLocaleString('en-US', { timeZone: 'Asia/Colombo' }));
  const minutes = hospitalTime.getHours() * 60 + hospitalTime.getMinutes();
  return minutes >= (8 * 60 + 30) && minutes <= (17 * 60);
}

// Trusted Networks (CIDR match)
const TRUSTED_NETWORKS = [
  { name: 'SLIIT Malabe Campus Health Center', cidrs: ['172.20.10.0/28', '10.100.0.0/16', '192.248.0.0/16', '127.0.0.1/32'] },
  { name: 'Seylan Tower 1 Medical Clinic, Colombo', cidrs: ['10.200.0.0/16', '192.168.10.0/24'] }
];

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

function isIPInCIDR(ip, cidr) {
  if (!ip || !cidr) return false;
  let cleanIp = ip.trim();
  if (cleanIp === "::1" || cleanIp === "::ffff:127.0.0.1") cleanIp = "127.0.0.1";
  if (cleanIp.startsWith("::ffff:")) cleanIp = cleanIp.substring(7);

  const [range, bits = 32] = cidr.split("/");
  const mask = ~(2 ** (32 - bits) - 1);
  const ip2long = (addr) => addr.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;

  try {
    return (ip2long(cleanIp) & mask) === (ip2long(range) & mask);
  } catch (err) {
    return false;
  }
}

function checkTrustedLocation(sourceIp) {
  let ip = sourceIp || "";
  if (ip === "::1" || ip === "127.0.0.1" || ip === "::ffff:127.0.0.1" || !ip) {
    ip = "172.20.10.8"; // Map developer host interface
  }

  for (const net of TRUSTED_NETWORKS) {
    for (const cidr of net.cidrs) {
      if (isIPInCIDR(ip, cidr)) {
        const isSliit = net.name.includes("SLIIT");
        return {
          trusted: true,
          isInternal: true,
          campusKey: isSliit ? "SLIIT_MALABE" : "SEYLAN_TOWER_1",
          facility: net.name,
          campusName: net.name,
          ip
        };
      }
    }
  }

  return {
    trusted: false,
    isInternal: false,
    campusKey: "UNKNOWN",
    facility: 'External / Off-Campus Network',
    campusName: 'External / Off-Campus Network',
    ip: sourceIp || "203.0.113.88"
  };
}

function detectHospitalNetwork(ip) {
  return checkTrustedLocation(ip);
}

/**
 * POST /api/auth/register
 * Doctor self-registration with SLMC credentials and persistent storage
 */
router.post("/register", async (req, res) => {
  const doctorName = req.body.name || req.body.fullName;
  const { slmcNumber, specialty, username, password, baseCampus, phone, deviceFingerprint, email } = req.body;

  if (!doctorName || !username || !password) {
    return res.status(400).json({ error: "Doctor Name, Username, and Password are required." });
  }

  const policy = passwordService.validatePasswordPolicy(password);
  if (!policy.valid) {
    return res.status(400).json({ error: policy.error });
  }

  try {
    const ehrDatabase = require("../services/ehrDatabase");
    const emailService = require("../services/emailService");
    const cleanEmail = (email || `${username}@hospital.lk`).trim().toLowerCase();
    const hashedPassword = await passwordService.hashPassword(password);

    const newDoctor = ehrDatabase.registerDoctor({
      name: doctorName,
      email: cleanEmail,
      slmcNumber,
      specialty,
      username,
      password: hashedPassword,
      baseCampus,
      phone,
      deviceFingerprint
    });

    // Dispatch 2FA enrollment & verification notification email
    let emailStatus = null;
    try {
      emailStatus = await emailService.send2FAOtp(
        newDoctor.id,
        cleanEmail,
        newDoctor.name,
        {
          reason: "Physician Clinical Account Registration & 2FA Enrollment",
          network: baseCampus || "Hospital Network",
          fingerprint: deviceFingerprint || "Enrolled Clinical Workstation"
        }
      );
    } catch (e) {
      // Non-fatal email dispatch failure on registration
    }

    return res.status(201).json({
      message: "Doctor registered successfully with MedGuard EHR.",
      doctor: newDoctor,
      emailStatus
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/auth/login
 * Doctor authentication with real coordinates capture & persistent session location
 */
router.post("/login", loginLimiter, async (req, res) => {
  const { username, password, coordinates, deviceFingerprint } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const ehrDatabase = require("../services/ehrDatabase");
  const doctor = ehrDatabase.getDoctorByUsername(username) || ehrDatabase.getDoctorById(username);

  if (!doctor) {
    return res.status(401).json({ error: "Invalid username or password. Please verify your credentials." });
  }

  const isPasswordValid = await passwordService.comparePassword(password, doctor.password);
  if (!isPasswordValid) {
    return res.status(401).json({ error: "Invalid username or password. Please verify your credentials." });
  }

  // Enforce administrative suspension
  if (doctor.disabled || doctor.status === "disabled") {
    return res.status(403).json({
      error: "Access Denied: Your account has been temporarily suspended by Hospital Administration. Please contact IT Security."
    });
  }

  // Transparent password upgrade to bcrypt cost factor >= 12
  if (passwordService.needsRehash(doctor.password)) {
    try {
      const newHashed = await passwordService.hashPassword(password);
      ehrDatabase.updateDoctorPassword(doctor.id, newHashed);
    } catch (e) {
      // Non-fatal rehash
    }
  }

  // Location calculation from real client GPS
  let locationInfo = {
    latitude: null,
    longitude: null,
    accuracy: null,
    distanceKm: null,
    isInsideCampus: false,
    campusName: "Unverified Location (No GPS)"
  };

  const clientIp = req.headers["x-forwarded-for"] || req.ip || "127.0.0.1";

  if (coordinates && coordinates.latitude !== undefined && coordinates.longitude !== undefined) {
    const lat = parseFloat(coordinates.latitude);
    const lon = parseFloat(coordinates.longitude);
    const acc = parseFloat(coordinates.accuracy) || 10;
    const distKm = haversineDistance(6.9147, 79.9733, lat, lon);
    const isInside = distKm <= 0.40; // 400m perimeter
    const campusName = isInside ? (doctor.baseCampus || "Hospital Campus (Inside Perimeter)") : `Outside Hospital Perimeter (${distKm.toFixed(2)} km)`;

    locationInfo = {
      latitude: lat,
      longitude: lon,
      accuracy: acc,
      distanceKm: parseFloat(distKm.toFixed(2)),
      isInsideCampus: isInside,
      campusName
    };

    // Save doctor's real location in DB
    ehrDatabase.saveDoctorSessionLocation(doctor.id, {
      latitude: lat,
      longitude: lon,
      accuracy: acc,
      distanceFromMalabeKm: parseFloat(distKm.toFixed(2)),
      isInsideMalabe: isInside,
      campusName,
      ipAddress: clientIp,
      userAgent: req.headers["user-agent"] || ""
    });
  } else {
    // If no GPS transmitted, save unverified session location
    ehrDatabase.saveDoctorSessionLocation(doctor.id, {
      latitude: null,
      longitude: null,
      accuracy: null,
      distanceFromMalabeKm: null,
      isInsideMalabe: false,
      campusName: "Unverified Location (No GPS)",
      ipAddress: clientIp,
      userAgent: req.headers["user-agent"] || ""
    });
  }

  // Enroll device fingerprint if supplied
  if (deviceFingerprint) {
    ehrDatabase.addTrustedDevice(doctor.ethereumAddress || doctor.id, deviceFingerprint);
  }

  const tokenPayload = {
    id: doctor.id,
    username: doctor.username,
    name: doctor.name,
    email: doctor.email || "",
    slmcNumber: doctor.slmcNumber || "",
    specialty: doctor.specialty || "General Medicine",
    ethereumAddress: doctor.ethereumAddress || "",
    baseCampus: doctor.baseCampus || "",
    defaultDeviceFingerprint: doctor.defaultDeviceFingerprint || "",
    role: doctor.role || "Doctor",
    lastKnownLocation: locationInfo
  };

  const token = sessionService.createSessionToken(tokenPayload);
  sessionService.setSessionCookie(res, token);

  res.status(200).json({
    message: "Doctor authenticated successfully.",
    token,
    doctor: tokenPayload,
    locationInfo
  });
});

/**
 * GET /api/auth/me
 * Session verification from HTTP-only cookie or Authorization Bearer token
 */
router.get("/me", authenticate, (req, res) => {
  res.status(200).json({
    user: req.user,
    doctor: req.user
  });
});

/**
 * POST /api/auth/logout
 * Terminates the authenticated session and clears the HTTP-only cookie
 */
router.post("/logout", (req, res) => {
  sessionService.clearSessionCookie(res);
  res.status(200).json({ message: "Signed out successfully." });
});

/**
 * POST /api/auth/2fa/totp/setup
 * Generates an RFC 6238 TOTP secret for authenticator apps (Google / Microsoft Authenticator)
 */
router.post("/2fa/totp/setup", authenticate, (req, res) => {
  try {
    const email = req.user.email || `${req.user.username}@hospital.lk`;
    const totpData = twoFactorService.generateTotpSecret(email, "MedGuard EHR");
    return res.status(200).json(totpData);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/2fa/totp/verify
 * Verifies a 6-digit TOTP code and activates authenticator app 2FA for the account
 */
router.post("/2fa/totp/verify", authenticate, (req, res) => {
  try {
    const { code, secret } = req.body;
    if (!code || !secret) {
      return res.status(400).json({ error: "TOTP code and secret are required." });
    }

    const isValid = twoFactorService.verifyTotp(code, secret);
    if (!isValid) {
      return res.status(400).json({
        error: "Invalid TOTP verification code. Please check your authenticator app and try again."
      });
    }

    const ehrDatabase = require("../services/ehrDatabase");
    ehrDatabase.setDoctorTotpSecret(req.user.id, secret);

    return res.status(200).json({
      success: true,
      message: "Two-factor authentication successfully configured with your authenticator app."
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/patient-login
 * Authenticates a patient by PHN, NIC, or patient ID for Patient Portal
 */
router.post("/patient-login", loginLimiter, (req, res) => {
  const { identifier } = req.body;
  if (!identifier) {
    return res.status(400).json({ error: "Personal Health Number (PHN) or NIC is required." });
  }

  const ehrDatabase = require("../services/ehrDatabase");
  const patient = ehrDatabase.getPatientByIdentifier(identifier);
  if (!patient) {
    return res.status(404).json({ error: `No registered patient found matching "${identifier}". Please verify your PHN or NIC.` });
  }

  const tokenPayload = {
    id: patient.id,
    phn: patient.phn,
    nic: patient.nic,
    name: patient.name,
    role: "Patient"
  };

  const token = sessionService.createSessionToken(tokenPayload);
  sessionService.setSessionCookie(res, token);

  return res.status(200).json({
    message: "Patient authenticated successfully.",
    token,
    patient: tokenPayload
  });
});

/**
 * GET /api/auth/doctors
 * Returns all active hospital physicians for patient care-team selection
 */
router.get("/doctors", (req, res) => {
  const ehrDatabase = require("../services/ehrDatabase");
  const dbData = ehrDatabase._readData();
  const doctorsList = (dbData.doctors || []).map(({ password, ...d }) => d);
  return res.status(200).json({ doctors: doctorsList });
});

/**
 * GET /api/auth/network-status
 * Auto-detects hospital network range based on client IP
 */
router.get("/network-status", (req, res) => {
  const clientIp = req.headers["x-forwarded-for"] || req.ip || "127.0.0.1";
  const detection = detectHospitalNetwork(clientIp);
  res.status(200).json(detection);
});

/**
 * GET /api/auth/context-status
 * Real auto-detected hospital network & SLST shift status from server clock
 */
router.get("/context-status", (req, res) => {
  const clientIp = req.headers["x-forwarded-for"] || req.ip || "127.0.0.1";
  const now = new Date();
  const inShift = isWithinTrustedShift(now);
  const locationInfo = checkTrustedLocation(clientIp);

  const docId = req.query.doctorId || req.headers["x-doctor-address"] || "";
  let doctorLocation = null;
  if (docId) {
    const ehrDatabase = require("../services/ehrDatabase");
    doctorLocation = ehrDatabase.getDoctorLastLocation(docId);
  }

  // Sri Lanka Standard Time formatting
  const slstString = now.toLocaleTimeString("en-US", { timeZone: "Asia/Colombo", hour: "2-digit", minute: "2-digit" });

  res.status(200).json({
    serverTime: now.toISOString(),
    slstTime: `${slstString} (SLST)`,
    inShift,
    shiftStatus: inShift ? "IN-SHIFT (08:30–17:00)" : "OUT-OF-SHIFT (08:30–17:00)",
    detectedIp: locationInfo.ip,
    detectedLocation: doctorLocation ? doctorLocation.campusName : locationInfo.campusName,
    facility: locationInfo.facility,
    isLocationTrusted: doctorLocation !== null ? (doctorLocation.isInsideMalabe && locationInfo.trusted) : locationInfo.trusted,
    doctorLocation
  });
});

/**
 * POST /api/auth/verify-device
 * 2FA OTP verification to enroll & trust a new device fingerprint
 */
router.post("/verify-device", (req, res) => {
  const { doctorId, fingerprint, otp } = req.body;
  if (!doctorId || !fingerprint) {
    return res.status(400).json({ error: "doctorId and device fingerprint are required." });
  }

  const emailService = require("../services/emailService");
  const verification = emailService.verify2FAOtp(doctorId, otp);
  if (!verification.valid) {
    return res.status(401).json({ error: verification.error || "Invalid 2FA verification code. Please check your registered email." });
  }

  const ehrDatabase = require("../services/ehrDatabase");
  ehrDatabase.addTrustedDevice(doctorId, fingerprint);

  return res.status(200).json({
    success: true,
    message: "2FA verified! Device successfully enrolled as trusted clinical workstation.",
    fingerprint,
    email: verification.email
  });
});

/**
 * POST /api/auth/send-2fa-otp
 * Dispatches dynamic 6-digit OTP to doctor's registered email
 */
router.post("/send-2fa-otp", async (req, res) => {
  const { doctorId, email, reason, fingerprint, network } = req.body;
  const ehrDatabase = require("../services/ehrDatabase");
  const emailService = require("../services/emailService");

  let doc = null;
  if (doctorId) {
    doc = ehrDatabase.getDoctorById(doctorId) || ehrDatabase.getDoctorByUsername(doctorId);
  }

  const targetEmail = (email || (doc ? doc.email : "")).trim();
  if (!targetEmail || !targetEmail.includes("@")) {
    return res.status(400).json({ error: "No valid email address registered for 2FA dispatch." });
  }

  const doctorName = doc ? doc.name : (req.body.doctorName || "Attending Clinician");

  try {
    const result = await emailService.send2FAOtp(
      doctorId || targetEmail,
      targetEmail,
      doctorName,
      {
        reason: reason || "Context-Aware RiskBAC Policy Step-Up Authentication",
        network: network || "Hospital Network",
        fingerprint: fingerprint || "Clinical Workstation Enclave"
      }
    );

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: `Failed to dispatch 2FA email: ${err.message}` });
  }
});

/**
 * PUT /api/auth/update-email
 * Allows a clinician to update their registered 2FA notification email
 */
router.put("/update-email", async (req, res) => {
  const { doctorId, email } = req.body;
  if (!doctorId || !email) {
    return res.status(400).json({ error: "Doctor ID and Email are required." });
  }

  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail.includes("@") || !cleanEmail.includes(".")) {
    return res.status(400).json({ error: "Invalid email format." });
  }

  try {
    const ehrDatabase = require("../services/ehrDatabase");
    const emailService = require("../services/emailService");
    const updated = ehrDatabase.updateDoctorEmail(doctorId, cleanEmail);

    const emailStatus = await emailService.send2FAOtp(
      updated.id,
      cleanEmail,
      updated.name,
      { reason: "2FA Notification Email Address Updated", network: "MedGuard Clinical System" }
    );

    return res.status(200).json({
      message: "2FA email updated successfully.",
      doctor: updated,
      emailStatus
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/auth/device-status
 * Checks if a device fingerprint is enrolled as trusted for a doctor
 */
router.get("/device-status", (req, res) => {
  const doctorId = req.query.doctorId || req.headers["x-doctor-address"] || "";
  const fingerprint = req.query.fingerprint || req.headers["x-device-fingerprint"] || "";
  const ehrDatabase = require("../services/ehrDatabase");
  const result = ehrDatabase.checkTrustedDevice(doctorId, fingerprint);
  return res.status(200).json(result);
});

module.exports = {
  router,
  detectHospitalNetwork,
  checkTrustedLocation,
  isWithinTrustedShift
};
