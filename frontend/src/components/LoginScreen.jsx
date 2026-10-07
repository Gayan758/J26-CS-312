import React, { useState, useEffect } from "react";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import {
  Shield,
  Lock,
  User,
  MapPin,
  CheckCircle2,
  Users,
  Building2,
  FileCheck,
  Stethoscope
} from "lucide-react";
import Button from "./ui/Button";

export default function LoginScreen({ onLoginSuccess, onPatientLogin }) {
  // Top-level Role Selection: "doctor" | "admin" | "patient"
  const [portalRole, setPortalRole] = useState("doctor");

  // Clinician Mode: "login" | "register"
  const [activeMode, setActiveMode] = useState("login");

  // Sign In Form State (unfilled by default)
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Clinician Registration Form State
  const [regName, setRegName] = useState("");
  const [regSlmc, setRegSlmc] = useState("");
  const [regSpecialty, setRegSpecialty] = useState("General Medicine");
  const [regCampus, setRegCampus] = useState("Main Hospital Facility");
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPhone, setRegPhone] = useState("");

  // Patient Login Form State
  const [patientIdentifier, setPatientIdentifier] = useState("");
  const [patientPassword, setPatientPassword] = useState("");

  // Real Geolocation (acquired strictly from browser API without hardcoded coordinates)
  const [deviceLocation, setDeviceLocation] = useState(null);

  // Real Device Trust: FingerprintJS visitorId
  const [deviceFingerprint, setDeviceFingerprint] = useState("");

  useEffect(() => {
    document.title = "Sign In · MedGuard EHR";
  }, []);

  // Initialize FingerprintJS visitorId
  useEffect(() => {
    let isMounted = true;
    async function initFingerprint() {
      try {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        if (isMounted && result?.visitorId) {
          setDeviceFingerprint(result.visitorId);
        }
      } catch (_) {
        // Fallback gracefully if client blocks fingerprinting
      }
    }
    initFingerprint();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setDeviceLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy)
          });
        },
        () => {
          setDeviceLocation(null);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      );
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
          coordinates: deviceLocation,
          fingerprint: deviceFingerprint || undefined,
          deviceFingerprint: deviceFingerprint || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed. Please verify your credentials.");
      }

      setLoading(false);
      if (onLoginSuccess) {
        onLoginSuccess(data.doctor, data.locationInfo || deviceLocation);
      }
    } catch (err) {
      setLoading(false);
      setErrorMsg(err.message || "Unable to sign in. Please verify your username and password.");
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    if (!regName.trim() || !regUsername.trim() || !regPassword.trim() || !regEmail.trim()) {
      setErrorMsg("Full name, email address, username, and password are required.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: regName.trim(),
          email: regEmail.trim(),
          slmcNumber: regSlmc.trim(),
          specialty: regSpecialty,
          baseCampus: regCampus,
          username: regUsername.trim().toLowerCase(),
          password: regPassword,
          phone: regPhone.trim(),
          deviceFingerprint: deviceFingerprint || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Registration failed.");
      }

      setLoading(false);
      setSuccessMsg("Registration submitted successfully. You may now sign in with your credentials.");
      setUsername(regUsername.trim().toLowerCase());
      setPassword("");
      setActiveMode("login");
    } catch (err) {
      setLoading(false);
      setErrorMsg(err.message || "Failed to complete registration.");
    }
  };

  const handlePatientLoginSubmit = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    if (!patientIdentifier.trim()) {
      setErrorMsg("Please enter your Personal Health Number (PHN) or National Identity Card (NIC).");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/patient-login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: patientIdentifier.trim(),
          password: patientPassword
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Unable to authenticate with provided patient details.");
      }

      setLoading(false);
      if (onPatientLogin) {
        onPatientLogin(data.patient);
      }
    } catch (err) {
      setLoading(false);
      setErrorMsg(err.message || "Patient authentication failed.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-surface">
      {/* 1. LEFT 40% BRANDED NAVY PANEL */}
      <div className="w-full md:w-[40%] bg-sidebar-bg text-sidebar-text p-8 lg:p-12 flex flex-col justify-between border-r border-sidebar-divider">
        <div>
          {/* Logo & Product Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center text-white shrink-0">
              <Shield className="w-5 h-5 text-[#38BDF8]" />
            </div>
            <div>
              <div className="text-sm font-bold text-white tracking-wider">
                MEDGUARD EHR
              </div>
              <div className="text-[11px] text-sidebar-text font-medium">
                Clinical Information System
              </div>
            </div>
          </div>

          {/* Subtitle & Description */}
          <div className="mt-12 space-y-3">
            <h2 className="text-xl font-bold text-white tracking-tight leading-snug">
              Secure Clinical Information &amp; Patient Governance
            </h2>
            <p className="text-xs text-sidebar-text leading-relaxed">
              Authorized clinical personnel access, patient-directed consent management, emergency access protocols, and verified audit logging.
            </p>
          </div>

          {/* Governance Points */}
          <div className="mt-8 space-y-3 pt-6 border-t border-sidebar-divider text-xs">
            <div className="flex items-center gap-2.5 text-sidebar-text">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Role-based clinical access control</span>
            </div>
            <div className="flex items-center gap-2.5 text-sidebar-text">
              <FileCheck className="w-4 h-4 text-[#38BDF8] shrink-0" />
              <span>Patient-directed consent records</span>
            </div>
            <div className="flex items-center gap-2.5 text-sidebar-text">
              <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Emergency medical override protocols</span>
            </div>
            <div className="flex items-center gap-2.5 text-sidebar-text">
              <Shield className="w-4 h-4 text-purple-400 shrink-0" />
              <span>Tamper-evident access audit ledger</span>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="pt-8 border-t border-sidebar-divider text-[11px] text-sidebar-text flex items-center justify-between">
          <span>MedGuard Health IT</span>
          <span>Protected Health Information System</span>
        </div>
      </div>

      {/* 2. RIGHT 60% CLEAN FORM AREA */}
      <div className="w-full md:w-[60%] bg-surface p-8 lg:p-12 flex flex-col justify-center max-w-2xl mx-auto">
        {/* Portal Role Switcher Tabs */}
        <div className="flex items-center justify-between border-b border-border pb-3 mb-6">
          <div className="inline-flex rounded border border-border bg-surface-muted p-0.5 text-xs select-none">
            <button
              type="button"
              onClick={() => {
                setPortalRole("doctor");
                setErrorMsg("");
                setSuccessMsg("");
              }}
              className={`px-3 py-1.5 rounded-xs font-medium transition flex items-center gap-1.5 ${
                portalRole === "doctor"
                  ? "bg-surface text-text-primary font-semibold shadow-xs"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              <Stethoscope className="w-3.5 h-3.5 text-primary" />
              <span>Clinician</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPortalRole("admin");
                setErrorMsg("");
                setSuccessMsg("");
              }}
              className={`px-3 py-1.5 rounded-xs font-medium transition flex items-center gap-1.5 ${
                portalRole === "admin"
                  ? "bg-surface text-text-primary font-semibold shadow-xs"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-purple-600" />
              <span>Hospital Administrator</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPortalRole("patient");
                setErrorMsg("");
                setSuccessMsg("");
              }}
              className={`px-3 py-1.5 rounded-xs font-medium transition flex items-center gap-1.5 ${
                portalRole === "patient"
                  ? "bg-surface text-text-primary font-semibold shadow-xs"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              <Users className="w-3.5 h-3.5 text-emerald-600" />
              <span>Patient Portal</span>
            </button>
          </div>

          {portalRole === "doctor" && (
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setActiveMode(activeMode === "login" ? "register" : "login");
                  setErrorMsg("");
                  setSuccessMsg("");
                }}
                className="text-primary hover:underline font-medium"
              >
                {activeMode === "login" ? "Register as Clinician" : "Back to Sign In"}
              </button>
            </div>
          )}
        </div>

        {/* CLINICIAN SIGN IN FORM */}
        {portalRole === "doctor" && activeMode === "login" && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                Clinician Sign In
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Sign in with your registered institutional username and password
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4 text-xs">
              <div>
                <label className="font-medium text-text-primary block mb-1">
                  Username
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-text-subtle absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter username"
                    autoComplete="username"
                    className="w-full h-9 pl-9 pr-3 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary transition"
                  />
                </div>
              </div>

              <div>
                <label className="font-medium text-text-primary block mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-text-subtle absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    autoComplete="current-password"
                    className="w-full h-9 pl-9 pr-3 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary transition"
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded border border-critical-border bg-critical-bg text-critical text-xs font-medium">
                  {errorMsg}
                </div>
              )}

              {successMsg && (
                <div className="p-2.5 rounded border border-success-border bg-success-bg text-success text-xs font-medium">
                  {successMsg}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={loading}
                className="w-full mt-2"
              >
                Sign In to Clinical Workstation
              </Button>
            </form>
          </div>
        )}

        {/* CLINICIAN REGISTRATION FORM */}
        {portalRole === "doctor" && activeMode === "register" && (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                Clinician Registration
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Register a new medical practitioner profile for clinical access review
              </p>
            </div>

            <form onSubmit={handleRegister} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-text-primary block mb-1">
                    Full Name (with Title)
                  </label>
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Dr. Full Name"
                    className="w-full h-9 px-3 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary transition"
                  />
                </div>

                <div>
                  <label className="font-medium text-text-primary block mb-1">
                    Medical Council Number
                  </label>
                  <input
                    type="text"
                    value={regSlmc}
                    onChange={(e) => setRegSlmc(e.target.value)}
                    placeholder="Registration number"
                    className="w-full h-9 px-3 rounded border border-border bg-surface text-text-primary font-mono focus:outline-none focus:border-primary transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-text-primary block mb-1">
                    Specialty / Department
                  </label>
                  <input
                    type="text"
                    value={regSpecialty}
                    onChange={(e) => setRegSpecialty(e.target.value)}
                    className="w-full h-9 px-3 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary transition"
                  />
                </div>

                <div>
                  <label className="font-medium text-text-primary block mb-1">
                    Base Facility
                  </label>
                  <input
                    type="text"
                    value={regCampus}
                    onChange={(e) => setRegCampus(e.target.value)}
                    className="w-full h-9 px-3 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-text-primary block mb-1">
                    Institutional Email (for verification)
                  </label>
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="physician@hospital.lk"
                    className="w-full h-9 px-3 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary transition"
                  />
                </div>

                <div>
                  <label className="font-medium text-text-primary block mb-1">
                    Contact Phone Number
                  </label>
                  <input
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="+94 7X XXXXXXX"
                    className="w-full h-9 px-3 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-text-primary block mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    required
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder="e.g. physician.name"
                    className="w-full h-9 px-3 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary transition"
                  />
                </div>

                <div>
                  <label className="font-medium text-text-primary block mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Minimum 12 characters"
                    className="w-full h-9 px-3 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary transition"
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded border border-critical-border bg-critical-bg text-critical text-xs font-medium">
                  {errorMsg}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={loading}
                className="w-full mt-2"
              >
                Submit Clinician Registration
              </Button>
            </form>
          </div>
        )}

        {/* HOSPITAL ADMINISTRATOR SIGN IN FORM */}
        {portalRole === "admin" && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                Hospital Administrator Console
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Sign in to manage clinical personnel, review audit records, and maintain system configuration
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4 text-xs">
              <div>
                <label className="font-medium text-text-primary block mb-1">
                  Administrator Username
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-text-subtle absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter administrator username"
                    autoComplete="username"
                    className="w-full h-9 pl-9 pr-3 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary transition"
                  />
                </div>
              </div>

              <div>
                <label className="font-medium text-text-primary block mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-text-subtle absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    autoComplete="current-password"
                    className="w-full h-9 pl-9 pr-3 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary transition"
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded border border-critical-border bg-critical-bg text-critical text-xs font-medium">
                  {errorMsg}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={loading}
                className="w-full mt-2"
              >
                Sign In to Administration Console
              </Button>
            </form>
          </div>
        )}

        {/* PATIENT PORTAL SIGN IN FORM */}
        {portalRole === "patient" && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                Patient Consent Portal
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Sign in with your Personal Health Number (PHN) or National Identity Card (NIC) to manage your consent records
              </p>
            </div>

            <form onSubmit={handlePatientLoginSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-medium text-text-primary block mb-1">
                  Personal Health Number (PHN) or NIC
                </label>
                <input
                  type="text"
                  required
                  value={patientIdentifier}
                  onChange={(e) => setPatientIdentifier(e.target.value)}
                  placeholder="e.g. PHN-100234 or National ID"
                  className="w-full h-9 px-3 rounded border border-border bg-surface text-text-primary font-mono focus:outline-none focus:border-primary transition"
                />
              </div>

              <div>
                <label className="font-medium text-text-primary block mb-1">
                  Security Code or Password
                </label>
                <input
                  type="password"
                  value={patientPassword}
                  onChange={(e) => setPatientPassword(e.target.value)}
                  placeholder="Enter your portal security code"
                  className="w-full h-9 px-3 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary transition"
                />
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded border border-critical-border bg-critical-bg text-critical text-xs font-medium">
                  {errorMsg}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={loading}
                className="w-full mt-2"
                icon={Users}
              >
                Access Patient Portal
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
