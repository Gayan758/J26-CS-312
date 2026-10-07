import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Filter,
  RefreshCw,
  UserPlus,
  AlertOctagon,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  UserX,
  SlidersHorizontal,
  ChevronRight,
  HeartPulse
} from "lucide-react";
import Button from "./ui/Button";
import StatusBadge from "./ui/StatusBadge";
import DataTable from "./ui/DataTable";
import EmptyState from "./ui/EmptyState";

export default function ClinicQueue({
  patients = [],
  onOpenChart,
  onOpenBreakGlass,
  onOpenAdmissions,
  onRefreshQueue
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all"); // "all" | "er_trauma" | "outpatient"
  const [isCompact, setIsCompact] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const searchInputRef = useRef(null);

  // Keyboard shortcut: '/' focuses search input
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    if (onRefreshQueue) onRefreshQueue();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Filter logic (Section 6.3: All / ER Trauma / Outpatient)
  const filteredPatients = patients.filter((p) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      (p.name || "").toLowerCase().includes(term) ||
      (p.phn || "").toLowerCase().includes(term) ||
      (p.nic || "").toLowerCase().includes(term) ||
      (p.department || "").toLowerCase().includes(term) ||
      (p.chronicConditions || []).some((c) => c.toLowerCase().includes(term));

    if (!matchesSearch) return false;

    if (filterType === "er_trauma") {
      return p.statusType === "emergency";
    }
    if (filterType === "outpatient") {
      return p.statusType !== "emergency";
    }
    return true;
  });

  const erTraumaCount = patients.filter((p) => p.statusType === "emergency").length;
  const outpatientCount = patients.filter((p) => p.statusType !== "emergency").length;

  // Compute patient age from DOB
  const calculateAge = (dobString) => {
    if (!dobString) return "--";
    const birthYear = parseInt(dobString.split("-")[0], 10);
    if (isNaN(birthYear)) return dobString;
    return `${new Date().getFullYear() - birthYear}y`;
  };

  // Columns for DataTable
  const columns = [
    {
      header: "Priority",
      accessor: "statusType",
      sortable: true,
      cellClassName: "w-28",
      render: (row) => {
        const isEmergency = row.statusType === "emergency";
        const isSpecialist = row.statusType === "specialist";

        if (isEmergency) {
          return (
            <StatusBadge variant="critical" dot label="Critical" size="xs" />
          );
        }
        if (isSpecialist) {
          return (
            <StatusBadge variant="warning" dot label="Specialist" size="xs" />
          );
        }
        return (
          <StatusBadge variant="neutral" label="Routine" size="xs" />
        );
      }
    },
    {
      header: "Patient",
      accessor: "name",
      sortable: true,
      render: (row) => {
        const age = calculateAge(row.dob);
        const sex = row.gender ? row.gender.charAt(0) : "U";
        return (
          <div className="flex flex-col min-w-0 py-0.5">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-text-primary text-xs hover:text-primary">
                {row.name}
              </span>
              <span className="text-[11px] text-text-subtle">
                {age} / {sex}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-text-subtle font-mono mt-0.5">
              <span>{row.phn}</span>
              {row.bloodGroup && (
                <span className="px-1 rounded bg-surface-muted border border-border text-[10px] text-text-muted font-semibold">
                  {row.bloodGroup}
                </span>
              )}
            </div>
          </div>
        );
      }
    },
    {
      header: "Location / Dept",
      accessor: "department",
      sortable: true,
      render: (row) => {
        const isEmergency = row.statusType === "emergency";
        return (
          <div className="flex flex-col text-xs">
            <span className={`font-medium ${isEmergency ? "text-critical" : "text-text-primary"}`}>
              {row.department || "Outpatient"}
            </span>
            <span className="text-[11px] text-text-subtle font-mono">
              {row.room || "--"}
            </span>
          </div>
        );
      }
    },
    {
      header: "Chief Complaint / Diagnosis",
      accessor: "conditions",
      render: (row) => {
        const conditions = row.criticalAlert || row.chronicConditions?.join(", ") || row.chiefComplaint || "--";
        return (
          <div className="max-w-xs truncate text-xs text-text-muted" title={conditions}>
            {row.criticalAlert ? (
              <span className="text-critical font-medium">{row.criticalAlert}</span>
            ) : (
              <span>{conditions}</span>
            )}
          </div>
        );
      }
    },
    {
      header: "Vitals",
      accessor: "vitals",
      cellClassName: "tabular-nums font-mono text-xs",
      render: (row) => {
        if (!row.vitals || (!row.vitals.bp && !row.vitals.hr)) {
          return <span className="text-text-subtle">--</span>;
        }

        const bp = row.vitals.bp || "--";
        const hr = row.vitals.hr ? parseInt(row.vitals.hr, 10) : null;
        const spo2 = row.vitals.spo2 ? parseInt(row.vitals.spo2, 10) : null;

        const isHrAbnormal = hr && (hr > 115 || hr < 50);
        const isSpo2Abnormal = spo2 && spo2 < 93;

        return (
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-text-muted">BP {bp}</span>
            {hr && (
              <>
                <span>·</span>
                <span className={`inline-flex items-center gap-1 ${isHrAbnormal ? "text-critical font-semibold" : "text-text-muted"}`}>
                  {isHrAbnormal && <span className="w-1.5 h-1.5 rounded-full bg-critical shrink-0" />}
                  <span>HR {hr}</span>
                </span>
              </>
            )}
            {spo2 && (
              <>
                <span>·</span>
                <span className={`inline-flex items-center gap-1 ${isSpo2Abnormal ? "text-critical font-semibold" : "text-text-muted"}`}>
                  {isSpo2Abnormal && <span className="w-1.5 h-1.5 rounded-full bg-critical shrink-0" />}
                  <span>{spo2}%</span>
                </span>
              </>
            )}
          </div>
        );
      }
    },
    {
      header: "Consent",
      accessor: "consentedDoctors",
      render: (row) => {
        const hasConsent = row.consentedDoctors && row.consentedDoctors.length > 0;
        if (hasConsent) {
          return (
            <StatusBadge variant="success" dot label="Verified" size="xs" />
          );
        }
        return (
          <StatusBadge variant="critical" dot label="No Consent (ER)" size="xs" />
        );
      }
    },
    {
      header: "Attending",
      accessor: "admittingDoctorName",
      render: (row) => (
        <span className="text-xs text-text-muted truncate max-w-[130px] block">
          {row.admittingDoctorName || (row.consentedDoctors && row.consentedDoctors[0]) || "Clinical Team"}
        </span>
      )
    },
    {
      header: "Actions",
      accessor: "actions",
      align: "right",
      render: (row) => {
        const isEmergency = row.statusType === "emergency";
        return (
          <div
            className="flex items-center justify-end gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {isEmergency && (
              <Button
                variant="critical"
                size="sm"
                icon={AlertOctagon}
                onClick={() => onOpenBreakGlass(row)}
                title="Emergency RAP Override"
              >
                ER Break-Glass
              </Button>
            )}

            <Button
              variant="secondary"
              size="sm"
              icon={ArrowRight}
              iconPosition="right"
              onClick={() => onOpenChart(row)}
            >
              Open Medical Record
            </Button>
          </div>
        );
      }
    }
  ];

  return (
    <div className="space-y-4">
      {/* Top Controls Bar: Search, Filter Tabs, Density Toggle, Actions */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Left: Search with Keyboard Shortcut Hint */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-text-subtle absolute left-3 top-2.5" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search patient, PHN, diagnosis... (Press / to focus)"
            className="w-full h-8 pl-8 pr-8 rounded border border-border bg-surface text-text-primary text-xs placeholder:text-text-subtle focus:outline-none focus:border-primary transition"
          />
          <kbd className="hidden sm:inline-flex items-center justify-center absolute right-2.5 top-2 px-1 rounded border border-border bg-surface-muted text-[10px] font-mono text-text-subtle pointer-events-none">
            /
          </kbd>
        </div>

        {/* Right: Segmented Filters, Density Toggle, Admit Button */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Segmented Filter Control */}
          {/* Segmented Filter Control (Section 6.3: All / ER Trauma / Outpatient) */}
          <div className="inline-flex rounded border border-border bg-surface-muted p-0.5 text-xs select-none">
            <button
              type="button"
              onClick={() => setFilterType("all")}
              className={`px-2.5 py-1 rounded-xs font-medium transition ${
                filterType === "all"
                  ? "bg-surface text-text-primary font-semibold shadow-xs"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              All ({patients.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType("er_trauma")}
              className={`px-2.5 py-1 rounded-xs font-medium transition flex items-center gap-1.5 ${
                filterType === "er_trauma"
                  ? "bg-surface text-critical font-semibold shadow-xs"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-critical" />
              <span>ER Trauma ({erTraumaCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterType("outpatient")}
              className={`px-2.5 py-1 rounded-xs font-medium transition ${
                filterType === "outpatient"
                  ? "bg-surface text-text-primary font-semibold shadow-xs"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              Outpatient ({outpatientCount})
            </button>
          </div>

          {/* Density Toggle Button */}
          <button
            type="button"
            onClick={() => setIsCompact(!isCompact)}
            className={`h-8 px-2 rounded border border-border bg-surface text-xs text-text-muted hover:text-text-primary transition flex items-center gap-1 ${
              isCompact ? "border-primary text-primary" : ""
            }`}
            title={isCompact ? "Switch to standard row height (48px)" : "Switch to compact row height (40px)"}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{isCompact ? "Compact" : "Standard"}</span>
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={handleRefresh}
            className="h-8 w-8 rounded border border-border bg-surface text-text-muted hover:text-text-primary transition flex items-center justify-center"
            title="Refresh patient worklist"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`}
            />
          </button>

          {/* Admit New Patient Button */}
          <Button
            variant="primary"
            size="md"
            icon={UserPlus}
            onClick={onOpenAdmissions}
          >
            Admit Patient
          </Button>
        </div>
      </div>

      {/* Main Epic-Style Clinical Worklist Table */}
      <DataTable
        columns={columns}
        data={filteredPatients}
        keyField="id"
        compact={isCompact}
        onRowClick={(patient) => onOpenChart(patient)}
        emptyState={
          <EmptyState
            icon={HeartPulse}
            title="No matching patients in queue"
            description="Try clearing search filters or admit a new patient into your clinical queue."
            actionLabel="Admit New Patient"
            onAction={onOpenAdmissions}
          />
        }
      />

      {/* Keyboard navigation hints */}
      <div className="flex items-center justify-between text-[11px] text-text-subtle pt-1 px-1">
        <div className="flex items-center gap-2">
          <span>Navigate:</span>
          <kbd className="px-1 py-0.5 rounded border border-border bg-surface font-mono">↑</kbd>
          <kbd className="px-1 py-0.5 rounded border border-border bg-surface font-mono">↓</kbd>
          <span>Select:</span>
          <kbd className="px-1 py-0.5 rounded border border-border bg-surface font-mono">Enter</kbd>
        </div>
        <div>
          Showing {filteredPatients.length} of {patients.length} active patients
        </div>
      </div>
    </div>
  );
}
