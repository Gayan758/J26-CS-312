import React, { useState, useEffect } from "react";
import { AlertOctagon, Clock, Key, ShieldAlert, FileText, CheckCircle2 } from "lucide-react";
import { activateBreakGlass, accessBreakGlassRecord } from "../api/client";

export default function BreakGlassPanel({ onEmergencyRecordDecrypted }) {
  const [doctorAddress, setDoctorAddress] = useState("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
  const [patientId, setPatientId] = useState("patient-456");
  const [justification, setJustification] = useState(
    "Patient in acute trauma in ER, unconscious, acute intracranial hemorrhage, allergy status vital."
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [decryptedRecord, setDecryptedRecord] = useState(null);

  // Active countdown timer
  useEffect(() => {
    if (!activeSession) return;

    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = activeSession.expires_at - now;
      if (remaining <= 0) {
        setTimeLeft(0);
        clearInterval(interval);
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSession]);

  const handleActivate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await activateBreakGlass(doctorAddress, patientId, justification);
      setActiveSession(res);
      const remaining = res.expires_at - Math.floor(Date.now() / 1000);
      setTimeLeft(remaining > 0 ? remaining : 1800);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchRecord = async () => {
    if (!activeSession) return;
    setLoading(true);
    setError(null);

    try {
      const res = await accessBreakGlassRecord(activeSession.token);
      setDecryptedRecord(res.record);
      if (onEmergencyRecordDecrypted) onEmergencyRecordDecrypted(res.record);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="glass-card rounded-2xl p-6 border border-red-500/30 flex flex-col gap-5 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-600 via-rose-500 to-red-600" />

      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-red-500/15 text-red-400 rounded-xl border border-red-500/20">
            <AlertOctagon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold font-outfit text-white flex items-center gap-2">
              Audited Break-Glass Emergency Override
              <span className="text-[10px] bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full font-mono border border-red-500/30">
                RAP PROTOCOL
              </span>
            </h2>
            <p className="text-xs text-slate-400">Time-boxed emergency access bypassing risk scoring without bypassing key custody</p>
          </div>
        </div>

        {activeSession && (
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 font-mono text-xs font-semibold animate-pulse">
            <Clock className="w-4 h-4 text-red-400" />
            <span>EXPIRES IN: {formatTimer(timeLeft)}</span>
          </div>
        )}
      </div>

      {!activeSession ? (
        <form onSubmit={handleActivate} className="space-y-4">
          <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-xl text-xs text-red-300 leading-relaxed">
            <strong>CRITICAL ACCOUNTABILITY NOTICE:</strong> Activating Break-Glass generates an immutable on-chain record logged as <code className="font-mono">isBreakGlass: true</code> on the AccessAuditLog smart contract. Bypasses normal consent logic for life-threatening emergencies.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Authorizing Doctor Address</label>
              <input
                type="text"
                value={doctorAddress}
                onChange={(e) => setDoctorAddress(e.target.value)}
                className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-xs text-slate-200 font-mono focus:border-red-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Emergency Patient ID</label>
              <input
                type="text"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-xs text-slate-200 font-mono focus:border-red-500 focus:outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Mandatory Clinical Justification (min 10 characters, permanently logged)
            </label>
            <textarea
              rows={3}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-xs text-slate-200 focus:border-red-500 focus:outline-none"
              placeholder="Detail the life-threatening emergency justification..."
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-950/40 border border-red-500/30 text-red-300 text-xs rounded-xl flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold rounded-xl text-xs transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-red-600/20"
          >
            {loading ? "Activating Break-Glass on Ethereum..." : "Confirm & Activate Break-Glass Emergency"}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="p-3.5 bg-red-950/30 border border-red-500/30 rounded-xl flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Emergency Token Active on BreakGlassRegistry.sol
              </div>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate max-w-md">
                Token ID: {activeSession.token_id}
              </p>
            </div>
            <button
              type="button"
              onClick={handleFetchRecord}
              disabled={loading || timeLeft <= 0}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 shadow-md shadow-red-600/30"
            >
              <Key className="w-3.5 h-3.5" /> {loading ? "Decrypting..." : "Execute Two-Branch Decrypt"}
            </button>
          </div>

          {decryptedRecord && (
            <div className="p-4 bg-slate-900/90 border border-red-500/40 rounded-xl flex flex-col gap-2.5">
              <div className="flex items-center justify-between text-xs text-red-400 font-bold border-b border-slate-800 pb-2">
                <span className="flex items-center gap-1.5"><FileText className="w-4 h-4" /> Emergency Plaintext Medical Record</span>
                <span className="font-mono text-[10px] text-emerald-400">ConsentRegistry Key Released</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-300">
                <div><span className="text-slate-500 block">Patient:</span> <strong className="text-white">{decryptedRecord.patientName}</strong></div>
                <div><span className="text-slate-500 block">Blood Group:</span> <span className="text-red-400 font-bold text-sm">{decryptedRecord.bloodGroup}</span></div>
                <div><span className="text-slate-500 block">Status:</span> {decryptedRecord.acuteEmergencyStatus}</div>
                <div><span className="text-slate-500 block">Allergies:</span> <span className="text-amber-400 font-semibold">{decryptedRecord.allergies?.join(", ")}</span></div>
              </div>
              {decryptedRecord.criticalAlert && (
                <div className="mt-1 p-2.5 bg-red-900/40 border border-red-500/40 rounded-lg text-xs font-semibold text-red-200">
                  ⚠️ CRITICAL CLINICAL ALERT: {decryptedRecord.criticalAlert}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
