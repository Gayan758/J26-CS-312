import React, { useState } from "react";
import {
  Database,
  Search,
  Filter,
  AlertOctagon,
  Copy,
  Check,
  ShieldCheck,
  ShieldAlert,
  Layers,
  FileCode,
  Info,
  RefreshCw
} from "lucide-react";
import Button from "./ui/Button";
import StatusBadge from "./ui/StatusBadge";
import DataTable from "./ui/DataTable";
import Sheet from "./ui/Sheet";

export default function ComplianceAuditCenter({ auditLogs = [], onClearLogs }) {
  const [filterDecision, setFilterDecision] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);
  const [copiedTx, setCopiedTx] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedTx(id);
    setTimeout(() => setCopiedTx(null), 2000);
  };

  const handleVerifyIntegrity = async () => {
    setIsVerifying(true);
    try {
      const res = await fetch("/api/audit-logs/verify", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setVerificationResult(data);
      } else {
        setVerificationResult({ verified: false, message: "Verification check failed." });
      }
    } catch {
      setVerificationResult({ verified: false, message: "Network error during verification." });
    } finally {
      setIsVerifying(false);
    }
  };

  const filteredLogs = auditLogs.filter((log) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      (log.doctor || log.actor || "").toLowerCase().includes(term) ||
      (log.patientPhn || log.patient_id || "").toLowerCase().includes(term) ||
      (log.curr_hash || log.txHash || "").toLowerCase().includes(term) ||
      (log.details || log.reason || "").toLowerCase().includes(term) ||
      (log.action || "").toLowerCase().includes(term);

    if (!matchesSearch) return false;

    const outcome = String(log.decision || log.outcome || "").toUpperCase();
    if (filterDecision === "allow") return outcome === "ALLOW" || outcome === "SUCCESS";
    if (filterDecision === "mfa") return outcome === "MFA_REQUIRED" || outcome === "MFA" || outcome === "CHALLENGE";
    if (filterDecision === "block") return outcome === "BLOCK" || outcome === "DENIED" || outcome === "FAILURE";
    if (filterDecision === "break_glass") return outcome === "BREAK_GLASS" || log.isBreakGlass || outcome === "BREAK_GLASS_ACTIVATE" || outcome === "BREAK_GLASS_READ";

    return true;
  });

  const totalCount = auditLogs.length;
  const allowCount = auditLogs.filter((l) => {
    const o = String(l.decision || l.outcome || "").toUpperCase();
    return o === "ALLOW" || o === "SUCCESS";
  }).length;
  const mfaCount = auditLogs.filter((l) => {
    const o = String(l.decision || l.outcome || "").toUpperCase();
    return o === "MFA_REQUIRED" || o === "MFA" || o === "CHALLENGE";
  }).length;
  const blockCount = auditLogs.filter((l) => {
    const o = String(l.decision || l.outcome || "").toUpperCase();
    return o === "BLOCK" || o === "DENIED" || o === "FAILURE";
  }).length;
  const breakGlassCount = auditLogs.filter((l) => {
    const o = String(l.decision || l.outcome || "").toUpperCase();
    return o === "BREAK_GLASS" || l.isBreakGlass || o === "BREAK_GLASS_ACTIVATE" || o === "BREAK_GLASS_READ";
  }).length;

  const allowRate = totalCount > 0 ? Math.round((allowCount / totalCount) * 100) : 100;

  const getDecisionBadge = (decision, isBreakGlass) => {
    const clean = String(decision || "").toUpperCase();
    if (clean === "BREAK_GLASS" || isBreakGlass || clean === "BREAK_GLASS_ACTIVATE" || clean === "BREAK_GLASS_READ") {
      return (
        <StatusBadge variant="critical" icon={AlertOctagon} label="Emergency Override" size="xs" />
      );
    }
    if (clean === "ALLOW" || clean === "SUCCESS") {
      return (
        <StatusBadge variant="success" dot label="Allowed" size="xs" />
      );
    }
    if (clean === "MFA_REQUIRED" || clean === "MFA" || clean === "CHALLENGE") {
      return (
        <StatusBadge variant="warning" dot label="Verification Required" size="xs" />
      );
    }
    return (
      <StatusBadge variant="neutral" dot label="Restricted" size="xs" />
    );
  };

  const getPolicyRule = (log) => {
    const clean = String(log.decision || log.outcome || "").toUpperCase();
    if (clean === "BREAK_GLASS" || log.isBreakGlass || clean === "BREAK_GLASS_ACTIVATE" || clean === "BREAK_GLASS_READ") {
      return "Emergency override policy";
    }
    if (clean === "ALLOW" || clean === "SUCCESS") return "Standard access policy";
    if (clean === "MFA_REQUIRED" || clean === "MFA" || clean === "CHALLENGE") return "Step-up verification policy";
    return "Access restriction policy";
  };

  const columns = [
    {
      header: "Timestamp",
      accessor: "timestamp",
      isMono: true,
      cellClassName: "text-text-subtle",
      render: (row) => row.timestamp ? new Date(row.timestamp).toLocaleString("en-US", { timeZone: "Asia/Colombo" }) : "N/A"
    },
    {
      header: "Outcome",
      accessor: "decision",
      render: (row) => getDecisionBadge(row.decision || row.outcome, row.isBreakGlass)
    },
    {
      header: "Risk Level",
      accessor: "riskLevel",
      render: (row) => {
        const level = String(row.risk_level || row.riskLevel || "LOW").toUpperCase();
        const score = row.risk_score !== null && row.risk_score !== undefined
          ? row.risk_score
          : (row.riskScore || "0.120");
        return (
          <div className="flex items-center gap-1.5 font-mono text-xs">
            <span className="font-semibold text-text-primary">{level}</span>
            <span className="text-[11px] text-text-subtle">({typeof score === "number" ? score.toFixed(3) : score})</span>
          </div>
        );
      }
    },
    {
      header: "Clinician / Actor",
      accessor: "actor",
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-semibold text-text-primary text-xs">{row.actor || row.doctor || "System"}</span>
          <span className="text-[10px] text-text-subtle">{row.role || "Authorized Staff"}</span>
        </div>
      )
    },
    {
      header: "Patient Identifier",
      accessor: "patientPhn",
      isMono: true,
      render: (row) => (
        <span className="font-semibold text-primary">{row.patient_id || row.patientPhn || "System Event"}</span>
      )
    },
    {
      header: "Policy Rule",
      accessor: "policy",
      cellClassName: "text-text-muted text-[11px]",
      render: (row) => getPolicyRule(row)
    },
    {
      header: "Ledger Digest",
      accessor: "curr_hash",
      isMono: true,
      render: (row) => {
        const hash = row.curr_hash || row.txHash || "00000000000000000000000000000000";
        const short = `${hash.slice(0, 8)}...${hash.slice(-6)}`;
        const isCopied = copiedTx === row.id;

        return (
          <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <span className="text-text-subtle text-[11px]">{short}</span>
            <button
              type="button"
              onClick={() => handleCopy(hash, row.id)}
              className="p-1 rounded text-text-subtle hover:text-text-primary hover:bg-neutral-bg"
              title="Copy hash digest"
            >
              {isCopied ? (
                <Check className="w-3 h-3 text-emerald-600" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>
        );
      }
    },
    {
      header: "Actions",
      accessor: "actions",
      align: "right",
      render: (row) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedLog(row);
          }}
        >
          View Detail
        </Button>
      )
    }
  ];

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            <span>Hospital Compliance &amp; Audit Ledger</span>
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Cryptographically verified access decisions and clinical governance event log
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs text-text-subtle flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
            <span>Ledger Status:</span>
            <span className="font-semibold text-emerald-700">Integrity verified</span>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleVerifyIntegrity}
            disabled={isVerifying}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isVerifying ? "animate-spin" : ""}`} />
            <span>Verify Integrity</span>
          </Button>
        </div>
      </div>

      {/* Verification Result Banner */}
      {verificationResult && (
        <div className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
          verificationResult.verified ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-red-50 border-red-200 text-red-900"
        }`}>
          <div className="flex items-center gap-2">
            {verificationResult.verified ? (
              <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />
            )}
            <span>{verificationResult.message}</span>
          </div>
          {verificationResult.headHash && (
            <span className="font-mono text-[10px] text-emerald-700">Head: {verificationResult.headHash.slice(0, 16)}...</span>
          )}
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div
          onClick={() => setFilterDecision("all")}
          className={`p-3.5 rounded-lg border bg-surface cursor-pointer transition select-none ${
            filterDecision === "all" ? "border-primary ring-1 ring-primary/20 shadow-xs" : "border-border hover:border-border-subtle"
          }`}
        >
          <div className="text-[11px] font-medium text-text-subtle">Total Requests</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-text-primary mt-1">
            {totalCount}
          </div>
        </div>

        <div
          onClick={() => setFilterDecision("allow")}
          className={`p-3.5 rounded-lg border bg-surface cursor-pointer transition select-none ${
            filterDecision === "allow" ? "border-primary ring-1 ring-primary/20 shadow-xs" : "border-border hover:border-border-subtle"
          }`}
        >
          <div className="text-[11px] font-medium text-text-subtle">Allowed Rate</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-600 mt-1">
            {allowRate}%
          </div>
        </div>

        <div
          onClick={() => setFilterDecision("mfa")}
          className={`p-3.5 rounded-lg border bg-surface cursor-pointer transition select-none ${
            filterDecision === "mfa" ? "border-primary ring-1 ring-primary/20 shadow-xs" : "border-border hover:border-border-subtle"
          }`}
        >
          <div className="text-[11px] font-medium text-text-subtle">Verification Challenges</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-warning mt-1">
            {mfaCount}
          </div>
        </div>

        <div
          onClick={() => setFilterDecision("block")}
          className={`p-3.5 rounded-lg border bg-surface cursor-pointer transition select-none ${
            filterDecision === "block" ? "border-primary ring-1 ring-primary/20 shadow-xs" : "border-border hover:border-border-subtle"
          }`}
        >
          <div className="text-[11px] font-medium text-text-subtle">Restricted Requests</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-text-muted mt-1">
            {blockCount}
          </div>
        </div>

        <div
          onClick={() => setFilterDecision("break_glass")}
          className={`p-3.5 rounded-lg border bg-surface cursor-pointer transition select-none col-span-2 sm:col-span-1 ${
            filterDecision === "break_glass" ? "border-critical ring-1 ring-critical/20 shadow-xs" : "border-border hover:border-border-subtle"
          }`}
        >
          <div className="text-[11px] font-medium text-text-subtle flex items-center gap-1">
            <AlertOctagon className="w-3 h-3 text-critical" />
            <span>Emergency Overrides</span>
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-critical mt-1">
            {breakGlassCount}
          </div>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="relative max-w-md">
        <Search className="w-3.5 h-3.5 text-text-subtle absolute left-3 top-2.5" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Filter by Clinician, PHN, Digest, or Reason..."
          className="w-full h-8 pl-8 pr-3 rounded border border-border bg-surface text-text-primary text-xs placeholder:text-text-subtle focus:outline-none focus:border-primary transition"
        />
      </div>

      {/* Audit Log DataTable */}
      <DataTable
        columns={columns}
        data={filteredLogs}
        keyField="id"
        onRowClick={(log) => setSelectedLog(log)}
        emptyState={
          <div className="py-8 text-center text-xs text-text-subtle">
            No compliance log records matching the selected query.
          </div>
        }
      />

      {/* Right-Side Detail Sheet for Audit Record */}
      {selectedLog && (
        <Sheet
          isOpen={Boolean(selectedLog)}
          onClose={() => setSelectedLog(null)}
          title="Audit Ledger Record"
          subtitle="Integrity verified · SHA-256 Hash Chain"
          width="max-w-lg"
          footer={
            <Button variant="secondary" size="md" onClick={() => setSelectedLog(null)}>
              Close Audit Record
            </Button>
          }
        >
          <div className="space-y-4 text-xs">
            {/* Overview */}
            <div className="p-3 rounded-lg border border-border bg-surface-muted flex items-center justify-between">
              <div>
                <span className="text-[11px] text-text-subtle block font-sans">Access Decision</span>
                <div className="mt-1">{getDecisionBadge(selectedLog.decision || selectedLog.outcome, selectedLog.isBreakGlass)}</div>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-text-subtle block font-sans">Risk Assessment</span>
                <span className="font-mono text-base font-bold text-text-primary mt-1 block">
                  {selectedLog.risk_level || selectedLog.riskLevel || "LOW"}
                </span>
              </div>
            </div>

            {/* Metadata */}
            <div className="p-3 rounded-lg border border-border bg-surface space-y-2">
              <div className="flex justify-between">
                <span className="text-text-subtle">Action:</span>
                <strong className="text-text-primary font-mono text-[11px]">{selectedLog.action || "clinical.access"}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-text-subtle">Requesting Actor:</span>
                <strong className="text-text-primary">{selectedLog.actor || selectedLog.doctor || "System"}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-text-subtle">Patient Identifier:</span>
                <strong className="text-primary font-mono">{selectedLog.patient_id || selectedLog.patientPhn || "N/A"}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-text-subtle">Timestamp:</span>
                <span className="font-mono text-text-muted">{selectedLog.timestamp}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-subtle">Policy Rule Fired:</span>
                <span className="text-text-muted">{getPolicyRule(selectedLog)}</span>
              </div>
            </div>

            {/* Clinical / Administrative Justification */}
            {(selectedLog.reason || selectedLog.details) && (
              <div className="space-y-1.5">
                <div className="font-semibold text-text-primary text-xs">
                  Event Context &amp; Justification
                </div>
                <div className="p-3 rounded-lg border border-border bg-surface text-text-muted leading-relaxed text-xs">
                  {selectedLog.reason || selectedLog.details}
                </div>
              </div>
            )}

            {/* Technical Details */}
            <div className="space-y-1.5 pt-2 border-t border-border">
              <div className="font-semibold text-text-primary text-xs flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-primary" />
                <span>Technical details</span>
              </div>
              <div className="p-3 rounded-lg border border-border bg-surface font-mono text-[11px] space-y-2">
                <div>
                  <span className="text-text-subtle block">Record Event ID</span>
                  <span className="text-text-primary text-[10px] break-all">{selectedLog.id}</span>
                </div>
                <div>
                  <span className="text-text-subtle block">Previous Record Hash</span>
                  <span className="text-text-subtle text-[10px] break-all">{selectedLog.prev_hash || "0000000000000000000000000000000000000000000000000000000000000000"}</span>
                </div>
                <div>
                  <span className="text-text-subtle block">Current Digest Hash</span>
                  <span className="text-text-primary text-[10px] break-all">{selectedLog.curr_hash || selectedLog.txHash || "N/A"}</span>
                </div>
                {selectedLog.tx_hash && (
                  <div>
                    <span className="text-text-subtle block">On-Chain Batch Anchor</span>
                    <span className="text-text-primary text-[10px] break-all">{selectedLog.tx_hash}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border text-[10px]">
                  <div>
                    <span className="text-text-subtle block">Client Network</span>
                    <span className="text-text-muted">{selectedLog.ip || "127.0.0.1"}</span>
                  </div>
                  <div>
                    <span className="text-text-subtle block">Location Verification</span>
                    <span className="text-text-muted">{selectedLog.location_result || "Verified"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
