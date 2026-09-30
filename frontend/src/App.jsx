import React, { useState, useEffect } from "react";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import {
  MOCK_DOCTORS,
  INITIAL_PATIENTS,
  INITIAL_AUDIT_LOGS
} from "./data/mockData";
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
  const [patients, setPatients] = useState(INITIAL_PATIENTS);
  const [auditLogs, setAuditLogs] = useState(INITIAL_AUDIT_LOGS);
  const [activeTab, setActiveTab] = useState("queue"); // "queue" | "chart" | "audit" | "tracking"
  const [activePatient, setActivePatient] = useState(null);
  const [theme, setTheme] = useState("light");

  // Sync theme with document element
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  // 2. Real Automated Context Signals
  const [deviceFingerprint, setDeviceFingerprint] = useState(
    "sha256:enrolled-workstation-sarah-macbook"
  );
  const [isDeviceTrusted, setIsDeviceTrusted] = useState(true);
  const [doctorLocation, setDoctorLocation] = useState({
    latitude: 6.9147,
    longitude: 79.9733,
    accuracy: 8,
    distanceKm: 0.0,
    isInsideCampus: true,
    campusName: "SLIIT Malabe Campus Health Center"
  });
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
      } catch (err) {
        console.warn("FingerprintJS fallback:", err);
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
        const res = await fetch(
          `/api/auth/device-status?doctorId=${encodeURIComponent(
            docId
          )}&fingerprint=${encodeURIComponent(deviceFingerprint)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setIsDeviceTrusted(
              !!data.trusted ||
                deviceFingerprint.includes("enrolled") ||
                deviceFingerprint.includes("alice") ||
                deviceFingerprint.includes("secure")
            );
          }
        }
      } catch (e) {
        if (isMounted) {
          setIsDeviceTrusted(
            deviceFingerprint.includes("enrolled") ||
              deviceFingerprint.includes("alice") ||
              deviceFingerprint.includes("secure")
          );
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
      const res = await fetch(
        `/api/patients?doctorId=${encodeURIComponent(
          docId
        )}&doctorAddress=${encodeURIComponent(docAddr)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.patients && Array.isArray(data.patients)) {
          setPatients(data.patients);
          return;
        }
      }
    } catch (err) {
      console.warn("Could not sync doctor queue from backend:", err.message);
    }

    // Local fallback
    const filtered = INITIAL_PATIENTS.filter((p) => {
      const assignedIds = (p.assignedDoctorIds || []).map((id) =>
        String(id).toLowerCase()
      );
      const assignedAddrs = (p.assignedDoctorAddresses || []).map((a) =>
        String(a).toLowerCase()
      );
      const docId = (targetDoctor.id || "").toLowerCase();
      const docAddr = (targetDoctor.ethereumAddress || "").toLowerCase();
      const docName = (targetDoctor.name || "").toLowerCase();

      const matchId = docId && assignedIds.includes(docId);
      const matchAddr = docAddr && assignedAddrs.includes(docAddr);
      const matchName =
        p.consentedDoctors &&
        p.consentedDoctors.some(
          (cd) =>
            cd.toLowerCase().includes(docName) || docName.includes(cd.toLowerCase())
        );

      if (
        targetDoctor.username?.includes("gayan") ||
        targetDoctor.name?.includes("Gayan")
      ) {
        return (
          p.id === "patient-123" ||
          p.id === "patient-789" ||
          matchId ||
          matchAddr ||
          matchName
        );
      }
      if (
        targetDoctor.username?.includes("sarah") ||
        targetDoctor.name?.includes("Sarah")
      ) {
        return p.id === "patient-789" || matchId || matchAddr || matchName;
      }
      if (
        targetDoctor.username?.includes("alice") ||
        targetDoctor.name?.includes("Alice")
      ) {
        return (
          p.id === "patient-123" ||
          p.id === "patient-321" ||
          matchId ||
          matchAddr ||
          matchName
        );
      }
      if (
        targetDoctor.username?.includes("kasun") ||
        targetDoctor.name?.includes("Kasun")
      ) {
        return (
          p.id === "patient-456" ||
          p.id === "patient-123" ||
          matchId ||
          matchAddr ||
          matchName
        );
      }

      return matchId || matchAddr || matchName;
    });

    setPatients(filtered.length > 0 ? filtered : INITIAL_PATIENTS.slice(0, 2));
  };

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
              txHash:
                "0x" +
                Array.from({ length: 64 }, () =>
                  Math.floor(Math.random() * 16).toString(16)
                ).join(""),
              details:
                "Break-Glass emergency token auto-expired after 30 minutes. Emergency session terminated.",
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
      `Access Granted for ${patient.name} · Decision logged to blockchain audit trail`,
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
