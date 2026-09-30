#!/usr/bin/env node
/**
 * scripts/dev/seed.js
 * Safe Developer Seeder for MedGuard EHR
 *
 * Populates local development database with fictional Sri Lankan patient and physician records.
 * STRICT SAFETY RULE: Refuses to run if NODE_ENV === 'production'.
 * Every generated record is tagged with '_dev_seed: true'.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// 1. Production safety guard
if (process.env.NODE_ENV === "production") {
  console.error("CRITICAL SAFETY ERROR: Refusing to seed test data into a production environment (NODE_ENV=production).");
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, "../../backend/data");
const DB_FILE = path.join(DATA_DIR, "ehr_database.json");
const IPFS_DIR = path.join(DATA_DIR, "ipfs_storage");

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(IPFS_DIR)) fs.mkdirSync(IPFS_DIR, { recursive: true });

const SEED_DOCTORS = [
  {
    id: "doc-001",
    name: "Dr. Alice Vance, MD",
    username: "alice.vance",
    password: "Password123!",
    email: "alice.vance@hospital.local",
    slmcNumber: "SLMC-48291",
    specialty: "Internal Medicine & Nephrology",
    baseCampus: "Hospital Main Campus",
    role: "Doctor",
    status: "active",
    ethereumAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    defaultDeviceFingerprint: "sha256:clinical-workstation-01",
    _dev_seed: true
  },
  {
    id: "doc-002",
    name: "Dr. Kasun Perera, MBBS",
    username: "kasun.perera",
    password: "Password123!",
    email: "kasun.perera@hospital.local",
    slmcNumber: "SLMC-51042",
    specialty: "Emergency Medicine & Trauma",
    baseCampus: "Emergency Treatment Unit (ETU)",
    role: "Doctor",
    status: "active",
    ethereumAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    defaultDeviceFingerprint: "sha256:etu-trauma-terminal",
    _dev_seed: true
  },
  {
    id: "doc-003",
    name: "Dr. Sarah Jenkins, MD",
    username: "sarah.jenkins",
    password: "Password123!",
    email: "sarah.jenkins@hospital.local",
    slmcNumber: "SLMC-39180",
    specialty: "Respiratory & Critical Care",
    baseCampus: "Cardio-Respiratory Wing",
    role: "Doctor",
    status: "active",
    ethereumAddress: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    defaultDeviceFingerprint: "sha256:icu-respiratory-terminal",
    _dev_seed: true
  }
];

const SEED_PATIENTS = [
  {
    id: "patient-123",
    phn: "PHN-847291",
    nic: "852190341V",
    name: "Nimal Perera",
    dob: "1985-04-12",
    gender: "Male",
    bloodGroup: "O+",
    allergies: ["Penicillin", "Sulfa drugs"],
    chronicConditions: ["Type 2 Diabetes Mellitus", "Stage 1 Essential Hypertension"],
    sensitivity: "medium",
    consentStatus: true,
    triageQueue: "Outpatient General Clinic",
    emergencyStatus: "Stable",
    criticalAlert: "",
    registeredAt: "2026-09-01T08:30:00Z",
    assignedDoctorIds: ["doc-001", "doc-002"],
    assignedDoctorAddresses: [
      "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
      "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc"
    ],
    consentedDoctors: ["Dr. Alice Vance, MD", "Dr. Kasun Perera, MBBS"],
    granularPermissions: {
      vitals: { view: true, modify: true },
      soap: { view: true, modify: true },
      prescriptions: { view: true, modify: true },
      labs: { view: true, modify: false },
      sensitiveRecords: { view: false, modify: false }
    },
    vitals: [
      {
        id: "vit-101",
        bp: "128/82",
        hr: 76,
        rr: 16,
        spo2: 98,
        temp: "36.7 C",
        glucose: "118 mg/dL",
        recordedAt: "2026-09-15T09:15:00Z",
        recordedBy: "Staff Nurse"
      }
    ],
    encounters: [
      {
        id: "enc-101",
        date: "2026-09-15",
        doctorName: "Dr. Alice Vance, MD",
        doctorAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        chiefComplaint: "Routine 3-month follow up for glycemic control and medication review",
        soap: {
          subjective: "Patient reports adherence to diet and metformin. Occasional evening fatigue.",
          objective: "BP 128/82 mmHg, HR 76 bpm regular. Chest clear to auscultation, no peripheral edema.",
          assessment: "Suboptimally controlled Type 2 Diabetes; stable essential hypertension.",
          plan: "Adjust Metformin dosage to 850mg BD. Order HbA1c and lipid panel for next visit."
        },
        diagnosisIcd10: ["E11.9 - Type 2 diabetes mellitus", "I10 - Essential hypertension"]
      }
    ],
    prescriptions: [
      {
        id: "rx-101",
        drugName: "Metformin Hydrochloride",
        dosage: "850mg",
        route: "Oral",
        frequency: "Twice daily after meals",
        duration: "90 days",
        refills: 2,
        instructions: "Take with or immediately after main meals to minimize gastrointestinal discomfort.",
        prescribedBy: "Dr. Alice Vance, MD",
        prescribedAt: "2026-09-15T09:40:00Z",
        status: "Active"
      }
    ],
    labResults: [
      {
        id: "lab-101",
        testName: "Fasting Blood Sugar & HbA1c",
        orderedDate: "2026-09-10",
        completedDate: "2026-09-12",
        status: "Final",
        results: [
          { parameter: "Fasting Plasma Glucose", value: "118", unit: "mg/dL", normalRange: "70 - 99", flag: "HIGH" },
          { parameter: "Hemoglobin A1c", value: "7.1", unit: "%", normalRange: "4.0 - 5.6", flag: "HIGH" }
        ]
      }
    ],
    _dev_seed: true
  },
  {
    id: "patient-456",
    phn: "PHN-912403",
    nic: "916024810V",
    name: "Sunethra Bandara",
    dob: "1991-11-20",
    gender: "Female",
    bloodGroup: "A-",
    allergies: ["No Known Drug Allergies (NKDA)"],
    chronicConditions: [],
    sensitivity: "high",
    consentStatus: false,
    triageQueue: "Emergency Resuscitation Bay 1",
    emergencyStatus: "CRITICAL RESUSCITATION",
    criticalAlert: "Emergency trauma admission. Patient currently unconscious.",
    registeredAt: "2026-09-16T02:15:00Z",
    assignedDoctorIds: ["doc-002"],
    assignedDoctorAddresses: ["0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc"],
    consentedDoctors: ["Dr. Kasun Perera, MBBS"],
    granularPermissions: {
      vitals: { view: true, modify: true },
      soap: { view: true, modify: true },
      prescriptions: { view: true, modify: true },
      labs: { view: true, modify: false },
      sensitiveRecords: { view: false, modify: false }
    },
    vitals: [
      {
        id: "vit-201",
        bp: "88/54",
        hr: 128,
        rr: 24,
        spo2: 91,
        temp: "35.8 C",
        glucose: "142 mg/dL",
        recordedAt: "2026-09-16T02:20:00Z",
        recordedBy: "Triage Sister"
      }
    ],
    encounters: [
      {
        id: "enc-201",
        date: "2026-09-16",
        doctorName: "Dr. Kasun Perera, MBBS",
        doctorAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
        chiefComplaint: "Acute polytrauma secondary to road traffic accident",
        soap: {
          subjective: "Patient unresponsive at scene. GCS 7 (E2V2M3).",
          objective: "Tachycardic (HR 128), hypotensive (BP 88/54). Pelvic instability detected.",
          assessment: "Hemorrhagic shock secondary to pelvic fracture and blunt abdominal trauma.",
          plan: "Immediate emergency intubation. Activate MTP protocol. Urgent FAST scan and CT angiogram."
        },
        diagnosisIcd10: ["S32.89 - Fracture of pelvis", "R57.1 - Hypovolemic shock"]
      }
    ],
    prescriptions: [
      {
        id: "rx-201",
        drugName: "Tranexamic Acid (TXA)",
        dosage: "1g IV loading",
        route: "Intravenous",
        frequency: "STAT over 10 min",
        duration: "Single dose",
        refills: 0,
        instructions: "Follow with 1g infusion over 8 hours.",
        prescribedBy: "Dr. Kasun Perera, MBBS",
        prescribedAt: "2026-09-16T02:25:00Z",
        status: "Administered"
      }
    ],
    labResults: [],
    _dev_seed: true
  }
];

function seedDatabase() {
  const existingData = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, "utf8")) : {};

  const mergedDoctors = [...SEED_DOCTORS];
  const mergedPatients = [...SEED_PATIENTS];

  const dbData = {
    doctors: mergedDoctors,
    patients: mergedPatients,
    sessionLocations: existingData.sessionLocations || {},
    trustedDevices: existingData.trustedDevices || {},
    accessEvents: existingData.accessEvents || []
  };

  fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2), "utf8");

  // Encrypt and persist IPFS blobs for seeded patients
  for (const patient of SEED_PATIENTS) {
    const keyBuffer = crypto.createHash("sha256").update(`${patient.id}-key`).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer, iv);
    const plaintextBuffer = Buffer.from(JSON.stringify(patient), "utf8");
    const ciphertext = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const hash = crypto.createHash("sha256").update(ciphertext).digest("hex");

    const blob = {
      fileHash: `ipfs://bafy-${hash}`,
      patientId: patient.id,
      iv: iv.toString("hex"),
      authTag: authTag.toString("hex"),
      ciphertext: ciphertext.toString("base64"),
      storedAt: new Date().toISOString(),
      _dev_seed: true
    };

    fs.writeFileSync(path.join(IPFS_DIR, `${patient.id}.json`), JSON.stringify(blob, null, 2), "utf8");
  }

  process.stdout.write(`[DEV SEED] Successfully seeded ${SEED_DOCTORS.length} doctors and ${SEED_PATIENTS.length} patients with encrypted IPFS records.\n`);
}

seedDatabase();
