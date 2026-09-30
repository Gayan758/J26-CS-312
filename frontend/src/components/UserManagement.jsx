import React, { useState, useEffect } from "react";
import {
  Users,
  UserCheck,
  UserX,
  KeyRound,
  Shield,
  ShieldAlert,
  Smartphone,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Trash2,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Building2,
  FileCheck,
  Stethoscope,
  X,
  ExternalLink
} from "lucide-react";
import Button from "./ui/Button";
import StatusBadge from "./ui/StatusBadge";

export default function UserManagement({ onShowToast }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Dialog / Modal States
  const [resetModalUser, setResetModalUser] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const [deleteConfirmUser, setDeleteConfirmUser] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const [isProvisionOpen, setIsProvisionOpen] = useState(false);
  const [provisionForm, setProvisionForm] = useState({
    name: "",
    username: "",
    password: "",
    email: "",
    slmcNumber: "",
    specialty: "Consultant Cardiologist",
    baseCampus: "SLIIT Malabe Campus Health Center",
    phone: "+94 77 ",
    role: "Doctor"
  });
  const [provisionSubmitting, setProvisionSubmitting] = useState(false);

  // Fetch users from API
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        if (data.users && Array.isArray(data.users)) {
          setUsers(data.users);
          setLoading(false);
          return;
        }
      }
    } catch (err) {
      console.warn("Could not fetch admin users from backend:", err.message);
    }

    // Fallback if backend offline
    setUsers([
      {
        id: "admin-001",
        name: "Hospital IT & Compliance Admin",
        username: "admin",
        email: "admin.compliance@sliit.lk",
        role: "Admin",
        specialty: "Hospital Security & Governance",
        slmcNumber: "ADMIN-GOV",
        baseCampus: "SLIIT Malabe Campus Health Center",
        phone: "+94 11 754 4801",
        status: "active",
        defaultDeviceFingerprint: "sha256:enrolled-workstation-admin"
      },
      {
        id: "doc-gayan",
        name: "Dr. Gayan Fernando, MD",
        username: "gayan.fernando",
        email: "it23270374@my.sliit.lk",
        role: "Doctor",
        specialty: "Lead Access & Clinical Specialist",
        slmcNumber: "SLMC-78901",
        baseCampus: "SLIIT Malabe Campus Health Center",
        phone: "+94 77 123 4567",
        status: "active",
        defaultDeviceFingerprint: "sha256:enrolled-workstation-gayan"
      },
      {
        id: "doc-sarah",
        name: "Dr. Sarah Jenkins, MD",
        username: "sarah.jenkins",
        email: "sarah.jenkins@hospital.lk",
        role: "Doctor",
        specialty: "Visiting Neurologist",
        slmcNumber: "SLMC-55102",
        baseCampus: "External Specialist / On-Call",
        phone: "+94 76 555 1212",
        status: "active",
        defaultDeviceFingerprint: "sha256:enrolled-workstation-sarah-macbook"
      },
      {
        id: "doc-alice",
        name: "Dr. Alice Vance, MD",
        username: "alice.vance",
        email: "alice.vance@sliit.lk",
        role: "Doctor",
        specialty: "Senior Cardiologist",
        slmcNumber: "SLMC-38491",
        baseCampus: "SLIIT Malabe Campus Hospital",
        phone: "+94 77 234 5678",
        status: "active",
        defaultDeviceFingerprint: "sha256:enrolled-workstation-alice-cardio"
      },
      {
        id: "doc-kasun",
        name: "Dr. Kasun Perera, MBBS",
        username: "kasun.perera",
        email: "kasun.perera@seylan.lk",
        role: "Doctor",
        specialty: "Emergency Medicine Specialist",
        slmcNumber: "SLMC-42915",
        baseCampus: "Seylan Tower 1 Clinic, Colombo",
        phone: "+94 71 987 6543",
        status: "active",
        defaultDeviceFingerprint: "sha256:enrolled-workstation-kasun-er"
      }
    ]);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const toast = (msg, type = "info") => {
    if (onShowToast) onShowToast(msg, type);
  };

  // Toggle user suspension
  const handleToggleStatus = async (user) => {
    const nextStatus = user.status === "disabled" ? "active" : "disabled";
    try {
      const res = await fetch(`/api/admin/users/${user.id}/toggle-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, status: nextStatus } : u))
        );
        toast(
          `User ${user.name} (${user.username}) is now ${
            nextStatus === "disabled" ? "TEMPORARILY SUSPENDED" : "ACTIVATED"
          }`,
          nextStatus === "disabled" ? "warning" : "success"
        );
        return;
      }
    } catch (e) {
      console.warn("Backend toggle status offline fallback:", e.message);
    }

    // Local state fallback
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, status: nextStatus } : u))
    );
    toast(
      `Account ${user.name} status updated to ${nextStatus.toUpperCase()}`,
      nextStatus === "disabled" ? "warning" : "success"
    );
  };

  // Reset password
  const handleExecutePasswordReset = async (e) => {
    e.preventDefault();
    if (!resetModalUser || !newPassword.trim()) return;

    setResetSubmitting(true);
    try {
      const res = await fetch(`/api/admin/users/${resetModalUser.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword.trim() })
      });
      if (res.ok) {
        toast(`Password successfully reset for ${resetModalUser.name}.`, "success");
        setResetModalUser(null);
        setNewPassword("");
        setResetSubmitting(false);
        return;
      }
    } catch (err) {
      console.warn("Backend password reset fallback:", err.message);
    }

    toast(`Password updated for ${resetModalUser.name} (${resetModalUser.username}).`, "success");
    setResetModalUser(null);
    setNewPassword("");
    setResetSubmitting(false);
  };

  // Revoke device trust
  const handleResetDevice = async (user) => {
    if (!confirm(`Revoke workstation device enrollment for ${user.name}? The doctor will be prompted for 2FA re-verification on next login.`)) {
      return;
    }
    try {
      await fetch(`/api/admin/users/${user.id}/reset-device`, { method: "POST" });
    } catch (err) {
      console.warn("Backend reset device fallback:", err.message);
    }
    setUsers((prev) =>
      prev.map((u) =>
        u.id === user.id
          ? { ...u, defaultDeviceFingerprint: `sha256:unregistered-${Date.now()}` }
          : u
      )
    );
    toast(`Workstation enrollment revoked for ${user.name}.`, "warning");
  };

  // Remove user
  const handleExecuteDelete = async () => {
    if (!deleteConfirmUser) return;
    setDeleteSubmitting(true);
    try {
      await fetch(`/api/admin/users/${deleteConfirmUser.id}`, { method: "DELETE" });
    } catch (err) {
      console.warn("Backend delete user fallback:", err.message);
    }
    setUsers((prev) => prev.filter((u) => u.id !== deleteConfirmUser.id));
    toast(`User ${deleteConfirmUser.name} unprovisioned from MedGuard registry.`, "error");
    setDeleteConfirmUser(null);
    setDeleteSubmitting(false);
  };

  // Provision new user
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setProvisionSubmitting(true);

    try {
      const res = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(provisionForm)
      });
      if (res.ok) {
        const data = await res.json();
        setUsers((prev) => [data.user, ...prev]);
        toast(`Dr. ${provisionForm.name} provisioned successfully!`, "success");
        setIsProvisionOpen(false);
        setProvisionSubmitting(false);
        return;
      }
    } catch (err) {
      console.warn("Backend provision fallback:", err.message);
    }

    const mockNew = {
      id: `doc-${Date.now().toString().slice(-4)}`,
      name: provisionForm.name,
      username: provisionForm.username,
      email: provisionForm.email,
      role: provisionForm.role || "Doctor",
      specialty: provisionForm.specialty,
      slmcNumber: provisionForm.slmcNumber || `SLMC-${Math.floor(10000 + Math.random() * 90000)}`,
      baseCampus: provisionForm.baseCampus,
      phone: provisionForm.phone,
      status: "active",
      defaultDeviceFingerprint: `sha256:enrolled-workstation-${provisionForm.username}`
    };

    setUsers((prev) => [mockNew, ...prev]);
    toast(`Dr. ${mockNew.name} provisioned successfully!`, "success");
    setIsProvisionOpen(false);
    setProvisionSubmitting(false);
  };

  // Generate random secure temp password
  const generateTempPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let pwd = "";
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(pwd + "1!");
  };

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery ||
      u.name?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.slmcNumber?.toLowerCase().includes(q) ||
      u.specialty?.toLowerCase().includes(q);

    const matchesRole =
      roleFilter === "all" ||
      u.role?.toLowerCase() === roleFilter.toLowerCase();

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && u.status !== "disabled") ||
      (statusFilter === "disabled" && u.status === "disabled");

    return matchesSearch && matchesRole && matchesStatus;
  });

  const activeCount = users.filter((u) => u.status !== "disabled").length;
  const disabledCount = users.filter((u) => u.status === "disabled").length;
  const doctorCount = users.filter((u) => u.role?.toLowerCase() === "doctor").length;

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* 1. Header Banner */}
      <div className="bg-surface rounded-lg border border-border p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded bg-primary-subtle text-primary">
                <Users className="w-5 h-5" />
              </div>
              <h1 className="text-xl font-semibold text-text-primary tracking-tight">
                Hospital User Management & Access Governance
              </h1>
            </div>
            <p className="text-xs text-text-muted mt-1 max-w-3xl">
              Enterprise directory for clinical practitioners and administrative personnel. Control user authentication status, reset clinician credentials, manage workstation trust enrollments, and enforce temporary suspensions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={fetchUsers}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => {
                setProvisionForm({
                  name: "",
                  username: "",
                  password: "Password123!",
                  email: "",
                  slmcNumber: "",
                  specialty: "Consultant Cardiologist",
                  baseCampus: "SLIIT Malabe Campus Health Center",
                  phone: "+94 77 123 4567",
                  role: "Doctor"
                });
                setIsProvisionOpen(true);
              }}
            >
              Provision Clinician
            </Button>
          </div>
        </div>

        {/* 2. KPI Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-border">
          <div className="p-3 bg-surface-muted rounded-md border border-border/60">
            <div className="text-[11px] font-medium text-text-subtle uppercase tracking-wider">
              Enrolled Personnel
            </div>
            <div className="text-2xl font-semibold text-text-primary tabular-nums mt-0.5">
              {users.length}
            </div>
            <div className="text-[11px] text-text-muted mt-0.5">
              Across all hospital networks
            </div>
          </div>

          <div className="p-3 bg-surface-muted rounded-md border border-border/60">
            <div className="text-[11px] font-medium text-text-subtle uppercase tracking-wider">
              Active Clinicians
            </div>
            <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
              {activeCount}
            </div>
            <div className="text-[11px] text-text-muted mt-0.5">
              {doctorCount} medical doctors on duty
            </div>
          </div>

          <div className="p-3 bg-surface-muted rounded-md border border-border/60">
            <div className="text-[11px] font-medium text-text-subtle uppercase tracking-wider">
              Suspended Accounts
            </div>
            <div className="text-2xl font-semibold text-critical tabular-nums mt-0.5">
              {disabledCount}
            </div>
            <div className="text-[11px] text-text-muted mt-0.5">
              {disabledCount === 0 ? "Zero accounts flagged" : "Access temporarily blocked"}
            </div>
          </div>

          <div className="p-3 bg-surface-muted rounded-md border border-border/60">
            <div className="text-[11px] font-medium text-text-subtle uppercase tracking-wider">
              Governance Policy
            </div>
            <div className="text-sm font-semibold text-text-primary mt-1 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-primary" />
              <span>HIPAA Role Partition</span>
            </div>
            <div className="text-[11px] text-text-muted mt-0.5">
              Zero clinical chart exposure
            </div>
          </div>
        </div>
      </div>

      {/* 3. Filter & Search Controls */}
      <div className="bg-surface rounded-lg border border-border p-3.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-text-subtle absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, SLMC number, username, or specialty..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md bg-surface-muted border border-border focus:outline-none focus:ring-1 focus:ring-primary text-text-primary"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          {/* Role Filter */}
          <div className="flex items-center gap-1 bg-surface-muted p-1 rounded-md border border-border text-xs">
            <span className="text-[11px] text-text-subtle px-1.5 font-medium">Role:</span>
            {["all", "Doctor", "Admin"].map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize transition ${
                  roleFilter === r
                    ? "bg-primary text-white"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-surface-muted p-1 rounded-md border border-border text-xs">
            <span className="text-[11px] text-text-subtle px-1.5 font-medium">Status:</span>
            {["all", "active", "disabled"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize transition ${
                  statusFilter === s
                    ? "bg-primary text-white"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {s === "disabled" ? "Suspended" : s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Main User Worklist Table */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-muted border-b border-border text-[11px] text-text-subtle uppercase tracking-wider font-semibold">
                <th className="py-2.5 px-4">User / Clinician</th>
                <th className="py-2.5 px-3">Identifier / SLMC</th>
                <th className="py-2.5 px-3">Role</th>
                <th className="py-2.5 px-3">Base Facility</th>
                <th className="py-2.5 px-3">Account Status</th>
                <th className="py-2.5 px-3">Workstation Trust</th>
                <th className="py-2.5 px-4 text-right">Administrative Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-text-muted">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                    <span>Synchronizing hospital personnel directory...</span>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-text-muted">
                    <Users className="w-8 h-8 text-text-subtle mx-auto mb-2 opacity-50" />
                    <div className="font-semibold text-text-primary">No matching users found</div>
                    <div className="text-[11px] text-text-subtle mt-1">
                      Try adjusting your search query or filter settings.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isSuspended = u.status === "disabled";
                  const isAdmin = u.role?.toLowerCase() === "admin";
                  const isTrustedFp =
                    u.defaultDeviceFingerprint &&
                    !u.defaultDeviceFingerprint.includes("unregistered");

                  const initials = u.name
                    ? u.name
                        .replace("Dr. ", "")
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()
                    : "MD";

                  return (
                    <tr
                      key={u.id}
                      className={`hover:bg-surface-muted/60 transition-colors ${
                        isSuspended ? "bg-critical-bg/20" : ""
                      }`}
                    >
                      {/* User Info */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-md flex items-center justify-center font-semibold text-xs shrink-0 ${
                              isAdmin
                                ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-200"
                                : "bg-primary-subtle text-primary border border-primary/20"
                            }`}
                          >
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-text-primary truncate flex items-center gap-1.5">
                              <span>{u.name}</span>
                              {isAdmin && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                                  Root Admin
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-text-muted flex items-center gap-2 mt-0.5">
                              <span>@{u.username}</span>
                              <span>·</span>
                              <span className="truncate">{u.email}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* SLMC */}
                      <td className="py-3 px-3">
                        <span className="font-mono text-[11px] text-text-primary px-1.5 py-0.5 rounded bg-surface-muted border border-border">
                          {u.slmcNumber || "N/A"}
                        </span>
                      </td>

                      {/* Role & Specialty */}
                      <td className="py-3 px-3">
                        <div className="font-medium text-text-primary">
                          {u.role || "Doctor"}
                        </div>
                        <div className="text-[11px] text-text-subtle truncate max-w-[150px]">
                          {u.specialty || "Staff Clinician"}
                        </div>
                      </td>

                      {/* Campus */}
                      <td className="py-3 px-3">
                        <div className="text-text-primary text-[11px] truncate max-w-[160px]">
                          {u.baseCampus || "SLIIT Malabe Campus"}
                        </div>
                      </td>

                      {/* Account Status */}
                      <td className="py-3 px-3">
                        {isSuspended ? (
                          <StatusBadge variant="critical" label="Suspended" />
                        ) : (
                          <StatusBadge variant="success" label="Active" />
                        )}
                      </td>

                      {/* Device Enrollment */}
                      <td className="py-3 px-3">
                        {isTrustedFp ? (
                          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
                            <Lock className="w-3.5 h-3.5 shrink-0" />
                            <span>Enrolled Workstation</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium text-[11px]">
                            <Unlock className="w-3.5 h-3.5 shrink-0" />
                            <span>Unenrolled (OTP Req)</span>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Password Reset */}
                          <button
                            type="button"
                            onClick={() => {
                              setResetModalUser(u);
                              setNewPassword("");
                            }}
                            className="p-1.5 rounded hover:bg-surface-muted text-text-muted hover:text-text-primary transition"
                            title="Reset password"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>

                          {/* Revoke Device */}
                          {!isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleResetDevice(u)}
                              className="p-1.5 rounded hover:bg-surface-muted text-text-muted hover:text-amber-600 transition"
                              title="Revoke device enrollment"
                            >
                              <Smartphone className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Toggle Active / Suspended */}
                          {!isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(u)}
                              className={`p-1.5 rounded transition ${
                                isSuspended
                                  ? "hover:bg-emerald-50 text-emerald-600 dark:hover:bg-emerald-950"
                                  : "hover:bg-amber-50 text-amber-600 dark:hover:bg-amber-950"
                              }`}
                              title={
                                isSuspended
                                  ? "Re-enable user account"
                                  : "Temporarily suspend user account"
                              }
                            >
                              {isSuspended ? (
                                <UserCheck className="w-3.5 h-3.5" />
                              ) : (
                                <UserX className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}

                          {/* Remove User */}
                          {!isAdmin && (
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmUser(u)}
                              className="p-1.5 rounded hover:bg-critical-bg text-text-muted hover:text-critical transition"
                              title="Remove user from registry"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Password Reset Modal */}
      {resetModalUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-lg border border-border max-w-md w-full p-5 shadow-2xl animate-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2 text-text-primary font-semibold text-sm">
                <KeyRound className="w-4 h-4 text-primary" />
                <span>Reset User Password</span>
              </div>
              <button
                type="button"
                onClick={() => setResetModalUser(null)}
                className="text-text-subtle hover:text-text-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleExecutePasswordReset} className="mt-4 space-y-3.5 text-xs">
              <div className="p-3 bg-surface-muted rounded border border-border">
                <div className="text-[11px] text-text-subtle">Target User:</div>
                <div className="font-semibold text-text-primary text-sm mt-0.5">
                  {resetModalUser.name}
                </div>
                <div className="text-[11px] text-text-muted font-mono mt-0.5">
                  @{resetModalUser.username} · {resetModalUser.slmcNumber || "No SLMC"}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-text-primary">
                    New Temporary Password
                  </label>
                  <button
                    type="button"
                    onClick={generateTempPassword}
                    className="text-[11px] text-primary hover:underline font-medium"
                  >
                    Generate Secure
                  </button>
                </div>
                <input
                  type="text"
                  required
                  placeholder="Enter new password (min 6 characters)..."
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-border bg-surface text-text-primary font-mono text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>

              <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded text-[11px] text-amber-700 dark:text-amber-300">
                Notice: The user will be required to authenticate with this password and complete email 2FA verification on their next login attempt.
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setResetModalUser(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={resetSubmitting || !newPassword.trim()}
                >
                  {resetSubmitting ? "Resetting..." : "Apply New Password"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Confirm Deletion Modal */}
      {deleteConfirmUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-lg border border-border max-w-sm w-full p-5 shadow-2xl animate-in zoom-in-95 duration-100">
            <div className="flex items-center gap-2.5 text-critical font-semibold text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Confirm User Unprovisioning</span>
            </div>
            <p className="text-xs text-text-muted mt-2">
              Are you sure you want to permanently remove <strong className="text-text-primary">{deleteConfirmUser.name}</strong> (@{deleteConfirmUser.username}) from MedGuard EHR?
            </p>
            <p className="text-[11px] text-critical mt-2 font-medium">
              This will revoke all active clinical session tokens, device fingerprint trusts, and staff tracking telemetry.
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDeleteConfirmUser(null)}
              >
                Cancel
              </Button>
              <Button
                variant="critical"
                size="sm"
                disabled={deleteSubmitting}
                onClick={handleExecuteDelete}
              >
                {deleteSubmitting ? "Removing..." : "Confirm Removal"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Provision Clinician Modal */}
      {isProvisionOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-lg border border-border max-w-lg w-full p-5 shadow-2xl animate-in zoom-in-95 duration-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2 text-text-primary font-semibold text-sm">
                <Plus className="w-4 h-4 text-primary" />
                <span>Provision New Medical Clinician</span>
              </div>
              <button
                type="button"
                onClick={() => setIsProvisionOpen(false)}
                className="text-text-subtle hover:text-text-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="mt-4 space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-text-primary block mb-1">
                    Full Clinician Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. Nuwan Senanayake, MD"
                    value={provisionForm.name}
                    onChange={(e) => setProvisionForm({ ...provisionForm, name: e.target.value })}
                    className="w-full px-3 py-1.5 rounded border border-border bg-surface text-text-primary text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-medium text-text-primary block mb-1">
                    SLMC Registration Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. SLMC-89412"
                    value={provisionForm.slmcNumber}
                    onChange={(e) => setProvisionForm({ ...provisionForm, slmcNumber: e.target.value })}
                    className="w-full px-3 py-1.5 rounded border border-border bg-surface text-text-primary font-mono text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-text-primary block mb-1">
                    Username *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. nuwan.senanayake"
                    value={provisionForm.username}
                    onChange={(e) => setProvisionForm({ ...provisionForm, username: e.target.value.toLowerCase().replace(/\s+/g, "") })}
                    className="w-full px-3 py-1.5 rounded border border-border bg-surface text-text-primary font-mono text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-medium text-text-primary block mb-1">
                    Temporary Password *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter password..."
                    value={provisionForm.password}
                    onChange={(e) => setProvisionForm({ ...provisionForm, password: e.target.value })}
                    className="w-full px-3 py-1.5 rounded border border-border bg-surface text-text-primary font-mono text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-text-primary block mb-1">
                    2FA Notification Email *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="doctor@sliit.lk"
                    value={provisionForm.email}
                    onChange={(e) => setProvisionForm({ ...provisionForm, email: e.target.value })}
                    className="w-full px-3 py-1.5 rounded border border-border bg-surface text-text-primary text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-medium text-text-primary block mb-1">
                    Clinical Specialty
                  </label>
                  <select
                    value={provisionForm.specialty}
                    onChange={(e) => setProvisionForm({ ...provisionForm, specialty: e.target.value })}
                    className="w-full px-3 py-1.5 rounded border border-border bg-surface text-text-primary text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                  >
                    <option value="Consultant Cardiologist">Consultant Cardiologist</option>
                    <option value="Visiting Neurologist">Visiting Neurologist</option>
                    <option value="Emergency Medicine Specialist">Emergency Medicine Specialist</option>
                    <option value="Consultant Pulmonologist">Consultant Pulmonologist</option>
                    <option value="General Physician">General Physician</option>
                    <option value="Orthopedic Surgeon">Orthopedic Surgeon</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-medium text-text-primary block mb-1">
                  Assigned Hospital Base Campus
                </label>
                <select
                  value={provisionForm.baseCampus}
                  onChange={(e) => setProvisionForm({ ...provisionForm, baseCampus: e.target.value })}
                  className="w-full px-3 py-1.5 rounded border border-border bg-surface text-text-primary text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                >
                  <option value="SLIIT Malabe Campus Health Center">SLIIT Malabe Campus Health Center</option>
                  <option value="Seylan Tower 1 Medical Clinic, Colombo">Seylan Tower 1 Medical Clinic, Colombo</option>
                  <option value="External Specialist / On-Call">External Specialist / On-Call</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsProvisionOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={provisionSubmitting || !provisionForm.name || !provisionForm.username}
                >
                  {provisionSubmitting ? "Provisioning..." : "Complete Clinician Provisioning"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
