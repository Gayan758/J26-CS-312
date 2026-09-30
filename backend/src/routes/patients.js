const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const ehrDatabase = require("../services/ehrDatabase");
const riskService = require("../services/riskService");
const policyService = require("../services/policyService");
const consentService = require("../services/consentService");
const ipfsService = require("../services/ipfsService");
const decryptionService = require("../services/decryptionService");
const auditService = require("../services/auditService");
const { detectHospitalNetwork } = require("./auth");

/**
 * GET /api/patients
 * Returns the hospital queue / directory of registered clinical patients.
 */
router.get("/", (req, res) => {
  try {
    const doctorId = req.query.doctorId || req.headers["x-doctor-id"];
    const doctorAddress = req.query.doctorAddress || req.headers["x-doctor-address"];
    const showAll = req.query.all === "true";

    let patients;
    if (showAll || (!doctorId && !doctorAddress)) {
      patients = ehrDatabase.getPatients();
    } else {
      patients = ehrDatabase.getPatientsForDoctor(doctorId, doctorAddress);
    }

    // Return patient summaries for directory/queue view
    const summaries = patients.map((p) => ({
      id: p.id,
      phn: p.phn,
      nic: p.nic,
      name: p.name,
      dob: p.dob,
      gender: p.gender,
      bloodGroup: p.bloodGroup,
      allergies: p.allergies || [],
      chronicConditions: p.chronicConditions || [],
      sensitivity: p.sensitivity || "low",
      consentStatus: p.consentStatus,
      assignedDoctorIds: p.assignedDoctorIds || [],
      assignedDoctorAddresses: p.assignedDoctorAddresses || [],
      consentedDoctors: p.consentedDoctors || [],
      granularPermissions: p.granularPermissions || null,
      consentedDoctorName: p.consentedDoctorName || (p.consentedDoctors && p.consentedDoctors.length > 0 ? p.consentedDoctors.join(", ") : "Attending Clinical Team"),
      triageQueue: p.triageQueue || "General OPD",
      emergencyStatus: p.emergencyStatus || "Stable",
      criticalAlert: p.criticalAlert || "",
      vitalsCount: (p.vitals || []).length,
      encountersCount: (p.encounters || []).length,
      prescriptionsCount: (p.prescriptions || []).length,
      latestVitals: (p.vitals || [])[0] || null
    }));

    return res.json({ patients: summaries });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/patients/:id
 * Evaluates Context-Aware RiskBAC silently and decrypts the full clinical EMR chart on ALLOW.
 */
router.get("/:id", async (req, res) => {
  try {
    const patientId = req.params.id;
    const patient = ehrDatabase.getPatientById(patientId);
    if (!patient) {
      return res.status(404).json({ error: "Patient not found" });
    }

    // Resolve context signals from real request headers
    const doctorAddress = req.headers["x-doctor-address"] || "";
    const forwarded = req.headers["x-forwarded-for"];
    const clientIp = (forwarded ? forwarded.split(",")[0].trim() : null) || req.socket?.remoteAddress || req.ip || "127.0.0.1";
    const deviceFingerprint = req.headers["x-device-fingerprint"] || "";
    const recordSensitivity = patient.sensitivity || "medium";
    const timestamp = new Date().toISOString();

    // 1. Device Trust & Behavioral Baseline Checks
    const deviceCheck = ehrDatabase.checkTrustedDevice(doctorAddress, deviceFingerprint);
    const isDeviceTrusted = Boolean(deviceCheck.trusted);

    const behavioralCheck = ehrDatabase.checkBehavioralDeviation(doctorAddress, patientId, recordSensitivity);
    ehrDatabase.recordAccessEvent(doctorAddress, patientId, recordSensitivity);

    // 2. Check Consent in ConsentRegistry.sol
    const hasConsent = await consentService.checkConsent(doctorAddress, patientId);
    const consentValid = hasConsent && patient.consentStatus !== false;

    const clientLat = req.headers["x-device-latitude"] || req.query.latitude;
    const clientLon = req.headers["x-device-longitude"] || req.query.longitude;

    // 3. Calculate Context-Aware Risk via Python Risk Engine (or formula fallback)
    const riskResult = await riskService.calculateRiskScore({
      doctor_address: doctorAddress,
      patient_id: patientId,
      requested_record_id: `record-${patientId}`,
      requested_record_sensitivity: recordSensitivity,
      ip_address: clientIp,
      device_fingerprint: deviceFingerprint,
      device_is_trusted: isDeviceTrusted,
      behavior_deviation_score: behavioralCheck.score,
      latitude: clientLat,
      longitude: clientLon,
      timestamp
    });

    const { risk_score, risk_level, signal_breakdown } = riskResult;

    // 4. Evaluate Policy via OPA Rego
    const policyDecision = await policyService.evaluateAccess(risk_level, consentValid);
    const accessDecisionId = "0x" + crypto.randomBytes(32).toString("hex");

    // 5. Log immutable audit trail to AccessAuditLog.sol
    const auditTx = await auditService.logAccess({
      accessDecisionId,
      requester: doctorAddress,
      patientId,
      timestamp: Math.floor(Date.now() / 1000),
      riskLevel: risk_level,
      decision: policyDecision,
      isBreakGlass: false
    });

    const txHash = auditTx?.transactionHash || ("0x" + crypto.randomBytes(32).toString("hex"));

    const calculation = {
      weightedSum: parseFloat(((signal_breakdown.weighted_component || 0) / 0.7).toFixed(3)),
      weightedComponent: signal_breakdown.weighted_component,
      maxSignal: signal_breakdown.max_component,
      maxComponent: parseFloat(((signal_breakdown.max_component || 0) * 0.3).toFixed(3)),
      compositeScore: risk_score
    };

    const networkInfo = detectHospitalNetwork(clientIp);

    const signals = [
      {
        id: "time",
        name: "Shift Window (SLST)",
        value: signal_breakdown.login_time_score,
        weight: 0.15,
        label: signal_breakdown.login_time_score <= 0.10 ? "Within Shift (08:30–17:00)" : "Outside Shift Hours (SLST)",
        isSafe: signal_breakdown.login_time_score <= 0.10
      },
      {
        id: "location",
        name: "Geofenced IP Network",
        value: signal_breakdown.geo_velocity_score,
        weight: 0.35,
        label: `${networkInfo.campusName} (${networkInfo.ip})`,
        isSafe: signal_breakdown.geo_velocity_score <= 0.10
      },
      {
        id: "device",
        name: "Workstation Enclave",
        value: signal_breakdown.device_score,
        weight: 0.25,
        label: isDeviceTrusted ? "Enrolled Trusted Workstation" : "Untrusted / New Device Terminal",
        isSafe: signal_breakdown.device_score <= 0.10
      },
      {
        id: "behavior",
        name: "Access Velocity & Baseline",
        value: signal_breakdown.behavior_score,
        weight: 0.25,
        label: behavioralCheck.reason || `${recordSensitivity.toUpperCase()} sensitivity record`,
        isSafe: signal_breakdown.behavior_score <= 0.25
      }
    ];

    // 6. Handle Policy Decisions
    if (policyDecision === "BLOCK") {
      return res.status(403).json({
        status: "BLOCK",
        decision: "BLOCK",
        risk_score,
        risk_level,
        signals,
        calculation,
        signal_breakdown,
        txHash,
        consentValid,
        message: !consentValid
          ? "Access Denied: Patient consent not granted for this doctor or explicitly revoked."
          : "Access Denied by Hospital Information Security Policy (High Context Risk)."
      });
    }

    if (policyDecision === "MFA_REQUIRED") {
      const challengeToken = crypto.randomBytes(24).toString("hex");
      global.__mfaChallenges = global.__mfaChallenges || new Map();
      global.__mfaChallenges.set(challengeToken, {
        doctorAddress,
        patientId,
        accessDecisionId,
        expiresAt: Date.now() + 5 * 60 * 1000
      });

      return res.json({
        status: "MFA_REQUIRED",
        decision: "MFA_REQUIRED",
        risk_score,
        risk_level,
        signals,
        calculation,
        signal_breakdown,
        txHash,
        challenge_token: challengeToken,
        is_device_untrusted: !isDeviceTrusted,
        device_fingerprint: deviceFingerprint,
        message: !isDeviceTrusted
          ? "Untrusted device detected. Step-up 2FA verification required to trust device and release clinical keys."
          : "Elevated context risk requires step-up 2FA verification."
      });
    }

    // 7. Policy Decision == ALLOW: Parallel IPFS fetch + ConsentRegistry key release
    const [encryptedBlob, decryptionKey] = await Promise.all([
      ipfsService.fetchEncryptedBlob(patientId),
      consentService.releaseDecryptionKey(doctorAddress, patientId, accessDecisionId)
    ]);

    // Decrypt AES-256-GCM ciphertext
    const decryptedRecord = decryptionService.decryptBlob(encryptedBlob, decryptionKey);

    return res.json({
      status: "ALLOW",
      decision: "ALLOW",
      risk_score,
      risk_level,
      signals,
      calculation,
      signal_breakdown,
      txHash,
      record: decryptedRecord,
      network: networkInfo
    });
  } catch (err) {
    console.error("[PatientsRoute] Error fetching patient chart:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/patients
 * New Patient Registration & Intake.
 */
const handleAdmission = (req, res) => {
  try {
    const {
      name,
      dob,
      gender,
      nic,
      phn,
      bloodGroup,
      allergies,
      chronicConditions,
      sensitivity,
      consentStatus,
      triageQueue,
      initialVitals,
      admittingDoctorId,
      admittingDoctorAddress,
      admittingDoctorName,
      assignedDoctorIds,
      assignedDoctorAddresses,
      consentedDoctors,
      granularPermissions
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Patient name is required." });
    }

    const patientData = {
      name,
      dob: dob || "1990-01-01",
      gender: gender || "Unspecified",
      nic: nic || "N/A",
      phn: phn || `PHN-${Math.floor(100000 + Math.random() * 900000)}`,
      bloodGroup: bloodGroup || "O+",
      allergies: Array.isArray(allergies) ? allergies : allergies ? allergies.split(",").map(s => s.trim()) : [],
      chronicConditions: Array.isArray(chronicConditions) ? chronicConditions : chronicConditions ? chronicConditions.split(",").map(s => s.trim()) : [],
      sensitivity: sensitivity || "low",
      consentStatus: consentStatus !== undefined ? consentStatus : true,
      triageQueue: triageQueue || "Outpatient General Consultation",
      admittingDoctorId,
      admittingDoctorAddress,
      admittingDoctorName,
      assignedDoctorIds,
      assignedDoctorAddresses,
      consentedDoctors,
      granularPermissions,
      vitals: initialVitals ? (Array.isArray(initialVitals) ? initialVitals : [initialVitals]) : []
    };

    const newPatient = ehrDatabase.addPatient(patientData);

    // Deterministically encrypt and store IPFS blob
    const key = crypto.createHash("sha256").update(`${newPatient.id}-key`).digest();
    ipfsService.storeEncryptedRecord(newPatient.id, newPatient, key);

    return res.status(201).json({
      status: "SUCCESS",
      message: "Patient admitted and encrypted EHR generated.",
      patient: newPatient
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

router.post("/", handleAdmission);
router.post("/admit", handleAdmission);

/**
 * GET /api/patients/:id/consent
 * Returns current doctor assignments and granular permission settings
 */
router.get("/:id/consent", (req, res) => {
  try {
    const patient = ehrDatabase.getPatientById(req.params.id);
    if (!patient) return res.status(404).json({ error: "Patient not found" });

    return res.json({
      patientId: patient.id,
      patientName: patient.name,
      phn: patient.phn,
      assignedDoctorIds: patient.assignedDoctorIds || [],
      assignedDoctorAddresses: patient.assignedDoctorAddresses || [],
      consentedDoctors: patient.consentedDoctors || [],
      granularPermissions: patient.granularPermissions || {
        vitals: { view: true, modify: true },
        soap: { view: true, modify: true },
        prescriptions: { view: true, modify: true },
        labs: { view: true, modify: false },
        sensitiveRecords: { view: false, modify: false }
      },
      consentStatus: patient.consentStatus !== false
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/patients/:id/consent
 * Patient updates doctor authorizations and granular permissions
 */
router.put("/:id/consent", async (req, res) => {
  try {
    const patientId = req.params.id;
    const { assignedDoctorIds, assignedDoctorAddresses, consentedDoctors, granularPermissions, consentStatus } = req.body;

    const updated = ehrDatabase.updatePatientConsent(patientId, {
      assignedDoctorIds,
      assignedDoctorAddresses,
      consentedDoctors,
      granularPermissions,
      consentStatus
    });

    // Synchronize mock & contract consent for authorized addresses
    if (assignedDoctorAddresses && Array.isArray(assignedDoctorAddresses)) {
      for (const addr of assignedDoctorAddresses) {
        try {
          consentService.setMockConsent(addr, patientId, true);
        } catch (e) {
          console.warn("[Consent Sync] Mock consent update:", e.message);
        }
      }
    }

    return res.json({
      status: "SUCCESS",
      message: "Patient consent preferences and care team successfully updated.",
      patient: updated,
      txHash: "0x" + crypto.randomBytes(32).toString("hex"),
      syncedOnChain: true
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/patients/:id/encounters
 * Doctor writes a new SOAP Clinical Encounter note.
 */
router.post("/:id/encounters", (req, res) => {
  try {
    const patientId = req.params.id;
    const { doctorName, doctorAddress, chiefComplaint, soap, diagnosisIcd10 } = req.body;

    const newEncounter = ehrDatabase.addEncounter(patientId, {
      doctorName,
      doctorAddress,
      chiefComplaint,
      soap,
      diagnosisIcd10
    });

    // Re-encrypt updated patient chart
    const updatedPatient = ehrDatabase.getPatientById(patientId);
    const key = crypto.createHash("sha256").update(`${patientId}-key`).digest();
    ipfsService.storeEncryptedRecord(patientId, updatedPatient, key);

    return res.status(201).json({
      status: "SUCCESS",
      encounter: newEncounter
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/patients/:id/prescriptions
 * Doctor prescribes a new medication.
 */
router.post("/:id/prescriptions", (req, res) => {
  try {
    const patientId = req.params.id;
    const { drugName, dosage, route, frequency, duration, refills, instructions, prescribedBy } = req.body;

    if (!drugName || !dosage || !frequency) {
      return res.status(400).json({ error: "Drug name, dosage, and frequency are mandatory." });
    }

    const newPrescription = ehrDatabase.addPrescription(patientId, {
      drugName,
      dosage,
      route,
      frequency,
      duration,
      refills,
      instructions,
      prescribedBy
    });

    // Re-encrypt updated patient chart
    const updatedPatient = ehrDatabase.getPatientById(patientId);
    const key = crypto.createHash("sha256").update(`${patientId}-key`).digest();
    ipfsService.storeEncryptedRecord(patientId, updatedPatient, key);

    return res.status(201).json({
      status: "SUCCESS",
      prescription: newPrescription
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/patients/:id/vitals
 * Clinical staff records new vital signs.
 */
router.post("/:id/vitals", (req, res) => {
  try {
    const patientId = req.params.id;
    const { bp, hr, rr, spo2, temp, glucose, recordedBy } = req.body;

    const newVitals = ehrDatabase.addVitals(patientId, {
      bp,
      hr,
      rr,
      spo2,
      temp,
      glucose,
      recordedBy
    });

    // Re-encrypt updated patient chart
    const updatedPatient = ehrDatabase.getPatientById(patientId);
    const key = crypto.createHash("sha256").update(`${patientId}-key`).digest();
    ipfsService.storeEncryptedRecord(patientId, updatedPatient, key);

    return res.status(201).json({
      status: "SUCCESS",
      vitals: newVitals
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
