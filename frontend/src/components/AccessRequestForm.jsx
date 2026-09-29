import React, { useState, useEffect } from "react";
import { ShieldCheck, ShieldAlert, AlertTriangle, Lock, FileText, Activity, Key } from "lucide-react";
import { requestAccess } from "../api/client";

export default function AccessRequestForm({ doctor, activeIp, selectedPatient, onMfaRequired, onAccessSuccess }) {
  const [patientId, setPatientId] = useState(selectedPatient ? selectedPatient.id : "patient-123");
  const [sensitivity, setSensitivity] = useState(selectedPatient ? selectedPatient.sensitivity : "low");
  const [deviceFingerprint, setDeviceFingerprint] = useState(doctor.defaultDeviceFingerprint || "sha256:alice-workstation-secure-enclave");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (selectedPatient) {
      setPatientId(selectedPatient.id);
      setSensitivity(selectedPatient.sensitivity);
      setResult(null);
      setError(null);
    }
  }, [selectedPatient]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await requestAccess({
        doctor_address: doctor.ethereumAddress,
        patient_id: patientId,
        requested_record_id: "record-001",
        requested_record_sensitivity: sensitivity,
        ip_address: activeIp,
        device_fingerprint: deviceFingerprint,
        timestamp: new Date().toISOString()
      });

      if (response.status === 403) {
        setResult({
          status: "BLOCK",
          message: response.data.message || "Access Denied by Policy"
        });
      } else if (response.data.status === "MFA_REQUIRED") {
        setResult(response.data);
        if (onMfaRequired) onMfaRequired(response.data);
      } else if (response.data.status === "ALLOW") {
        setResult(response.data);
        if (onAccessSuccess) onAccessSuccess(response.data.record);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-6 border border-slate-800 flex flex-col gap-5">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-500/15 text-indigo-400 rounded-xl border border-indigo-500/20">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold font-outfit text-white">Pre-Access RiskBAC Evaluation</h2>
            <p className="text-[11px] text-slate-400">Context-Aware Security Evaluation before Decryption Key Release</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Physician Signer (Authenticated)
            </label>
            <input
              type="text"
              value={doctor.ethereumAddress}
              readOnly
              className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-xs text-slate-400 font-mono cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Target Patient ID
            </label>
            <input
              type="text"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Record Classification
            </label>
            <select
              value={sensitivity}
              onChange={(e) => setSensitivity(e.target.value)}
              className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
            >
              <option value="low">Low (Standard Medical Chart)</option>
              <option value="medium">Medium (Confidential Clinical History)</option>
              <option value="high">High (Specialist Diagnostic Data)</option>
              <option value="restricted">Restricted (Psychiatric / Sensitive)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Terminal Device Signature
            </label>
            <select
              value={deviceFingerprint}
              onChange={(e) => setDeviceFingerprint(e.target.value)}
              className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none font-mono"
            >
              <option value={doctor.defaultDeviceFingerprint}>Registered Enrolled Terminal (Valid)</option>
              <option value="sha256:approved-hospital-tablet">Hospital Tablet (MDM Approved)</option>
              <option value="sha256:unregistered-rogue-phone">Unregistered Personal Phone (Rogue)</option>
            </select>
          </div>

        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition duration-150 flex items-center justify-center gap-2 text-xs shadow-lg shadow-indigo-600/20"
        >
          {loading ? "Running RiskBAC Scoring & OPA Policy..." : "Run Risk Scoring & Request Decryption"}
        </button>
      </form>

      {/* Decision Results & Risk Breakdown */}
      {result && (
        <div className="border-t border-slate-800 pt-3.5 flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Policy Decision</span>
            {result.status === "ALLOW" && (
              <span className="px-3 py-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold rounded-full flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> ALLOW (Access Granted)
              </span>
            )}
            {result.status === "MFA_REQUIRED" && (
              <span className="px-3 py-1 bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold rounded-full flex items-center gap-1.5 animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5" /> MFA_REQUIRED (Step-Up Needed)
              </span>
            )}
            {result.status === "BLOCK" && (
              <span className="px-3 py-1 bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-bold rounded-full flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> BLOCK (Access Denied by Policy)
              </span>
            )}
          </div>

          {/* Breakdown cards if scored */}
          {result.signal_breakdown && (
            <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800 flex flex-col gap-2.5">
              <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800">
                <span className="text-slate-400 font-mono">Calculated Risk: <strong className="text-white text-sm">{result.risk_score}</strong> ({result.risk_level})</span>
                <span className="text-slate-400 font-mono text-[11px]">R_max: <strong className="text-indigo-400">{result.signal_breakdown.max_component}</strong></span>
                <span className="text-slate-400 font-mono text-[11px]">Weighted: <strong className="text-indigo-400">{result.signal_breakdown.weighted_component}</strong></span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono">
                <div className="p-2 rounded bg-slate-950/60 border border-slate-800/50">
                  <span className="text-slate-500 block">R_t (SLST Time):</span>
                  <span className="text-slate-200 font-semibold">{result.signal_breakdown.login_time_score}</span>
                </div>
                <div className="p-2 rounded bg-slate-950/60 border border-slate-800/50">
                  <span className="text-slate-500 block">R_l (Campus Geo):</span>
                  <span className="text-slate-200 font-semibold">{result.signal_breakdown.geo_velocity_score}</span>
                </div>
                <div className="p-2 rounded bg-slate-950/60 border border-slate-800/50">
                  <span className="text-slate-500 block">R_d (Device):</span>
                  <span className="text-slate-200 font-semibold">{result.signal_breakdown.device_score}</span>
                </div>
                <div className="p-2 rounded bg-slate-950/60 border border-slate-800/50">
                  <span className="text-slate-500 block">R_b (Sensitivity):</span>
                  <span className="text-slate-200 font-semibold">{result.signal_breakdown.behavior_score}</span>
                </div>
              </div>
            </div>
          )}

          {/* Decrypted Record display on ALLOW */}
          {result.record && (
            <div className="bg-emerald-950/15 border border-emerald-500/25 rounded-xl p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs text-emerald-400 font-semibold border-b border-emerald-500/20 pb-2">
                <span className="flex items-center gap-1.5"><FileText className="w-4 h-4" /> Decrypted Plaintext EHR Record</span>
                <span className="font-mono text-[10px] text-emerald-300">IPFS + ConsentRegistry Key Released</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                <div><span className="text-slate-500">Patient:</span> <strong className="text-white">{result.record.patientName}</strong></div>
                <div><span className="text-slate-500">DOB:</span> {result.record.dob}</div>
                <div><span className="text-slate-500">Blood Group:</span> <span className="text-indigo-400 font-bold">{result.record.bloodGroup}</span></div>
                <div><span className="text-slate-500">Allergies:</span> <span className="text-red-400 font-medium">{result.record.allergies?.join(", ")}</span></div>
              </div>
              <div className="text-xs text-slate-300 pt-1 border-t border-slate-800/50">
                <span className="text-slate-500 block">Clinical Notes:</span>
                <p className="italic text-slate-400 mt-0.5">{result.record.clinicalNotes}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-950/40 border border-red-500/30 text-red-300 text-xs rounded-xl flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-400" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
