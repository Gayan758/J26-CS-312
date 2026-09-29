/**
 * MedGuard Clinical EHR — Synthetic Mock Dataset & Simulation Configuration
 * 
 * NOTE: All data is completely synthetic and fictional (invented Sri Lankan names,
 * fictional NIC formats, simulated clinical values). Designed for viva/proposal demonstrations.
 */

export const MOCK_DOCTORS = [
  {
    id: "doc-sarah",
    username: "sarah.jenkins",
    password: "Password123!",
    name: "Dr. Sarah Jenkins, MD",
    role: "Visiting Neurologist",
    department: "Clinical Neurosciences",
    facility: "SLIIT & Seylan Network",
    ethereumAddress: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    deviceFingerprint: "sha256:enrolled-workstation-sarah-macbook"
  },
  {
    id: "doc-alice",
    username: "alice.vance",
    password: "Password123!",
    name: "Dr. Alice Vance, MD",
    role: "Senior Cardiologist",
    department: "Cardiovascular Medicine",
    facility: "SLIIT Malabe Campus Hospital",
    ethereumAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    deviceFingerprint: "sha256:enrolled-workstation-alice-cardio"
  },
  {
    id: "doc-kasun",
    username: "kasun.perera",
    password: "Password123!",
    name: "Dr. Kasun Perera, MBBS",
    role: "Emergency Medicine Specialist",
    department: "Emergency Trauma & Resuscitation",
    facility: "Seylan Tower 1 Clinic, Colombo",
    ethereumAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    deviceFingerprint: "sha256:enrolled-workstation-kasun-er"
  }
];

export const SIMULATION_LOCATIONS = {
  sliit: {
    id: "sliit",
    name: "SLIIT Malabe Campus Health Center",
    shortName: "SLIIT Malabe Campus",
    address: "New Kandy Rd, Malabe",
    coordinates: "6.9147° N, 79.9733° E",
    ip: "10.100.1.25",
    isTrusted: true,
    riskScore: 0.05,
    tag: "Campus LAN"
  },
  seylan: {
    id: "seylan",
    name: "Seylan Tower 1 Clinic, Colombo",
    shortName: "Seylan Tower 1, Colombo",
    address: "90 Galle Road, Colombo 3",
    coordinates: "6.9147° N, 79.8460° E",
    ip: "192.168.10.45",
    isTrusted: true,
    riskScore: 0.08,
    tag: "Branch LAN"
  },
  unknown: {
    id: "unknown",
    name: "Unknown Location / Off-Campus",
    shortName: "Unknown / Off-Campus",
    address: "Outside Geofence (Cellular / Public ISP)",
    coordinates: "6.8402° N, 80.0012° E",
    ip: "203.0.113.88",
    isTrusted: false,
    riskScore: 0.85,
    tag: "External Untrusted"
  }
};

