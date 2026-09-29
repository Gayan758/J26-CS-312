const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export async function login(username, password) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Login failed");
  }

  // Store active doctor token in localStorage
  localStorage.setItem("medguard_doctor_token", data.token);
  localStorage.setItem("medguard_doctor_profile", JSON.stringify(data.doctor));
  return data;
}

export function getStoredDoctor() {
  const profile = localStorage.getItem("medguard_doctor_profile");
  const token = localStorage.getItem("medguard_doctor_token");
  if (!profile || !token) return null;
  try {
    return { doctor: JSON.parse(profile), token };
  } catch {
    return null;
  }
}

export function logout() {
  localStorage.removeItem("medguard_doctor_token");
  localStorage.removeItem("medguard_doctor_profile");
}

export async function getDemoAccounts() {
  try {
    const res = await fetch(`${BASE_URL}/auth/demo-accounts`);
    if (res.ok) return await res.json();
  } catch {}
  return [];
}

export async function getNetworkStatus(simulatedIp) {
  try {
    const url = simulatedIp 
      ? `${BASE_URL}/auth/network-status?simulated_ip=${encodeURIComponent(simulatedIp)}`
      : `${BASE_URL}/auth/network-status`;
    const res = await fetch(url);
    if (res.ok) return await res.json();
  } catch {}
  return {
    campusName: "SLIIT Malabe Campus Health Center",
    location: "Malabe, Sri Lanka",
    isInternal: true,
    networkType: "Secure Campus Medical LAN"
  };
}

export async function requestAccess(payload) {
  const token = localStorage.getItem("medguard_doctor_token");
  const res = await fetch(`${BASE_URL}/access-request`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok && res.status !== 403) {
    throw new Error(data.error || "Access request failed");
  }
  return { status: res.status, data };
}

export async function verifyMfa(challengeToken, otp) {
  const res = await fetch(`${BASE_URL}/mfa-verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challenge_token: challengeToken, otp })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "MFA verification failed");
  }
  return data;
}

export async function activateBreakGlass(doctorAddress, patientId, justification) {
  const res = await fetch(`${BASE_URL}/break-glass/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      doctor_address: doctorAddress,
      patient_id: patientId,
      justification
    })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Break-Glass activation failed");
  }
  return data;
}

export async function accessBreakGlassRecord(emergencyToken) {
  const res = await fetch(`${BASE_URL}/break-glass/access-record`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${emergencyToken}`
    },
    body: JSON.stringify({})
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Emergency record access failed");
  }
  return data;
}

export async function fetchAuditLogs() {
  try {
    const res = await fetch(`${BASE_URL}/audit-logs`);
    if (res.ok) return await res.json();
  } catch {}
  return [];
}

export async function fetchPatientsQueue() {
  const token = localStorage.getItem("medguard_doctor_token");
  const res = await fetch(`${BASE_URL}/patients`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch patient queue");
  return data.patients || [];
}

export async function getPatientChart(patientId, options = {}) {
  const token = localStorage.getItem("medguard_doctor_token");
  const query = new URLSearchParams();
  if (options.doctor_address) query.append("doctor_address", options.doctor_address);
  if (options.ip_address) query.append("ip_address", options.ip_address);
  if (options.device_fingerprint) query.append("device_fingerprint", options.device_fingerprint);

  const res = await fetch(`${BASE_URL}/patients/${patientId}?${query.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  const data = await res.json();
  if (!res.ok && res.status !== 403) {
    throw new Error(data.error || "Failed to retrieve clinical chart");
  }
  return { status: res.status, data };
}

export async function registerPatient(patientData) {
  const token = localStorage.getItem("medguard_doctor_token");
  const res = await fetch(`${BASE_URL}/patients`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(patientData)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Patient registration failed");
  return data;
}

export async function addSoapEncounter(patientId, encounterData) {
  const token = localStorage.getItem("medguard_doctor_token");
  const res = await fetch(`${BASE_URL}/patients/${patientId}/encounters`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(encounterData)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to save SOAP encounter note");
  return data;
}

export async function addPrescription(patientId, rxData) {
  const token = localStorage.getItem("medguard_doctor_token");
  const res = await fetch(`${BASE_URL}/patients/${patientId}/prescriptions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(rxData)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to save prescription");
  return data;
}

export async function recordVitals(patientId, vitalsData) {
  const token = localStorage.getItem("medguard_doctor_token");
  const res = await fetch(`${BASE_URL}/patients/${patientId}/vitals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(vitalsData)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to record clinical vitals");
  return data;
}

