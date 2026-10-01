import React, { useState } from "react";
import { KeyRound, CheckCircle2, AlertCircle, FileText } from "lucide-react";
import { verifyMfa } from "../api/client";

export default function MFAChallenge({ challengeData, onMfaSuccess, onClose }) {
  const [otp, setOtp] = useState("123456");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [decryptedRecord, setDecryptedRecord] = useState(null);

  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await verifyMfa(challengeData.challenge_token, otp);
      setDecryptedRecord(res.record);
      if (onMfaSuccess) onMfaSuccess(res.record);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div className="glass-card w-full max-w-md rounded-2xl p-6 border border-amber-500/30 shadow-2xl flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/15 text-amber-400 rounded-xl border border-amber-500/20">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-md font-bold font-outfit text-white">Step-Up MFA Required</h3>
            <p className="text-xs text-slate-400">Medium Contextual Risk (0.30 ≤ R &lt; 0.65)</p>
          </div>
        </div>

        <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-slate-300 leading-relaxed">
          Accessing this medical record from an external network requires step-up verification.
          <br /><strong className="text-amber-400 font-mono">Test verification OTP code: 123456</strong>
        </div>

        {!decryptedRecord ? (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Enter 6-Digit OTP Verification Code
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                maxLength={6}
                className="w-full text-center tracking-[0.5em] font-mono text-lg rounded-xl bg-slate-900 border border-slate-800 py-3 text-white focus:border-amber-500 focus:outline-none"
                placeholder="123456"
                required
              />
            </div>

            {error && (
              <div className="p-2.5 bg-red-950/40 border border-red-500/30 text-red-300 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-1.5"
              >
                {loading ? "Verifying..." : "Verify & Decrypt"}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>MFA Challenge verified! Scoped key released & record decrypted.</span>
            </div>
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-xs space-y-1.5">
              <div className="text-white font-semibold">{decryptedRecord.patientName} ({decryptedRecord.bloodGroup})</div>
              <div className="text-slate-400">Allergies: {decryptedRecord.allergies?.join(", ")}</div>
              <div className="text-slate-400 italic">{decryptedRecord.clinicalNotes}</div>
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition"
            >
              Close Dialog
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
