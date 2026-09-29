/**
 * MedGuard Clinical EHR — Client-Side Mock RiskBAC Engine & Policy Evaluator
 * 
 * Implements the Context-Aware Risk-Based Access Control (RiskBAC) formula:
 * R = 0.7 * (sum(w_i * R_i)) + 0.3 * max(R_i)
 * 
 * Weights:
 * w_t = 0.15 (Login Time / Shift Window)
 * w_l = 0.35 (Geolocation / Network CIDR Range)
 * w_d = 0.25 (Device Enrolment / Workstation Enclave)
 * w_b = 0.25 (Access Behaviour / Record Sensitivity)
 */

export const RISK_WEIGHTS = {
  time: 0.15,      // w_t: Login Time / Shift Window (08:30–17:00 SLST)
  location: 0.35,  // w_l: Geolocation / Network Subnet (172.20.10.0/28 SLIIT)
  device: 0.25,    // w_d: Device Enrolment & Fingerprint
  behavior: 0.25   // w_b: Clinical Access Behaviour & Record Sensitivity
};

/**
 * Evaluates contextual risk signals and computes the final composite risk score R.
 */
export function evaluateRiskBAC({ doctor, patient, contextStatus, deviceFingerprint, isDeviceTrusted, doctorLocation }) {
  // 1. Evaluate Signal 1: Login Time (R_t)
  // Shift window: 08:30 - 17:00 (SLST: 510 to 1020 minutes)
  let isShiftValid = contextStatus?.inShift;
  if (isShiftValid === undefined) {
    const now = new Date();
    const hospitalTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Colombo' }));
    const minutes = hospitalTime.getHours() * 60 + hospitalTime.getMinutes();
    isShiftValid = minutes >= 510 && minutes <= 1020;
  }

  const r_time = isShiftValid ? 0.10 : 0.80;
  const timeLabel = isShiftValid
    ? "In-Shift (08:30–17:00 SLST)"
    : "Out-of-Shift / Anomalous Time Window (SLST)";

  // 2. Evaluate Signal 2: Real Geolocation & Subnet (R_l)
  let isLocTrusted = true;
  if (doctorLocation) {
    isLocTrusted = doctorLocation.isInsideCampus;
  } else if (contextStatus?.isLocationTrusted !== undefined) {
    isLocTrusted = contextStatus.isLocationTrusted;
  }

  const locationName = doctorLocation?.campusName || contextStatus?.detectedLocation || "SLIIT Malabe Campus Health Center";
  const locationIp = contextStatus?.detectedIp || "172.20.10.8";
  // Outside SLIIT Malabe Campus -> 0.95 (High Risk Location)
  const r_location = isLocTrusted ? 0.05 : 0.95;

  // 3. Evaluate Signal 3: Device Integrity & Enrolment (R_d)
  const deviceTrusted = isDeviceTrusted !== undefined
    ? isDeviceTrusted
    : (deviceFingerprint?.includes("enrolled") || deviceFingerprint?.includes("alice") || deviceFingerprint?.includes("secure") || false);
  const r_device = deviceTrusted ? 0.05 : 0.85;
  const deviceLabel = deviceTrusted
    ? "Enrolled Clinical Workstation Enclave"
    : "Unenrolled / New Workstation Terminal";

  // 4. Evaluate Signal 4: Access Behavioural Anomaly & Sensitivity (R_b)
  const sens = (patient.sensitivity || "medium").toLowerCase();
  let r_behavior = 0.10;
  if (sens === "medium" || sens === "confidential") r_behavior = 0.20;
  else if (sens === "high" || sens === "sensitive") r_behavior = 0.60;
  else if (sens === "restricted") r_behavior = 0.85;
  const behaviorLabel = `${(patient.sensitivity || "Standard").toUpperCase()} Record Sensitivity`;

  // 5. Compute Weighted Average: sum(w_i * R_i)
  const weightedSum =
    (RISK_WEIGHTS.time * r_time) +
    (RISK_WEIGHTS.location * r_location) +
    (RISK_WEIGHTS.device * r_device) +
    (RISK_WEIGHTS.behavior * r_behavior);

  // 6. Compute Maximum Signal: max(R_i)
  const maxSignal = Math.max(r_time, r_location, r_device, r_behavior);

  // 7. Core Formula: R = 0.7 * (weighted) + 0.3 * max
  const weightedComponent = 0.7 * weightedSum;
  const maxComponent = 0.3 * maxSignal;
  const compositeScore = weightedComponent + maxComponent;
  const roundedScore = parseFloat(compositeScore.toFixed(3));

  // 8. Consent Registry Verification (ConsentRegistry.sol check)
  const hasDoctorConsent = patient.consentStatus !== false && (
    (patient.consentedDoctors || []).some(
      (docName) => docName.toLowerCase().includes(doctor.name.toLowerCase()) ||
                   doctor.name.toLowerCase().includes(docName.toLowerCase())
    ) ||
    patient.consentedDoctorName?.toLowerCase().includes(doctor.name.toLowerCase())
  );
  const consentValid = hasDoctorConsent;

  // 9. Open Policy Agent (OPA) Access Decision Logic
  let decision = "BLOCK";
  let riskLevel = "LOW";
  let decisionReason = "";

  if (roundedScore < 0.30) {
    riskLevel = "LOW";
  } else if (roundedScore < 0.65) {
    riskLevel = "MEDIUM";
  } else {
    riskLevel = "HIGH";
  }

  if (!consentValid) {
    decision = "BLOCK";
    decisionReason = patient.statusType === "emergency" || patient.consentStatus === false
      ? "Patient Consent Not on Record (Emergency Trauma Admission). Use ER Break-Glass to override."
      : `Consent Boundary: Attending doctor (${doctor.name}) is not authorized in patient's consent registry.`;
  } else if (riskLevel === "LOW") {
    decision = "ALLOW";
    decisionReason = "Permissible Risk Score (R < 0.30) and Verified Patient Consent.";
  } else if (riskLevel === "MEDIUM") {
    decision = "MFA_REQUIRED";
    decisionReason = "Elevated Risk Score (0.30 <= R < 0.65). Step-up Multi-Factor Authentication (MFA) required.";
  } else {
    decision = "BLOCK";
    decisionReason = "Risk Score Exceeded Permissible Operational Threshold (R >= 0.65). Access denied by security policy.";
  }

  // Generate simulated Ethereum transaction hash
  const txHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

  return {
    patientId: patient.id,
    patientPhn: patient.phn,
    patientName: patient.name,
    doctorName: doctor.name,
    timestamp: (contextStatus?.slstTime || new Date().toLocaleTimeString("en-US", { hour12: true }) + " (SLST)"),
    signals: [
      {
        id: "time",
        name: "Shift Window (SLST)",
        weight: RISK_WEIGHTS.time,
        value: r_time,
        label: timeLabel,
        isSafe: isShiftValid
      },
      {
        id: "location",
        name: "Geofenced IP Network",
        weight: RISK_WEIGHTS.location,
        value: r_location,
        label: `${locationName} (${locationIp})`,
        isSafe: isLocTrusted
      },
      {
        id: "device",
        name: "Workstation Enclave",
        weight: RISK_WEIGHTS.device,
        value: r_device,
        label: deviceLabel,
        isSafe: deviceTrusted
      },
      {
        id: "behavior",
        name: "Access Velocity & Baseline",
        weight: RISK_WEIGHTS.behavior,
        value: r_behavior,
        label: behaviorLabel,
        isSafe: r_behavior <= 0.25
      }
    ],
    calculation: {
      formula: "R = 0.7 * (Σ w_i · R_i) + 0.3 * max(R_i)",
      weightedSum: parseFloat(weightedSum.toFixed(3)),
      weightedComponent: parseFloat(weightedComponent.toFixed(3)),
      maxSignal: parseFloat(maxSignal.toFixed(3)),
      maxComponent: parseFloat(maxComponent.toFixed(3)),
      compositeScore: roundedScore
    },
    consent: {
      valid: consentValid,
      consentedDoctors: patient.consentedDoctors || []
    },
    decision,
    riskLevel,
    decisionReason,
    txHash
  };
}
