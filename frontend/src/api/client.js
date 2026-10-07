const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export async function login(username, password) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Login failed");
  }

  // Store active doctor profile for UI context
  if (data.token) {
    localStorage.setItem("medguard_doctor_token", data.token);
  }
  if (data.doctor) {
    localStorage.setItem("medguard_doctor_profile", JSON.stringify(data.doctor));
  }
  return data;
}

export async function patientLogin(identifier, password) {
  const res = await fetch(`${BASE_URL}/auth/patient-login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Patient login failed");
  }

  if (data.token) {
    localStorage.setItem("medguard_patient_token", data.token);
  }
  return data;
}

export async function getMe() {
  const token = localStorage.getItem("medguard_doctor_token") || localStorage.getItem("medguard_patient_token");
  const res = await fetch(`${BASE_URL}/auth/me`, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) return null;
  return await res.json();
}

export function getStoredDoctor() {
  const profile = localStorage.getItem("medguard_doctor_profile");
  const token = localStorage.getItem("medguard_doctor_token");
  if (!profile) return null;
  try {
    return { doctor: JSON.parse(profile), token };
  } catch {
    return null;
  }
}

export async function logout() {
  try {
    await fetch(`${BASE_URL}/auth/logout`, {
      method: "POST",
      credentials: "include"
    });
  } catch (err) {
    // Network or server unreachable; clear client state regardless
  }
  localStorage.removeItem("medguard_doctor_token");
  localStorage.removeItem("medguard_doctor_profile");
  localStorage.removeItem("medguard_patient_token");
}

export async function getNetworkStatus() {
  try {
    const res = await fetch(`${BASE_URL}/auth/network-status`, {
      credentials: "include"
    });
    if (res.ok) return await res.json();
  } catch {}
  return {
    campusName: "Hospital Network",
    location: "Hospital Clinical Facility",
    isInternal: true,
    networkType: "Internal Medical LAN"
  };
}

export async function requestAccess(payload) {
  const token = localStorage.getItem("medguard_doctor_token");
  const res = await fetch(`${BASE_URL}/access-request`, {
    method: "POST",
    credentials: "include",
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
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challenge_token: challengeToken, otp })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "MFA verification failed");
  }
  return data;
}

export async function setupTotp() {
  const token = localStorage.getItem("medguard_doctor_token");
  const res = await fetch(`${BASE_URL}/auth/2fa/totp/setup`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to setup TOTP");
  return data;
}

export async function verifyTotp(totpCode) {
  const token = localStorage.getItem("medguard_doctor_token");
  const res = await fetch(`${BASE_URL}/auth/2fa/totp/verify`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ totpCode })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to verify TOTP code");
  return data;
}

export async function activateBreakGlass(doctorAddress, patientId, justification) {
  const token = localStorage.getItem("medguard_doctor_token");
  const res = await fetch(`${BASE_URL}/break-glass/activate`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      doctor_address: doctorAddress,
      patient_id: patientId,
      patientId: patientId,
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
    credentials: "include",
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
    const token = localStorage.getItem("medguard_doctor_token");
    const res = await fetch(`${BASE_URL}/audit-logs`, {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (res.ok) return await res.json();
  } catch {}
  return [];
}

export async function fetchPatientsQueue() {
  const token = localStorage.getItem("medguard_doctor_token");
  const res = await fetch(`${BASE_URL}/patients`, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch patient queue");
  return data.patients || [];
}

export async function getPatientChart(patientId) {
  const token = localStorage.getItem("medguard_doctor_token") || localStorage.getItem("medguard_patient_token");
  const res = await fetch(`${BASE_URL}/patients/${patientId}`, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  const data = await res.json();
  if (!res.ok && res.status !== 403) {
    throw new Error(data.error || "Failed to retrieve clinical chart");
  }
  return { status: res.status, data };
}

export async function getPatientConsent(patientId) {
  const token = localStorage.getItem("medguard_doctor_token") || localStorage.getItem("medguard_patient_token");
  const res = await fetch(`${BASE_URL}/patients/${patientId}/consent`, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to retrieve consent settings");
  return data;
}

export async function updatePatientConsent(patientId, consentData) {
  const token = localStorage.getItem("medguard_doctor_token") || localStorage.getItem("medguard_patient_token");
  const res = await fetch(`${BASE_URL}/patients/${patientId}/consent`, {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(consentData)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to update consent preferences");
  return data;
}

export async function registerPatient(patientData) {
  const token = localStorage.getItem("medguard_doctor_token");
  const res = await fetch(`${BASE_URL}/patients`, {
    method: "POST",
    credentials: "include",
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
    credentials: "include",
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
    credentials: "include",
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
    credentials: "include",
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
