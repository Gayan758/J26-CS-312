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
const encryptionService = require("../services/encryptionService");
const logger = require("../utils/logger");
const { detectHospitalNetwork } = require("./auth");
const { optionalAuthenticate } = require("../middleware/auth");
const { patientDataLimiter } = require("../middleware/rateLimiter");

/**
 * GET /api/patients
 * Returns the hospital queue / directory of registered clinical patients.
 */
router.get("/", optionalAuthenticate, patientDataLimiter, (req, res) => {
  try {
    const userRole = (req.user?.role || "").toLowerCase();

    // 1. Patient view: Patients may only view their own summary
    if (userRole === "patient") {
      const allPatients = ehrDatabase.getPatients();
      const myPatient = allPatients.find(
        (p) => p.id === req.user.id || p.phn === req.user.phn || p.nic === req.user.nic
      );
      if (!myPatient) {
        return res.json({ patients: [] });
      }
      return res.json({
        patients: [{
          id: myPatient.id,
          phn: myPatient.phn,
          name: myPatient.name,
          gender: myPatient.gender,
          dob: myPatient.dob,
          bloodGroup: myPatient.bloodGroup,
          consentStatus: myPatient.consentStatus,
          consentedDoctors: myPatient.consentedDoctors || [],
          allergies: myPatient.allergies || [],
          chronicConditions: myPatient.chronicConditions || []
        }]
      });
    }

    // 2. Administrator view: Separation of Duties (Administrative metadata only, NO clinical notes)
    if (userRole === "admin" || userRole === "administrator") {
      const allPatients = ehrDatabase.getPatients();
      const adminSummaries = allPatients.map((p) => ({
        id: p.id,
        phn: p.phn,
        name: p.name,
        dob: p.dob,
        gender: p.gender,
        bloodGroup: p.bloodGroup,
        department: p.department || "General OPD",
        triageQueue: p.triageQueue || "General OPD",
        emergencyStatus: p.emergencyStatus || "Stable",
        consentStatus: p.consentStatus,
        assignedDoctorIds: p.assignedDoctorIds || [],
        assignedDoctorAddresses: p.assignedDoctorAddresses || []
      }));
      return res.json({ patients: adminSummaries });
    }

    // 3. Clinician view: Hospital triage queue
    const doctorId = req.user ? req.user.id : (req.query.doctorId || req.headers["x-doctor-id"]);
    const doctorAddress = req.user ? (req.user.ethereumAddress || req.user.id) : (req.query.doctorAddress || req.headers["x-doctor-address"]);
    const showAll = req.query.all === "true" || (!doctorId && !doctorAddress);

    let patients;
    if (showAll) {
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
router.get("/:id", optionalAuthenticate, patientDataLimiter, async (req, res) => {
  try {
    const patientId = req.params.id;
    const patient = ehrDatabase.getPatientById(patientId);
    if (!patient) {
      return res.status(404).json({ error: "Patient not found" });
    }

    const userRole = (req.user?.role || "").toLowerCase();

    // 1. Separation of Duties: Administrators are strictly forbidden from viewing clinical EMR records
    if (userRole === "admin" || userRole === "administrator") {
      return res.status(403).json({
        error: "Separation of Duties: Hospital administrators are prohibited from viewing patient clinical health records."
      });
    }

    // 2. Patient self-view: Patients may only access their own clinical health records
    if (userRole === "patient") {
      const isSelf = req.user.id === patient.id || req.user.phn === patient.phn || req.user.nic === patient.nic;
      if (!isSelf) {
        return res.status(403).json({
          error: "Access Denied: Patients may only access their own clinical health records."
        });
      }

      return res.json({
        status: "ALLOW",
        decision: "ALLOW",
        risk_score: 0.0,
        risk_level: "LOW",
        signals: [],
        record: patient,
        message: "Patient personal health record released to verified patient."
      });
    }

    // Resolve context signals from verified user session or real request headers
    const doctorAddress = req.user ? (req.user.ethereumAddress || req.user.id) : (req.headers["x-doctor-address"] || "");
    const forwarded = req.headers["x-forwarded-for"];
    const clientIp = (forwarded ? forwarded.split(",")[0].trim() : null) || req.socket?.remoteAddress || req.ip || "127.0.0.1";
    const deviceFingerprint = req.headers["x-device-fingerprint"] || (req.user?.defaultDeviceFingerprint || "");
    const recordSensitivity = patient.sensitivity || "medium";
    const timestamp = req.headers["x-request-timestamp"] || req.headers["x-timestamp"] || req.query.timestamp || new Date().toISOString();

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

    const txHash = auditTx?.txHash || auditTx?.transactionHash || null;

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
    logger.error({ error: err.message, patientId: req.params.id }, "[PatientsRoute] Error fetching patient chart");
    return res.status(500).json({ error: "Failed to retrieve patient medical chart" });
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

    // Securely encrypt and store IPFS blob using derived patient DEK
    const key = encryptionService.getPatientKey(newPatient.id);
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
router.get("/:id/consent", optionalAuthenticate, (req, res) => {
  try {
    const patient = ehrDatabase.getPatientById(req.params.id);
    if (!patient) return res.status(404).json({ error: "Patient not found" });

    if (req.user && req.user.role === "patient") {
      const isSelf = req.user.id === patient.id || req.user.phn === patient.phn || req.user.nic === patient.nic;
      if (!isSelf) {
        return res.status(403).json({ error: "Access Denied: Patients may only access their own consent settings." });
      }
    }

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
router.put("/:id/consent", optionalAuthenticate, async (req, res) => {
  try {
    const patientId = req.params.id;
    const patient = ehrDatabase.getPatientById(patientId);
    if (!patient) return res.status(404).json({ error: "Patient not found" });

    if (req.user && req.user.role === "patient") {
      const isSelf = req.user.id === patient.id || req.user.phn === patient.phn || req.user.nic === patient.nic;
      if (!isSelf) {
        return res.status(403).json({ error: "Access Denied: Patients may only modify their own consent settings." });
      }
    }

    const { assignedDoctorIds, assignedDoctorAddresses, consentedDoctors, granularPermissions, consentStatus } = req.body;

    const updated = ehrDatabase.updatePatientConsent(patientId, {
      assignedDoctorIds,
      assignedDoctorAddresses,
      consentedDoctors,
      granularPermissions,
      consentStatus
    });

    let onChainTxHash = null;
    if (assignedDoctorAddresses && Array.isArray(assignedDoctorAddresses)) {
      for (const addr of assignedDoctorAddresses) {
        try {
          const tx = await consentService.setConsent(addr, patientId, Boolean(consentStatus !== false));
          if (tx) onChainTxHash = tx;
        } catch (e) {
          // Consent sync logging
        }
      }
    }

    auditService.logInternalAudit({
      actor: req.user ? `${req.user.name || req.user.username} (${req.user.role})` : "Patient Direct",
      actorAddress: req.user?.ethereumAddress || null,
      action: "CONSENT_UPDATE",
      details: `Consent preferences updated for patient ${patientId}. Active status: ${consentStatus !== false}`
    });

    return res.json({
      status: "SUCCESS",
      message: "Patient consent preferences and care team successfully updated.",
      patient: updated,
      txHash: onChainTxHash,
      syncedOnChain: Boolean(onChainTxHash)
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/patients/:id/encounters
 * Doctor writes a new SOAP Clinical Encounter note.
 */
const handleEncounter = (req, res) => {
  try {
    if (req.user) {
      const role = (req.user.role || "").toLowerCase();
      if (role === "admin" || role === "administrator" || role === "patient") {
        return res.status(403).json({ error: `Access Denied: Role "${req.user.role}" cannot author clinical encounter notes.` });
      }
    }

    const patientId = req.params.id;
    const { doctorName, doctorAddress, chiefComplaint, soap, subjective, objective, assessment, plan, diagnosisIcd10 } = req.body;

    const soapData = soap || {
      subjective: subjective || "",
      objective: objective || "",
      assessment: assessment || "",
      plan: plan || ""
    };

    const newEncounter = ehrDatabase.addEncounter(patientId, {
      doctorName: req.user?.name || doctorName,
      doctorAddress: req.user?.ethereumAddress || doctorAddress,
      chiefComplaint,
      soap: soapData,
      diagnosisIcd10
    });

    // Re-encrypt updated patient chart
    const updatedPatient = ehrDatabase.getPatientById(patientId);
    const key = encryptionService.getPatientKey(patientId);
    ipfsService.storeEncryptedRecord(patientId, updatedPatient, key);

    return res.status(201).json({
      status: "SUCCESS",
      encounter: newEncounter
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

router.post("/:id/encounters", optionalAuthenticate, handleEncounter);
router.post("/:id/soap", optionalAuthenticate, handleEncounter);

/**
 * POST /api/patients/:id/prescriptions
 * Doctor prescribes a new medication.
 */
router.post("/:id/prescriptions", optionalAuthenticate, (req, res) => {
  try {
    if (req.user) {
      const role = (req.user.role || "").toLowerCase();
      if (role === "admin" || role === "administrator" || role === "patient") {
        return res.status(403).json({ error: `Access Denied: Role "${req.user.role}" cannot prescribe medications.` });
      }
    }

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
      prescribedBy: req.user?.name || prescribedBy
    });

    // Re-encrypt updated patient chart
    const updatedPatient = ehrDatabase.getPatientById(patientId);
    const key = encryptionService.getPatientKey(patientId);
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
router.post("/:id/vitals", optionalAuthenticate, (req, res) => {
  try {
    if (req.user) {
      const role = (req.user.role || "").toLowerCase();
      if (role === "admin" || role === "administrator" || role === "patient") {
        return res.status(403).json({ error: `Access Denied: Role "${req.user.role}" cannot record clinical vital signs.` });
      }
    }

    const patientId = req.params.id;
    const { bp, hr, rr, spo2, temp, glucose, recordedBy } = req.body;

    const newVitals = ehrDatabase.addVitals(patientId, {
      bp,
      hr,
      rr,
      spo2,
      temp,
      glucose,
      recordedBy: req.user?.name || recordedBy
    });

    // Re-encrypt updated patient chart
    const updatedPatient = ehrDatabase.getPatientById(patientId);
    const key = encryptionService.getPatientKey(patientId);
    ipfsService.storeEncryptedRecord(patientId, updatedPatient, key);

    return res.status(201).json({
      status: "SUCCESS",
      vitals: newVitals
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/patients/:id/encounters/:encounterId/amend
 * Clinician records an immutable amendment to an existing clinical encounter note.
 */
router.post("/:id/encounters/:encounterId/amend", optionalAuthenticate, (req, res) => {
  try {
    const authorizationService = require("../services/authorizationService");
    if (req.user) {
      const authCheck = authorizationService.authorize(req.user, "write_encounter");
      if (!authCheck.allowed) {
        return res.status(403).json({ error: authCheck.reason });
      }
    }

    const { id: patientId, encounterId } = req.params;
    const { soap, diagnosisIcd10, reason, expectedVersion } = req.body;

    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ error: "A clear clinical rationale (min 5 characters) is required for amending an encounter note." });
    }

    const amended = ehrDatabase.amendEncounter(
      patientId,
      encounterId,
      {
        soap,
        diagnosisIcd10,
        reason: reason.trim(),
        amendedBy: req.user?.name || "Attending Clinician"
      },
      expectedVersion
    );

    // Re-encrypt updated patient chart
    const updatedPatient = ehrDatabase.getPatientById(patientId);
    const key = encryptionService.getPatientKey(patientId);
    ipfsService.storeEncryptedRecord(patientId, updatedPatient, key);

    auditService.logEvent({
      actor: req.user?.username || req.user?.name || "Attending Clinician",
      role: req.user?.role || "Doctor",
      action: "clinical.encounter_amended",
      resource_type: "encounter",
      resource_id: encounterId,
      patient_id: patientId,
      outcome: "SUCCESS",
      ip: req.ip,
      request_id: req.id,
      reason: reason.trim()
    });

    return res.status(200).json({
      status: "SUCCESS",
      message: `Encounter ${encounterId} amended to version ${amended.version}. Previous state preserved in immutable history.`,
      encounter: amended
    });
  } catch (err) {
    if (err.code === "CONCURRENCY_CONFLICT") {
      return res.status(409).json({ error: err.message, code: err.code });
    }
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/patients/:id/prescriptions/:prescriptionId/amend
 * Doctor records an adjustment, dose modification, or discontinuation of a medication.
 */
router.post("/:id/prescriptions/:prescriptionId/amend", optionalAuthenticate, (req, res) => {
  try {
    const authorizationService = require("../services/authorizationService");
    if (req.user) {
      const authCheck = authorizationService.authorize(req.user, "write_prescription");
      if (!authCheck.allowed) {
        return res.status(403).json({ error: authCheck.reason });
      }
    }

    const { id: patientId, prescriptionId } = req.params;
    const { dosage, frequency, duration, instructions, status, reason, expectedVersion } = req.body;

    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ error: "A clinical justification (min 5 characters) is required for amending a prescription." });
    }

    const amended = ehrDatabase.amendPrescription(
      patientId,
      prescriptionId,
      {
        dosage,
        frequency,
        duration,
        instructions,
        status,
        reason: reason.trim(),
        amendedBy: req.user?.name || "Attending Physician"
      },
      expectedVersion
    );

    // Re-encrypt updated patient chart
    const updatedPatient = ehrDatabase.getPatientById(patientId);
    const key = encryptionService.getPatientKey(patientId);
    ipfsService.storeEncryptedRecord(patientId, updatedPatient, key);

    auditService.logEvent({
      actor: req.user?.username || req.user?.name || "Attending Physician",
      role: req.user?.role || "Doctor",
      action: "clinical.prescription_amended",
      resource_type: "prescription",
      resource_id: prescriptionId,
      patient_id: patientId,
      outcome: "SUCCESS",
      ip: req.ip,
      request_id: req.id,
      reason: reason.trim()
    });

    return res.status(200).json({
      status: "SUCCESS",
      message: `Prescription ${prescriptionId} amended to version ${amended.version}. Previous state preserved.`,
      prescription: amended
    });
  } catch (err) {
    if (err.code === "CONCURRENCY_CONFLICT") {
      return res.status(409).json({ error: err.message, code: err.code });
    }
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;

