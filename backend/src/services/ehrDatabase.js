const fs = require("fs");
const path = require("path");

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

  _readData() {
    try {
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      const data = JSON.parse(raw);
      if (!data.doctors) data.doctors = [];
      if (!data.patients) data.patients = [];
      if (!data.sessionLocations) data.sessionLocations = {};
      if (!data.trustedDevices) data.trustedDevices = {};
      if (!data.accessEvents) data.accessEvents = [];
      return data;
    } catch (err) {
      return {
        doctors: [],
        patients: [],
        sessionLocations: {},
        trustedDevices: {},
        accessEvents: []
      };
    }
  }

  _writeData(data) {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
    } catch (err) {
      console.error("[EhrDatabase] Error persisting data:", err.message);
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
    const all = this.getPatients();
    return all.find((p) => 
      (p.id && p.id.toLowerCase() === clean) ||
      (p.phn && p.phn.toLowerCase() === clean) ||
      (p.nic && p.nic.toLowerCase() === clean) ||
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
      console.warn("[EhrDatabase] IPFS re-encrypt on consent update:", e.message);
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

    const newPatient = {
      id,
      patientId: id,
      phn: patientData.phn || `PHN-${Math.floor(100000 + Math.random() * 900000)}`,
      nic: patientData.nic || "N/A",
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
      date: new Date().toISOString().split("T")[0],
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

  addPrescription(patientId, rx) {
    const db = this._readData();
    const patient = db.patients.find((p) => p.id === patientId);
    if (!patient) throw new Error(`Patient not found: ${patientId}`);

    const newPrescription = {
      id: `rx-${Date.now()}`,
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
