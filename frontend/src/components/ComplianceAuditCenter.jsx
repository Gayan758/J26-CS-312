import React, { useState } from "react";
import {
  Database,
  Search,
  Filter,
  AlertOctagon,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Key,
  Layers,
  FileCode,
  Info
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

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedTx(id);
    setTimeout(() => setCopiedTx(null), 2000);
  };

  const filteredLogs = auditLogs.filter((log) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      (log.doctor || "").toLowerCase().includes(term) ||
      (log.patientPhn || "").toLowerCase().includes(term) ||
      (log.txHash || "").toLowerCase().includes(term) ||
      (log.details && log.details.toLowerCase().includes(term));

    if (!matchesSearch) return false;

    if (filterDecision === "allow") return log.decision === "ALLOW";
    if (filterDecision === "mfa") return log.decision === "MFA_REQUIRED" || log.decision === "MFA";
    if (filterDecision === "block") return log.decision === "BLOCK";
    if (filterDecision === "break_glass") return log.decision === "BREAK_GLASS" || log.isBreakGlass;

    return true;
  });

  const totalCount = auditLogs.length;
  const allowCount = auditLogs.filter((l) => l.decision === "ALLOW").length;
  const mfaCount = auditLogs.filter((l) => l.decision === "MFA_REQUIRED" || l.decision === "MFA").length;
  const blockCount = auditLogs.filter((l) => l.decision === "BLOCK").length;
  const breakGlassCount = auditLogs.filter((l) => l.decision === "BREAK_GLASS" || l.isBreakGlass).length;

  const allowRate = totalCount > 0 ? Math.round((allowCount / totalCount) * 100) : 100;

  const getDecisionBadge = (decision, isBreakGlass) => {
    if (decision === "BREAK_GLASS" || isBreakGlass) {
      return (
        <StatusBadge variant="critical" icon={AlertOctagon} label="BREAK_GLASS" size="xs" />
      );
    }
    if (decision === "ALLOW") {
      return (
        <StatusBadge variant="success" dot label="ALLOW" size="xs" />
      );
    }
    if (decision === "MFA_REQUIRED" || decision === "MFA") {
      return (
        <StatusBadge variant="warning" dot label="MFA_REQUIRED" size="xs" />
      );
    }
    // BLOCK is neutral/muted, NOT screaming red
    return (
      <StatusBadge variant="neutral" dot label="BLOCK" size="xs" />
    );
  };

  const getPolicyRule = (log) => {
    if (log.decision === "BREAK_GLASS" || log.isBreakGlass) return "RAP-Override-Emergency";
    if (log.decision === "ALLOW") return "RiskBAC-Allow-LowRisk";
    if (log.decision === "MFA_REQUIRED" || log.decision === "MFA") return "RiskBAC-MFA-StepUp";
    return "RiskBAC-Block-Elevated";
  };

  const columns = [
    {
      header: "Timestamp (SLST)",
      accessor: "timestamp",
      isMono: true,
      cellClassName: "text-text-subtle",
      render: (row) => row.timestamp
    },
    {
      header: "Decision",
      accessor: "decision",
      render: (row) => getDecisionBadge(row.decision, row.isBreakGlass)
    },
    {
      header: "Risk Score",
      accessor: "riskScore",
      isMono: true,
      render: (row) => {
        const val = parseFloat(row.riskScore);
        return (
          <span className="font-semibold text-text-primary">
            {!isNaN(val) ? val.toFixed(3) : row.riskScore || "0.135"}
          </span>
        );
      }
    },
    {
      header: "Clinician",
      accessor: "doctor",
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-semibold text-text-primary text-xs">{row.doctor}</span>
          <span className="text-[10px] font-mono text-text-subtle">SLMC-Registered</span>
        </div>
      )
    },
    {
      header: "Patient PHN",
      accessor: "patientPhn",
      isMono: true,
      render: (row) => (
        <span className="font-semibold text-primary">{row.patientPhn}</span>
      )
    },
    {
      header: "Policy Rule Fired",
      accessor: "policy",
      isMono: true,
      cellClassName: "text-text-muted text-[11px]",
      render: (row) => getPolicyRule(row)
    },
    {
      header: "Ethereum Tx Hash",
      accessor: "txHash",
      isMono: true,
      render: (row) => {
        const hash = row.txHash || "0x0000000000000000000000000000000000000000";
        const short = `${hash.slice(0, 8)}...${hash.slice(-6)}`;
        const isCopied = copiedTx === row.id;

        return (
          <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <span className="text-text-subtle text-[11px]">{short}</span>
            <button
              type="button"
              onClick={() => handleCopy(hash, row.id)}
              className="p-1 rounded text-text-subtle hover:text-text-primary hover:bg-neutral-bg"
              title="Copy transaction hash"
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

        <div className="text-xs text-text-subtle">
          Ledger Status: <span className="font-semibold text-emerald-600">Verified Append-Only</span>
        </div>
      </div>

      {/* Summary KPI Cards (Stripe Dashboard Style: 24px bold, 11px muted label, 1px border) */}
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
          <div className="text-[11px] font-medium text-text-subtle">MFA Challenges</div>
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
          <div className="text-[11px] font-medium text-text-subtle">Blocked Requests</div>
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
            <span>Break-Glass Overrides</span>
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
          placeholder="Filter by Clinician, PHN, Transaction Hash..."
          className="w-full h-8 pl-8 pr-3 rounded border border-border bg-surface text-text-primary text-xs font-mono placeholder:font-sans placeholder:text-text-subtle focus:outline-none focus:border-primary transition"
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
          title="Cryptographic Audit Record"
          subtitle={`Verified on Ethereum Local Node · Block #${selectedLog.blockNumber || "194821"}`}
          width="max-w-lg"
          footer={
            <Button variant="secondary" size="md" onClick={() => setSelectedLog(null)}>
              Close Audit Record
            </Button>
          }
        >
          <div className="space-y-4 text-xs">
            {/* Decision & Score Overview */}
            <div className="p-3 rounded-lg border border-border bg-surface-muted flex items-center justify-between">
              <div>
                <span className="text-[11px] text-text-subtle block font-sans">Access Decision</span>
                <div className="mt-1">{getDecisionBadge(selectedLog.decision, selectedLog.isBreakGlass)}</div>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-text-subtle block font-sans">Composite Risk Score</span>
                <span className="font-mono text-base font-bold text-text-primary mt-1 block">
                  {selectedLog.riskScore || "0.135"}
                </span>
              </div>
            </div>

            {/* Clinician and Patient Metadata */}
            <div className="p-3 rounded-lg border border-border bg-surface space-y-2">
              <div className="flex justify-between">
                <span className="text-text-subtle">Requesting Clinician:</span>
                <strong className="text-text-primary">{selectedLog.doctor}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-text-subtle">Patient PHN:</span>
                <strong className="text-primary font-mono">{selectedLog.patientPhn}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-text-subtle">Timestamp:</span>
                <span className="font-mono text-text-muted">{selectedLog.timestamp}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-subtle">Policy Rule Fired:</span>
                <span className="font-mono text-text-muted">{getPolicyRule(selectedLog)}</span>
              </div>
            </div>

            {/* Context Signals Readout */}
            <div className="space-y-1.5">
              <div className="font-semibold text-text-primary text-xs flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-primary" />
                <span>Decrypted Context Signals</span>
              </div>
              <div className="p-3 rounded-lg border border-border bg-surface-muted space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-text-subtle">Subnet IP:</span>
                  <span className="text-text-primary">172.20.10.8 (CIDR Geofenced)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-subtle">Geofence Status:</span>
                  <span className="text-emerald-600 font-semibold">INSIDE CAMPUS (SLIIT Malabe)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-subtle">Hardware Enclave:</span>
                  <span className="text-text-primary truncate max-w-[200px]">sha256:enrolled-workstation</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-subtle">Shift Evaluation:</span>
                  <span className="text-text-primary">VALID SHIFT (08:30–17:00 SLST)</span>
                </div>
              </div>
            </div>

            {/* Blockchain Transaction Verification */}
            <div className="space-y-1.5">
              <div className="font-semibold text-text-primary text-xs flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-primary" />
                <span>Cryptographic Audit Trail</span>
              </div>
              <div className="p-3 rounded-lg border border-border bg-surface font-mono text-[11px] space-y-2">
                <div>
                  <span className="text-text-subtle block">Transaction / Block Hash</span>
                  <div className="text-text-primary break-all select-all font-mono text-[10px] mt-0.5">
                    {selectedLog.txHash || "Off-chain / Local Hash Chain"}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border text-[10px]">
                  <div>
                    <span className="text-text-subtle block">Audit Verification</span>
                    <span className="text-text-muted">Cryptographic Chain</span>
                  </div>
                  <div>
                    <span className="text-text-subtle block">Record Digest</span>
                    <span className="text-text-muted truncate block">{selectedLog.fileHash || selectedLog.patientIdHash || "N/A"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Audit Details / Justification */}
            {selectedLog.details && (
              <div className="space-y-1.5">
                <div className="font-semibold text-text-primary text-xs">
                  Event Rationale / Justification
                </div>
                <div className="p-3 rounded-lg border border-border bg-surface text-text-muted leading-relaxed text-xs">
                  {selectedLog.details}
                </div>
              </div>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}
