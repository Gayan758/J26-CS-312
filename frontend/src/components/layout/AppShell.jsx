import React, { useState, useEffect, useRef } from "react";
import {
  Shield,
  Activity,
  FileText,
  Database,
  Radio,
  Users,
  Clock,
  MapPin,
  Laptop,
  AlertOctagon,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Moon,
  Sun,
  Mail,
  CheckCircle2,
  AlertTriangle,
  Lock,
  ExternalLink,
  Info,
  X,
  Send
} from "lucide-react";
import Button from "../ui/Button";
import StatusBadge from "../ui/StatusBadge";

export default function AppShell({
  doctor,
  onLogout,
  contextStatus,
  deviceFingerprint,
  isDeviceTrusted,
  doctorLocation,
  breakGlassSession,
  onOpenBreakGlass,
  activeTab = "queue",
  onSelectTab,
  queueCount = 0,
  theme = "light",
  onToggleTheme,
  children
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [securityPopoverOpen, setSecurityPopoverOpen] = useState(false);
  const [showEmailConfig, setShowEmailConfig] = useState(false);

  // Email Config State
  const [currentEmail, setCurrentEmail] = useState(
    doctor?.email || `${doctor?.username || "doctor"}@sliit.lk`
  );
  const [inputEmail, setInputEmail] = useState(
    doctor?.email || `${doctor?.username || "doctor"}@sliit.lk`
  );
  const [emailMsg, setEmailMsg] = useState("");
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  const userMenuRef = useRef(null);
  const securityRef = useRef(null);

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
      if (securityRef.current && !securityRef.current.contains(e.target)) {
        setSecurityPopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSaveEmail = async (e) => {
    e.preventDefault();
    setIsSavingEmail(true);
    setEmailMsg("");
    try {
      const token = localStorage.getItem("medguard_doctor_token");
      const res = await fetch("/api/auth/update-email", {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          doctorId: doctor?.id || doctor?.ethereumAddress,
          email: inputEmail.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update email.");
      setCurrentEmail(inputEmail.trim());
      setEmailMsg(`✓ 2FA Email updated successfully.`);
    } catch (err) {
      setEmailMsg(`✗ ${err.message}`);
    } finally {
      setIsSavingEmail(false);
    }
  };

  const handleSendTestOtp = async () => {
    setIsSavingEmail(true);
    setEmailMsg("");
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
          doctorId: doctor?.id || doctor?.ethereumAddress,
          doctorName: doctor?.name,
          email: currentEmail,
          reason: "Manual 2FA Connectivity Verification Test",
          fingerprint: deviceFingerprint
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send test OTP.");
      setEmailMsg(`✓ Security 2FA OTP dispatched to registered inbox.`);
    } catch (err) {
      setEmailMsg(`✗ ${err.message}`);
    } finally {
      setIsSavingEmail(false);
    }
  };

  // Format helpers
  const timeString =
    contextStatus?.slstTime ||
    new Date().toLocaleTimeString("en-US", {
      timeZone: "Asia/Colombo",
      hour: "2-digit",
      minute: "2-digit"
    }) + " (SLST)";
  const isShiftValid =
    contextStatus?.inShift !== undefined ? contextStatus.inShift : true;
  const shiftText = isShiftValid
    ? "IN-SHIFT (08:30–17:00)"
    : "OUT-OF-SHIFT (08:30–17:00)";

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const truncatedFp = deviceFingerprint
    ? deviceFingerprint.startsWith("sha256:")
      ? deviceFingerprint.slice(7, 19) + "..."
      : deviceFingerprint.slice(0, 12) + "..."
    : "workstation-enclave";

  const getInitials = (name) => {
    if (!name) return "MD";
    const parts = name.replace("Dr. ", "").split(" ");
    return parts.length > 1
      ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  };

  const isAdmin = doctor?.role?.toLowerCase() === "admin";

  const navItems = isAdmin
    ? [
        {
          id: "users",
          label: "User Management & Access",
          icon: Users
        },
        {
          id: "audit",
          label: "Hospital Compliance Ledger",
          icon: Database
        },
        {
          id: "tracking",
          label: "Staff Safety & Location",
          icon: Radio,
          badgeDot: true
        }
      ]
    : [
        {
          id: "queue",
          label: "Clinic Queue & Triage",
          icon: Activity,
          badge: queueCount > 0 ? queueCount : null
        },
        {
          id: "chart",
          label: "Patient Chart (EMR)",
          icon: FileText
        },
        {
          id: "audit",
          label: "Hospital Compliance Ledger",
          icon: Database
        },
        {
          id: "tracking",
          label: "Staff Safety & Location",
          icon: Radio,
          badgeDot: true
        }
      ];

  const viewTitles = {
    users: "User Management & Access Governance",
    queue: "Clinic Queue & Triage",
    chart: "Patient Chart",
    audit: "Hospital Compliance Ledger",
    tracking: "Staff Safety & Real-Time Location"
  };

  return (
    <div className="min-h-screen flex bg-bg text-text-primary">
      {/* 1. LEFT SIDEBAR (240px Collapsible to 64px) */}
      <aside
        className={`bg-sidebar-bg text-sidebar-text flex flex-col justify-between shrink-0 transition-all duration-200 border-r border-sidebar-divider z-30 select-none ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        {/* Sidebar Header: Brand Mark */}
        <div>
          <div className="h-14 px-4 flex items-center justify-between border-b border-sidebar-divider">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-md bg-[#0B5FA5]/30 border border-[#0B5FA5]/60 flex items-center justify-center text-white shrink-0">
                <Shield className="w-4 h-4 text-[#38BDF8]" />
              </div>
              {!collapsed && (
                <div className="leading-tight truncate">
                  <div className="text-xs font-bold text-white tracking-wider">
                    MEDGUARD
                  </div>
                  <div className="text-[10px] text-sidebar-text font-medium tracking-tight">
                    CLINICAL EHR
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              className="p-1 rounded text-sidebar-text hover:text-white hover:bg-sidebar-hover-bg transition"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Navigation Items */}
          <nav className="p-2 space-y-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  title={collapsed ? item.label : undefined}
                  className={`w-full h-10 px-3 flex items-center gap-3 rounded-md text-xs font-medium transition-colors relative ${
                    isActive
                      ? "bg-sidebar-active-bg text-white font-semibold"
                      : "text-sidebar-text hover:text-white hover:bg-sidebar-hover-bg"
                  }`}
                >
                  {/* 3px Teal Active Bar */}
                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-accent rounded-r" />
                  )}

                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? "text-[#38BDF8]" : "text-sidebar-text"
                    } ${item.badgeDot ? "animate-pulse text-emerald-400" : ""}`}
                  />

                  {!collapsed && (
                    <span className="truncate flex-1 text-left">
                      {item.label}
                    </span>
                  )}

                  {!collapsed && item.badge !== undefined && item.badge !== null && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono tabular-nums bg-sidebar-hover-bg text-sidebar-text font-semibold border border-sidebar-divider">
                      {item.badge}
                    </span>
                  )}

                  {!collapsed && item.badgeDot && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer: Doctor User Block & Popover */}
        <div className="p-2 border-t border-sidebar-divider relative" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="w-full p-2 flex items-center gap-2.5 rounded-md hover:bg-sidebar-hover-bg transition text-left"
          >
            <div className="w-8 h-8 rounded-md bg-[#1B4470] border border-sidebar-divider text-white flex items-center justify-center text-xs font-semibold shrink-0">
              {getInitials(doctor?.name)}
            </div>

            {!collapsed && (
              <div className="flex-1 min-w-0 leading-tight">
                <div className="text-xs font-semibold text-white truncate">
                  {doctor?.name || "Clinician"}
                </div>
                <div className="text-[11px] text-sidebar-text truncate">
                  {doctor?.specialty || doctor?.role || "Staff Clinician"}
                </div>
              </div>
            )}

            {!collapsed && (
              <ChevronDown className="w-3.5 h-3.5 text-sidebar-text shrink-0" />
            )}
          </button>

          {/* User Popover Menu */}
          {userMenuOpen && (
            <div className="absolute bottom-16 left-2 w-56 rounded-md bg-surface border border-border shadow-xl py-1 z-50 text-text-primary text-xs divide-y divide-border-subtle animate-in fade-in duration-100">
              <div className="px-3 py-2 bg-surface-muted">
                <div className="font-semibold text-text-primary truncate">
                  {doctor?.name}
                </div>
                <div className="text-[11px] text-text-subtle font-mono mt-0.5">
                  SLMC: {doctor?.slmcNumber || "SLMC-38491"}
                </div>
                <div className="text-[10px] text-text-muted truncate mt-0.5">
                  {currentEmail}
                </div>
              </div>

              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    setShowEmailConfig(true);
                  }}
                  className="w-full px-3 py-1.5 flex items-center gap-2 text-text-muted hover:text-text-primary hover:bg-surface-muted transition text-left"
                >
                  <Mail className="w-3.5 h-3.5 text-primary" />
                  <span>2FA Email Settings</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onToggleTheme();
                    setUserMenuOpen(false);
                  }}
                  className="w-full px-3 py-1.5 flex items-center justify-between text-text-muted hover:text-text-primary hover:bg-surface-muted transition text-left"
                >
                  <div className="flex items-center gap-2">
                    {theme === "dark" ? (
                      <Sun className="w-3.5 h-3.5 text-amber-500" />
                    ) : (
                      <Moon className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span>Theme</span>
                  </div>
                  <span className="text-[11px] text-text-subtle capitalize">
                    {theme}
                  </span>
                </button>
              </div>

              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full px-3 py-1.5 flex items-center gap-2 text-critical hover:bg-critical-bg transition text-left"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* 2. MAIN APPLICATION CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* TOP BAR (56px) */}
        <header className="h-14 bg-surface border-b border-border px-6 flex items-center justify-between gap-4 shrink-0 z-20">
          {/* Left: Facility Breadcrumb */}
          <div className="flex items-center gap-2 text-xs truncate">
            <span className="text-text-subtle font-medium">
              SLIIT Malabe Campus Health Center
            </span>
            <span className="text-text-subtle">/</span>
            <span className="text-text-primary font-semibold">
              {viewTitles[activeTab] || "Clinical Workspace"}
            </span>
          </div>

          {/* Right: Real Signals, Security Popover, ER Break-Glass */}
          <div className="flex items-center gap-3">
            {/* Shift & Time Display (Plain Text) */}
            <div className="hidden md:flex items-center gap-2 text-xs font-mono tabular-nums text-text-muted px-2.5 py-1 rounded border border-border bg-surface-muted">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isShiftValid ? "bg-[#067647]" : "bg-[#B54708]"
                }`}
              />
              <span>{timeString}</span>
              <span className="text-text-subtle">·</span>
              <span className="font-semibold text-text-primary text-[11px]">
                {shiftText}
              </span>
            </div>

            {/* Session & Security Context Popover */}
            <div className="relative" ref={securityRef}>
              <button
                type="button"
                onClick={() => setSecurityPopoverOpen(!securityPopoverOpen)}
                className="h-8 px-2.5 rounded border border-border bg-surface hover:bg-surface-muted text-xs font-medium text-text-muted hover:text-text-primary flex items-center gap-1.5 transition"
                title="View context signals, hardware enclave trust, and network location"
              >
                <Lock className="w-3.5 h-3.5 text-primary" />
                <span className="hidden sm:inline">Session &amp; Security</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </button>

              {securityPopoverOpen && (
                <div className="absolute right-0 top-10 w-96 rounded-lg bg-surface border border-border shadow-2xl p-4 z-50 text-xs text-text-primary animate-in fade-in duration-100">
                  <div className="flex items-center justify-between pb-3 border-b border-border">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-primary" />
                      <span className="font-semibold">
                        Zero-Trust Context Verification
                      </span>
                    </div>
                    <StatusBadge
                      variant={isShiftValid && isDeviceTrusted ? "success" : "warning"}
                      label={isShiftValid && isDeviceTrusted ? "Verified" : "Warning"}
                      dot
                    />
                  </div>

                  <div className="mt-3 space-y-2.5">
                    {/* Signal 1: Hardware Enclave */}
                    <div className="p-2.5 rounded bg-surface-muted border border-border flex items-start gap-2.5">
                      <Laptop className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-text-primary">
                            Hardware Enclave Fingerprint
                          </span>
                          <span className="text-[10px] font-mono px-1 rounded bg-surface border border-border text-emerald-600 font-semibold">
                            {isDeviceTrusted ? "TRUSTED" : "UNENROLLED"}
                          </span>
                        </div>
                        <div className="font-mono text-[11px] text-text-subtle mt-0.5 truncate">
                          {deviceFingerprint || "sha256:enclave-workstation"}
                        </div>
                      </div>
                    </div>

                    {/* Signal 2: Geofenced Network & GPS */}
                    <div className="p-2.5 rounded bg-surface-muted border border-border flex items-start gap-2.5">
                      <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-text-primary">
                            Geofenced Location &amp; IP
                          </span>
                          <span className="text-[10px] font-mono px-1 rounded bg-surface border border-border text-emerald-600 font-semibold">
                            IN-CAMPUS
                          </span>
                        </div>
                        <div className="text-[11px] text-text-subtle mt-0.5">
                          {doctorLocation?.campusName || "SLIIT Malabe Campus Health Center"}
                        </div>
                        <div className="font-mono text-[10px] text-text-subtle mt-0.5">
                          IP: {contextStatus?.detectedIp || "172.20.10.8"} (CIDR Match) · Lat: {doctorLocation?.latitude?.toFixed(4) || "6.9147"}°
                        </div>
                      </div>
                    </div>

                    {/* Signal 3: 2FA Email Gateway */}
                    <div className="p-2.5 rounded bg-surface-muted border border-border flex items-start gap-2.5">
                      <Mail className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-text-primary">
                            Registered 2FA Email
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSecurityPopoverOpen(false);
                              setShowEmailConfig(true);
                            }}
                            className="text-[10px] text-primary hover:underline font-semibold"
                          >
                            Configure
                          </button>
                        </div>
                        <div className="font-mono text-[11px] text-text-subtle mt-0.5 truncate">
                          {currentEmail}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-[11px] text-text-subtle">
                    <span>Access Policy: Context Evaluated</span>
                    <button
                      type="button"
                      onClick={() => setSecurityPopoverOpen(false)}
                      className="text-text-primary font-medium hover:underline"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Action / Mode Status: Admin Console vs Emergency Break-Glass */}
            {isAdmin ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 text-xs font-semibold">
                <Shield className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span>ADMINISTRATOR CONSOLE</span>
              </div>
            ) : (
              <>
                {/* Active Break-Glass Countdown Timer Banner */}
                {breakGlassSession && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-critical-bg border border-critical text-critical text-xs font-mono font-bold animate-pulse">
                    <AlertOctagon className="w-3.5 h-3.5" />
                    <span>Emergency Access: {formatTimer(breakGlassSession.timeLeft)}</span>
                  </div>
                )}

                {/* Emergency Break-Glass Button */}
                <Button
                  variant="critical"
                  size="md"
                  icon={AlertOctagon}
                  onClick={onOpenBreakGlass}
                  title="Emergency medical record access override with verified audit logging"
                >
                  Emergency Break-Glass
                </Button>
              </>
            )}
          </div>
        </header>

        {/* MAIN WORKSPACE CONTENT */}
        <main className="flex-1 overflow-y-auto p-6 bg-bg">
          <div className="max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>

        {/* ENTERPRISE CLINICAL FOOTER */}
        <footer className="h-10 bg-surface border-t border-border px-6 flex items-center justify-between text-[11px] text-text-subtle shrink-0">
          <div className="flex items-center gap-3">
            <span>MedGuard EHR</span>
            <span>·</span>
            <span>Clinical Information System</span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 text-text-muted">
            <Lock className="w-3 h-3 text-text-subtle" />
            <span>Protected Health Information System</span>
          </div>
        </footer>
      </div>

      {/* 2FA EMAIL CONFIGURATION MODAL */}
      {showEmailConfig && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-surface w-full max-w-md rounded-lg border border-border shadow-2xl overflow-hidden flex flex-col">
            <div className="bg-surface-muted border-b border-border px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                <div>
                  <h3 className="text-xs font-semibold text-text-primary">
                    2FA Notification Gateway
                  </h3>
                  <p className="text-[11px] text-text-subtle">
                    Registered Clinician Email for Step-Up Verification
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEmailConfig(false);
                  setEmailMsg("");
                }}
                className="p-1 rounded text-text-subtle hover:text-text-primary hover:bg-neutral-bg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEmail} className="p-5 flex flex-col gap-4 text-xs">
              <div>
                <label className="font-semibold text-text-primary block mb-1.5">
                  Notification Email Address
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-text-subtle absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    value={inputEmail}
                    onChange={(e) => setInputEmail(e.target.value)}
                    placeholder="doctor@hospital.lk"
                    className="w-full pl-9 pr-3 py-2 rounded border border-border bg-surface text-text-primary text-xs font-mono focus:outline-none focus:border-primary transition"
                  />
                </div>
                <p className="text-[11px] text-text-muted mt-1 leading-normal">
                  When RiskBAC detects elevated context risk, single-use 6-digit OTP codes are dispatched to this address.
                </p>
              </div>

              {emailMsg && (
                <div
                  className={`p-2.5 rounded text-xs border ${
                    emailMsg.startsWith("✓")
                      ? "bg-success-bg text-success border-success-border"
                      : "bg-critical-bg text-critical border-critical-border"
                  }`}
                >
                  {emailMsg}
                </div>
              )}

              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  loading={isSavingEmail}
                  className="flex-1"
                >
                  Save Email Address
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  icon={Send}
                  loading={isSavingEmail}
                  onClick={handleSendTestOtp}
                >
                  Send Test OTP
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
