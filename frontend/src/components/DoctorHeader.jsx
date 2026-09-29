import React, { useState } from "react";
import {
  Shield,
  Clock,
  MapPin,
  Laptop,
  AlertOctagon,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Activity,
  FileText,
  Database,
  Radio,
  Mail,
  X
} from "lucide-react";

export default function DoctorHeader({
  doctor,
  onLogout,
  contextStatus,
  deviceFingerprint,
  isDeviceTrusted,
  doctorLocation,
  onOpenBreakGlass,
  breakGlassSession,
  activeTab = "queue",
  onSelectTab
}) {
  const [showEmailConfig, setShowEmailConfig] = useState(false);
  const [currentEmail, setCurrentEmail] = useState(doctor.email || `${doctor.username || "doctor"}@sliit.lk`);
  const [inputEmail, setInputEmail] = useState(doctor.email || `${doctor.username || "doctor"}@sliit.lk`);
  const [emailMsg, setEmailMsg] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const handleSaveEmail = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setEmailMsg("");
    try {
      const res = await fetch("/api/auth/update-email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorId: doctor.id || doctor.ethereumAddress,
          email: inputEmail.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update email.");
      setCurrentEmail(inputEmail.trim());
      setEmailMsg(`✓ 2FA Email updated! Test verification OTP dispatched to ${inputEmail.trim()}`);
    } catch (err) {
      setEmailMsg(`✗ ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTestOtp = async () => {
    setIsSaving(true);
    setEmailMsg("");
    try {
      const res = await fetch("/api/auth/send-2fa-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorId: doctor.id || doctor.ethereumAddress,
          doctorName: doctor.name,
          email: currentEmail,
          reason: "Manual 2FA Connectivity Verification Test",
          fingerprint: deviceFingerprint
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send test OTP.");
      setEmailMsg(`✓ Test 2FA OTP dispatched to ${currentEmail}! (Code: ${data.previewOtp || "Sent to inbox"})`);
    } catch (err) {
      setEmailMsg(`✗ ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Format shift time and status
  const timeString = contextStatus?.slstTime || new Date().toLocaleTimeString("en-US", { timeZone: "Asia/Colombo", hour: "2-digit", minute: "2-digit" }) + " (SLST)";
  const isShiftValid = contextStatus?.inShift !== undefined ? contextStatus.inShift : true;
  const shiftLabel = contextStatus?.shiftStatus || (isShiftValid ? "IN-SHIFT (08:30–17:00)" : "OUT-OF-SHIFT (08:30–17:00)");

  // Detected network & GPS location
  const locationName = doctorLocation?.campusName || contextStatus?.detectedLocation || "SLIIT Malabe Campus Health Center";
  const ipAddress = contextStatus?.detectedIp || "172.20.10.8";
  const isInside = doctorLocation?.isInsideCampus !== undefined
    ? doctorLocation.isInsideCampus
    : (contextStatus?.isLocationTrusted !== undefined ? contextStatus.isLocationTrusted : true);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const truncatedFp = deviceFingerprint
    ? (deviceFingerprint.startsWith("sha256:")
        ? deviceFingerprint.slice(0, 20) + "..."
        : deviceFingerprint.slice(0, 14) + "...")
    : "FP-Enclave-Workstation";

  return (
    <header className="bg-white border-b border-[#DCE8F0] sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
        
        {/* Left: Brand + Network Pill + Doctor Info */}
        <div className="flex items-center gap-3 min-w-[260px]">
          <div className="w-10 h-10 rounded-xl bg-[#E3F2FD] border border-[#5AA9E6]/40 flex items-center justify-center text-[#1E88E5] shadow-sm shrink-0">
            <Shield className="w-5 h-5 fill-[#5AA9E6]/20" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold font-outfit text-[#1F2937] tracking-tight">
                MedGuard EHR
              </h1>
              <span className="text-[10px] font-semibold font-mono px-2 py-0.5 rounded-full bg-[#E3F2FD] text-[#1E88E5] border border-[#5AA9E6]/30">
                SLIIT &amp; Seylan Network
              </span>
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="font-semibold text-[#1F2937]">{doctor.name}</span>
              <span>·</span>
              <span className="text-slate-500 truncate max-w-[150px]">{doctor.role || doctor.specialty}</span>
              {doctor.slmcNumber && (
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-semibold border border-slate-200">
                  {doctor.slmcNumber}
                </span>
              )}
              {/* 2FA Email Pill */}
              <button
                type="button"
                onClick={() => setShowEmailConfig(true)}
                className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold border border-blue-200 flex items-center gap-1 transition shrink-0 cursor-pointer"
                title="Click to view, test or change registered 2FA Email"
              >
                <Mail className="w-2.5 h-2.5 text-blue-600" />
                <span className="truncate max-w-[130px]">{currentEmail}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Center: Real Automated Detection Indicators (Read-Only Status Pills) */}
        <div className="hidden lg:flex items-center gap-3">
          
          {/* Signal 1: Server Clock & Shift Hours (Read-Only) */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F4F8FB] border border-[#DCE8F0]">
            <Clock className="w-3.5 h-3.5 text-[#5AA9E6] shrink-0" />
            <div className="text-left leading-tight">
              <div className="text-[11px] font-mono font-bold text-[#1F2937]">
                {timeString}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isShiftValid ? "bg-[#10B981] animate-pulse" : "bg-[#D97706]"}`} />
                <span className={`text-[9px] font-bold font-mono tracking-tight ${isShiftValid ? "text-[#10B981]" : "text-[#D97706]"}`}>
                  {shiftLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Signal 2: Auto-Detected Geofenced Location (Read-Only) */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F4F8FB] border border-[#DCE8F0]">
            <MapPin className="w-3.5 h-3.5 text-[#5AA9E6] shrink-0" />
            <div className="text-left leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-[#1F2937] truncate max-w-[190px]">
                  {locationName}
                </span>
                <span className={`text-[8px] font-mono px-1 py-0.2 rounded border uppercase font-bold ${
                  isInside
                    ? "bg-[#E6F7ED] text-[#10B981] border-[#66C28A]/30"
                    : "bg-[#FEE2E2] text-[#DC2626] border-[#DC2626]/30"
                }`}>
                  {isInside ? "In-Campus (Low)" : "Off-Campus (High Risk)"}
                </span>
              </div>
              <div className="text-[9px] font-mono text-slate-500 mt-0.5">
                {doctorLocation?.latitude ? (
                  <span>GPS: {doctorLocation.latitude.toFixed(4)}°, {doctorLocation.longitude.toFixed(4)}° · IP: {ipAddress}</span>
                ) : (
                  <span>IP: <span className="font-semibold text-slate-700">{ipAddress}</span> (Subnet Geofenced)</span>
                )}
              </div>
            </div>
          </div>

          {/* Signal 3: Hardware Enclave Fingerprint (Read-Only) */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F4F8FB] border border-[#DCE8F0]">
            <Laptop className="w-3.5 h-3.5 text-[#5AA9E6] shrink-0" />
            <div className="text-left leading-tight">
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-bold text-[#1F2937]">
                  Workstation Enclave
                </span>
                {isDeviceTrusted ? (
                  <CheckCircle2 className="w-3 h-3 text-[#10B981]" />
                ) : (
                  <AlertTriangle className="w-3 h-3 text-[#D97706]" />
                )}
              </div>
              <div className="text-[9px] font-mono text-slate-500 mt-0.5">
                FP: <span className="font-semibold text-slate-700">{truncatedFp}</span>
              </div>
            </div>
          </div>

        </div>

        {/* Right: Active Break-Glass Timer + ER Break-Glass (RAP) + Logout */}
        <div className="flex items-center gap-2.5">
          
          {/* Active Break-Glass Countdown Timer Banner */}
          {breakGlassSession && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FEE2E2] border border-[#DC2626]/40 text-[#DC2626] text-xs font-mono font-bold animate-pulse">
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>RAP Active: {formatTimer(breakGlassSession.timeLeft)}</span>
            </div>
          )}

          {/* ER Break-Glass (RAP) Button — Always Accessible in Emergency */}
          <button
            type="button"
            onClick={onOpenBreakGlass}
            className="px-3.5 py-2 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold font-outfit shadow-sm shadow-red-500/20 transition flex items-center gap-1.5 active:scale-95"
            title="Emergency Override: Bypasses RiskBAC with Immutable Blockchain Audit"
          >
            <AlertOctagon className="w-4 h-4" />
            <span>ER Break-Glass (RAP)</span>
          </button>

          {/* Logout Button */}
          <button
            type="button"
            onClick={onLogout}
            className="p-2 rounded-xl bg-[#F4F8FB] hover:bg-slate-200 text-slate-500 hover:text-[#1F2937] border border-[#DCE8F0] transition"
            title="Sign out of clinical session"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

      </div>

      {/* Sub-Header Navigation Bar */}
      <div className="border-t border-[#DCE8F0]/70 bg-[#FAFBFD]">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <nav className="flex items-center gap-1 -mb-px">
            <button
              type="button"
              onClick={() => onSelectTab && onSelectTab("queue")}
              className={`px-4 py-2 border-b-2 text-xs font-bold font-outfit flex items-center gap-2 transition ${
                activeTab === "queue"
                  ? "border-[#1E88E5] text-[#1E88E5] bg-[#E3F2FD]/40"
                  : "border-transparent text-slate-500 hover:text-[#1F2937] hover:border-slate-300"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Clinic Queue &amp; Triage</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectTab && onSelectTab("chart")}
              className={`px-4 py-2 border-b-2 text-xs font-bold font-outfit flex items-center gap-2 transition ${
                activeTab === "chart"
                  ? "border-[#1E88E5] text-[#1E88E5] bg-[#E3F2FD]/40"
                  : "border-transparent text-slate-500 hover:text-[#1F2937] hover:border-slate-300"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Patient Chart (EMR)</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectTab && onSelectTab("audit")}
              className={`px-4 py-2 border-b-2 text-xs font-bold font-outfit flex items-center gap-2 transition ${
                activeTab === "audit"
                  ? "border-[#1E88E5] text-[#1E88E5] bg-[#E3F2FD]/40"
                  : "border-transparent text-slate-500 hover:text-[#1F2937] hover:border-slate-300"
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Hospital Compliance Ledger</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectTab && onSelectTab("tracking")}
              className={`px-4 py-2 border-b-2 text-xs font-bold font-outfit flex items-center gap-2 transition ${
                activeTab === "tracking"
                  ? "border-[#1E88E5] text-[#1E88E5] bg-[#E3F2FD]/40"
                  : "border-transparent text-slate-500 hover:text-[#1F2937] hover:border-slate-300"
              }`}
            >
              <Radio className="w-3.5 h-3.5 text-[#10B981] animate-pulse" />
              <span>Staff Safety &amp; Location</span>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-[#E6F7ED] text-[#10B981] border border-[#66C28A]/30">
                Traccar
              </span>
            </button>
          </nav>

          {/* Architectural Separation Notice */}
          <div className="hidden md:flex items-center gap-2 text-[10px] font-mono text-slate-500 py-1.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-[#DCE8F0]">
              <Shield className="w-3 h-3 text-[#5AA9E6]" />
              <strong>RiskBAC:</strong> IP CIDR Match
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-[#DCE8F0]">
              <Radio className="w-3 h-3 text-[#10B981]" />
              <strong>Safety:</strong> Traccar GPS
            </span>
          </div>
        </div>
      </div>

      {/* 2FA Email Configuration Modal */}
      {showEmailConfig && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col">
            <div className="bg-[#0F172A] text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold font-outfit">2FA Email Settings</h3>
                  <p className="text-[11px] text-slate-400">Step-Up OTP Notification Gateway</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEmailConfig(false);
                  setEmailMsg("");
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEmail} className="p-5 flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Registered Clinician 2FA Email:
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={inputEmail}
                    onChange={(e) => setInputEmail(e.target.value)}
                    placeholder="e.g. yourname@hospital.lk"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono text-[#1F2937] focus:outline-none focus:border-blue-500 focus:bg-white transition"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  During RiskBAC step-up challenges or off-campus logins, a secure 6-digit OTP code is dispatched to this email.
                </p>
              </div>

              {emailMsg && (
                <div className={`p-3 rounded-xl text-xs font-medium ${
                  emailMsg.startsWith("✓")
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}>
                  {emailMsg}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold font-outfit shadow-sm transition disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save Email Address"}
                </button>

                <button
                  type="button"
                  onClick={handleSendTestOtp}
                  disabled={isSaving}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold font-outfit border border-slate-300 transition flex items-center gap-1.5"
                >
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  <span>Send Test OTP</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
