const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

const DATA_FILE = path.join(__dirname, "../../data/ehr_database.json");

class EhrDatabase {
  constructor() {
    this._ensureDataFile();
  }

  _ensureDataFile() {
    const dataDir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (!fs.existsSync(DATA_FILE)) {
      const initialEmptySchema = {
        doctors: [],
        patients: [],
        sessionLocations: {},
        trustedDevices: {},
        accessEvents: []
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(initialEmptySchema, null, 2), "utf8");
    }
  }

  _getDefaultSettings() {
    return {
      hospitalSites: [
        {
          id: "site-001",
          name: "SLIIT Malabe Health Center",
          latitude: 6.9147,
          longitude: 79.9733,
          radiusKm: 0.40
        },
        {
          id: "site-002",
          name: "Seylan Tower 1 Medical Clinic",
          latitude: 6.9319,
          longitude: 79.8437,
          radiusKm: 0.25
        }
      ],
      trustedNetworkRanges: [
        { id: "net-001", name: "Malabe Campus LAN", prefix: "172.20.10." },
        { id: "net-002", name: "Malabe Clinical Subnet", prefix: "10.100." },
        { id: "net-003", name: "SLIIT Academic Network", prefix: "192.248." },
        { id: "net-004", name: "Seylan Tower LAN", prefix: "10.200." },
        { id: "net-005", name: "Local Loopback", prefix: "127.0.0.1" }
      ],
      shiftRules: {
        timezone: "Asia/Colombo",
        normalShiftStartMinutes: 510, // 08:30 SLST
        normalShiftEndMinutes: 1020,  // 17:00 SLST
        nightShiftAllowed: true
      },
      riskThresholds: {
        lowThreshold: 0.30,
        mediumThreshold: 0.65
      },
      breakGlassPolicy: {
        durationMinutes: 240, // 4 hours emergency TTL
        minJustificationChars: 15,
        autoExpire: true,
        requireComplianceReview: true,
        notifyPatient: true
      },
      locationService: {
        traccarEnabled: false,
        historyRetentionDays: 90,
        unavailableBehavior: "ELEVATE_RISK"
      }
    };
  }

  _readData() {
    try {
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      const data = JSON.parse(raw);
      if (!data.doctors) data.doctors = [];
      if (!data.patients) data.patients = [];
      if (!data.sessionLocations) data.sessionLocations = {};
      if (!data.trustedDevices) data.trustedDevices = {};
      if (!data.accessEvents) data.accessEvents = [];
      if (!data.settings) data.settings = this._getDefaultSettings();
      if (!data.breakGlassEvents) data.breakGlassEvents = [];
      if (!data.registeredDevices) {
        data.registeredDevices = {
          "sha256:alice-workstation-secure-enclave": {
            fingerprint: "sha256:alice-workstation-secure-enclave",
            name: "Registered Workstation",
            status: "approved",
            approvedBy: "Hospital Administration",
            approvedAt: new Date().toISOString()
          }
        };
      }
      return data;
    } catch (err) {
      return {
        doctors: [],
        patients: [],
        sessionLocations: {},
        trustedDevices: {},
        accessEvents: [],
        settings: this._getDefaultSettings(),
        breakGlassEvents: [],
        registeredDevices: {}
      };
    }
  }

