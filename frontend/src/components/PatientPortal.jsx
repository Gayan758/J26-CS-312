import React, { useState, useEffect } from "react";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  UserX,
  Stethoscope,
  Lock,
  Eye,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  LogOut,
  Hospital,
  Activity,
  FileText,
  Pill,
  TestTube,
  Heart,
  Sliders,
  Database
} from "lucide-react";
import Button from "./ui/Button";
import StatusBadge from "./ui/StatusBadge";

export default function PatientPortal({ patient: initialPatient, onLogout }) {
  const [patient, setPatient] = useState(initialPatient);
  const [doctors, setDoctors] = useState([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);
  const [activeTab, setActiveTab] = useState("consent"); // "consent" | "record"
  const [saveSuccessMsg, setSaveSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [lastTxHash, setLastTxHash] = useState(null);

  // Editable Consent State
  const [assignedDoctorIds, setAssignedDoctorIds] = useState(
    patient?.assignedDoctorIds || []
  );
  const [granularPermissions, setGranularPermissions] = useState(
    patient?.granularPermissions || {
      vitals: { view: true, modify: true },
      soap: { view: true, modify: true },
      prescriptions: { view: true, modify: true },
      labs: { view: true, modify: false },
      sensitiveRecords: { view: false, modify: false }
    }
  );

  // Fetch hospital doctors and latest consent data on load
  useEffect(() => {
    let isMounted = true;

    async function loadPortalData() {
      setLoadingDoctors(true);
      try {
        const docRes = await fetch("/api/auth/doctors");
        if (docRes.ok) {
          const docData = await docRes.json();
          if (isMounted && docData.doctors) {
            setDoctors(docData.doctors);
          }
        }

        const consentRes = await fetch(`/api/patients/${patient.id}/consent`);
        if (consentRes.ok) {
          const consentData = await consentRes.json();
          if (isMounted) {
            if (consentData.assignedDoctorIds) {
              setAssignedDoctorIds(consentData.assignedDoctorIds);
            }
            if (consentData.granularPermissions) {
              setGranularPermissions(consentData.granularPermissions);
            }
          }
        }
      } catch (err) {
        console.warn("Failed to load portal data:", err.message);
      } finally {
        if (isMounted) setLoadingDoctors(false);
      }
    }

    loadPortalData();
    return () => {
      isMounted = false;
    };
  }, [patient.id]);

  // Toggle Doctor Authorization
  const handleToggleDoctor = (doc) => {
    setSaveSuccessMsg("");
    setErrorMsg("");
    setAssignedDoctorIds((prev) => {
      const exists = prev.includes(doc.id);
      if (exists) {
        return prev.filter((id) => id !== doc.id);
      } else {
        return [...prev, doc.id];
      }
    });
  };

  // Toggle Granular View/Modify Permission
  const handleToggleGranular = (category, mode) => {
    setSaveSuccessMsg("");
    setErrorMsg("");
    setGranularPermissions((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [mode]: !prev[category]?.[mode]
      }
    }));
  };

  // Commit Consent Preferences to Backend + Smart Contract
  const handleSaveConsent = async () => {
    setSavingConsent(true);
    setSaveSuccessMsg("");
    setErrorMsg("");

    try {
      const selectedDocs = doctors.filter((d) => assignedDoctorIds.includes(d.id));
      const assignedAddresses = selectedDocs
        .map((d) => d.ethereumAddress)
        .filter(Boolean);
      const consentedNames = selectedDocs.map((d) => d.name);

      const res = await fetch(`/api/patients/${patient.id}/consent`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedDoctorIds,
          assignedDoctorAddresses: assignedAddresses,
          consentedDoctors: consentedNames,
          granularPermissions,
          consentStatus: assignedDoctorIds.length > 0
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update consent preferences.");
      }

      setPatient(data.patient);
      setLastTxHash(data.txHash);
      setSaveSuccessMsg(
        "Dynamic Consent Preferences committed to Ethereum blockchain & re-encrypted on IPFS!"
      );
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSavingConsent(false);
    }
  };

  const DATA_CATEGORIES = [
    {
      key: "vitals",
      title: "Vital Signs & Biometrics",
      desc: "Blood pressure, heart rate, SpO2 pulse oximetry, respiratory rate, and temperature recordings.",
      icon: Activity
    },
    {
      key: "soap",
      title: "Clinical SOAP Encounters",
      desc: "Doctor consultation evaluations, subjective symptoms, objective findings, and care plans.",
      icon: FileText
    },
    {
      key: "prescriptions",
      title: "Electronic Prescriptions & Pharmacy",
      desc: "Prescribed pharmaceutical regimens, active drug dosages, dispensing frequency, and refills.",
      icon: Pill
    },
    {
      key: "labs",
      title: "Diagnostic Labs & Pathology",
      desc: "Serum biochemistry, hematology panels, urinalysis, HbA1c, and radiology imaging results.",
      icon: TestTube
    },
    {
      key: "sensitiveRecords",
      title: "Sensitive & Confidential History",
      desc: "Psychiatric notes, infectious disease screenings, genetic assessments, and addiction history.",
      icon: Lock
    }
  ];

  return (
    <div className="min-h-screen bg-bg text-text-primary flex flex-col font-sans">
      {/* Top Header */}
      <header className="h-14 bg-surface border-b border-border px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-primary-subtle border border-primary/30 flex items-center justify-center text-primary">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-text-primary tracking-tight">
                MEDGUARD PATIENT PORTAL
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded border border-border bg-surface-muted text-text-subtle">
                Consent Hub
              </span>
            </div>
            <div className="text-[11px] text-text-muted">
              SLIIT Malabe Hospital &amp; Seylan Healthcare Network
            </div>
          </div>
        </div>

        {/* Patient Profile Capsule & Logout */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs font-semibold text-text-primary">{patient.name}</span>
            <span className="text-[10px] font-mono text-text-subtle">
              PHN: {patient.phn} · Blood: {patient.bloodGroup || "O+"}
            </span>
          </div>

          <Button variant="secondary" size="sm" icon={LogOut} onClick={onLogout}>
            Sign Out
          </Button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-4">
        {/* Navigation Tabs Bar */}
        <div className="flex items-center justify-between border-b border-border pb-2">
          <div className="flex items-center gap-6 -mb-px">
            <button
              type="button"
              onClick={() => setActiveTab("consent")}
              className={`pb-2 text-xs font-medium border-b-2 transition flex items-center gap-1.5 ${
                activeTab === "consent"
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-text-muted hover:text-text-primary hover:border-border"
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Doctor Selection &amp; Granular Consent Matrix</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("record")}
              className={`pb-2 text-xs font-medium border-b-2 transition flex items-center gap-1.5 ${
                activeTab === "record"
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-text-muted hover:text-text-primary hover:border-border"
              }`}
            >
              <Heart className="w-3.5 h-3.5" />
              <span>Personal Health Record</span>
            </button>
          </div>

          <div>
            <StatusBadge
              variant={assignedDoctorIds.length > 0 ? "success" : "neutral"}
              dot
              label={
                assignedDoctorIds.length > 0
                  ? `${assignedDoctorIds.length} Doctor(s) Authorized`
                  : "Access Restricted"
              }
              size="xs"
            />
          </div>
        </div>

        {/* Success / Error Banners */}
        {saveSuccessMsg && (
          <div className="p-3 rounded border border-success-border bg-success-bg text-success text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{saveSuccessMsg}</span>
            </div>
            {lastTxHash && (
              <span className="font-mono text-[10px] text-text-subtle truncate max-w-[200px]">
                Tx: {lastTxHash}
              </span>
            )}
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded border border-critical-border bg-critical-bg text-critical text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* TAB 1: DOCTOR SELECTION & GRANULAR MATRIX */}
        {activeTab === "consent" && (
          <div className="space-y-4">
            {/* Top Instruction Banner */}
            <div className="p-4 rounded-lg border border-border bg-surface flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 className="text-xs font-semibold text-text-primary">
                  Patient Self-Sovereign Consent Management
                </h2>
                <p className="text-xs text-text-muted mt-0.5 leading-relaxed max-w-2xl">
                  You maintain cryptographic autonomy over your clinical record. Select which clinicians are allowed to view your file and specify exact read/write permissions per clinical module.
                </p>
              </div>

              <Button
                variant="primary"
                size="md"
                loading={savingConsent}
                onClick={handleSaveConsent}
                icon={Database}
              >
                Save &amp; Commit On-Chain
              </Button>
            </div>

            {/* Section 1: Choose Authorized Doctors */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                  <Stethoscope className="w-3.5 h-3.5 text-primary" />
                  <span>1. Authorized Care Team</span>
                </span>
                <span className="text-xs font-mono text-text-subtle">
                  {assignedDoctorIds.length} of {doctors.length} Authorized
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {doctors.map((doc) => {
                  const isAuthorized = assignedDoctorIds.includes(doc.id);
                  return (
                    <div
                      key={doc.id}
                      className={`p-3.5 rounded-lg border transition flex flex-col justify-between gap-2.5 ${
                        isAuthorized
                          ? "bg-surface border-primary shadow-xs ring-1 ring-primary/20"
                          : "bg-surface-muted border-border opacity-70"
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold text-text-primary text-xs">
                              {doc.name}
                            </div>
                            <div className="text-[11px] text-primary mt-0.5">
                              {doc.role || doc.specialty}
                            </div>
                          </div>
                          <StatusBadge
                            variant={isAuthorized ? "success" : "neutral"}
                            dot
                            label={isAuthorized ? "Authorized" : "Revoked"}
                            size="xs"
                          />
                        </div>

                        <div className="mt-2 text-[10px] font-mono text-text-subtle">
                          <div>Campus: {doc.baseCampus || doc.facility || "SLIIT Malabe"}</div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-border flex justify-end">
                        <Button
                          variant={isAuthorized ? "secondary" : "primary"}
                          size="sm"
                          icon={isAuthorized ? UserX : UserCheck}
                          onClick={() => handleToggleDoctor(doc)}
                        >
                          {isAuthorized ? "Revoke Access" : "Authorize"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Granular Access Matrix */}
            <div className="space-y-2.5">
              <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-primary" />
                <span>2. Granular Data Access Matrix</span>
              </span>

              <div className="border border-border rounded-lg bg-surface overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-surface-muted border-b border-border text-text-subtle font-medium text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-4">Clinical Data Category</th>
                      <th className="py-2.5 px-4 text-center w-36">View Access</th>
                      <th className="py-2.5 px-4 text-center w-36">Modify Access</th>
                      <th className="py-2.5 px-4 text-center w-32">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {DATA_CATEGORIES.map((cat) => {
                      const Icon = cat.icon;
                      const viewAllowed = Boolean(granularPermissions[cat.key]?.view);
                      const modifyAllowed = Boolean(granularPermissions[cat.key]?.modify);

                      return (
                        <tr key={cat.key} className="hover:bg-surface-muted transition">
                          <td className="py-3 px-4">
                            <div className="flex items-start gap-2.5">
                              <Icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                              <div>
                                <span className="font-semibold text-text-primary block text-xs">
                                  {cat.title}
                                </span>
                                <span className="text-[11px] text-text-muted mt-0.5 block">
                                  {cat.desc}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleGranular(cat.key, "view")}
                              className={`px-2.5 py-1 rounded text-xs font-medium border transition ${
                                viewAllowed
                                  ? "bg-success-bg text-success border-success-border font-semibold"
                                  : "bg-surface border-border text-text-subtle"
                              }`}
                            >
                              {viewAllowed ? "Allowed" : "Locked"}
                            </button>
                          </td>

                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleGranular(cat.key, "modify")}
                              className={`px-2.5 py-1 rounded text-xs font-medium border transition ${
                                modifyAllowed
                                  ? "bg-primary-subtle text-primary border-primary/30 font-semibold"
                                  : "bg-surface border-border text-text-subtle"
                              }`}
                            >
                              {modifyAllowed ? "Allowed" : "Locked"}
                            </button>
                          </td>

                          <td className="py-3 px-4 text-center">
                            <span className="font-mono text-[11px] text-text-subtle">
                              {viewAllowed && modifyAllowed
                                ? "Full"
                                : viewAllowed
                                ? "Read Only"
                                : "Blocked"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MY PERSONAL HEALTH RECORD */}
        {activeTab === "record" && (
          <div className="space-y-4">
            {/* Vitals Summary Card */}
            <div className="p-4 rounded-lg border border-border bg-surface space-y-3">
              <h3 className="text-xs font-semibold text-text-primary flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                <span>Recorded Vital Signs</span>
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded border border-border bg-surface-muted text-center">
                  <span className="text-[11px] text-text-subtle block font-sans">Blood Pressure</span>
                  <strong className="text-base font-mono text-text-primary mt-1 block">
                    {patient.vitals?.bp || "120/80"}
                  </strong>
                </div>

                <div className="p-3 rounded border border-border bg-surface-muted text-center">
                  <span className="text-[11px] text-text-subtle block font-sans">Heart Rate</span>
                  <strong className="text-base font-mono text-text-primary mt-1 block">
                    {patient.vitals?.hr || 72} bpm
                  </strong>
                </div>

                <div className="p-3 rounded border border-border bg-surface-muted text-center">
                  <span className="text-[11px] text-text-subtle block font-sans">SpO2 Oxygen</span>
                  <strong className="text-base font-mono text-text-primary mt-1 block">
                    {patient.vitals?.spo2 || 98}%
                  </strong>
                </div>

                <div className="p-3 rounded border border-border bg-surface-muted text-center">
                  <span className="text-[11px] text-text-subtle block font-sans">Body Temperature</span>
                  <strong className="text-base font-mono text-text-primary mt-1 block">
                    {patient.vitals?.temp || "36.8°C"}
                  </strong>
                </div>
              </div>
            </div>

            {/* Prescriptions and Encounters */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Active Prescriptions */}
              <div className="p-4 rounded-lg border border-border bg-surface space-y-3">
                <h3 className="text-xs font-semibold text-text-primary flex items-center gap-2">
                  <Pill className="w-4 h-4 text-primary" />
                  <span>Prescribed Medications ({patient.prescriptions?.length || 0})</span>
                </h3>

                {(!patient.prescriptions || patient.prescriptions.length === 0) ? (
                  <div className="py-6 text-center text-xs text-text-subtle">
                    No medications currently prescribed.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {patient.prescriptions.map((rx, idx) => (
                      <div key={idx} className="p-2.5 rounded border border-border bg-surface-muted text-xs">
                        <div className="flex items-center justify-between">
                          <strong className="text-text-primary">{rx.drug || rx.drugName}</strong>
                          <StatusBadge variant="success" dot label={rx.status || "Active"} size="xs" />
                        </div>
                        <div className="text-[11px] text-text-muted mt-1 font-mono">
                          {rx.dosage} · {rx.frequency}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Consultation Encounters */}
              <div className="p-4 rounded-lg border border-border bg-surface space-y-3">
                <h3 className="text-xs font-semibold text-text-primary flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <span>Consultation History ({patient.encounters?.length || 0})</span>
                </h3>

                {(!patient.encounters || patient.encounters.length === 0) ? (
                  <div className="py-6 text-center text-xs text-text-subtle">
                    No clinical encounters logged yet.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {patient.encounters.map((enc, idx) => (
                      <div key={idx} className="p-2.5 rounded border border-border bg-surface-muted text-xs">
                        <div className="flex items-center justify-between text-[11px] text-text-subtle mb-1">
                          <span className="font-mono">{enc.date}</span>
                          <span className="font-semibold text-primary">{enc.doctor}</span>
                        </div>
                        <div className="font-medium text-text-primary">
                          {enc.chiefComplaint}
                        </div>
                        <p className="text-[11px] text-text-muted mt-0.5 line-clamp-2">
                          {enc.soap?.assessment || enc.soap?.plan || "Consultation documented."}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
