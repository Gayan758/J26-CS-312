const express = require("express");
const jwt = require("jsonwebtoken");
const config = require("../config");

const router = express.Router();

// Pre-seeded clinical demo accounts
const DEMO_DOCTORS = [
  {
    id: "doc-001",
    username: "alice.vance",
    password: "Password123!",
    name: "Dr. Alice Vance, MD",
    email: "alice.vance@sliit.lk",
    specialty: "Consultant Cardiologist",
    ethereumAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    baseCampus: "SLIIT Malabe Campus Health Center",
    defaultDeviceFingerprint: "sha256:alice-workstation-secure-enclave",
    role: "Doctor"
  },
  {
    id: "doc-002",
    username: "kasun.perera",
    password: "Password123!",
    name: "Dr. Kasun Perera, MBBS",
    email: "kasun.perera@seylan.lk",
    specialty: "Emergency Medicine Specialist",
    ethereumAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    baseCampus: "Seylan Tower 1 Medical Clinic (Kollupitiya)",
    defaultDeviceFingerprint: "sha256:kasun-mdm-tablet",
    role: "Doctor"
  },
  {
    id: "doc-003",
    username: "sarah.jenkins",
    password: "Password123!",
    name: "Dr. Sarah Jenkins, MD",
    email: "sarah.jenkins@hospital.lk",
    specialty: "Visiting Neurologist",
    ethereumAddress: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    baseCampus: "External Specialist / On-Call",
    defaultDeviceFingerprint: "sha256:sarah-laptop",
    role: "Doctor"
  }
];

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

  const cleanEmail = (email || "").trim().toLowerCase() || `${username.trim().toLowerCase()}@sliit.lk`;
  if (!cleanEmail.includes("@") || !cleanEmail.includes(".")) {
    return res.status(400).json({ error: "Please provide a valid registered email address for 2FA OTP delivery." });
  }

  try {
    const ehrDatabase = require("../services/ehrDatabase");
    const emailService = require("../services/emailService");

    const newDoctor = ehrDatabase.registerDoctor({
      name: doctorName,
      email: cleanEmail,
      slmcNumber,
      specialty,
      username,
      password,
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
          network: baseCampus || "SLIIT Malabe Hospital",
          fingerprint: deviceFingerprint || "Enrolled Clinical Workstation"
        }
      );
    } catch (e) {
      console.warn("[Auth] Email dispatch on register warning:", e.message);
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
router.post("/login", (req, res) => {
  const { username, password, coordinates, deviceFingerprint } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const ehrDatabase = require("../services/ehrDatabase");
  let doctor = ehrDatabase.getDoctorByUsername(username);

  if (!doctor) {
    // Check pre-seeded DEMO_DOCTORS
    doctor = DEMO_DOCTORS.find(
      (d) => d.username.toLowerCase() === username.trim().toLowerCase() && d.password === password
    );
  } else if (doctor.password !== password) {
    doctor = null;
  }

  if (!doctor) {
    return res.status(401).json({ error: "Invalid username or password. Please verify your clinical credentials." });
  }

  // Real location calculation
  let locationInfo = {
    latitude: 6.9147,
    longitude: 79.9733,
    accuracy: 8,
    distanceKm: 0.0,
    isInsideCampus: true,
    campusName: doctor.baseCampus || "SLIIT Malabe Campus Health Center"
  };

  if (coordinates && coordinates.latitude !== undefined && coordinates.longitude !== undefined) {
    const lat = parseFloat(coordinates.latitude);
    const lon = parseFloat(coordinates.longitude);
    const acc = parseFloat(coordinates.accuracy) || 10;
    const distKm = haversineDistance(6.9147, 79.9733, lat, lon);
    const isInside = distKm <= 0.40; // 400m perimeter
    const campusName = isInside ? "SLIIT Malabe Campus (Inside Perimeter)" : `Outside SLIIT Malabe (${distKm.toFixed(2)} km)`;

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
      ipAddress: req.ip || req.headers["x-forwarded-for"] || "172.20.10.8",
      userAgent: req.headers["user-agent"] || ""
    });
  } else {
    // If no GPS transmitted, save default campus location
    ehrDatabase.saveDoctorSessionLocation(doctor.id, {
      latitude: 6.9147,
      longitude: 79.9733,
      accuracy: 10,
      distanceFromMalabeKm: 0.0,
      isInsideMalabe: true,
      campusName: "SLIIT Malabe Campus Health Center",
      ipAddress: req.ip || req.headers["x-forwarded-for"] || "172.20.10.8",
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
    email: doctor.email || `${doctor.username}@sliit.lk`,
    slmcNumber: doctor.slmcNumber || "SLMC-VERIFIED",
    specialty: doctor.specialty,
    ethereumAddress: doctor.ethereumAddress,
    baseCampus: doctor.baseCampus,
    defaultDeviceFingerprint: doctor.defaultDeviceFingerprint,
    role: doctor.role,
    lastKnownLocation: locationInfo
  };

  const token = jwt.sign(tokenPayload, config.jwtSecret, { expiresIn: "8h" });

  res.status(200).json({
    message: "Doctor authenticated successfully.",
    token,
    doctor: tokenPayload,
    locationInfo
  });
});

/**
 * GET /api/auth/me
 * Session verification
 */
router.get("/me", (req, res) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No active clinical session" });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    res.status(200).json({ doctor: decoded });
  } catch (err) {
    res.status(401).json({ error: "Session expired or invalid" });
  }
});

