import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  Clock,
  MapPin,
  Laptop,
  Activity,
  CheckCircle2,
  AlertTriangle,
  X,
  ArrowRight,
  Key,
  Lock,
  Database,
  Terminal,
  AlertOctagon,
  Mail,
  RefreshCw
} from "lucide-react";
import Button from "./ui/Button";
import StatusBadge from "./ui/StatusBadge";

export default function RiskCheckModal({
  doctor,
  patient,
  contextStatus,
  deviceFingerprint,
  isDeviceTrusted,
  doctorLocation,
  onDeviceEnrolled,
  onClose,
  onGrantAccess,
  onOpenBreakGlass,
  onLogDecision
}) {
  const [evaluating, setEvaluating] = useState(true);
  const [evaluationResult, setEvaluationResult] = useState(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState("");
  const [otpDispatchedInfo, setOtpDispatchedInfo] = useState(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verifyingMfa, setVerifyingMfa] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setEvaluating(true);

    async function evaluateAccess() {
      const doctorAddress = doctor?.ethereumAddress || doctor?.id || "";

      try {
        const headers = {
          "x-doctor-address": doctorAddress
        };
        if (deviceFingerprint) {
          headers["x-device-fingerprint"] = deviceFingerprint;
        }
        if (doctorLocation && doctorLocation.latitude != null) {
          headers["x-device-latitude"] = String(doctorLocation.latitude);
          headers["x-device-longitude"] = String(doctorLocation.longitude);
        }

        const token = localStorage.getItem("medguard_doctor_token");
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const res = await fetch(`/api/patients/${patient.id}`, {
          method: "GET",
          credentials: "include",
          headers
        });

        const data = await res.json();
        if (isMounted) {
          const isErrorStatus = !res.ok;
          const decision = isErrorStatus ? "BLOCK" : (data.decision || data.status || "BLOCK");
          const decisionReason =
            data.message ||
            data.error ||
            (decision === "ALLOW"
              ? "Permissible Risk Score (R < 0.30) & Verified Consent."
              : "Context Risk Evaluated.");

          const result = {
            patientId: patient.id,
            patientPhn: patient.phn,
            patientName: patient.name,
            doctorName: doctor.name,
            timestamp:
              contextStatus?.slstTime ||
              new Date().toLocaleTimeString("en-US", { hour12: true }) + " (SLST)",
            decision,
            riskLevel: data.risk_level || (isErrorStatus ? "HIGH" : "LOW"),
            decisionReason,
            errorId: data.errorId || null,
            requestId: data.requestId || res.headers.get("x-request-id") || null,
            statusCode: res.status,
            signals: data.signals || [],
            calculation: data.calculation || {
              formula: "R = 0.7 * (Σ w_i · R_i) + 0.3 * max(R_i)",
              weightedSum: isErrorStatus ? 1.0 : 0.15,
              weightedComponent: isErrorStatus ? 0.7 : 0.105,
              maxSignal: isErrorStatus ? 1.0 : 0.1,
              maxComponent: isErrorStatus ? 0.3 : 0.03,
              compositeScore: data.risk_score || (isErrorStatus ? 1.0 : 0.135)
            },
            consent: {
              valid: data.consentValid !== undefined ? data.consentValid : !isErrorStatus,
              consentedDoctors: patient.consentedDoctors || []
            },
            record: data.record || null,
            txHash: data.txHash || null
          };

          setEvaluationResult(result);
          setEvaluating(false);

          if (onLogDecision) {
            onLogDecision({
              id: `log-${Date.now()}`,
              timestamp: result.timestamp,
              doctor: result.doctorName,
              patientPhn: result.patientPhn,
              decision: result.decision,
              riskScore: result.calculation?.compositeScore?.toString() || "0.0",
              txHash: result.txHash,
              details: `${result.decisionReason} · Score: ${result.calculation?.compositeScore || "0"}`,
              isBreakGlass: false
            });
          }
        }
      } catch (err) {
        if (isMounted) {
          const failClosedResult = {
            patientId: patient.id,
            patientPhn: patient.phn,
            patientName: patient.name,
            doctorName: doctor?.name || "Clinician",
            timestamp:
              contextStatus?.slstTime ||
              new Date().toLocaleTimeString("en-US", { hour12: true }) + " (SLST)",
            decision: "BLOCK",
            riskLevel: "HIGH",
            decisionReason: "Policy evaluation service unavailable. Access denied (fail-closed).",
            signals: [],
            calculation: {
              formula: "R = 0.7 * (Σ w_i · R_i) + 0.3 * max(R_i)",
              weightedSum: 1.0,
              weightedComponent: 0.7,
              maxSignal: 1.0,
              maxComponent: 0.3,
              compositeScore: 1.0
            },
            consent: {
              valid: false,
              consentedDoctors: []
            },
            record: null,
            txHash: null
          };
          setEvaluationResult(failClosedResult);
          setEvaluating(false);

          if (onLogDecision) {
            onLogDecision({
              id: `log-${Date.now()}`,
              timestamp: failClosedResult.timestamp,
              doctor: failClosedResult.doctorName,
              patientPhn: failClosedResult.patientPhn,
              decision: failClosedResult.decision,
              riskScore: "1.0",
              txHash: null,
              details: failClosedResult.decisionReason,
              isBreakGlass: false
            });
          }
        }
      }
    }

    const timer = setTimeout(evaluateAccess, 600);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [
    doctor,
    patient,
    contextStatus,
    deviceFingerprint,
    isDeviceTrusted,
    doctorLocation
  ]);

  // Auto-dispatch 2FA OTP email when MFA_REQUIRED is triggered
  useEffect(() => {
    if (evaluationResult?.decision === "MFA_REQUIRED") {
      dispatch2faOtp();
    }
  }, [evaluationResult]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const dispatch2faOtp = async () => {
    try {
      const token = localStorage.getItem("medguard_doctor_token");
      const res = await fetch("/api/auth/send-2fa-otp", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          doctorId: doctor.id || doctor.ethereumAddress,
          doctorName: doctor.name,
          email: doctor.email,
          reason: `RiskBAC Step-Up (Score: ${
            evaluationResult?.calculation?.compositeScore
              ? evaluationResult.calculation.compositeScore.toFixed(3)
              : "0.55"
          })`,
          fingerprint: deviceFingerprint
        })
      });
      if (res.ok) {
        const data = await res.json();
        setOtpDispatchedInfo(data);
      }
    } catch (_) {
      // Non-fatal dispatch error handled via UI retry
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setResendCooldown(30);
    await dispatch2faOtp();
  };

  const handleVerifyMfa = async (e) => {
    e.preventDefault();
    if (!mfaCode.trim()) {
      setMfaError("Please enter the 6-digit verification code received in your email.");
      return;
    }

    setVerifyingMfa(true);
    setMfaError("");

    try {
      const token = localStorage.getItem("medguard_doctor_token");
      const res = await fetch("/api/auth/verify-2fa-otp", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          doctorId: doctor.id || doctor.ethereumAddress,
          email: doctor.email,
          otp: mfaCode.trim(),
          fingerprint: deviceFingerprint
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Invalid or expired OTP code.");
      }

      setVerifyingMfa(false);

      if (data.enrolledFingerprint && onDeviceEnrolled) {
        onDeviceEnrolled(data.enrolledFingerprint);
      }

      if (onGrantAccess) {
        onGrantAccess(patient, evaluationResult, evaluationResult?.record || null);
      }
    } catch (err) {
      setVerifyingMfa(false);
      setMfaError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-surface w-full max-w-2xl rounded-lg border border-border shadow-2xl overflow-hidden my-8 flex flex-col">
        {/* Header */}
        <div className="bg-surface-muted border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-primary-subtle border border-primary/30 flex items-center justify-center text-primary">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary tracking-tight flex items-center gap-2">
                <span>RiskBAC Context Evaluation</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface border border-border text-text-subtle">
                  OPA Gate
                </span>
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                Evaluating access for <strong className="text-text-primary">{patient.name}</strong> ({patient.phn})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-text-subtle hover:text-text-primary hover:bg-neutral-bg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto max-h-[80vh]">
          {/* Phase 1: Evaluating State */}
          {evaluating && (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
              <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <div>
                <h3 className="text-xs font-semibold text-text-primary">
                  Evaluating Access Risk Signals...
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Sampling shift hours, IP subnet geofence, hardware enclave, and velocity
                </p>
              </div>
            </div>
          )}

          {/* Phase 2: Evaluation Completed Breakdown */}
          {!evaluating && evaluationResult && (
            <div className="space-y-4 text-xs">
              {/* 1. Context Signals Breakdown Panel */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-text-primary text-[11px] uppercase tracking-wider">
                    Context Signal Breakdown
                  </span>
                  <span className="text-[11px] font-mono text-text-subtle">
                    Weights: Time (20%) · Location (35%) · Device (25%) · Behaviour (20%)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {evaluationResult.signals.map((sig) => (
                    <div
                      key={sig.id}
                      className="p-3 rounded border border-border bg-surface-muted flex flex-col justify-between gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-medium text-text-primary">
                          {sig.id === "time" && <Clock className="w-3.5 h-3.5 text-primary" />}
                          {sig.id === "location" && <MapPin className="w-3.5 h-3.5 text-primary" />}
                          {sig.id === "device" && <Laptop className="w-3.5 h-3.5 text-primary" />}
                          {sig.id === "behavior" && <Activity className="w-3.5 h-3.5 text-primary" />}
                          <span>{sig.name}</span>
                        </div>
                        <span className="text-[10px] font-mono text-text-subtle">
                          w = {sig.weight.toFixed(2)}
                        </span>
                      </div>

                      <div className="text-[11px] text-text-muted leading-tight">
                        {sig.label}
                      </div>

                      {sig.id === "location" && doctorLocation?.latitude && (
                        <div className="text-[10px] font-mono text-text-subtle">
                          GPS: {Number(doctorLocation.latitude).toFixed(4)}°, {Number(doctorLocation.longitude).toFixed(4)}°
                        </div>
                      )}

                      {/* Visual score meter */}
                      <div>
                        <div className="flex justify-between text-[10px] font-mono mb-1">
                          <span className="text-text-subtle">Risk Value:</span>
                          <span className={sig.isSafe ? "text-emerald-600 font-semibold" : "text-critical font-semibold"}>
                            {sig.value.toFixed(2)}
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-border overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              sig.value < 0.30
                                ? "bg-emerald-600"
                                : sig.value < 0.65
                                ? "bg-amber-500"
                                : "bg-critical"
                            }`}
                            style={{ width: `${Math.min(sig.value * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Mathematical Formula Breakdown Panel */}
              <div className="p-3 rounded border border-border bg-surface text-xs space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <div className="flex items-center gap-1.5 text-text-primary font-medium">
                    <Terminal className="w-3.5 h-3.5 text-primary" />
                    <span>Formula: R = 0.7 · (Σ w_i · R_i) + 0.3 · max(R_i)</span>
                  </div>
                  <span className="text-text-subtle">Non-Dilution Model</span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center font-mono">
                  <div className="p-2 rounded border border-border bg-surface-muted">
                    <span className="text-[10px] text-text-subtle block font-sans">Weighted (70%)</span>
                    <strong className="text-text-primary text-xs">
                      {evaluationResult.calculation.weightedComponent.toFixed(3)}
                    </strong>
                  </div>

                  <div className="p-2 rounded border border-border bg-surface-muted">
                    <span className="text-[10px] text-text-subtle block font-sans">Max Signal (30%)</span>
                    <strong className="text-text-primary text-xs">
                      {evaluationResult.calculation.maxComponent.toFixed(3)}
                    </strong>
                  </div>

                  <div className="p-2 rounded border border-primary/30 bg-primary-subtle">
                    <span className="text-[10px] text-primary font-semibold block font-sans">Composite R</span>
                    <strong className="text-primary text-sm">
                      {evaluationResult.calculation.compositeScore.toFixed(3)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* 3. Decision Outcome: ALLOW */}
              {evaluationResult.decision === "ALLOW" && (
                <div className="p-3.5 rounded border border-success-border bg-success-bg flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                    <div>
                      <div className="font-semibold text-success flex items-center gap-2">
                        <span>Access Granted (ALLOW)</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded border border-success-border bg-surface font-semibold">
                          R &lt; 0.30
                        </span>
                      </div>
                      <p className="text-xs text-text-muted mt-0.5">
                        {evaluationResult.decisionReason} Enclave decryption permitted.
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="primary"
                    size="md"
                    icon={ArrowRight}
                    iconPosition="right"
                    onClick={() => onGrantAccess(patient, evaluationResult)}
                  >
                    Open Record
                  </Button>
                </div>
              )}

              {/* 4. Decision Outcome: MFA_REQUIRED */}
              {evaluationResult.decision === "MFA_REQUIRED" && (
                <div className="p-3.5 rounded border border-warning-border bg-warning-bg space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-warning flex items-center gap-2">
                        <span>Step-Up 2FA Challenge Required</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded border border-warning-border bg-surface font-semibold">
                          0.30 &le; R &lt; 0.65
                        </span>
                      </div>
                      <p className="text-xs text-text-muted mt-0.5">
                        {evaluationResult.decisionReason} A 6-digit OTP code was dispatched to your registered email.
                      </p>
                    </div>
                  </div>

                  {/* Email Dispatch Info Row */}
                  <div className="p-2.5 rounded border border-warning-border bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <Mail className="w-3.5 h-3.5 text-warning shrink-0" />
                      <span className="text-text-muted truncate">
                        Dispatched to: <strong className="font-mono text-text-primary">{otpDispatchedInfo?.maskedEmail || doctor.email || "doctor@hospital.lk"}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={resendCooldown > 0}
                        className="text-[11px] text-text-muted hover:text-text-primary underline font-medium disabled:opacity-50"
                      >
                        {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : "Resend OTP"}
                      </button>
                    </div>
                  </div>

                  {/* OTP Input Form */}
                  <form onSubmit={handleVerifyMfa} className="flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value)}
                      placeholder="Enter 6-digit OTP"
                      className="flex-1 h-9 px-3 rounded border border-border bg-surface text-text-primary font-mono text-center tracking-widest text-sm focus:outline-none focus:border-primary transition"
                    />

                    <Button
                      type="submit"
                      variant="primary"
                      size="md"
                      loading={verifyingMfa}
                      icon={Key}
                    >
                      Verify &amp; Decrypt
                    </Button>
                  </form>

                  {mfaError && (
                    <div className="text-xs text-critical font-medium">
                      {mfaError}
                    </div>
                  )}
                </div>
              )}

              {/* 5. Decision Outcome: BLOCK */}
              {evaluationResult.decision === "BLOCK" && (
                <div className="p-3.5 rounded border border-critical-border bg-critical-bg space-y-3">
                  <div className="flex items-start gap-2.5">
                    <ShieldAlert className="w-4 h-4 text-critical shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-critical flex items-center gap-2">
                        <span>{evaluationResult.statusCode === 429 ? "Rate Limit Throttled (429)" : "Access Denied by Policy (BLOCK)"}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded border border-critical-border bg-surface font-semibold">
                          {evaluationResult.statusCode === 429 ? "Rate Limit" : (!evaluationResult.consent.valid ? "Consent Boundary" : "R >= 0.65")}
                        </span>
                      </div>
                      <p className="text-xs text-text-muted mt-0.5">
                        {evaluationResult.decisionReason}
                      </p>
                    </div>
                  </div>

                  {(evaluationResult.errorId || evaluationResult.requestId) && (
                    <div className="p-2.5 rounded border border-critical-border/60 bg-surface flex items-center justify-between text-[11px] font-mono">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-text-subtle font-sans">Reference ID:</span>
                        <span className="text-text-primary font-bold truncate select-all">
                          {evaluationResult.errorId || evaluationResult.requestId}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(evaluationResult.errorId || evaluationResult.requestId);
                        }}
                        className="text-primary hover:underline text-[10px] shrink-0 font-sans font-medium"
                      >
                        Copy Reference
                      </button>
                    </div>
                  )}

                  <div className="p-2.5 rounded border border-critical-border bg-surface flex items-center justify-between gap-3">
                    <div className="text-[11px] text-text-muted">
                      Clinical Emergency? Override policy restriction via emergency Red Alert Protocol.
                    </div>
                    <Button
                      variant="critical"
                      size="sm"
                      icon={AlertOctagon}
                      onClick={() => {
                        onClose();
                        if (onOpenBreakGlass) onOpenBreakGlass(patient);
                      }}
                    >
                      ER Break-Glass
                    </Button>
                  </div>
                </div>
              )}

              {/* 6. Blockchain Tx Hash note */}
              {evaluationResult.txHash && (
                <div className="p-2.5 rounded border border-border bg-surface-muted flex items-center justify-between text-[11px] font-mono text-text-subtle">
                  <div className="flex items-center gap-1.5 truncate">
                    <Database className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span>Audit Sealed:</span>
                    <span className="truncate">{evaluationResult.txHash}</span>
                  </div>
                  <StatusBadge variant="success" label="Sealed" size="xs" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