export const INITIAL_PATIENTS = [
  {
    id: "patient-123",
    phn: "PHN-772910",
    nic: "198512409182",
    name: "Kusal Silva",
    gender: "Male",
    dob: "1985-04-12",
    bloodGroup: "B+",
    department: "Cardiology Review Clinic (Room 3)",
    statusType: "routine",
    consentedDoctors: ["Dr. Sarah Jenkins, MD", "Dr. Alice Vance, MD"],
    chronicConditions: ["Essential Hypertension", "Type 2 Diabetes Mellitus"],
    allergies: ["Penicillin", "Peanuts"],
    criticalAlert: "",
    vitals: {
      bp: "122/78",
      hr: 72,
      rr: 16,
      spo2: 98,
      temp: "36.8°C",
      glucose: "112 mg/dL",
      recordedAt: "Today, 08:45 AM"
    },
    notesCount: 4,
    prescriptionsCount: 3,
    encounters: [
      {
        id: "enc-101",
        date: "2026-09-14",
        doctor: "Dr. Alice Vance, MD",
        chiefComplaint: "Routine hypertension and glycemic review",
        soap: {
          subjective: "Patient reports feeling well, no orthostatic dizziness or chest pressure. Taking meds consistently.",
          objective: "BP 122/78 mmHg, HR 72 bpm regular. Clear chest. No peripheral edema.",
          assessment: "Stage 1 Essential Hypertension well controlled on ACE-inhibitor. T2DM stable.",
          plan: "Continue Metformin 500mg BID and Lisinopril 10mg daily. Repeat fasting lipids in 3 months."
        }
      }
    ],
    prescriptions: [
      { id: "rx-101", drug: "Metformin Hydrochloride", dosage: "500mg", frequency: "Twice daily with meals", duration: "90 days", refills: 2, status: "Active" },
      { id: "rx-102", drug: "Lisinopril", dosage: "10mg", frequency: "Once daily in the morning", duration: "90 days", refills: 2, status: "Active" }
    ],
    labs: [
      { test: "HbA1c", result: "6.4%", reference: "< 5.7% (Normal), < 7.0% (Target)", status: "Optimal" },
      { test: "Serum Creatinine", result: "0.9 mg/dL", reference: "0.7 - 1.3 mg/dL", status: "Normal" }
    ]
  },
  {
    id: "patient-456",
    phn: "PHN-884219",
    nic: "199465201934",
    name: "Jane Trauma-Smith",
    gender: "Female",
    dob: "1994-11-20",
    bloodGroup: "O-",
    department: "Emergency Trauma Bay 1 (Resuscitation)",
    statusType: "emergency",
    consentedDoctors: [],
    chronicConditions: ["None reported (Unconscious emergency intake)"],
    allergies: ["Latex (Anaphylaxis)", "Morphine (Severe Bronchospasm)"],
    criticalAlert: "Severe latex allergy! Use non-latex surgical equipment immediately.",
    vitals: {
      bp: "84/52",
      hr: 128,
      rr: 26,
      spo2: 88,
      temp: "35.8°C",
      glucose: "84 mg/dL",
      recordedAt: "12 mins ago (ER Resus)"
    },
    notesCount: 2,
    prescriptionsCount: 1,
    encounters: [
      {
        id: "enc-201",
        date: "2026-09-16",
        doctor: "Dr. Kasun Perera, MBBS",
        chiefComplaint: "Severe blunt polytrauma following road traffic collision. GCS 4 (E1V1M2).",
        soap: {
          subjective: "Paramedics report high-speed vehicle impact. Found unresponsive. No relatives present for consent.",
          objective: "GCS 4. Right pupil 5mm sluggish, left 3mm reactive. Hypotensive 84/52, tachycardic 128. Depressed skull fracture.",
          assessment: "Traumatic Brain Injury with suspected acute epidural hematoma. Hypovolemic shock. GCS 4 critical.",
          plan: "Urgent emergency craniotomy. Strict non-latex protocol due to documented anaphylaxis. Transfuse 4 units O-negative blood."
        }
      }
    ],
    prescriptions: [
      { id: "rx-201", drug: "Mannitol 20% IV Infusion", dosage: "100g STAT", frequency: "STAT over 20 mins", duration: "1 dose", refills: 0, status: "Administered" }
    ],
    labs: [
      { test: "Arterial pH", result: "7.26", reference: "7.35 - 7.45", status: "Critical Low" },
      { test: "Blood Lactate", result: "4.4 mmol/L", reference: "0.5 - 1.6 mmol/L", status: "Critical High" },
      { test: "Hemoglobin", result: "8.6 g/dL", reference: "12.0 - 15.5 g/dL", status: "Low" }
    ]
  },
  {
    id: "patient-789",
    phn: "PHN-331045",
    nic: "197209104821",
    name: "Sunil Wickramasinghe",
    gender: "Male",
    dob: "1972-09-18",
    bloodGroup: "A+",
    department: "Outpatient General OPD",
    statusType: "routine",
    consentedDoctors: ["Dr. Sarah Jenkins, MD"],
    chronicConditions: ["Mild Intermittent Bronchial Asthma"],
    allergies: ["Aspirin (Bronchospasm)"],
    criticalAlert: "",
    vitals: {
      bp: "118/76",
      hr: 70,
      rr: 15,
      spo2: 99,
      temp: "36.6°C",
      glucose: "96 mg/dL",
      recordedAt: "Today, 09:15 AM"
    },
    notesCount: 3,
    prescriptionsCount: 2,
    encounters: [
      {
        id: "enc-301",
        date: "2026-09-15",
        doctor: "Dr. Sarah Jenkins, MD",
        chiefComplaint: "Routine pre-employment medical clearance and asthma check",
        soap: {
          subjective: "Asymptomatic. No nocturnal wheeze or exertional breathlessness.",
          objective: "Lungs clear bilaterally. Peak expiratory flow 520 L/min (96% of predicted).",
          assessment: "Well controlled bronchial asthma. Fitness certificate issued.",
          plan: "Salbutamol inhaler PRN. Avoid NSAIDs."
        }
      }
    ],
    prescriptions: [
      { id: "rx-301", drug: "Salbutamol Inhaler 100mcg", dosage: "2 puffs", frequency: "As needed for wheeze", duration: "PRN", refills: 3, status: "Active" }
    ],
    labs: [
      { test: "Chest X-Ray", result: "Normal lung fields", reference: "Clear", status: "Normal" }
    ]
  },
  {
    id: "patient-321",
    phn: "PHN-552901",
    nic: "199078201349",
    name: "Dilani Fernando",
    gender: "Female",
    dob: "1990-07-25",
    bloodGroup: "O+",
    department: "Nephrology Specialist Clinic",
    statusType: "specialist",
    consentedDoctors: ["Dr. Alice Vance, MD"],
    chronicConditions: ["Chronic Kidney Disease (Stage 3)", "Secondary Hypertension"],
    allergies: ["Sulfa Antibiotics"],
    criticalAlert: "",
    vitals: {
      bp: "134/86",
      hr: 76,
      rr: 16,
      spo2: 97,
      temp: "36.9°C",
      glucose: "104 mg/dL",
      recordedAt: "Today, 08:30 AM"
    },
    notesCount: 5,
    prescriptionsCount: 3,
    encounters: [
      {
        id: "enc-401",
        date: "2026-09-10",
        doctor: "Dr. Alice Vance, MD",
        chiefComplaint: "Quarterly renal function and blood pressure review",
        soap: {
          subjective: "Mild ankle puffiness by evening. Compliant with low-sodium, low-protein renal diet.",
          objective: "BP 134/86 mmHg. Trace pedal edema. JVP not elevated.",
          assessment: "CKD Stage 3a with microalbuminuria. Blood pressure borderline.",
          plan: "Optimize Telmisartan to 40mg. Monitor serum potassium in 2 weeks."
        }
      }
    ],
    prescriptions: [
      { id: "rx-401", drug: "Telmisartan", dosage: "40mg", frequency: "Once daily morning", duration: "90 days", refills: 2, status: "Active" },
      { id: "rx-402", drug: "Sodium Bicarbonate", dosage: "500mg", frequency: "Twice daily", duration: "90 days", refills: 2, status: "Active" }
    ],
    labs: [
      { test: "eGFR", result: "48 mL/min/1.73m²", reference: "> 60 mL/min", status: "Abnormal" },
      { test: "Serum Creatinine", result: "1.4 mg/dL", reference: "0.5 - 1.1 mg/dL", status: "Elevated" }
    ]
  },
  {
    id: "patient-654",
    phn: "PHN-664120",
    nic: "196815309482",
    name: "Priyantha Jayawardena",
    gender: "Male",
    dob: "1968-02-14",
    bloodGroup: "AB+",
    department: "Endocrinology Review Clinic",
    statusType: "routine",
    consentedDoctors: ["Dr. Sarah Jenkins, MD", "Dr. Alice Vance, MD"],
    chronicConditions: ["Type 1 Diabetes Mellitus", "Peripheral Neuropathy"],
    allergies: ["Cephalosporins"],
    criticalAlert: "",
    vitals: {
      bp: "120/80",
      hr: 68,
      rr: 14,
      spo2: 99,
      temp: "36.7°C",
      glucose: "142 mg/dL",
      recordedAt: "Today, 09:40 AM"
    },
    notesCount: 6,
    prescriptionsCount: 4,
    encounters: [
      {
        id: "enc-501",
        date: "2026-09-08",
        doctor: "Dr. Sarah Jenkins, MD",
        chiefComplaint: "CGM sensor review and basal insulin titration",
        soap: {
          subjective: "Minor nocturnal hypoglycemia episode 4 days ago. Sensor data shows 74% time in range.",
          objective: "Feet inspection: intact sensation to 10g monofilament. Dorsalis pedis pulses palpable.",
          assessment: "T1DM with satisfactory time-in-range. Mild nocturnal dip.",
          plan: "Reduce bedtime Glargine by 2 units. Recheck CGM trend in 4 weeks."
        }
      }
    ],
    prescriptions: [
      { id: "rx-501", drug: "Insulin Glargine (Lantus)", dosage: "22 units", frequency: "Once daily at 22:00", duration: "30 days", refills: 3, status: "Active" },
      { id: "rx-502", drug: "Insulin Aspart (NovoRapid)", dosage: "6-8 units", frequency: "Subcutaneously TID before meals", duration: "30 days", refills: 3, status: "Active" }
    ],
    labs: [
      { test: "HbA1c", result: "6.9%", reference: "< 7.0%", status: "On Target" }
    ]
  },
  {
    id: "patient-987",
    phn: "PHN-442817",
    nic: "199854109281",
    name: "Nimali Ratnayake",
    gender: "Female",
    dob: "1998-12-05",
    bloodGroup: "A-",
    department: "Neurology Specialist Clinic",
    statusType: "specialist",
    consentedDoctors: ["Dr. Sarah Jenkins, MD"],
    chronicConditions: ["Episodic Migraine with Visual Aura"],
    allergies: ["None reported"],
    criticalAlert: "",
    vitals: {
      bp: "114/72",
      hr: 66,
      rr: 14,
      spo2: 99,
      temp: "36.5°C",
      glucose: "90 mg/dL",
      recordedAt: "Today, 10:05 AM"
    },
    notesCount: 2,
    prescriptionsCount: 2,
    encounters: [
      {
        id: "enc-601",
        date: "2026-09-02",
        doctor: "Dr. Sarah Jenkins, MD",
        chiefComplaint: "Severe pulsating headache with scintillating scotoma",
        soap: {
          subjective: "Averaging 3 disabling migraine attacks per month triggered by sleep deprivation.",
          objective: "Neurological examination completely normal. Cranial nerves I-XII intact.",
          assessment: "Common Migraine with typical sensory aura. Good candidate for prophylactic therapy.",
          plan: "Start Propranolol 40mg daily prophylaxis. Zolmitriptan 2.5mg for acute abortive treatment."
        }
      }
    ],
    prescriptions: [
      { id: "rx-601", drug: "Propranolol Hydrochloride", dosage: "40mg", frequency: "Once daily in morning", duration: "60 days", refills: 2, status: "Active" },
      { id: "rx-602", drug: "Zolmitriptan Oral Tablets", dosage: "2.5mg", frequency: "At onset of aura", duration: "PRN", refills: 3, status: "Active" }
    ],
    labs: [
      { test: "Brain MRI (Non-contrast)", result: "No focal intracranial pathology", reference: "Normal", status: "Normal" }
    ]
  },
  {
    id: "patient-111",
    phn: "PHN-991204",
    nic: "198124508319",
    name: "Kasun Bandara",
    gender: "Male",
    dob: "1981-06-30",
    bloodGroup: "B-",
    department: "Orthopedics OPD (Room 5)",
    statusType: "routine",
    consentedDoctors: ["Dr. Kasun Perera, MBBS"],
    chronicConditions: ["Post-Operative Fracture Rehabilitation"],
    allergies: ["Ibuprofen (Gastritis)"],
    criticalAlert: "",
    vitals: {
      bp: "126/80",
      hr: 74,
      rr: 16,
      spo2: 98,
      temp: "37.0°C",
      glucose: "98 mg/dL",
      recordedAt: "Today, 09:20 AM"
    },
    notesCount: 3,
    prescriptionsCount: 1,
    encounters: [
      {
        id: "enc-701",
        date: "2026-08-28",
        doctor: "Dr. Kasun Perera, MBBS",
        chiefComplaint: "Six-week post-op review right tibial plateau fixation",
        soap: {
          subjective: "Weight bearing 50% with crutches. Pain 2/10 at rest.",
          objective: "Surgical scar well healed. Active knee flexion 110 degrees.",
          assessment: "Satisfactory fracture union. Good progression.",
          plan: "Advance to full weight bearing as tolerated with physiotherapy."
        }
      }
    ],
    prescriptions: [
      { id: "rx-701", drug: "Paracetamol", dosage: "1000mg", frequency: "QDS as needed for pain", duration: "14 days", refills: 1, status: "Active" }
    ],
    labs: [
      { test: "Right Knee X-Ray", result: "Stable internal fixation, callus formation", reference: "Healing", status: "Normal" }
    ]
  },
  {
    id: "patient-222",
    phn: "PHN-228391",
    nic: "195971203841",
    name: "Malini Senanayake",
    gender: "Female",
    dob: "1959-03-10",
    bloodGroup: "O+",
    department: "Cardiology Specialist Clinic",
    statusType: "specialist",
    consentedDoctors: ["Dr. Alice Vance, MD"],
    chronicConditions: ["Non-Valvular Atrial Fibrillation", "Mild Osteoarthritis"],
    allergies: ["Codeine (Nausea/Vomiting)"],
    criticalAlert: "",
    vitals: {
      bp: "138/84",
      hr: 82,
      rr: 18,
      spo2: 96,
      temp: "36.7°C",
      glucose: "115 mg/dL",
      recordedAt: "Today, 08:50 AM"
    },
    notesCount: 4,
    prescriptionsCount: 3,
    encounters: [
      {
        id: "enc-801",
        date: "2026-09-05",
        doctor: "Dr. Alice Vance, MD",
        chiefComplaint: "Palpitations check and anticoagulation safety check",
        soap: {
          subjective: "Occasional flutter sensation, no syncope, no bleeding manifestations.",
          objective: "Irregularly irregular pulse 82 bpm. BP 138/84. No signs of heart failure.",
          assessment: "Permanent AFib, rate controlled. CHA2DS2-VASc score 3.",
          plan: "Continue Apixaban 5mg BID and Bisoprolol 2.5mg daily."
        }
      }
    ],
    prescriptions: [
      { id: "rx-801", drug: "Apixaban", dosage: "5mg", frequency: "Twice daily with water", duration: "90 days", refills: 3, status: "Active" },
      { id: "rx-802", drug: "Bisoprolol Fumarate", dosage: "2.5mg", frequency: "Once daily morning", duration: "90 days", refills: 3, status: "Active" }
    ],
    labs: [
      { test: "12-Lead ECG", result: "Atrial fibrillation, ventricular response 80 bpm", reference: "Sinus", status: "Expected AF" }
    ]
  },
  {
    id: "patient-333",
    phn: "PHN-117492",
    nic: "200109204192",
    name: "Chaminda Perera",
    gender: "Male",
    dob: "2001-08-19",
    bloodGroup: "A+",
    department: "Routine Outpatient OPD",
    statusType: "routine",
    consentedDoctors: ["Dr. Sarah Jenkins, MD"],
    chronicConditions: ["No chronic conditions"],
    allergies: ["None reported"],
    criticalAlert: "",
    vitals: {
      bp: "116/74",
      hr: 68,
      rr: 14,
      spo2: 100,
      temp: "36.6°C",
      glucose: "88 mg/dL",
      recordedAt: "Today, 10:15 AM"
    },
    notesCount: 1,
    prescriptionsCount: 0,
    encounters: [
      {
        id: "enc-901",
        date: "2026-09-12",
        doctor: "Dr. Sarah Jenkins, MD",
        chiefComplaint: "Pre-employment physical examination",
        soap: {
          subjective: "Fit and well. Denies smoking or alcohol use.",
          objective: "Height 175cm, weight 68kg, BMI 22.2. Visual acuity 6/6 bilateral.",
          assessment: "Normal physical examination. Medically fit for employment.",
          plan: "Issue standard fitness certificate."
        }
      }
    ],
    prescriptions: [],
    labs: [
      { test: "Complete Blood Count", result: "All parameters within normal limits", reference: "Normal", status: "Normal" }
    ]
  }
];

