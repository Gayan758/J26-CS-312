import React, { useState, useEffect } from "react";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import AppShell from "./components/layout/AppShell";
import ClinicQueue from "./components/ClinicQueue";
import PatientChart from "./components/PatientChart";
import ComplianceAuditCenter from "./components/ComplianceAuditCenter";
import RiskCheckModal from "./components/RiskCheckModal";
import BreakGlassModal from "./components/BreakGlassModal";
import PatientAdmissionModal from "./components/PatientAdmissionModal";
import LoginScreen from "./components/LoginScreen";
import StaffSafetyMap from "./components/StaffSafetyMap";
import PatientPortal from "./components/PatientPortal";
import UserManagement from "./components/UserManagement";
import { CheckCircle2, AlertOctagon, Info, X, ShieldAlert } from "lucide-react";

export default function App() {
  // 1. Session State
  const [userRole, setUserRole] = useState("doctor"); // "doctor" | "patient"
  const [patientUser, setPatientUser] = useState(null);
  const [doctor, setDoctor] = useState(null); // Always start from LoginScreen
  const [patients, setPatients] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [activeTab, setActiveTab] = useState("queue"); // "queue" | "chart" | "audit" | "tracking"
  const [activePatient, setActivePatient] = useState(null);
  const [theme, setTheme] = useState("light");

  // Sync theme with document element
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Sync tab title with document title
  useEffect(() => {
    const titles = {
      queue: "Clinic Queue · MedGuard EHR",
      chart: "Patient Chart · MedGuard EHR",
      audit: "Compliance & Audit · MedGuard EHR",
      tracking: "Staff Safety · MedGuard EHR",
      users: "User Management · MedGuard EHR"
    };
    document.title = titles[activeTab] || "MedGuard EHR";
  }, [activeTab]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  // 2. Real Automated Context Signals
  const [deviceFingerprint, setDeviceFingerprint] = useState("");
  const [isDeviceTrusted, setIsDeviceTrusted] = useState(false);
  const [doctorLocation, setDoctorLocation] = useState(null);
  const [contextStatus, setContextStatus] = useState({
    serverTime: new Date().toISOString(),
    slstTime:
      new Date().toLocaleTimeString("en-US", {
        timeZone: "Asia/Colombo",
        hour: "2-digit",
        minute: "2-digit"
      }) + " (SLST)",
    inShift: true,
    shiftStatus: "IN-SHIFT (08:30–17:00)",
    detectedIp: "172.20.10.8",
    detectedLocation: "SLIIT Malabe Campus Health Center",
    facility: "SLIIT Malabe Campus Health Center",
    isLocationTrusted: true
  });

  // 3. Modals & Dialogs State
  const [evaluatingPatient, setEvaluatingPatient] = useState(null);
  const [isBreakGlassOpen, setIsBreakGlassOpen] = useState(false);
  const [breakGlassTargetPatient, setBreakGlassTargetPatient] = useState(null);
  const [breakGlassSession, setBreakGlassSession] = useState(null);
  const [isAdmissionsOpen, setIsAdmissionsOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg, type = "info") => {
    setToastMessage({ text: msg, type });
    setTimeout(() => setToastMessage(null), 5000);
  };

  // FingerprintJS initialization
  useEffect(() => {
    let isMounted = true;
    async function initFingerprint() {
      try {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        if (isMounted && result?.visitorId) {
          setDeviceFingerprint(result.visitorId);
        }
      } catch (_) {
        // Enclave device fingerprint fallback
      }
    }
    initFingerprint();
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch real server clock & context
  useEffect(() => {
    let isMounted = true;
    async function fetchServerContext() {
      try {
        const res = await fetch("/api/auth/context-status");
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setContextStatus(data);
        }
      } catch (err) {
        const now = new Date();
        const slstStr = now.toLocaleTimeString("en-US", {
          timeZone: "Asia/Colombo",
          hour: "2-digit",
          minute: "2-digit"
        });
        const hospitalTime = new Date(
          now.toLocaleString("en-US", { timeZone: "Asia/Colombo" })
        );
        const minutes = hospitalTime.getHours() * 60 + hospitalTime.getMinutes();
        const inShift = minutes >= 510 && minutes <= 1020;
        if (isMounted) {
          setContextStatus({
            serverTime: now.toISOString(),
            slstTime: `${slstStr} (SLST)`,
            inShift,
            shiftStatus: inShift
              ? "IN-SHIFT (08:30–17:00)"
              : "OUT-OF-SHIFT (08:30–17:00)",
            detectedIp: "172.20.10.8",
            detectedLocation: "SLIIT Malabe Campus Perimeter",
            facility: "SLIIT Malabe Campus Health Center",
            isLocationTrusted: true
          });
        }
      }
    }

    fetchServerContext();
    const timer = setInterval(fetchServerContext, 15000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  // Check device trust status
  useEffect(() => {
    if (!doctor || !deviceFingerprint) return;
    let isMounted = true;
    async function checkTrust() {
      try {
        const docId = doctor.ethereumAddress || doctor.id;
        const token = localStorage.getItem("medguard_doctor_token");
        const res = await fetch(
          `/api/auth/device-status?doctorId=${encodeURIComponent(
            docId
          )}&fingerprint=${encodeURIComponent(deviceFingerprint)}`,
          {
            credentials: "include",
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          }
        );
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setIsDeviceTrusted(!!data.trusted);
          }
        }
      } catch (e) {
        if (isMounted) {
          setIsDeviceTrusted(false);
        }
      }
    }
    checkTrust();
    return () => {
      isMounted = false;
    };
  }, [doctor, deviceFingerprint]);

  // Synchronize doctor-scoped clinical patient queue
  const fetchDoctorPatients = async (targetDoctor) => {
    if (!targetDoctor) return;
    try {
      const docId = targetDoctor.id || "";
      const docAddr = targetDoctor.ethereumAddress || "";
      const token = localStorage.getItem("medguard_doctor_token");
      const res = await fetch(
        `/api/patients?doctorId=${encodeURIComponent(
          docId
        )}&doctorAddress=${encodeURIComponent(docAddr)}`,
        {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.patients && Array.isArray(data.patients)) {
          setPatients(data.patients);
          return;
        }
      }
      setPatients([]);
    } catch (err) {
      setPatients([]);
    }
  };

  // Synchronize audit ledger records when audit tab is selected
  useEffect(() => {
    if (activeTab === "audit") {
      const token = localStorage.getItem("medguard_doctor_token");
      fetch("/api/audit-logs", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          if (Array.isArray(data)) {
            setAuditLogs(data);
          }
        })
        .catch(() => {});
    }
  }, [activeTab]);

  useEffect(() => {
    if (doctor) {
      fetchDoctorPatients(doctor);
    }
  }, [doctor]);

  // Break-Glass Active Countdown Timer
  useEffect(() => {
    if (!breakGlassSession) return;

    const interval = setInterval(() => {
      setBreakGlassSession((prev) => {
        if (!prev) return null;
        if (prev.timeLeft <= 1) {
          clearInterval(interval);
          showToast("Break-Glass token expired — access revoked", "error");

          setAuditLogs((logs) => [
            {
              id: `log-${Date.now()}`,
              timestamp:
                new Date().toLocaleTimeString("en-US", { hour12: true }) +
                " (SLST)",
              doctor: prev.doctorName,
              patientPhn: prev.patientPhn,
              decision: "EXPIRED",
              riskScore: "REVOKED",
              txHash: null,
              details:
                "Break-Glass emergency token auto-expired. Emergency session terminated.",
              isBreakGlass: true
            },
            ...logs
          ]);

          setActivePatient((cur) =>
            cur && cur.id === prev.patientId ? null : cur
          );
          setActiveTab("queue");
          return null;
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [breakGlassSession]);

  const handleOpenChart = (patient) => {
    setEvaluatingPatient(patient);
  };

  const handleGrantAccess = (patient, evaluationResult, decryptedRecord) => {
    setEvaluatingPatient(null);
    const targetPatient = decryptedRecord
      ? { ...patient, ...decryptedRecord }
      : patient;
    setActivePatient(targetPatient);
    setActiveTab("chart");
    showToast(
      `Access Granted for ${patient.name} · Recorded to compliance audit ledger`,
      "success"
    );
  };

  const handleActivateBreakGlass = (targetPatient, sessionData) => {
    setIsBreakGlassOpen(false);
    setBreakGlassTargetPatient(null);
    setBreakGlassSession(sessionData);

    setAuditLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        timestamp: sessionData.activatedAt,
        doctor: sessionData.doctorName,
        patientPhn: sessionData.patientPhn,
        decision: "BREAK_GLASS",
        riskScore: "OVERRIDE",
        txHash: sessionData.txHash,
        details: `Break-Glass activated by ${sessionData.doctorName} for ${sessionData.patientPhn} — logged immutably. Justification: "${sessionData.justification}"`,
        isBreakGlass: true
      },
      ...prev
    ]);

    setActivePatient(targetPatient);
    setActiveTab("chart");
    showToast(
      `Break-Glass activated for ${targetPatient.name} — token valid for 30 minutes`,
      "warning"
    );
  };

  const handlePatientAdmitted = (newPatient) => {
    setPatients((prev) => [
      newPatient,
      ...prev.filter((p) => p.id !== newPatient.id)
    ]);
    setActivePatient(newPatient);
    setActiveTab("chart");
    showToast(
      `Patient ${newPatient.name} admitted successfully and assigned to your care queue`,
      "success"
    );
  };

  // If in Patient mode, render PatientPortal
  if (userRole === "patient" && patientUser) {
    return (
      <PatientPortal
        patient={patientUser}
        onLogout={() => {
          setPatientUser(null);
          setUserRole("doctor");
        }}
      />
    );
  }

  // If logged out, show Login Screen
  if (!doctor) {
    return (
      <LoginScreen
        onLoginSuccess={(doc, loc) => {
          setDoctor(doc);
          const isDocAdmin = doc.role?.toLowerCase() === "admin";
          setUserRole(isDocAdmin ? "admin" : "doctor");
          setActiveTab(isDocAdmin ? "users" : "queue");
          if (loc) {
            setDoctorLocation(loc);
            setContextStatus((prev) => ({
              ...prev,
              detectedLocation: loc.campusName || prev.detectedLocation,
              isLocationTrusted: loc.isInsideCampus
            }));
          }
        }}
        onPatientLogin={(pat) => {
          setPatientUser(pat);
          setUserRole("patient");
        }}
      />
    );
  }

  return (
    <AppShell
      doctor={doctor}
      onLogout={() => {
        setDoctor(null);
        setActivePatient(null);
        setBreakGlassSession(null);
        setPatientUser(null);
        setUserRole("doctor");
      }}
      contextStatus={contextStatus}
      deviceFingerprint={deviceFingerprint}
      isDeviceTrusted={isDeviceTrusted}
      doctorLocation={doctorLocation}
      breakGlassSession={breakGlassSession}
      onOpenBreakGlass={() => {
        setBreakGlassTargetPatient(null);
        setIsBreakGlassOpen(true);
      }}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      queueCount={patients.length}
      theme={theme}
      onToggleTheme={toggleTheme}
    >
      {/* Tab 0 (Admin View): User Management & Access Governance */}
      {activeTab === "users" && (
        <UserManagement onShowToast={showToast} />
      )}

      {/* Tab 1: Clinic Queue & Triage */}
      {activeTab === "queue" && (
        userRole === "admin" ? (
          <div className="bg-surface rounded-lg border border-border p-8 text-center max-w-xl mx-auto my-12 space-y-3">
            <div className="w-12 h-12 rounded-full bg-critical-bg text-critical flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h2 className="text-base font-semibold text-text-primary">
              Clinical Queue Restricted from Administrator Role
            </h2>
            <p className="text-xs text-text-muted leading-relaxed">
              Under the HIPAA Minimum Necessary Rule (45 CFR § 164.502) and clinical data governance standards, administrative and IT compliance personnel are strictly barred from accessing identifiable patient queues, triage states, and triage notes.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setActiveTab("users")}
                className="px-4 py-2 rounded bg-primary text-white text-xs font-medium hover:bg-primary-hover transition"
              >
                Return to User Management
              </button>
            </div>
          </div>
        ) : (
          <ClinicQueue
            patients={patients}
            onOpenChart={handleOpenChart}
            onOpenBreakGlass={(patient) => {
              setBreakGlassTargetPatient(patient);
              setIsBreakGlassOpen(true);
            }}
            onOpenAdmissions={() => setIsAdmissionsOpen(true)}
            onRefreshQueue={() => showToast("Clinic Worklist synchronized", "info")}
          />
        )
      )}

      {/* Tab 2: Full Patient Medical Chart (EMR) */}
      {activeTab === "chart" && (
        userRole === "admin" ? (
          <div className="bg-surface rounded-lg border border-border p-8 text-center max-w-xl mx-auto my-12 space-y-3">
            <div className="w-12 h-12 rounded-full bg-critical-bg text-critical flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h2 className="text-base font-semibold text-text-primary">
              Protected Health Information (PHI) Strictly Restricted
            </h2>
            <p className="text-xs text-text-muted leading-relaxed">
              Only treating medical doctors with explicit patient sovereign consent or an emergency Break-Glass override token are authorized to decrypt patient medical histories, medications, and lab results.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setActiveTab("users")}
                className="px-4 py-2 rounded bg-primary text-white text-xs font-medium hover:bg-primary-hover transition"
              >
                Return to User Management
              </button>
            </div>
          </div>
        ) : (
          <PatientChart
            patient={activePatient}
            doctor={doctor}
            breakGlassSession={breakGlassSession}
            onBackToQueue={() => setActiveTab("queue")}
            onUpdatePatient={(updated) => {
              setPatients((list) =>
                list.map((p) => (p.id === updated.id ? updated : p))
              );
              setActivePatient(updated);
              showToast("Patient medical record updated & encrypted", "success");
            }}
          />
        )
      )}

      {/* Tab 3: Hospital Compliance & Blockchain Audit Ledger */}
      {activeTab === "audit" && (
        <ComplianceAuditCenter
          auditLogs={auditLogs}
          onClearLogs={() => setAuditLogs([])}
        />
      )}

      {/* Tab 4: Staff Safety & Real-Time Location Tracking */}
      {activeTab === "tracking" && (
        <StaffSafetyMap doctor={doctor} onShowToast={showToast} />
      )}

      {/* Modals & Sheets */}
      {evaluatingPatient && (
        <RiskCheckModal
          doctor={doctor}
          patient={evaluatingPatient}
          contextStatus={contextStatus}
          deviceFingerprint={deviceFingerprint}
          isDeviceTrusted={isDeviceTrusted}
          doctorLocation={doctorLocation}
          onDeviceEnrolled={() => setIsDeviceTrusted(true)}
          onClose={() => setEvaluatingPatient(null)}
          onGrantAccess={handleGrantAccess}
          onOpenBreakGlass={(patient) => {
            setEvaluatingPatient(null);
            setBreakGlassTargetPatient(patient);
            setIsBreakGlassOpen(true);
          }}
          onLogDecision={(newLog) => setAuditLogs((prev) => [newLog, ...prev])}
        />
      )}

      {isBreakGlassOpen && (
        <BreakGlassModal
          doctor={doctor}
          initialPatient={breakGlassTargetPatient}
          allPatients={patients}
          onClose={() => {
            setIsBreakGlassOpen(false);
            setBreakGlassTargetPatient(null);
          }}
          onActivateBreakGlass={handleActivateBreakGlass}
        />
      )}

      {isAdmissionsOpen && (
        <PatientAdmissionModal
          doctor={doctor}
          onClose={() => setIsAdmissionsOpen(false)}
          onAdmitted={handlePatientAdmitted}
        />
      )}

      {/* Global Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div
            className={`px-3.5 py-2.5 rounded-lg border shadow-xl flex items-center gap-2.5 text-xs font-medium bg-surface ${
              toastMessage.type === "success"
                ? "text-success border-success-border bg-success-bg"
                : toastMessage.type === "warning"
                ? "text-warning border-warning-border bg-warning-bg"
                : toastMessage.type === "error"
                ? "text-critical border-critical-border bg-critical-bg"
                : "text-text-primary border-border bg-surface"
            }`}
          >
            {toastMessage.type === "success" && (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-success" />
            )}
            {toastMessage.type === "warning" && (
              <AlertOctagon className="w-4 h-4 shrink-0 text-warning" />
            )}
            {toastMessage.type === "error" && (
              <AlertOctagon className="w-4 h-4 shrink-0 text-critical" />
            )}
            {toastMessage.type === "info" && (
              <Info className="w-4 h-4 shrink-0 text-primary" />
            )}
            <span>{toastMessage.text}</span>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="ml-2 text-text-subtle hover:text-text-primary"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
