import React, { useState } from "react";
import {
  AlertOctagon,
  X,
  AlertTriangle,
  Clock,
  ShieldAlert,
  User,
  Activity
} from "lucide-react";
import Button from "./ui/Button";
import { activateBreakGlass } from "../api/client";

export default function BreakGlassModal({
  doctor,
  initialPatient,
  allPatients = [],
  onClose,
  onActivateBreakGlass
}) {
  const [targetId, setTargetId] = useState(
    initialPatient ? initialPatient.phn || initialPatient.id : ""
  );
  const [justification, setJustification] = useState(
    initialPatient?.statusType === "emergency"
      ? "Severe polytrauma, GCS 4, emergency craniotomy indicated. Immediate allergy check required."
      : ""
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Find preview patient strictly based on targetId (or initialPatient)
  const targetPatient =
    allPatients.find(
      (p) =>
        p.id.toLowerCase() === targetId.trim().toLowerCase() ||
        p.phn.toLowerCase() === targetId.trim().toLowerCase()
    ) || initialPatient;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const submittedPatientId = targetId.trim();
    if (!submittedPatientId) {
      setError("Please specify the target Patient ID or PHN.");
      return;
    }

    if (justification.trim().length < 20) {
      setError(
        `Emergency clinical justification must be at least 20 characters (current: ${justification.trim().length}).`
      );
      return;
    }

    setSubmitting(true);

    try {
      // Find matching patient by ID or PHN
      const matchingPatient = allPatients.find(
        (p) =>
          p.id.toLowerCase() === submittedPatientId.toLowerCase() ||
          p.phn.toLowerCase() === submittedPatientId.toLowerCase()
      );
      const exactPatientId = matchingPatient ? matchingPatient.id : submittedPatientId;

      const response = await activateBreakGlass(
        doctor?.ethereumAddress || doctor?.address || doctor?.id,
        exactPatientId,
        justification.trim()
      );

      const expiresAt =
        response.tokenExpiresAt ||
        response.expires_at ||
        Math.floor(Date.now() / 1000) + 1800;

      const session = {
        token: response.token || response.token_id,
        txHash: response.token_id || "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
        patientId: exactPatientId,
        patientPhn: response.record?.phn || matchingPatient?.phn || exactPatientId,
        patientName: response.record?.patientName || response.record?.name || matchingPatient?.name || "Emergency Patient",
        doctorName: doctor?.name || "Attending Physician",
        justification: justification.trim(),
        activatedAt:
          new Date().toLocaleTimeString("en-US", { timeZone: "Asia/Colombo", hour12: true }) + " (SLST)",
        expiresAt,
        timeLeft: 1800
      };

      const resolvedPatient = response.record
        ? {
            ...matchingPatient,
            ...response.record,
            id: exactPatientId,
            name: response.record.patientName || response.record.name || matchingPatient?.name
          }
        : matchingPatient;

      onActivateBreakGlass(resolvedPatient, session);
    } catch (err) {
      setError(err.message || "Failed to activate Emergency Break-Glass override.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-surface w-full max-w-[520px] rounded-lg border border-critical-border shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="bg-surface-muted border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-critical-bg border border-critical-border flex items-center justify-center text-critical">
              <AlertOctagon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary tracking-tight">
                Emergency Break-Glass Override
              </h2>
              <span className="text-[11px] text-text-muted">
                Red Alert Protocol (RAP V2) · Immediate Emergency Access
              </span>
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4 text-xs">
          {/* Clinical Caution Banner */}
          <div className="p-3 rounded border border-critical-border bg-critical-bg text-critical text-xs leading-relaxed flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>EMERGENCY OVERRIDE (RAP V2)</strong> — Bypasses RiskBAC evaluation and grants 30-minute full clinical record access. Every access event is immutably logged to the Ethereum blockchain audit ledger (AccessAuditLog.sol) with your SLMC credential and timestamp.
            </div>
          </div>

          {/* Target Patient Identifier & Preview Card */}
          <div>
            <label className="font-semibold text-text-primary block mb-1">
              Target Patient Identifier (PHN / ID) <span className="text-critical">*</span>
            </label>
            <input
              type="text"
              required
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder="e.g. PHN-884219"
              className="w-full px-3 py-2 rounded border border-border bg-surface text-text-primary font-mono text-xs focus:outline-none focus:border-critical transition"
            />
          </div>

          {targetPatient && (
            <div className="p-3 rounded border border-border bg-surface-muted flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <div className="font-semibold text-text-primary">
                  {targetPatient.name}
                </div>
                <div className="text-[11px] text-text-muted">
                  {targetPatient.gender}, DOB: {targetPatient.dob} · Dept: {targetPatient.department}
                </div>
                <div className="text-[11px] text-critical font-medium">
                  {targetPatient.criticalAlert || targetPatient.chronicConditions?.join(", ") || "Emergency evaluation"}
                </div>
              </div>
              <div className="font-mono text-xs px-2 py-0.5 rounded bg-surface border border-border font-semibold text-text-primary">
                {targetPatient.phn}
              </div>
            </div>
          )}

          {/* Mandatory Emergency Justification */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-text-primary">
                Clinical Justification <span className="text-critical">*</span>
              </label>
              <span
                className={`font-mono text-[11px] ${
                  justification.trim().length >= 20
                    ? "text-success font-medium"
                    : "text-text-subtle"
                }`}
              >
                {justification.trim().length}/20 min chars
              </span>
            </div>
            <textarea
              rows={3}
              required
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="State clinical emergency rationale (minimum 20 characters)..."
              className="w-full px-3 py-2 rounded border border-border bg-surface text-text-primary text-xs focus:outline-none focus:border-critical transition resize-none leading-relaxed"
            />
          </div>

          {/* Session Parameters Readout */}
          <div className="p-2.5 rounded border border-border bg-surface-muted text-[11px] text-text-muted space-y-1">
            <div className="flex justify-between">
              <span>Token Validity Window:</span>
              <strong className="text-text-primary font-mono">30 Minutes (Auto-Revocation)</strong>
            </div>
            <div className="flex justify-between">
              <span>Authorizing Clinician:</span>
              <strong className="text-text-primary">{doctor.name}</strong>
            </div>
            <div className="flex justify-between">
              <span>Audit Target:</span>
              <span className="font-mono text-text-primary">AccessAuditLog.sol (Ethereum Node #04)</span>
            </div>
          </div>

          {error && (
            <div className="p-2.5 rounded border border-critical-border bg-critical-bg text-critical text-xs font-medium flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-border">
            <Button variant="secondary" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="critical"
              size="md"
              type="submit"
              icon={AlertOctagon}
              loading={submitting}
            >
              Authorize Emergency Override
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