export const INITIAL_AUDIT_LOGS = [
  {
    id: "log-1",
    timestamp: "2026-09-22 09:15:22 (SLST)",
    doctor: "Dr. Sarah Jenkins, MD",
    patientPhn: "PHN-772910",
    decision: "ALLOW",
    riskScore: "0.134",
    txHash: "0x8f2a9c1485d41c9b208472506e78a221f456180a9c8b74102e3a51f89bc1014a",
    details: "Routine clinic consultation · In-shift · SLIIT Malabe Campus LAN",
    isBreakGlass: false
  },
  {
    id: "log-2",
    timestamp: "2026-09-22 09:30:10 (SLST)",
    doctor: "Dr. Alice Vance, MD",
    patientPhn: "PHN-552901",
    decision: "ALLOW",
    riskScore: "0.142",
    txHash: "0x3b890f5c12847a19283e5891720a4b719283e4a91029c8172635a9018274a102",
    details: "Nephrology chart review · In-shift · Seylan Tower 1 Branch LAN",
    isBreakGlass: false
  },
  {
    id: "log-3",
    timestamp: "2026-09-22 09:42:05 (SLST)",
    doctor: "Dr. Kasun Perera, MBBS",
    patientPhn: "PHN-884219",
    decision: "BREAK_GLASS",
    riskScore: "EMERGENCY_OVERRIDE",
    txHash: "0xee41a90c428174591a284091823751a09182736451928374a102938475619283",
    details: "RAP V2 emergency override · Unconscious polytrauma GCS 4 · Severe latex alert unlocked",
    isBreakGlass: true
  }
];