  _writeData(data) {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
    } catch (err) {
      logger.error({ error: err.message }, "[EhrDatabase] Error persisting data");
      throw err;
    }
  }

  getPatients() {
    const db = this._readData();
    return db.patients || [];
  }

  getPatientById(id) {
    const db = this._readData();
    return (db.patients || []).find((p) => p.id === id) || null;
  }

  getPatientByIdentifier(identifier) {
    if (!identifier) return null;
    const clean = String(identifier).trim().toLowerCase();
    const encryptionService = require("./encryptionService");
    const nicBlindIndex = encryptionService.computeBlindIndex(identifier);
    const all = this.getPatients();
    return all.find((p) => 
      (p.id && p.id.toLowerCase() === clean) ||
      (p.phn && p.phn.toLowerCase() === clean) ||
      (p.nic && p.nic.toLowerCase() === clean) ||
      (p.nicHash && p.nicHash === nicBlindIndex) ||
      (p.name && p.name.toLowerCase() === clean) ||
      (p.phn && p.phn.replace(/[^0-9]/g, "") === clean.replace(/[^0-9]/g, ""))
    ) || null;
  }

  getPatientsForDoctor(doctorId, doctorAddress) {
    const all = this.getPatients();
    if (!doctorId && !doctorAddress) return all;

    const cleanId = (doctorId || "").trim().toLowerCase();
    const cleanAddr = (doctorAddress || "").trim().toLowerCase();

    const db = this._readData();
    const doc = (db.doctors || []).find((d) => 
      (d.id && d.id.toLowerCase() === cleanId) || 
      (d.ethereumAddress && d.ethereumAddress.toLowerCase() === cleanAddr) ||
      (d.username && d.username.toLowerCase() === cleanId)
    );

    return all.filter((p) => {
      const assignedIds = (p.assignedDoctorIds || []).map((id) => String(id).toLowerCase());
      const assignedAddrs = (p.assignedDoctorAddresses || []).map((addr) => String(addr).toLowerCase());
      
      const idMatch = cleanId && (assignedIds.includes(cleanId) || String(p.primaryDoctorId || "").toLowerCase() === cleanId);
      const addrMatch = cleanAddr && assignedAddrs.includes(cleanAddr);
      
      let nameMatch = false;
      if (doc && p.consentedDoctors) {
        nameMatch = p.consentedDoctors.some((cd) => 
          cd.toLowerCase().includes(doc.name.toLowerCase()) || 
          doc.name.toLowerCase().includes(cd.toLowerCase())
        );
      }

      return idMatch || addrMatch || nameMatch;
    });
  }

  updatePatientConsent(patientId, consentUpdate) {
    const db = this._readData();
    const patient = db.patients.find((p) => p.id === patientId);
    if (!patient) throw new Error(`Patient not found: ${patientId}`);

    if (consentUpdate.assignedDoctorIds !== undefined) {
      patient.assignedDoctorIds = consentUpdate.assignedDoctorIds;
    }
    if (consentUpdate.assignedDoctorAddresses !== undefined) {
      patient.assignedDoctorAddresses = consentUpdate.assignedDoctorAddresses.map((a) => a.toLowerCase());
    }
    if (consentUpdate.consentedDoctors !== undefined) {
      patient.consentedDoctors = consentUpdate.consentedDoctors;
    }
    if (consentUpdate.granularPermissions !== undefined) {
      patient.granularPermissions = {
        ...patient.granularPermissions,
        ...consentUpdate.granularPermissions
      };
    }
    if (consentUpdate.consentStatus !== undefined) {
      patient.consentStatus = consentUpdate.consentStatus;
    }

    patient.consentUpdatedAt = new Date().toISOString();
    this._writeData(db);

    // Synchronize re-encryption on disk & IPFS
    try {
      const ipfsService = require("./ipfsService");
      const crypto = require("crypto");
      const key = crypto.createHash("sha256").update(`${patient.id}-key`).digest();
      ipfsService.storeEncryptedRecord(patient.id, patient, key);
    } catch (e) {
      logger.warn({ error: e.message }, "[EhrDatabase] IPFS re-encrypt on consent update");
    }

    return patient;
  }

  addPatient(patientData) {
    const db = this._readData();
    const id = patientData.id || `patient-${Date.now().toString().slice(-4)}`;

    const admittingId = patientData.admittingDoctorId || patientData.doctorId;
    const admittingAddress = patientData.admittingDoctorAddress || patientData.doctorAddress;
    const admittingName = patientData.admittingDoctorName || patientData.doctorName;

    const assignedDoctorIds = patientData.assignedDoctorIds || (admittingId ? [admittingId] : []);
    const assignedDoctorAddresses = (patientData.assignedDoctorAddresses || (admittingAddress ? [admittingAddress] : [])).map(a => a.toLowerCase());
    const consentedDoctors = patientData.consentedDoctors || (admittingName ? [admittingName] : []);

    const encryptionService = require("./encryptionService");
    const nicHash = patientData.nic && patientData.nic !== "N/A" ? encryptionService.computeBlindIndex(patientData.nic) : null;

    const newPatient = {
      id,
      patientId: id,
      phn: patientData.phn || `PHN-${Math.floor(100000 + Math.random() * 900000)}`,
      nic: patientData.nic || "N/A",
      nicHash,
      name: patientData.name,
      patientName: patientData.name,
      dob: patientData.dob,
      gender: patientData.gender || "Unspecified",
      bloodGroup: patientData.bloodGroup || "O+",
      allergies: patientData.allergies || [],
      chronicConditions: patientData.chronicConditions || [],
      sensitivity: patientData.sensitivity || "low",
      consentStatus: patientData.consentStatus !== undefined ? patientData.consentStatus : true,
      triageQueue: patientData.triageQueue || "Outpatient General Clinic",
      emergencyStatus: patientData.emergencyStatus || "Stable",
      criticalAlert: patientData.criticalAlert || "",
      registeredAt: new Date().toISOString(),
      assignedDoctorIds,
      assignedDoctorAddresses,
      consentedDoctors,
      granularPermissions: patientData.granularPermissions || {
        vitals: { view: true, modify: true },
        soap: { view: true, modify: true },
        prescriptions: { view: true, modify: true },
        labs: { view: true, modify: false },
        sensitiveRecords: { view: false, modify: false }
      },
      vitals: patientData.vitals ? (Array.isArray(patientData.vitals) ? patientData.vitals : [patientData.vitals]) : [],
      encounters: patientData.encounters || [],
      prescriptions: patientData.prescriptions || [],
      labResults: patientData.labResults || []
    };

    db.patients.push(newPatient);
    this._writeData(db);
    return newPatient;
  }

  addEncounter(patientId, encounter) {
    const db = this._readData();
    const patient = db.patients.find((p) => p.id === patientId);
    if (!patient) throw new Error(`Patient not found: ${patientId}`);

    const newEncounter = {
      id: `enc-${Date.now()}`,
      version: 1,
      amendments: [],
      date: new Date().toISOString().split("T")[0],
      createdAt: new Date().toISOString(),
      doctorName: encounter.doctorName || "Attending Physician",
      doctorAddress: encounter.doctorAddress || "0x0000000000000000000000000000000000000000",
      chiefComplaint: encounter.chiefComplaint || "General consultation",
      soap: {
        subjective: encounter.soap?.subjective || "",
        objective: encounter.soap?.objective || "",
        assessment: encounter.soap?.assessment || "",
        plan: encounter.soap?.plan || ""
      },
      diagnosisIcd10: encounter.diagnosisIcd10 || []
    };

    if (!patient.encounters) patient.encounters = [];
    patient.encounters.unshift(newEncounter);
    this._writeData(db);
    return newEncounter;
  }

  amendEncounter(patientId, encounterId, amendmentData, expectedVersion) {
    const db = this._readData();
    const patient = db.patients.find((p) => p.id === patientId);
    if (!patient) throw new Error(`Patient not found: ${patientId}`);

    const encounter = (patient.encounters || []).find((e) => e.id === encounterId);
    if (!encounter) throw new Error(`Encounter not found: ${encounterId}`);

    if (expectedVersion !== undefined && expectedVersion !== null && encounter.version !== expectedVersion) {
      const err = new Error(`Concurrency Conflict: Encounter version mismatch (expected v${expectedVersion}, found v${encounter.version}). Please refresh.`);
      err.code = "CONCURRENCY_CONFLICT";
      throw err;
    }

    if (!encounter.amendments) encounter.amendments = [];

    encounter.amendments.push({
      amendedAt: new Date().toISOString(),
      amendedBy: amendmentData.amendedBy || "Attending Clinician",
      reason: amendmentData.reason || "Clinical note correction",
      previousSoap: { ...encounter.soap }
    });

    if (amendmentData.soap) {
      encounter.soap = {
        subjective: amendmentData.soap.subjective !== undefined ? amendmentData.soap.subjective : encounter.soap.subjective,
        objective: amendmentData.soap.objective !== undefined ? amendmentData.soap.objective : encounter.soap.objective,
        assessment: amendmentData.soap.assessment !== undefined ? amendmentData.soap.assessment : encounter.soap.assessment,
        plan: amendmentData.soap.plan !== undefined ? amendmentData.soap.plan : encounter.soap.plan
      };
    }
    if (amendmentData.diagnosisIcd10) {
      encounter.diagnosisIcd10 = amendmentData.diagnosisIcd10;
    }

    encounter.version = (encounter.version || 1) + 1;
    encounter.updatedAt = new Date().toISOString();

    this._writeData(db);
    return encounter;
  }

  addPrescription(patientId, rx) {
    const db = this._readData();
    const patient = db.patients.find((p) => p.id === patientId);
    if (!patient) throw new Error(`Patient not found: ${patientId}`);

    const newPrescription = {
      id: `rx-${Date.now()}`,
      version: 1,
      amendments: [],
      drugName: rx.drugName,
      dosage: rx.dosage,
      route: rx.route || "Oral",
      frequency: rx.frequency,
      duration: rx.duration || "30 days",
      refills: rx.refills !== undefined ? rx.refills : 0,
      instructions: rx.instructions || "Take as directed",
      prescribedBy: rx.prescribedBy || "Attending Physician",
      prescribedAt: new Date().toISOString(),
      status: "Active"
    };

    if (!patient.prescriptions) patient.prescriptions = [];
    patient.prescriptions.unshift(newPrescription);
    this._writeData(db);
    return newPrescription;
  }

  amendPrescription(patientId, rxId, amendmentData, expectedVersion) {
    const db = this._readData();
    const patient = db.patients.find((p) => p.id === patientId);
    if (!patient) throw new Error(`Patient not found: ${patientId}`);

    const rx = (patient.prescriptions || []).find((r) => r.id === rxId);
    if (!rx) throw new Error(`Prescription not found: ${rxId}`);

    if (expectedVersion !== undefined && expectedVersion !== null && rx.version !== expectedVersion) {
      const err = new Error(`Concurrency Conflict: Prescription version mismatch (expected v${expectedVersion}, found v${rx.version}).`);
      err.code = "CONCURRENCY_CONFLICT";
      throw err;
    }

    if (!rx.amendments) rx.amendments = [];

    rx.amendments.push({
      amendedAt: new Date().toISOString(),
      amendedBy: amendmentData.amendedBy || "Attending Physician",
      reason: amendmentData.reason || "Prescription adjustment",
      previousStatus: rx.status,
      previousDosage: rx.dosage,
      previousFrequency: rx.frequency
    });

    if (amendmentData.dosage) rx.dosage = amendmentData.dosage;
    if (amendmentData.frequency) rx.frequency = amendmentData.frequency;
    if (amendmentData.duration) rx.duration = amendmentData.duration;
    if (amendmentData.instructions) rx.instructions = amendmentData.instructions;
    if (amendmentData.status) rx.status = amendmentData.status;

    rx.version = (rx.version || 1) + 1;
    rx.updatedAt = new Date().toISOString();

    this._writeData(db);
    return rx;
  }

  addVitals(patientId, vitals) {
    const db = this._readData();
    const patient = db.patients.find((p) => p.id === patientId);
    if (!patient) throw new Error(`Patient not found: ${patientId}`);

    const newVitals = {
      id: `vit-${Date.now()}`,
      bp: vitals.bp || "120/80",
      hr: vitals.hr || 72,
      rr: vitals.rr || 16,
      spo2: vitals.spo2 || 98,
      temp: vitals.temp || "36.8 C",
      glucose: vitals.glucose || "95 mg/dL",
      recordedAt: new Date().toISOString(),
      recordedBy: vitals.recordedBy || "Triage Nurse"
    };

    if (!patient.vitals) patient.vitals = [];
    patient.vitals.unshift(newVitals);
    this._writeData(db);
    return newVitals;
  }

  // 3.3 Trusted Device: real fingerprinting with trust-on-first-verify
  checkTrustedDevice(doctorId, fingerprint) {
    if (!doctorId || !fingerprint) return { trusted: false };
    const db = this._readData();
    const knownDevices = db.knownDevices || [];
    const match = knownDevices.find(
      (d) => (d.doctorId === doctorId || d.ethereumAddress === doctorId) && d.fingerprint === fingerprint && d.trusted
    );
    if (match) return { trusted: true };

    const doc = (db.doctors || []).find(
      (d) => d.id === doctorId || d.ethereumAddress?.toLowerCase() === doctorId?.toLowerCase() || d.username?.toLowerCase() === doctorId?.toLowerCase()
    );
    if (doc && doc.defaultDeviceFingerprint && doc.defaultDeviceFingerprint === fingerprint) {
      return { trusted: true };
    }

    return { trusted: false };
  }

  addTrustedDevice(doctorId, fingerprint) {
    const db = this._readData();
    if (!db.knownDevices) db.knownDevices = [];
    const existing = db.knownDevices.find(
      (d) => (d.doctorId === doctorId || d.ethereumAddress === doctorId) && d.fingerprint === fingerprint
    );
    if (existing) {
      existing.trusted = true;
      existing.lastVerifiedAt = new Date().toISOString();
    } else {
      db.knownDevices.push({
        doctorId,
        fingerprint,
        trusted: true,
        enrolledAt: new Date().toISOString()
      });
    }
    this._writeData(db);
  }

  // 3.4 Behavioural Deviation
  recordAccessEvent(doctorId, patientId, sensitivity) {
    const db = this._readData();
    if (!db.accessHistory) db.accessHistory = [];
    db.accessHistory.push({ doctorId, patientId, sensitivity, timestamp: Date.now() });
    if (db.accessHistory.length > 200) db.accessHistory.shift();
    this._writeData(db);
  }

  checkBehavioralDeviation(doctorId, patientId, sensitivity) {
    const db = this._readData();
    const history = db.accessHistory || [];
    const doctorHistory = history.filter((h) => h.doctorId === doctorId);
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentAccesses = doctorHistory.filter((h) => h.timestamp > oneDayAgo);

    if (recentAccesses.length > 30) {
      return { isDeviating: true, score: 0.80, reason: "Unusually high access volume (>30 records in 24h)" };
    }

    if (sensitivity === "restricted") {
      return { isDeviating: false, score: 0.25, reason: "Restricted sensitivity access within normal bounds" };
    }

    return { isDeviating: false, score: 0.05, reason: "Normal clinical access pattern" };
  }

  // Staff Safety & Location Tracking Methods (Module: Traccar & OsmAnd)
  getStaffDevices() {
    const db = this._readData();
    return db.staffTrackingDevices || [];
  }

  getStaffDeviceById(deviceId) {
    const devices = this.getStaffDevices();
    return devices.find((d) => d.deviceId === deviceId || d.osmandProtocolId === deviceId || d.doctorId === deviceId) || null;
  }

  upsertStaffDevice(deviceData) {
    const db = this._readData();
    if (!db.staffTrackingDevices) db.staffTrackingDevices = [];
    const idx = db.staffTrackingDevices.findIndex(
      (d) => d.deviceId === deviceData.deviceId || d.osmandProtocolId === deviceData.osmandProtocolId
    );
    if (idx >= 0) {
      db.staffTrackingDevices[idx] = { ...db.staffTrackingDevices[idx], ...deviceData, updatedAt: new Date().toISOString() };
    } else {
      db.staffTrackingDevices.push({
        ...deviceData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    this._writeData(db);
    return this.getStaffDeviceById(deviceData.deviceId || deviceData.osmandProtocolId);
  }

  updateDevicePosition(deviceId, positionData) {
    const db = this._readData();
    if (!db.staffTrackingDevices) db.staffTrackingDevices = [];
    const dev = db.staffTrackingDevices.find(
      (d) => d.deviceId === deviceId || d.osmandProtocolId === deviceId || d.doctorId === deviceId
    );
    if (dev) {
      dev.lastPosition = {
        lat: positionData.lat,
        lon: positionData.lon,
        speed: positionData.speed || 0,
        altitude: positionData.altitude || 0,
        accuracy: positionData.accuracy || 10,
        timestamp: positionData.timestamp || new Date().toISOString()
      };
      if (positionData.batteryLevel !== undefined) dev.batteryLevel = positionData.batteryLevel;
      if (positionData.sos !== undefined) dev.sosActive = positionData.sos;
      dev.lastReportTime = new Date().toISOString();
      dev.updatedAt = new Date().toISOString();
      this._writeData(db);
      return dev;
    }
    return null;
  }

  recordGeofenceEvent(eventData) {
    const db = this._readData();
    if (!db.geofenceRiskEvents) db.geofenceRiskEvents = [];
    const event = {
      id: eventData.id || `geofence-evt-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      deviceId: eventData.deviceId,
      doctorId: eventData.doctorId,
      doctorName: eventData.doctorName || "Staff Member",
      geofenceId: eventData.geofenceId || "sliit-malabe",
      geofenceName: eventData.geofenceName || "SLIIT Malabe Campus (Main Perimeter)",
      eventType: eventData.eventType || "GEOFENCE_EXIT",
      latitude: eventData.latitude,
      longitude: eventData.longitude,
      distanceFromBaseKm: eventData.distanceFromBaseKm || 0,
      calculatedRiskScore: eventData.calculatedRiskScore || 0.05,
      riskLevel: eventData.riskLevel || "LOW",
      securityNotified: eventData.securityNotified || false,
      securityReason: eventData.securityReason || "",
      createdAt: new Date().toISOString(),
      // 60-day rolling data retention policy
      retentionExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
    };

    db.geofenceRiskEvents.unshift(event);
    if (db.geofenceRiskEvents.length > 200) db.geofenceRiskEvents.pop();
    this._writeData(db);
    return event;
  }

  getGeofenceEvents(limit = 50) {
    const db = this._readData();
    return (db.geofenceRiskEvents || []).slice(0, limit);
  }

  recordSafetyAudit(auditData) {
    const db = this._readData();
    if (!db.staffSafetyAuditLogs) db.staffSafetyAuditLogs = [];
    const log = {
      id: `audit-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      actorId: auditData.actorId,
      actorName: auditData.actorName || "Medical Officer",
      actorRole: auditData.actorRole || "Security Dispatcher",
      action: auditData.action,
      targetDoctorId: auditData.targetDoctorId,
      justification: auditData.justification || "Staff safety status check",
      timestamp: new Date().toISOString()
    };
    db.staffSafetyAuditLogs.unshift(log);
    if (db.staffSafetyAuditLogs.length > 300) db.staffSafetyAuditLogs.pop();
    this._writeData(db);
    return log;
  }

  getSafetyAuditLogs(limit = 50) {
    const db = this._readData();
    return (db.staffSafetyAuditLogs || []).slice(0, limit);
  }

  _getDefaultStaffDevices() {
    return [];
  }

  _getDefaultDoctors() {
    return [];
  }

  getDoctors() {
    const db = this._readData();
    return db.doctors || [];
  }

  getDoctorById(id) {
    if (!id) return null;
    const doctors = this.getDoctors();
    return doctors.find((d) => d.id === id || d.ethereumAddress === id) || null;
  }

  getDoctorByUsername(username) {
    if (!username) return null;
    const clean = username.trim().toLowerCase();
    const doctors = this.getDoctors();
    return doctors.find((d) => d.username && d.username.toLowerCase() === clean) || null;
  }

  getAllUsers() {
    const db = this._readData();
    return (db.doctors || []).map((d) => ({
      id: d.id,
      name: d.name,
      username: d.username,
      email: d.email || "",
      role: d.role || "Doctor",
      specialty: d.specialty || "General Physician",
      slmcNumber: d.slmcNumber || "",
      baseCampus: d.baseCampus || "",
      phone: d.phone || "",
      ethereumAddress: d.ethereumAddress || "",
      defaultDeviceFingerprint: d.defaultDeviceFingerprint || "",
      status: d.status || (d.disabled ? "disabled" : "active"),
      registeredAt: d.registeredAt || ""
    }));
  }

  updateUserStatus(userId, newStatus) {
    const db = this._readData();
    if (!db.doctors) db.doctors = [];
    const doc = db.doctors.find((d) => d.id === userId || d.username?.toLowerCase() === userId.toLowerCase());
    if (!doc) {
      if (userId === "admin-001" || userId === "admin") {
        throw new Error("Cannot disable the primary root Administrator account.");
      }
      throw new Error(`User with ID "${userId}" not found.`);
    }
    doc.status = newStatus;
    doc.disabled = newStatus === "disabled";
    this._writeData(db);
    return { id: doc.id, username: doc.username, name: doc.name, status: doc.status };
  }

  resetUserPassword(userId, newPassword) {
    const db = this._readData();
    if (!db.doctors) db.doctors = [];
    const doc = db.doctors.find((d) => d.id === userId || d.username?.toLowerCase() === userId.toLowerCase());
    if (!doc) {
      throw new Error(`User with ID "${userId}" not found.`);
    }
    doc.password = newPassword;
    this._writeData(db);
    return { id: doc.id, username: doc.username, name: doc.name };
  }

  updateDoctorPassword(userId, newPasswordHash) {
    const db = this._readData();
    if (!db.doctors) db.doctors = [];
    const doc = db.doctors.find((d) => d.id === userId || d.username?.toLowerCase() === userId.toLowerCase());
    if (doc) {
      doc.password = newPasswordHash;
      this._writeData(db);
    }
  }

  setDoctorTotpSecret(userId, secretBase32) {
    const db = this._readData();
    if (!db.doctors) db.doctors = [];
    const doc = db.doctors.find((d) => d.id === userId || d.username?.toLowerCase() === userId.toLowerCase() || d.ethereumAddress?.toLowerCase() === userId.toLowerCase());
    if (!doc) throw new Error(`User "${userId}" not found.`);
    doc.totpSecret = secretBase32;
    doc.totpEnabled = true;
    doc.totpEnrolledAt = new Date().toISOString();
    this._writeData(db);
    return { success: true, totpEnabled: true };
  }

  getDoctorTotpSecret(userId) {
    const db = this._readData();
    if (!db.doctors) db.doctors = [];
    const doc = db.doctors.find((d) => d.id === userId || d.username?.toLowerCase() === userId.toLowerCase() || d.ethereumAddress?.toLowerCase() === userId.toLowerCase());
    return doc ? (doc.totpSecret || null) : null;
  }

  removeUser(userId) {
    const db = this._readData();
    if (!db.doctors) db.doctors = [];
    const idx = db.doctors.findIndex((d) => d.id === userId || d.username?.toLowerCase() === userId.toLowerCase());
    if (idx === -1) {
      throw new Error(`User with ID "${userId}" not found.`);
    }
    const removed = db.doctors.splice(idx, 1)[0];
    
    if (db.staffTrackingDevices) {
      db.staffTrackingDevices = db.staffTrackingDevices.filter((dev) => dev.doctorId !== removed.id);
    }
    if (db.knownDevices) {
      db.knownDevices = db.knownDevices.filter((dev) => dev.doctorId !== removed.ethereumAddress && dev.doctorId !== removed.id);
    }

    this._writeData(db);
    return { id: removed.id, name: removed.name, username: removed.username };
  }

  resetUserDevice(userId) {
    const db = this._readData();
    const doc = db.doctors?.find((d) => d.id === userId || d.username?.toLowerCase() === userId.toLowerCase());
    if (!doc) throw new Error(`User with ID "${userId}" not found.`);
    
    const oldFp = doc.defaultDeviceFingerprint;
    doc.defaultDeviceFingerprint = `sha256:unregistered-${Date.now()}`;
    if (db.knownDevices) {
      db.knownDevices = db.knownDevices.filter((dev) => dev.fingerprint !== oldFp);
    }
    this._writeData(db);
    return { id: doc.id, defaultDeviceFingerprint: doc.defaultDeviceFingerprint };
  }

  registerDoctor(doctorData) {
    const db = this._readData();
    if (!db.doctors) db.doctors = this._getDefaultDoctors();

    const cleanUser = (doctorData.username || "").trim().toLowerCase();
    const existing = db.doctors.find((d) => d.username && d.username.toLowerCase() === cleanUser);
    if (existing) {
      throw new Error(`Username "${doctorData.username}" is already registered in MedGuard EHR.`);
    }

    const id = `doc-${Date.now().toString().slice(-4)}`;
    const ethAddress = doctorData.ethereumAddress || ("0x" + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join(""));

    const newDoctor = {
      id,
      username: cleanUser,
      password: doctorData.password,
      name: (doctorData.name || "").trim() || "Dr. Medical Officer",
      email: (doctorData.email || "").trim() || `${cleanUser}@sliit.lk`,
      slmcNumber: doctorData.slmcNumber ? doctorData.slmcNumber.trim() : `SLMC-${Math.floor(10000 + Math.random() * 90000)}`,
      specialty: doctorData.specialty || "General Physician",
      ethereumAddress: ethAddress,
      baseCampus: doctorData.baseCampus || "SLIIT Malabe Campus Health Center",
      phone: doctorData.phone || "+94 77 000 0000",
      defaultDeviceFingerprint: doctorData.deviceFingerprint || `sha256:enrolled-workstation-${cleanUser}`,
      role: "Doctor",
      registeredAt: new Date().toISOString(),
      lastKnownLocation: null
    };

    db.doctors.push(newDoctor);

    // Auto-enroll device fingerprint as trusted on register
    if (newDoctor.defaultDeviceFingerprint) {
      if (!db.knownDevices) db.knownDevices = [];
      db.knownDevices.push({
        doctorId: ethAddress,
        fingerprint: newDoctor.defaultDeviceFingerprint,
        trusted: true,
        enrolledAt: new Date().toISOString()
      });
    }

    this._writeData(db);
    const { password, ...safeDoctor } = newDoctor;
    return safeDoctor;
  }

  updateDoctorEmail(doctorId, newEmail) {
    if (!doctorId || !newEmail) throw new Error("Doctor ID and valid Email are required.");
    const cleanEmail = newEmail.trim().toLowerCase();
    const cleanId = String(doctorId).trim().toLowerCase();

    const db = this._readData();
    if (!db.doctors) db.doctors = this._getDefaultDoctors();

    const doc = db.doctors.find(
      (d) => (d.id && d.id.toLowerCase() === cleanId) ||
             (d.ethereumAddress && d.ethereumAddress.toLowerCase() === cleanId) ||
             (d.username && d.username.toLowerCase() === cleanId)
    );

    if (!doc) throw new Error(`Doctor not found matching "${doctorId}"`);

    doc.email = cleanEmail;
    doc.emailUpdatedAt = new Date().toISOString();
    this._writeData(db);

    const { password, ...safeDoctor } = doc;
    return safeDoctor;
  }

  saveDoctorSessionLocation(doctorId, locationData) {
    const db = this._readData();
    if (!db.doctorSessions) db.doctorSessions = [];

    const sessionRecord = {
      id: `sess-${Date.now()}`,
      doctorId,
      latitude: locationData.latitude,
      longitude: locationData.longitude,
      accuracy: locationData.accuracy || 10,
      distanceFromMalabeKm: locationData.distanceFromMalabeKm || 0,
      isInsideMalabe: locationData.isInsideMalabe !== undefined ? locationData.isInsideMalabe : true,
      campusName: locationData.campusName || "Hospital Campus",
      ipAddress: locationData.ipAddress || "127.0.0.1",
      userAgent: locationData.userAgent || "",
      recordedAt: new Date().toISOString()
    };

    db.doctorSessions.unshift(sessionRecord);
    if (db.doctorSessions.length > 500) db.doctorSessions.pop();

    // Update doctor's lastKnownLocation
    if (db.doctors) {
      const doc = db.doctors.find((d) => d.id === doctorId || d.ethereumAddress === doctorId || (d.username && d.username.toLowerCase() === String(doctorId).toLowerCase()));
      if (doc) {
        doc.lastKnownLocation = {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          accuracy: locationData.accuracy || 10,
          distanceFromMalabeKm: locationData.distanceFromMalabeKm || 0,
          isInsideMalabe: locationData.isInsideMalabe,
          campusName: sessionRecord.campusName,
          recordedAt: new Date().toISOString()
        };
      }
    }

    // Sync with staff tracking device
    if (db.staffTrackingDevices && locationData.latitude && locationData.longitude) {
      const dev = db.staffTrackingDevices.find((d) => d.doctorId === doctorId || d.deviceId === `device-${doctorId}`);
      if (dev) {
        dev.lastPosition = {
          lat: locationData.latitude,
          lon: locationData.longitude,
          speed: 0,
          altitude: 18,
          accuracy: locationData.accuracy || 10,
          timestamp: new Date().toISOString()
        };
        dev.lastReportTime = new Date().toISOString();
      }
    }

    this._writeData(db);
    return sessionRecord;
  }

  getDoctorLastLocation(doctorId) {
    const db = this._readData();
    if (db.doctors) {
      const doc = db.doctors.find((d) => d.id === doctorId || d.ethereumAddress === doctorId || (d.username && d.username.toLowerCase() === String(doctorId).toLowerCase()));
      if (doc && doc.lastKnownLocation) return doc.lastKnownLocation;
    }
    const sess = (db.doctorSessions || []).find((s) => s.doctorId === doctorId);
    return sess || null;
  }

  getSettings() {
    const db = this._readData();
    return db.settings || this._getDefaultSettings();
  }

  updateSettings(updatedSettings, modifiedBy = "Administrator") {
    const db = this._readData();
    const current = db.settings || this._getDefaultSettings();

    const merged = {
      ...current,
      ...updatedSettings,
      hospitalSites: updatedSettings.hospitalSites || current.hospitalSites,
      trustedNetworkRanges: updatedSettings.trustedNetworkRanges || current.trustedNetworkRanges,
      shiftRules: { ...current.shiftRules, ...(updatedSettings.shiftRules || {}) },
      riskThresholds: { ...current.riskThresholds, ...(updatedSettings.riskThresholds || {}) },
      breakGlassPolicy: { ...current.breakGlassPolicy, ...(updatedSettings.breakGlassPolicy || {}) },
      locationService: { ...current.locationService, ...(updatedSettings.locationService || {}) }
    };

    db.settings = merged;
    this._writeData(db);

    try {
      const auditService = require("./auditService");
      auditService.logInternalAudit({
        actor: modifiedBy,
        action: "SETTINGS_UPDATE",
        details: "Hospital operational settings updated by administrator"
      });
    } catch {}

    return merged;
  }

  getRegisteredDevices() {
    const db = this._readData();
    if (!db.registeredDevices) {
      db.registeredDevices = {
        "sha256:alice-workstation-secure-enclave": {
          fingerprint: "sha256:alice-workstation-secure-enclave",
          name: "Registered Workstation",
          status: "approved",
          approvedBy: "Hospital Administration",
          approvedAt: new Date().toISOString()
        }
      };
      this._writeData(db);
    }
    return Object.values(db.registeredDevices);
  }

  isDeviceRegistered(fingerprint) {
    if (!fingerprint) return false;
    const clean = String(fingerprint).trim();
    const devices = this.getRegisteredDevices();
    const match = devices.find(d => d.fingerprint === clean || (d.fingerprint && d.fingerprint.toLowerCase() === clean.toLowerCase()));
    return match ? match.status === "approved" : false;
  }

  registerDevice(fingerprint, name, userId) {
    const db = this._readData();
    if (!db.registeredDevices) db.registeredDevices = {};

    const clean = String(fingerprint).trim();
    db.registeredDevices[clean] = {
      fingerprint: clean,
      name: name || "Registered Hospital Device",
      userId: userId || null,
      status: "pending",
      registeredAt: new Date().toISOString(),
      approvedBy: null,
      approvedAt: null
    };

    this._writeData(db);
    return db.registeredDevices[clean];
  }

  approveDevice(fingerprint, approvedBy = "Administrator") {
    const db = this._readData();
    if (!db.registeredDevices) db.registeredDevices = {};

    const clean = String(fingerprint).trim();
    if (!db.registeredDevices[clean]) {
      db.registeredDevices[clean] = {
        fingerprint: clean,
        name: "Registered Workstation",
        status: "approved",
        approvedBy,
        approvedAt: new Date().toISOString()
      };
    } else {
      db.registeredDevices[clean].status = "approved";
      db.registeredDevices[clean].approvedBy = approvedBy;
      db.registeredDevices[clean].approvedAt = new Date().toISOString();
    }

    this._writeData(db);

    try {
      const auditService = require("./auditService");
      auditService.logInternalAudit({
        actor: approvedBy,
        action: "DEVICE_APPROVAL",
        details: `Device fingerprint ${clean} approved for clinical workstation access`
      });
    } catch {}

    return db.registeredDevices[clean];
  }

  revokeDevice(fingerprint, revokedBy = "Administrator") {
    const db = this._readData();
    if (!db.registeredDevices) db.registeredDevices = {};

    const clean = String(fingerprint).trim();
    if (db.registeredDevices[clean]) {
      db.registeredDevices[clean].status = "revoked";
      db.registeredDevices[clean].revokedBy = revokedBy;
      db.registeredDevices[clean].revokedAt = new Date().toISOString();
    }

    this._writeData(db);

    try {
      const auditService = require("./auditService");
      auditService.logInternalAudit({
        actor: revokedBy,
        action: "DEVICE_REVOCATION",
        details: `Device fingerprint ${clean} revoked by administrator`
      });
    } catch {}

    return db.registeredDevices[clean] || null;
  }

  recordBreakGlassEvent(eventData) {
    const db = this._readData();
    if (!db.breakGlassEvents) db.breakGlassEvents = [];

    const newEvent = {
      id: eventData.id || `bg-${Date.now()}`,
      tokenId: eventData.tokenId,
      patientId: eventData.patientId,
      doctorId: eventData.doctorId || eventData.doctorAddress,
      doctorAddress: eventData.doctorAddress,
      justification: eventData.justification,
      grantedAt: eventData.grantedAt || new Date().toISOString(),
      expiresAt: eventData.expiresAt || new Date(Date.now() + 3600 * 1000).toISOString(),
      status: "ACTIVE",
      reviewStatus: "PENDING_REVIEW",
      reviewedBy: null,
      reviewedAt: null,
      reviewDecision: null,
      reviewNotes: null
    };

    db.breakGlassEvents.unshift(newEvent);
    this._writeData(db);
    return newEvent;
  }

  getBreakGlassReviewQueue() {
    const db = this._readData();
    return db.breakGlassEvents || [];
  }

  recordBreakGlassReview(tokenIdOrId, reviewer, decision, notes) {
    const db = this._readData();
    if (!db.breakGlassEvents) db.breakGlassEvents = [];

    const event = db.breakGlassEvents.find(
      (e) => e.tokenId === tokenIdOrId || e.id === tokenIdOrId
    );
    if (!event) throw new Error(`Break-glass event not found for ID: ${tokenIdOrId}`);

    // Self-Review Prevention: Invoking clinician cannot review their own break-glass incident
    const reviewerId = (reviewer.id || reviewer.username || "").toLowerCase();
    const reviewerAddr = (reviewer.ethereumAddress || "").toLowerCase();
    const eventDocId = (event.doctorId || "").toLowerCase();
    const eventDocAddr = (event.doctorAddress || "").toLowerCase();

    if (
      (reviewerId && eventDocId && reviewerId === eventDocId) ||
      (reviewerAddr && eventDocAddr && reviewerAddr === eventDocAddr)
    ) {
      const err = new Error("Conflict of Interest: Break-glass activations cannot be self-reviewed by the invoking clinician.");
      err.code = "CONFLICT_OF_INTEREST";
      throw err;
    }

    event.reviewStatus = decision || "JUSTIFIED";
    event.reviewedBy = reviewer.name || reviewer.username || "Compliance Officer";
    event.reviewedAt = new Date().toISOString();
    event.reviewDecision = decision;
    event.reviewNotes = notes || "Standard compliance review completed.";

    this._writeData(db);

    try {
      const auditService = require("./auditService");
      auditService.logInternalAudit({
        actor: event.reviewedBy,
        action: "BREAK_GLASS_REVIEW",
        targetUser: event.doctorId,
        details: `Emergency override ${event.tokenId} reviewed. Outcome: ${decision}`
      });
    } catch {}

    return event;
  }

  _getSeedData() {
    return {
      doctors: [],
      patients: [],
      sessionLocations: {},
      trustedDevices: {},
      accessEvents: []
    };
  }
}

module.exports = new EhrDatabase();