/**
 * POST /api/auth/patient-login
 * Authenticates a patient by PHN, NIC, or patient ID for Patient Portal
 */
router.post("/patient-login", (req, res) => {
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

  const token = jwt.sign(tokenPayload, config.jwtSecret, { expiresIn: "8h" });

  return res.status(200).json({
    message: "Patient authenticated successfully.",
    token,
    patient
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
 * GET /api/auth/patient-accounts
 * Exposes seeded patient profiles for 1-click patient portal demo login
 */
router.get("/patient-accounts", (req, res) => {
  const ehrDatabase = require("../services/ehrDatabase");
  const patients = ehrDatabase.getPatients().slice(0, 4).map(p => ({
    id: p.id,
    phn: p.phn,
    nic: p.nic,
    name: p.name,
    bloodGroup: p.bloodGroup,
    sensitivity: p.sensitivity,
    assignedDoctorsCount: (p.assignedDoctorIds || []).length
  }));
  return res.status(200).json(patients);
});

/**
 * GET /api/auth/demo-accounts
 * Exposes pre-seeded demo accounts for easy testing in the UI
 */
router.get("/demo-accounts", (req, res) => {
  const safeAccounts = DEMO_DOCTORS.map(({ password, ...rest }) => ({
    ...rest,
    demoPassword: password
  }));
  res.status(200).json(safeAccounts);
});

/**
 * GET /api/auth/network-status
 * Auto-detects hospital network range based on client IP or requested simulated IP
 */
router.get("/network-status", (req, res) => {
  const queryIp = req.query.simulated_ip || req.ip || req.headers["x-forwarded-for"] || "172.20.10.8";
  const detection = detectHospitalNetwork(queryIp);
  res.status(200).json(detection);
});

/**
 * GET /api/auth/context-status
 * Real auto-detected hospital network & SLST shift status from server clock
 */
router.get("/context-status", (req, res) => {
  const clientIp = req.headers["x-simulated-ip"] || req.headers["x-forwarded-for"] || req.ip || "172.20.10.8";
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
    if (!doc) {
      doc = DEMO_DOCTORS.find(d => d.id === doctorId || d.ethereumAddress === doctorId || d.username === doctorId);
    }
  }

  const targetEmail = (email || (doc ? doc.email : "") || "alice.vance@sliit.lk").trim();
  const doctorName = doc ? doc.name : (req.body.doctorName || "Attending Physician");

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
 * GET /api/auth/latest-email
 * Returns the most recent dispatched 2FA email for UI/examiner live inspection
 */
router.get("/latest-email", (req, res) => {
  const emailService = require("../services/emailService");
  const target = req.query.doctorId || req.query.email || "";
  const emailRecord = emailService.getLatestEmail(target);
  if (!emailRecord) {
    return res.status(404).json({ error: "No dispatched 2FA emails found for this account." });
  }
  return res.status(200).json(emailRecord);
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
  DEMO_DOCTORS,
  detectHospitalNetwork,
  checkTrustedLocation,
  isWithinTrustedShift
};
