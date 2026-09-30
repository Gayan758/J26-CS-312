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
      const initialSeed = this._getSeedData();
      fs.writeFileSync(DATA_FILE, JSON.stringify(initialSeed, null, 2), "utf8");
    }
  }

  _readData() {
    try {
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      const data = JSON.parse(raw);
      let modified = false;

      if (!data.doctors || data.doctors.length === 0) {
        data.doctors = this._getDefaultDoctors();
        modified = true;
      } else {
        // Ensure email exists on all doctor profiles
        for (const doc of data.doctors) {
          if (!doc.email) {
            if (doc.id === "doc-001" || doc.username === "alice.vance") doc.email = "alice.vance@sliit.lk";
            else if (doc.id === "doc-002" || doc.username === "kasun.perera") doc.email = "kasun.perera@seylan.lk";
            else if (doc.id === "doc-003" || doc.username === "sarah.jenkins") doc.email = "sarah.jenkins@hospital.lk";
            else doc.email = `${doc.username || doc.id}@sliit.lk`;
            modified = true;
          }
        }
      }

      // Default doctor assignments and granular consent matrix for seeded patients
      const defaultDoctorMap = {
        "patient-123": {
          assignedDoctorIds: ["doc-001", "doc-002"],
          assignedDoctorAddresses: ["0x70997970c51812dc3a010c7d01b50e0d17dc79c8", "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc"],
          consentedDoctors: ["Dr. Alice Vance, MD", "Dr. Kasun Perera, MBBS"]
        },
        "patient-456": {
          assignedDoctorIds: ["doc-002"],
          assignedDoctorAddresses: ["0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc"],
          consentedDoctors: ["Dr. Kasun Perera, MBBS"]
        },
        "patient-789": {
          assignedDoctorIds: ["doc-003"],
          assignedDoctorAddresses: ["0x90f79bf6eb2c4f870365e785982e1f101e93b906"],
          consentedDoctors: ["Dr. Sarah Jenkins, MD"]
        },
        "patient-321": {
          assignedDoctorIds: ["doc-001"],
          assignedDoctorAddresses: ["0x70997970c51812dc3a010c7d01b50e0d17dc79c8"],
          consentedDoctors: ["Dr. Alice Vance, MD"]
        }
      };

      if (data.patients && Array.isArray(data.patients)) {
        for (const p of data.patients) {
          const mapping = defaultDoctorMap[p.id];
          if (!p.assignedDoctorIds || p.assignedDoctorIds.length === 0) {
            p.assignedDoctorIds = mapping ? mapping.assignedDoctorIds : ["doc-001"];
            modified = true;
          }
          if (!p.assignedDoctorAddresses || p.assignedDoctorAddresses.length === 0) {
            p.assignedDoctorAddresses = mapping ? mapping.assignedDoctorAddresses : ["0x70997970c51812dc3a010c7d01b50e0d17dc79c8"];
            modified = true;
          }
          if (!p.consentedDoctors || p.consentedDoctors.length === 0) {
            p.consentedDoctors = mapping ? mapping.consentedDoctors : ["Dr. Alice Vance, MD"];
            modified = true;
          }
          if (!p.granularPermissions) {
            p.granularPermissions = {
              vitals: { view: true, modify: true },
              soap: { view: true, modify: true },
              prescriptions: { view: true, modify: true },
              labs: { view: true, modify: false },
              sensitiveRecords: { view: false, modify: false }
            };
            modified = true;
          }
        }
      }

      if (modified) {
        this._writeData(data);
      }

      return data;
    } catch (err) {
      console.error("[EhrDatabase] Error reading database file:", err.message);
      return this._getSeedData();
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

    const assignedDoctorIds = patientData.assignedDoctorIds || (admittingId ? [admittingId] : ["doc-001"]);
    const assignedDoctorAddresses = (patientData.assignedDoctorAddresses || (admittingAddress ? [admittingAddress] : ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8"])).map(a => a.toLowerCase());
    const consentedDoctors = patientData.consentedDoctors || (admittingName ? [admittingName] : ["Attending Physician"]);

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
    const db = this._readData();
    const knownDevices = db.knownDevices || [];
    const match = knownDevices.find(
      (d) => (d.doctorId === doctorId || d.ethereumAddress === doctorId) && d.fingerprint === fingerprint && d.trusted
    );
    return match ? { trusted: true } : { trusted: false };
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
    return db.staffTrackingDevices || this._getDefaultStaffDevices();
  }

  getStaffDeviceById(deviceId) {
    const devices = this.getStaffDevices();
    return devices.find((d) => d.deviceId === deviceId || d.osmandProtocolId === deviceId || d.doctorId === deviceId) || null;
  }

  upsertStaffDevice(deviceData) {
    const db = this._readData();
    if (!db.staffTrackingDevices) db.staffTrackingDevices = this._getDefaultStaffDevices();
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
    if (!db.staffTrackingDevices) db.staffTrackingDevices = this._getDefaultStaffDevices();
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
    return [
      {
        deviceId: "dev-alice-01",
        doctorId: "doc-001",
        doctorName: "Dr. Alice Vance, MD",
        deviceName: "Dr. Vance iPhone 15 Pro (Work)",
        osmandProtocolId: "alice_vance_mobile",
        consentGiven: true,
        consentTimestamp: "2026-09-01T08:00:00Z",
        consentVersion: "v1.0",
        trackingEnabled: true,
        sosActive: false,
        batteryLevel: 84,
        lastPosition: {
          lat: 6.9148,
          lon: 79.9734,
          altitude: 18.5,
          speed: 0.0,
          accuracy: 5.2,
          timestamp: new Date().toISOString()
        },
        lastReportTime: new Date().toISOString()
      },
      {
        deviceId: "dev-kasun-02",
        doctorId: "doc-002",
        doctorName: "Dr. Kasun Perera, MBBS",
        deviceName: "Dr. Kasun Samsung Galaxy S24",
        osmandProtocolId: "kasun_perera_mobile",
        consentGiven: true,
        consentTimestamp: "2026-09-05T08:30:00Z",
        consentVersion: "v1.0",
        trackingEnabled: true,
        sosActive: false,
        batteryLevel: 62,
        lastPosition: {
          lat: 6.9145,
          lon: 79.8462,
          altitude: 12.0,
          speed: 0.0,
          accuracy: 4.8,
          timestamp: new Date().toISOString()
        },
        lastReportTime: new Date().toISOString()
      },
      {
        deviceId: "dev-sarah-03",
        doctorId: "doc-003",
        doctorName: "Dr. Sarah Jenkins, MD",
        deviceName: "Dr. Sarah Pixel 8 (Clinical Dispatch)",
        osmandProtocolId: "sarah_jenkins_mobile",
        consentGiven: true,
        consentTimestamp: "2026-09-10T09:00:00Z",
        consentVersion: "v1.0",
        trackingEnabled: true,
        sosActive: false,
        batteryLevel: 91,
        lastPosition: {
          lat: 6.9150,
          lon: 79.9729,
          altitude: 19.0,
          speed: 1.2,
          accuracy: 6.0,
          timestamp: new Date().toISOString()
        },
        lastReportTime: new Date().toISOString()
      }
    ];
  }

  _getDefaultDoctors() {
    return [
      {
        id: "doc-001",
        username: "alice.vance",
        password: "Password123!",
        name: "Dr. Alice Vance, MD",
        email: "alice.vance@sliit.lk",
        slmcNumber: "SLMC-31842",
        specialty: "Consultant Cardiologist",
        ethereumAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        baseCampus: "SLIIT Malabe Campus Health Center",
        phone: "+94 77 123 4567",
        defaultDeviceFingerprint: "sha256:alice-workstation-secure-enclave",
        role: "Doctor",
        registeredAt: "2026-01-10T08:00:00Z",
        lastKnownLocation: {
          latitude: 6.9147,
          longitude: 79.9733,
          accuracy: 5,
          distanceFromMalabeKm: 0.0,
          isInsideMalabe: true,
          campusName: "SLIIT Malabe Campus Health Center",
          recordedAt: new Date().toISOString()
        }
      },
      {
        id: "doc-002",
        username: "kasun.perera",
        password: "Password123!",
        name: "Dr. Kasun Perera, MBBS",
        email: "kasun.perera@seylan.lk",
        slmcNumber: "SLMC-42915",
        specialty: "Emergency Medicine Specialist",
        ethereumAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
        baseCampus: "Seylan Tower 1 Medical Clinic (Kollupitiya)",
        phone: "+94 71 987 6543",
        defaultDeviceFingerprint: "sha256:kasun-mdm-tablet",
        role: "Doctor",
        registeredAt: "2026-02-15T09:30:00Z",
        lastKnownLocation: {
          latitude: 6.9147,
          longitude: 79.8460,
          accuracy: 6,
          distanceFromMalabeKm: 14.1,
          isInsideMalabe: false,
          campusName: "Seylan Tower 1, Colombo",
          recordedAt: new Date().toISOString()
        }
      },
      {
        id: "doc-003",
        username: "sarah.jenkins",
        password: "Password123!",
        name: "Dr. Sarah Jenkins, MD",
        email: "sarah.jenkins@hospital.lk",
        slmcNumber: "SLMC-55102",
        specialty: "Visiting Neurologist",
        ethereumAddress: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
        baseCampus: "External Specialist / On-Call",
        phone: "+94 76 555 1212",
        defaultDeviceFingerprint: "sha256:sarah-laptop",
        role: "Doctor",
        registeredAt: "2026-03-01T11:00:00Z",
        lastKnownLocation: {
          latitude: 6.9150,
          longitude: 79.9729,
          accuracy: 8,
          distanceFromMalabeKm: 0.05,
          isInsideMalabe: true,
          campusName: "SLIIT Malabe Campus Perimeter",
          recordedAt: new Date().toISOString()
        }
      }
    ];
  }

  getDoctors() {
    const db = this._readData();
    if (!db.doctors || db.doctors.length === 0) {
      db.doctors = this._getDefaultDoctors();
      this._writeData(db);
    }
    return db.doctors;
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
    const doctors = (db.doctors || []).map((d) => ({
      id: d.id,
      name: d.name,
      username: d.username,
      email: d.email || `${d.username}@sliit.lk`,
      role: d.role || "Doctor",
      specialty: d.specialty || "General Physician",
      slmcNumber: d.slmcNumber || "N/A",
      baseCampus: d.baseCampus || "SLIIT Malabe Campus Health Center",
      phone: d.phone || "+94 77 123 4567",
      ethereumAddress: d.ethereumAddress,
      defaultDeviceFingerprint: d.defaultDeviceFingerprint,
      status: d.status || (d.disabled ? "disabled" : "active"),
      registeredAt: d.registeredAt || "2026-01-01T00:00:00Z"
    }));

    const hasAdmin = doctors.some((u) => u.role === "Admin" || u.username === "admin");
    if (!hasAdmin) {
      doctors.unshift({
        id: "admin-001",
        name: "Hospital IT & Compliance Admin",
        username: "admin",
        email: "admin.compliance@sliit.lk",
        role: "Admin",
        specialty: "Hospital Security & Governance",
        slmcNumber: "ADMIN-GOV",
        baseCampus: "SLIIT Malabe Campus Health Center",
        phone: "+94 11 754 4801",
        ethereumAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        defaultDeviceFingerprint: "sha256:enrolled-workstation-admin",
        status: "active",
        registeredAt: "2026-01-01T08:00:00Z"
      });
    }

    return doctors;
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

    // Auto-provision tracking device in staff tracking
    if (!db.staffTrackingDevices) db.staffTrackingDevices = this._getDefaultStaffDevices();
    db.staffTrackingDevices.push({
      deviceId: `device-${newDoctor.id}`,
      doctorId: newDoctor.id,
      doctorName: newDoctor.name,
      deviceName: `${newDoctor.name}'s Medical Device`,
      osmandProtocolId: `osmand-${newDoctor.id}`,
      consentGiven: true,
      consentTimestamp: new Date().toISOString(),
      consentVersion: "v1.0",
      trackingEnabled: true,
      batteryLevel: 100,
      sosActive: false,
      lastPosition: {
        lat: 6.9147,
        lon: 79.9733,
        speed: 0,
        altitude: 18,
        accuracy: 5,
        timestamp: new Date().toISOString()
      },
      lastReportTime: new Date().toISOString()
    });

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
      campusName: locationData.campusName || (locationData.isInsideMalabe ? "SLIIT Malabe Campus Health Center" : "Outside Campus Perimeter"),
      ipAddress: locationData.ipAddress || "172.20.10.8",
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
      patients: [
        {
          id: "patient-123",
          patientId: "patient-123",
          phn: "PHN-772910",
          nic: "801352491V",
          name: "John Doe",
          patientName: "John Doe",
          dob: "1980-05-15",
          gender: "Male",
          bloodGroup: "A+",
          allergies: ["Penicillin", "Peanuts"],
          chronicConditions: ["Type 2 Diabetes Mellitus", "Essential Hypertension"],
          sensitivity: "medium",
          consentStatus: true,
          triageQueue: "Cardiology Review Clinic (Room 3)",
          emergencyStatus: "Stable",
          criticalAlert: "",
          registeredAt: "2026-09-01T08:00:00Z",
          vitals: [
            {
              id: "vit-101",
              bp: "128/82",
              hr: 72,
              rr: 16,
              spo2: 98,
              temp: "36.8 C",
              glucose: "118 mg/dL",
              recordedAt: "2026-09-15T09:30:00Z",
              recordedBy: "Nurse Chamari Fernando"
            }
          ],
          encounters: [
            {
              id: "enc-101",
              date: "2026-09-14",
              doctorName: "Dr. Alice Vance, MD",
              doctorAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
              chiefComplaint: "Routine follow-up for diabetes glycemic control & cardiovascular stability",
              soap: {
                subjective: "Patient reports no dizziness, chest tightness, or polyuria. Compliant with prescribed oral hypoglycemic agents.",
                objective: "BP 128/82 mmHg, pulse 72 bpm regular. Heart sounds S1/S2 normal, no murmurs. Lungs vesicular breath sounds bilaterally. Lower extremities: no pedal edema.",
                assessment: "Type 2 Diabetes Mellitus under fair control. Stage 1 Essential Hypertension well controlled.",
                plan: "Continue Metformin 500mg BID and Lisinopril 10mg daily. Recommend low sodium, low glycemic diet. Schedule fasting lipids & HbA1c in 3 months."
              },
              diagnosisIcd10: ["E11.9 - Type 2 diabetes mellitus without complications", "I10 - Essential hypertension"]
            }
          ],
          prescriptions: [
            {
              id: "rx-101",
              drugName: "Metformin Hydrochloride",
              dosage: "500mg",
              route: "Oral",
              frequency: "Twice daily with meals",
              duration: "90 days",
              refills: 3,
              instructions: "Take with morning and evening meals.",
              prescribedBy: "Dr. Alice Vance, MD",
              prescribedAt: "2026-09-14T10:00:00Z",
              status: "Active"
            },
            {
              id: "rx-102",
              drugName: "Lisinopril",
              dosage: "10mg",
              route: "Oral",
              frequency: "Once daily in the morning",
              duration: "90 days",
              refills: 3,
              instructions: "Monitor blood pressure weekly.",
              prescribedBy: "Dr. Alice Vance, MD",
              prescribedAt: "2026-09-14T10:00:00Z",
              status: "Active"
            }
          ],
          labResults: [
            {
              id: "lab-101",
              testName: "Comprehensive Glycemic & Renal Profile",
              orderedDate: "2026-09-10",
              completedDate: "2026-09-12",
              status: "Final",
              results: [
                { parameter: "Fasting Blood Sugar", value: "118", unit: "mg/dL", normalRange: "70 - 99", flag: "HIGH" },
                { parameter: "Glycated Hemoglobin (HbA1c)", value: "6.8", unit: "%", normalRange: "< 5.7 (Normal), < 7.0 (Target)", flag: "BORDERLINE" },
                { parameter: "eGFR", value: "92", unit: "mL/min/1.73m2", normalRange: "> 60", flag: "NORMAL" },
                { parameter: "Serum Creatinine", value: "0.9", unit: "mg/dL", normalRange: "0.7 - 1.3", flag: "NORMAL" }
              ]
            }
          ]
        },
        {
          id: "patient-456",
          patientId: "patient-456",
          phn: "PHN-884219",
          nic: "948251032V",
          name: "Jane Trauma-Smith",
          patientName: "Jane Trauma-Smith",
          dob: "1994-11-20",
          gender: "Female",
          bloodGroup: "O-",
          allergies: ["Morphine (Severe Bronchospasm)", "Latex (Anaphylactic Shock)"],
          chronicConditions: ["None reported"],
          sensitivity: "restricted",
          consentStatus: false, // Unconscious in ER, consent cannot be given
          triageQueue: "Emergency Trauma Bay 1 (Resuscitation)",
          emergencyStatus: "CRITICAL / UNCONSCIOUS (GCS 4)",
          criticalAlert: "Severe latex allergy! Use non-latex surgical equipment immediately.",
          registeredAt: "2026-09-16T06:45:00Z",
          vitals: [
            {
              id: "vit-201",
              bp: "84/52",
              hr: 128,
              rr: 26,
              spo2: 91,
              temp: "35.9 C",
              glucose: "88 mg/dL",
              recordedAt: "2026-09-16T07:15:00Z",
              recordedBy: "ER Resus Team"
            }
          ],
          encounters: [
            {
              id: "enc-201",
              date: "2026-09-16",
              doctorName: "Dr. Kasun Perera, MBBS",
              doctorAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
              chiefComplaint: "Severe polytrauma following motor vehicle collision, Glasgow Coma Scale 4, unconscious",
              soap: {
                subjective: "Paramedics report high-speed vehicle impact. Unresponsive at scene. No family or next-of-kin present for consent.",
                objective: "GCS 4 (E1V1M2). Unequal pupils (right pupil 5mm sluggish, left 3mm reactive). Depressed skull fracture right parietal region. Tachycardic 128 bpm, hypotensive 84/52 mmHg.",
                assessment: "Acute Traumatic Brain Injury with Epidural / Subdural Hemorrhage. Hypovolemic Shock. Impending uncal herniation.",
                plan: "Urgent non-contrast CT brain. Emergency endotracheal intubation with in-line cervical stabilization. Prepare trauma operating theater for craniotomy. Cross-match 4 units O-negative packed red cells. STRICT NON-LATEX PROTOCOL."
              },
              diagnosisIcd10: ["S06.2 - Diffuse traumatic brain injury", "T79.4 - Traumatic shock", "Z91.040 - Latex allergy status"]
            }
          ],
          prescriptions: [
            {
              id: "rx-201",
              drugName: "Mannitol 20% IV Infusion",
              dosage: "1g/kg",
              route: "Intravenous",
              frequency: "STAT bolus over 20 mins",
              duration: "1 dose",
              refills: 0,
              instructions: "Administer through dedicated line with in-line filter for cerebral edema reduction.",
              prescribedBy: "Dr. Kasun Perera, MBBS",
              prescribedAt: "2026-09-16T07:20:00Z",
              status: "Active"
            }
          ],
          labResults: [
            {
              id: "lab-201",
              testName: "Urgent Trauma Coagulation & Blood Gas",
              orderedDate: "2026-09-16",
              completedDate: "2026-09-16",
              status: "Final",
              results: [
                { parameter: "Arterial pH", value: "7.28", unit: "pH", normalRange: "7.35 - 7.45", flag: "LOW" },
                { parameter: "Blood Lactate", value: "4.2", unit: "mmol/L", normalRange: "0.5 - 1.6", flag: "HIGH" },
                { parameter: "Hemoglobin", value: "8.9", unit: "g/dL", normalRange: "12.0 - 15.5", flag: "LOW" },
                { parameter: "Platelet Count", value: "145", unit: "x10^3/uL", normalRange: "150 - 450", flag: "LOW" }
              ]
            }
          ]
        },
        {
          id: "patient-789",
          phn: "PHN-661902",
          nic: "960241852V",
          name: "Kusal Silva",
          dob: "1996-03-24",
          gender: "Male",
          bloodGroup: "B+",
          allergies: ["Aspirin (Bronchospasm)", "Ibuprofen"],
          chronicConditions: ["Mild Intermittent Bronchial Asthma"],
          sensitivity: "low",
          consentStatus: true,
          triageQueue: "Outpatient General Consultation (Room 1)",
          emergencyStatus: "Stable",
          criticalAlert: "",
          registeredAt: "2026-09-10T11:00:00Z",
          vitals: [
            {
              id: "vit-301",
              bp: "116/74",
              hr: 68,
              rr: 14,
              spo2: 99,
              temp: "36.6 C",
              glucose: "92 mg/dL",
              recordedAt: "2026-09-15T14:10:00Z",
              recordedBy: "Staff Nurse"
            }
          ],
          encounters: [
            {
              id: "enc-301",
              date: "2026-09-15",
              doctorName: "Dr. Sarah Jenkins, MD",
              doctorAddress: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
              chiefComplaint: "Routine pre-employment medical clearance and asthma check",
              soap: {
                subjective: "Asymptomatic. No nocturnal wheezing or shortness of breath on exertion.",
                objective: "Chest clear. Peak expiratory flow rate 520 L/min (96% of predicted).",
                assessment: "Controlled mild bronchial asthma. Medical fitness certificate issued.",
                plan: "Salbutamol inhaler PRN. Avoid NSAIDs."
              },
              diagnosisIcd10: ["J45.20 - Mild intermittent asthma", "Z02.1 - Pre-employment examination"]
            }
          ],
          prescriptions: [
            {
              id: "rx-301",
              drugName: "Salbutamol Inhaler 100mcg",
              dosage: "2 puffs",
              route: "Inhalation",
              frequency: "As needed for wheezing or chest tightness",
              duration: "PRN",
              refills: 2,
              instructions: "Use with spacer. Do not exceed 8 puffs in 24 hours.",
              prescribedBy: "Dr. Sarah Jenkins, MD",
              prescribedAt: "2026-09-15T14:30:00Z",
              status: "Active"
            }
          ],
          labResults: []
        },
        {
          id: "patient-321",
          phn: "PHN-553198",
          nic: "721590412V",
          name: "Priyantha Jayawardena",
          dob: "1972-08-11",
          gender: "Male",
          bloodGroup: "AB+",
          allergies: ["Sulfa Antibiotics (Severe Skin Rash)"],
          chronicConditions: ["Chronic Kidney Disease (Stage 3a)", "Essential Hypertension"],
          sensitivity: "high",
          consentStatus: true,
          triageQueue: "Nephrology Specialist Clinic (Room 5)",
          emergencyStatus: "Stable Review",
          criticalAlert: "Renal dosage adjustments mandatory for all prescribed pharmaceuticals.",
          registeredAt: "2026-08-15T10:00:00Z",
          vitals: [
            {
              id: "vit-401",
              bp: "134/86",
              hr: 74,
              rr: 16,
              spo2: 97,
              temp: "36.7 C",
              glucose: "104 mg/dL",
              recordedAt: "2026-09-15T11:00:00Z",
              recordedBy: "Staff Nurse"
            }
          ],
          encounters: [
            {
              id: "enc-401",
              date: "2026-09-15",
              doctorName: "Dr. Alice Vance, MD",
              doctorAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
              chiefComplaint: "Nephrology assessment and renal function monitoring",
              soap: {
                subjective: "No gross hematuria, dysuria, or peripheral swelling noted.",
                objective: "BP 134/86 mmHg. Serum creatinine 1.7 mg/dL, eGFR 48 mL/min/1.73m2.",
                assessment: "CKD Stage 3a with stable proteinuria under ACE inhibitor therapy.",
                plan: "Maintain tight BP control < 130/80. Recheck serum electrolytes and potassium in 6 weeks."
              },
              diagnosisIcd10: ["N18.3 - Chronic kidney disease, stage 3", "I10 - Essential hypertension"]
            }
          ],
          prescriptions: [
            {
              id: "rx-401",
              drugName: "Losartan Potassium",
              dosage: "50mg",
              route: "Oral",
              frequency: "Once daily",
              duration: "60 days",
              refills: 2,
              instructions: "Take consistently at bedtime.",
              prescribedBy: "Dr. Alice Vance, MD",
              prescribedAt: "2026-09-15T11:20:00Z",
              status: "Active"
            }
          ],
          labResults: [
            {
              id: "lab-401",
              testName: "Renal Function & Electrolyte Profile",
              orderedDate: "2026-09-14",
              completedDate: "2026-09-15",
              status: "Final",
              results: [
                { parameter: "Serum Creatinine", value: "1.7", unit: "mg/dL", normalRange: "0.7 - 1.3", flag: "HIGH" },
                { parameter: "eGFR (CKD-EPI)", value: "48", unit: "mL/min/1.73m2", normalRange: "> 60", flag: "LOW" },
                { parameter: "Serum Potassium", value: "4.7", unit: "mmol/L", normalRange: "3.5 - 5.0", flag: "NORMAL" },
                { parameter: "Blood Urea Nitrogen (BUN)", value: "28", unit: "mg/dL", normalRange: "7 - 20", flag: "HIGH" }
              ]
            }
          ]
        }
      ]
    };
  }
}

module.exports = new EhrDatabase();
