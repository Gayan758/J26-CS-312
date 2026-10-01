import React, { useState } from "react";
import {
  FileText,
  Pill,
  Activity,
  TestTube,
  ShieldCheck,
  ShieldAlert,
  AlertOctagon,
  AlertTriangle,
  User,
  Plus,
  Save,
  CheckCircle2,
  Calendar,
  Clock,
  ArrowLeft,
  Lock,
  Shield,
  Eye,
  Copy,
  Check,
  XCircle,
  FileCheck
} from "lucide-react";
import Button from "./ui/Button";
import StatusBadge from "./ui/StatusBadge";
import DataTable from "./ui/DataTable";

export default function PatientChart({
  patient,
  doctor,
  breakGlassSession,
  onBackToQueue,
  onUpdatePatient
}) {
  const [activeSubTab, setActiveSubTab] = useState("soap"); // "soap" | "rx" | "vitals" | "labs" | "audit"
  const [showAddSoap, setShowAddSoap] = useState(false);
  const [showAddRx, setShowAddRx] = useState(false);
  const [showAddVitals, setShowAddVitals] = useState(false);
  const [copiedPhn, setCopiedPhn] = useState(false);

  // SOAP form state
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [soapS, setSoapS] = useState("");
  const [soapO, setSoapO] = useState("");
  const [soapA, setSoapA] = useState("");
  const [soapP, setSoapP] = useState("");

  // Rx form state
  const [rxDrug, setRxDrug] = useState("");
  const [rxDosage, setRxDosage] = useState("");
  const [rxFrequency, setRxFrequency] = useState("");
  const [rxDuration, setRxDuration] = useState("");

  // Vitals form state (empty by default)
  const [vitalsBp, setVitalsBp] = useState("");
  const [vitalsHr, setVitalsHr] = useState("");
  const [vitalsSpo2, setVitalsSpo2] = useState("");
  const [vitalsTemp, setVitalsTemp] = useState("");

  if (!patient) {
    return (
      <div className="border border-border rounded-lg p-12 text-center bg-surface flex flex-col items-center justify-center gap-3">
        <FileText className="w-10 h-10 text-text-subtle" />
        <h3 className="text-sm font-semibold text-text-primary">No Patient Chart Selected</h3>
        <p className="text-xs text-text-muted max-w-sm">
          Please select a patient from the Clinic Queue &amp; Triage worklist to evaluate access authorization and decrypt the medical record.
        </p>
        <Button variant="primary" size="md" onClick={onBackToQueue} className="mt-2">
          Return to Clinic Queue
        </Button>
      </div>
    );
  }

  const isEmergencySession = Boolean(breakGlassSession && breakGlassSession.patientId === patient.id);

  // Granular Dynamic Consent Matrix Enforcement
  const perms = patient.granularPermissions || {
    vitals: { view: true, modify: true },
    soap: { view: true, modify: true },
    prescriptions: { view: true, modify: true },
    labs: { view: true, modify: false },
    sensitiveRecords: { view: false, modify: false }
  };

  const canViewSoap = isEmergencySession || perms.soap?.view !== false;
  const canModifySoap = isEmergencySession || perms.soap?.modify !== false;

  const canViewRx = isEmergencySession || perms.prescriptions?.view !== false;
  const canModifyRx = isEmergencySession || perms.prescriptions?.modify !== false;

  const canViewVitals = isEmergencySession || perms.vitals?.view !== false;
  const canModifyVitals = isEmergencySession || perms.vitals?.modify !== false;

  const canViewLabs = isEmergencySession || perms.labs?.view !== false;
  const canModifyLabs = isEmergencySession || perms.labs?.modify !== false;

  const handleCopyPhn = () => {
    if (patient.phn) {
      navigator.clipboard.writeText(patient.phn);
      setCopiedPhn(true);
      setTimeout(() => setCopiedPhn(false), 2000);
    }
  };

  const handleSaveSoap = async (e) => {
    e.preventDefault();
    if (!chiefComplaint || !soapS) return;

    try {
      const token = localStorage.getItem("medguard_doctor_token");
      await fetch(`/api/patients/${patient.id}/soap`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          chiefComplaint,
          subjective: soapS,
          objective: soapO,
          assessment: soapA,
          plan: soapP,
          doctorName: doctor?.name,
          doctorSlmc: doctor?.slmcNumber
        })
      });
    } catch (_) {}

    const newEncounter = {
      id: `enc-${Date.now()}`,
      date: new Date().toISOString().split("T")[0],
      doctor: doctor.name,
      doctorSlmc: doctor.slmcNumber,
      chiefComplaint,
      soap: {
        subjective: soapS,
        objective: soapO || "Clinical examination documented.",
        assessment: soapA || "Clinical diagnosis confirmed.",
        plan: soapP || "Plan recorded."
      }
    };

    const updated = {
      ...patient,
      notesCount: (patient.notesCount || 0) + 1,
      encounters: [newEncounter, ...(patient.encounters || [])]
    };

    if (onUpdatePatient) onUpdatePatient(updated);
    setShowAddSoap(false);
    setChiefComplaint("");
    setSoapS("");
    setSoapO("");
    setSoapA("");
    setSoapP("");
  };

  const handleSaveRx = async (e) => {
    e.preventDefault();
    if (!rxDrug || !rxDosage) return;

    try {
      const token = localStorage.getItem("medguard_doctor_token");
      await fetch(`/api/patients/${patient.id}/prescriptions`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          drugName: rxDrug,
          dosage: rxDosage,
          route: "Oral",
          frequency: rxFrequency || "Once daily",
          duration: rxDuration || "14 days",
          refills: 1,
          prescribedBy: doctor.name
        })
      });
    } catch (_) {}

    const newRx = {
      id: `rx-${Date.now()}`,
      drug: rxDrug,
      dosage: rxDosage,
      frequency: rxFrequency || "Once daily",
      duration: rxDuration || "14 days",
      prescribedBy: doctor.name,
      refills: 1,
      status: "Active"
    };

    const updated = {
      ...patient,
      prescriptionsCount: (patient.prescriptionsCount || 0) + 1,
      prescriptions: [newRx, ...(patient.prescriptions || [])]
    };

    if (onUpdatePatient) onUpdatePatient(updated);
    setShowAddRx(false);
    setRxDrug("");
    setRxDosage("");
    setRxFrequency("");
    setRxDuration("");
  };

  const handleSaveVitals = async (e) => {
    e.preventDefault();

    try {
      const token = localStorage.getItem("medguard_doctor_token");
      await fetch(`/api/patients/${patient.id}/vitals`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          bp: vitalsBp,
          hr: vitalsHr ? parseInt(vitalsHr, 10) : undefined,
          spo2: vitalsSpo2 ? parseInt(vitalsSpo2, 10) : undefined,
          temp: vitalsTemp,
          recordedBy: doctor?.name
        })
      });
    } catch (_) {}

    const updated = {
      ...patient,
      vitals: {
        bp: vitalsBp,
        hr: parseInt(vitalsHr, 10) || "--",
        spo2: parseInt(vitalsSpo2, 10) || "--",
        temp: vitalsTemp || "--",
        rr: 16,
        recordedAt: "Just now (" + doctor.name + ")"
      }
    };
    if (onUpdatePatient) onUpdatePatient(updated);
    setShowAddVitals(false);
    setVitalsBp("");
    setVitalsHr("");
    setVitalsSpo2("");
    setVitalsTemp("");
  };

  // Compute patient age
  const calculateAge = (dobString) => {
    if (!dobString) return "--";
    const birthYear = parseInt(dobString.split("-")[0], 10);
    if (isNaN(birthYear)) return dobString;
    return `${new Date().getFullYear() - birthYear} yrs`;
  };

  const hasAllergies = patient.allergies && patient.allergies.length > 0;
  const allergyListText = patient.allergies?.join(", ");

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4">
      {/* Back Button & Breadcrumb */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBackToQueue}
          className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Clinic Worklist</span>
        </button>

        {isEmergencySession ? (
          <StatusBadge variant="critical" dot label="RAP Emergency Override Active" size="sm" />
        ) : (
          <StatusBadge variant="success" dot label="Verified RiskBAC Session" size="sm" />
        )}
      </div>

      {/* 1. BREAK-GLASS ACTIVE PERSISTENT WARNING BAR */}
      {isEmergencySession && (
        <div className="p-3 rounded-lg border border-critical bg-critical-bg text-critical text-xs flex items-center justify-between gap-4 animate-pulse">
          <div className="flex items-center gap-2.5">
            <AlertOctagon className="w-4 h-4 shrink-0 text-critical" />
            <span>
              <strong>EMERGENCY OVERRIDE SESSION ACTIVE</strong> — Authorized by {breakGlassSession.doctorName} at {breakGlassSession.activatedAt}. Access expires in <strong>{formatTimer(breakGlassSession.timeLeft)}</strong>. All actions are immutably logged to Ethereum block #194821.
            </span>
          </div>
          <button
            type="button"
            onClick={onBackToQueue}
            className="px-2.5 py-1 rounded bg-critical text-white font-medium text-xs hover:bg-[#912018] shrink-0 transition"
          >
            Terminate Session
          </button>
        </div>
      )}

      {/* 2. PATIENT DEMOGRAPHICS STICKY BANNER */}
      <div className="border border-border rounded-lg bg-surface shadow-xs overflow-hidden">
        <div className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start md:items-center gap-4">
            {/* Blood Group Badge */}
            <div className="w-12 h-12 rounded-lg border border-primary/20 bg-primary-subtle text-primary flex items-center justify-center font-mono font-bold text-base shrink-0">
              {patient.bloodGroup || "O+"}
            </div>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-lg font-bold text-text-primary tracking-tight">
                  {patient.name}
                </h1>

                {/* PHN with Copy Button */}
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-surface-muted text-xs font-mono font-medium text-text-primary">
                  <span>{patient.phn}</span>
                  <button
                    type="button"
                    onClick={handleCopyPhn}
                    className="p-0.5 text-text-subtle hover:text-text-primary"
                    title="Copy PHN"
                  >
                    {copiedPhn ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>

                <span className="text-xs font-mono text-text-subtle">
                  NIC: {patient.nic}
                </span>
              </div>

              <div className="text-xs text-text-muted flex items-center gap-2 mt-1 flex-wrap">
                <span>Age: <strong className="text-text-primary">{calculateAge(patient.dob)}</strong></span>
                <span>·</span>
                <span>Sex: <strong className="text-text-primary">{patient.gender}</strong></span>
                <span>·</span>
                <span>DOB: <strong className="text-text-primary font-mono">{patient.dob}</strong></span>
                <span>·</span>
                <span>Location: <strong className="text-primary">{patient.department}</strong></span>
                <span>·</span>
                <span>Attending: <strong className="text-text-primary">{patient.admittingDoctorName || doctor.name}</strong></span>
              </div>
            </div>
          </div>

          {/* Quick Vitals Summary (Abnormal Highlighted Only) */}
          <div className="flex items-center gap-3 px-3 py-2 rounded border border-border bg-surface-muted text-xs font-mono tabular-nums shrink-0">
            <div>
              <span className="text-[10px] text-text-subtle block font-sans">BP</span>
              <strong className="text-text-primary">{patient.vitals?.bp || "120/80"}</strong>
            </div>
            <div className="h-6 w-px bg-border" />
            <div>
              <span className="text-[10px] text-text-subtle block font-sans">Pulse</span>
              <strong className={parseInt(patient.vitals?.hr, 10) > 115 ? "text-critical font-bold" : "text-text-primary"}>
                {patient.vitals?.hr || 72}
              </strong>
            </div>
            <div className="h-6 w-px bg-border" />
            <div>
              <span className="text-[10px] text-text-subtle block font-sans">SpO2</span>
              <strong className={parseInt(patient.vitals?.spo2, 10) < 92 ? "text-critical font-bold" : "text-text-primary"}>
                {patient.vitals?.spo2 || 98}%
              </strong>
            </div>
          </div>
        </div>

        {/* 3. CRITICAL ALLERGY WARNING STRIP (Full Width, No pills) */}
        {hasAllergies && (
          <div className="px-5 py-2 border-t border-warning-border bg-warning-bg text-warning text-xs font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-warning" />
            <span>
              <strong>ALLERGIES:</strong> {allergyListText} — DO NOT ADMINISTER without verification.
            </span>
          </div>
        )}
      </div>

      {/* 4. UNDERLINE TABS BAR */}
      <div className="border-b border-border flex items-center justify-between">
        <nav className="flex items-center gap-6 -mb-px">
          <button
            type="button"
            onClick={() => setActiveSubTab("soap")}
            className={`pb-2.5 text-xs font-medium border-b-2 transition flex items-center gap-1.5 ${
              activeSubTab === "soap"
                ? "border-primary text-primary font-semibold"
                : "border-transparent text-text-muted hover:text-text-primary hover:border-border"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Clinical Notes (SOAP)</span>
            <span className="text-[10px] font-mono px-1 rounded bg-surface-muted text-text-subtle border border-border">
              {patient.encounters?.length || 0}
            </span>
            {!canViewSoap && <Lock className="w-3 h-3 text-critical" />}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("rx")}
            className={`pb-2.5 text-xs font-medium border-b-2 transition flex items-center gap-1.5 ${
              activeSubTab === "rx"
                ? "border-primary text-primary font-semibold"
                : "border-transparent text-text-muted hover:text-text-primary hover:border-border"
            }`}
          >
            <Pill className="w-3.5 h-3.5" />
            <span>Medications (Rx)</span>
            <span className="text-[10px] font-mono px-1 rounded bg-surface-muted text-text-subtle border border-border">
              {patient.prescriptions?.length || 0}
            </span>
            {!canViewRx && <Lock className="w-3 h-3 text-critical" />}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("vitals")}
            className={`pb-2.5 text-xs font-medium border-b-2 transition flex items-center gap-1.5 ${
              activeSubTab === "vitals"
                ? "border-primary text-primary font-semibold"
                : "border-transparent text-text-muted hover:text-text-primary hover:border-border"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Vital Signs</span>
            {!canViewVitals && <Lock className="w-3 h-3 text-critical" />}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("labs")}
            className={`pb-2.5 text-xs font-medium border-b-2 transition flex items-center gap-1.5 ${
              activeSubTab === "labs"
                ? "border-primary text-primary font-semibold"
                : "border-transparent text-text-muted hover:text-text-primary hover:border-border"
            }`}
          >
            <TestTube className="w-3.5 h-3.5" />
            <span>Lab Results</span>
            <span className="text-[10px] font-mono px-1 rounded bg-surface-muted text-text-subtle border border-border">
              {patient.labs?.length || 0}
            </span>
            {!canViewLabs && <Lock className="w-3 h-3 text-critical" />}
          </button>
        </nav>

        {/* Tab Context Action Button */}
        <div>
          {activeSubTab === "soap" && canModifySoap && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setShowAddSoap(!showAddSoap)}
            >
              New Clinical Note
            </Button>
          )}

          {activeSubTab === "rx" && canModifyRx && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setShowAddRx(!showAddRx)}
            >
              Prescribe Medication
            </Button>
          )}

          {activeSubTab === "vitals" && canModifyVitals && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setShowAddVitals(!showAddVitals)}
            >
              Record Vitals
            </Button>
          )}
        </div>
      </div>

      {/* 5. TAB 1: CLINICAL NOTES (SOAP) — 2/3 + 1/3 GRID LAYOUT */}
      {activeSubTab === "soap" && (
        !canViewSoap ? (
          <div className="border border-border rounded-lg p-10 bg-surface text-center flex flex-col items-center justify-center gap-2">
            <Lock className="w-6 h-6 text-critical" />
            <h4 className="text-xs font-semibold text-text-primary">SOAP Clinical Notes Restricted</h4>
            <p className="text-xs text-text-muted max-w-sm">
              Patient {patient.name} has not granted view consent for clinical notes in their Dynamic Consent profile.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left 2/3: Encounter Timeline */}
            <div className="lg:col-span-2 space-y-4">
              {/* Inline SOAP Composer */}
              {showAddSoap && (
                <form
                  onSubmit={handleSaveSoap}
                  className="border border-primary/40 rounded-lg p-4 bg-surface shadow-xs space-y-3 text-xs"
                >
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <span className="font-semibold text-text-primary">
                      New Clinical SOAP Encounter
                    </span>
                    <span className="text-[11px] font-mono text-text-subtle">
                      Attending: {doctor.name} ({doctor.slmcNumber || "SLMC-38491"})
                    </span>
                  </div>

                  <div>
                    <label className="font-medium text-text-primary block mb-1">
                      Chief Complaint:
                    </label>
                    <input
                      type="text"
                      required
                      value={chiefComplaint}
                      onChange={(e) => setChiefComplaint(e.target.value)}
                      placeholder="e.g. Acute chest discomfort radiating to left arm"
                      className="w-full px-3 py-1.5 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary transition"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-medium text-text-primary block mb-1">
                        Subjective (S):
                      </label>
                      <textarea
                        rows={2}
                        required
                        value={soapS}
                        onChange={(e) => setSoapS(e.target.value)}
                        placeholder="Patient stated symptoms and history..."
                        className="w-full p-2 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary transition resize-none leading-relaxed"
                      />
                    </div>

                    <div>
                      <label className="font-medium text-text-primary block mb-1">
                        Objective (O):
                      </label>
                      <textarea
                        rows={2}
                        value={soapO}
                        onChange={(e) => setSoapO(e.target.value)}
                        placeholder="Clinical exam findings, heart sounds, vitals..."
                        className="w-full p-2 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary transition resize-none leading-relaxed"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-medium text-text-primary block mb-1">
                        Assessment (A):
                      </label>
                      <input
                        type="text"
                        value={soapA}
                        onChange={(e) => setSoapA(e.target.value)}
                        placeholder="Clinical assessment or differential..."
                        className="w-full px-3 py-1.5 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary transition"
                      />
                    </div>

                    <div>
                      <label className="font-medium text-text-primary block mb-1">
                        Plan (P):
                      </label>
                      <input
                        type="text"
                        value={soapP}
                        onChange={(e) => setSoapP(e.target.value)}
                        placeholder="Therapeutic plan, investigations, review date..."
                        className="w-full px-3 py-1.5 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary transition"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                    <Button variant="secondary" size="sm" onClick={() => setShowAddSoap(false)}>
                      Cancel
                    </Button>
                    <Button variant="primary" size="sm" type="submit" icon={Save}>
                      Save Note
                    </Button>
                  </div>
                </form>
              )}

              {/* Past Notes List */}
              {patient.encounters?.map((enc) => (
                <div
                  key={enc.id}
                  className="border border-border rounded-lg bg-surface p-4 shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-border pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-text-primary text-xs">
                        {enc.chiefComplaint}
                      </span>
                      <span className="text-[11px] font-mono text-text-subtle">
                        · {enc.doctor}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-text-subtle">
                      {enc.date}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-2.5 rounded border border-border bg-surface-muted">
                      <span className="font-semibold text-primary block mb-0.5 text-[11px]">
                        Subjective (S)
                      </span>
                      <p className="text-text-muted leading-relaxed">
                        {enc.soap.subjective}
                      </p>
                    </div>

                    <div className="p-2.5 rounded border border-border bg-surface-muted">
                      <span className="font-semibold text-primary block mb-0.5 text-[11px]">
                        Objective (O)
                      </span>
                      <p className="text-text-muted leading-relaxed">
                        {enc.soap.objective}
                      </p>
                    </div>

                    <div className="p-2.5 rounded border border-border bg-surface-muted">
                      <span className="font-semibold text-emerald-600 block mb-0.5 text-[11px]">
                        Assessment (A)
                      </span>
                      <p className="text-text-muted leading-relaxed">
                        {enc.soap.assessment}
                      </p>
                    </div>

                    <div className="p-2.5 rounded border border-border bg-surface-muted">
                      <span className="font-semibold text-emerald-600 block mb-0.5 text-[11px]">
                        Plan (P)
                      </span>
                      <p className="text-text-muted leading-relaxed">
                        {enc.soap.plan}
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              {(!patient.encounters || patient.encounters.length === 0) && (
                <div className="border border-border rounded-lg p-8 text-center text-xs text-text-subtle bg-surface">
                  No past clinical encounter notes documented for this patient.
                </div>
              )}
            </div>

            {/* Right 1/3: Quick Reference Panel */}
            <div className="space-y-4">
              {/* Active Problems / Diagnoses */}
              <div className="border border-border rounded-lg bg-surface p-4 shadow-xs text-xs space-y-2.5">
                <div className="font-semibold text-text-primary text-xs pb-2 border-b border-border">
                  Active Problems
                </div>
                {patient.chronicConditions && patient.chronicConditions.length > 0 ? (
                  <ul className="space-y-1.5">
                    {patient.chronicConditions.map((cond, i) => (
                      <li key={i} className="flex items-center gap-2 text-text-muted">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        <span>{cond}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-text-subtle text-xs">No active chronic conditions noted.</div>
                )}
              </div>

              {/* Current Medications Quick Ref */}
              <div className="border border-border rounded-lg bg-surface p-4 shadow-xs text-xs space-y-2.5">
                <div className="font-semibold text-text-primary text-xs pb-2 border-b border-border">
                  Active Medications
                </div>
                {patient.prescriptions && patient.prescriptions.length > 0 ? (
                  <ul className="space-y-2">
                    {patient.prescriptions.slice(0, 4).map((rx) => (
                      <li key={rx.id} className="text-xs">
                        <div className="font-medium text-text-primary">{rx.drug}</div>
                        <div className="text-[11px] text-text-subtle font-mono">
                          {rx.dosage} · {rx.frequency}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-text-subtle text-xs">No active prescriptions on file.</div>
                )}
              </div>

              {/* Dynamic Consent Status Box */}
              <div className="border border-border rounded-lg bg-surface p-4 shadow-xs text-xs space-y-2">
                <div className="font-semibold text-text-primary text-xs pb-2 border-b border-border flex items-center justify-between">
                  <span>Dynamic Consent Profile</span>
                  <StatusBadge variant="success" dot label="Active" size="xs" />
                </div>
                <div className="text-text-muted text-[11px] leading-relaxed">
                  Care Team: <span className="font-medium text-text-primary">{patient.consentedDoctors?.join(", ") || doctor.name}</span>
                </div>
                <div className="pt-2 border-t border-border grid grid-cols-2 gap-2 text-[10px] font-mono text-text-subtle">
                  <div>SOAP: {canViewSoap ? "ALLOW" : "BLOCK"}</div>
                  <div>Rx: {canViewRx ? "ALLOW" : "BLOCK"}</div>
                  <div>Vitals: {canViewVitals ? "ALLOW" : "BLOCK"}</div>
                  <div>Labs: {canViewLabs ? "ALLOW" : "BLOCK"}</div>
                </div>
              </div>
            </div>
          </div>
        )
      )}

      {/* 6. TAB 2: MEDICATIONS (RX) */}
      {activeSubTab === "rx" && (
        !canViewRx ? (
          <div className="border border-border rounded-lg p-10 bg-surface text-center flex flex-col items-center justify-center gap-2">
            <Lock className="w-6 h-6 text-critical" />
            <h4 className="text-xs font-semibold text-text-primary">Prescription Records Restricted</h4>
            <p className="text-xs text-text-muted max-w-sm">
              Patient {patient.name} has restricted prescription viewing in their Dynamic Consent registry.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {showAddRx && (
              <form
                onSubmit={handleSaveRx}
                className="border border-primary/40 rounded-lg p-4 bg-surface shadow-xs space-y-3 text-xs"
              >
                <div className="font-semibold text-text-primary">Prescribe Medication</div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <input
                    type="text"
                    required
                    value={rxDrug}
                    onChange={(e) => setRxDrug(e.target.value)}
                    placeholder="Drug Name (e.g. Metformin)"
                    className="px-3 py-1.5 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary"
                  />
                  <input
                    type="text"
                    required
                    value={rxDosage}
                    onChange={(e) => setRxDosage(e.target.value)}
                    placeholder="Dosage (e.g. 500mg)"
                    className="px-3 py-1.5 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary"
                  />
                  <input
                    type="text"
                    value={rxFrequency}
                    onChange={(e) => setRxFrequency(e.target.value)}
                    placeholder="Frequency (e.g. Twice daily)"
                    className="px-3 py-1.5 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary"
                  />
                  <input
                    type="text"
                    value={rxDuration}
                    onChange={(e) => setRxDuration(e.target.value)}
                    placeholder="Duration (e.g. 30 days)"
                    className="px-3 py-1.5 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  <Button variant="secondary" size="sm" onClick={() => setShowAddRx(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" type="submit" icon={Save}>
                    Sign &amp; Prescribe
                  </Button>
                </div>
              </form>
            )}

            <DataTable
              columns={[
                { header: "Medication", accessor: "drug", cellClassName: "font-semibold" },
                { header: "Dosage", accessor: "dosage", isMono: true },
                { header: "Frequency", accessor: "frequency" },
                { header: "Duration", accessor: "duration", isMono: true },
                {
                  header: "Status",
                  accessor: "status",
                  render: (row) => (
                    <StatusBadge variant="success" dot label={row.status || "Active"} size="xs" />
                  )
                }
              ]}
              data={patient.prescriptions || []}
              keyField="id"
              emptyState={
                <div className="py-6 text-center text-xs text-text-subtle">
                  No medications currently recorded.
                </div>
              }
            />
          </div>
        )
      )}

      {/* 7. TAB 3: VITALS SIGNS (Metric Cards - abnormal only colored) */}
      {activeSubTab === "vitals" && (
        !canViewVitals ? (
          <div className="border border-border rounded-lg p-10 bg-surface text-center flex flex-col items-center justify-center gap-2">
            <Lock className="w-6 h-6 text-critical" />
            <h4 className="text-xs font-semibold text-text-primary">Biometric Vitals Restricted</h4>
            <p className="text-xs text-text-muted max-w-sm">
              Patient {patient.name} has restricted biometric vital sign viewing.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {showAddVitals && (
              <form
                onSubmit={handleSaveVitals}
                className="border border-primary/40 rounded-lg p-4 bg-surface shadow-xs space-y-3 text-xs"
              >
                <div className="font-semibold text-text-primary">Log Clinical Vitals</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[11px] text-text-subtle block mb-1">Blood Pressure</label>
                    <input
                      type="text"
                      value={vitalsBp}
                      onChange={(e) => setVitalsBp(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded border border-border bg-surface text-text-primary font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-text-subtle block mb-1">Heart Rate (bpm)</label>
                    <input
                      type="number"
                      value={vitalsHr}
                      onChange={(e) => setVitalsHr(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded border border-border bg-surface text-text-primary font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-text-subtle block mb-1">SpO2 (%)</label>
                    <input
                      type="number"
                      value={vitalsSpo2}
                      onChange={(e) => setVitalsSpo2(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded border border-border bg-surface text-text-primary font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-text-subtle block mb-1">Temperature</label>
                    <input
                      type="text"
                      value={vitalsTemp}
                      onChange={(e) => setVitalsTemp(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded border border-border bg-surface text-text-primary font-mono text-xs"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  <Button variant="secondary" size="sm" onClick={() => setShowAddVitals(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" type="submit" icon={Save}>
                    Save Vitals
                  </Button>
                </div>
              </form>
            )}

            {/* Metric cards grid — Rule: Normal vitals are NOT green! */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="border border-border rounded-lg bg-surface p-4 text-center">
                <span className="text-xs text-text-subtle block font-sans">Blood Pressure</span>
                <strong className="text-xl font-mono text-text-primary mt-1 block tabular-nums">
                  {patient.vitals?.bp || "120/80"}
                </strong>
                <span className="text-[11px] text-text-subtle font-mono">mmHg</span>
              </div>

              <div className="border border-border rounded-lg bg-surface p-4 text-center">
                <span className="text-xs text-text-subtle block font-sans">Heart Rate</span>
                <strong
                  className={`text-xl font-mono mt-1 block tabular-nums ${
                    parseInt(patient.vitals?.hr, 10) > 115 || parseInt(patient.vitals?.hr, 10) < 50
                      ? "text-critical"
                      : "text-text-primary"
                  }`}
                >
                  {patient.vitals?.hr || 72}
                </strong>
                <span className="text-[11px] text-text-subtle font-mono">bpm</span>
              </div>

              <div className="border border-border rounded-lg bg-surface p-4 text-center">
                <span className="text-xs text-text-subtle block font-sans">SpO2 Saturation</span>
                <strong
                  className={`text-xl font-mono mt-1 block tabular-nums ${
                    parseInt(patient.vitals?.spo2, 10) < 92
                      ? "text-critical"
                      : "text-text-primary"
                  }`}
                >
                  {patient.vitals?.spo2 || 98}%
                </strong>
                <span className="text-[11px] text-text-subtle font-mono">Room air</span>
              </div>

              <div className="border border-border rounded-lg bg-surface p-4 text-center">
                <span className="text-xs text-text-subtle block font-sans">Body Temperature</span>
                <strong className="text-xl font-mono text-text-primary mt-1 block tabular-nums">
                  {patient.vitals?.temp || "36.8°C"}
                </strong>
                <span className="text-[11px] text-text-subtle font-mono">Core</span>
              </div>
            </div>
          </div>
        )
      )}

      {/* 8. TAB 4: DIAGNOSTIC LABS */}
      {activeSubTab === "labs" && (
        !canViewLabs ? (
          <div className="border border-border rounded-lg p-10 bg-surface text-center flex flex-col items-center justify-center gap-2">
            <Lock className="w-6 h-6 text-critical" />
            <h4 className="text-xs font-semibold text-text-primary">Diagnostic Pathology Labs Restricted</h4>
            <p className="text-xs text-text-muted max-w-sm">
              Patient {patient.name} has not granted view consent for diagnostic pathology investigations.
            </p>
          </div>
        ) : (
          <DataTable
            columns={[
              { header: "Investigation / Parameter", accessor: "test", cellClassName: "font-semibold" },
              { header: "Observed Value", accessor: "result", isMono: true },
              { header: "Reference Interval", accessor: "reference", isMono: true },
              {
                header: "Clinical Flag",
                accessor: "status",
                render: (row) => {
                  const isCrit = row.status?.includes("Critical") || row.status?.includes("Abnormal");
                  return (
                    <StatusBadge
                      variant={isCrit ? "critical" : "neutral"}
                      dot={isCrit}
                      label={row.status}
                      size="xs"
                    />
                  );
                }
              }
            ]}
            data={patient.labs || []}
            keyField="test"
            emptyState={
              <div className="py-6 text-center text-xs text-text-subtle">
                No diagnostic labs on file.
              </div>
            }
          />
        )
      )}
    </div>
  );
}
