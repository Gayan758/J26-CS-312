import React, { useState, useEffect } from "react";
import {
  Shield,
  Lock,
  User,
  ArrowRight,
  CheckCircle2,
  MapPin,
  LogIn,
  AlertTriangle,
  RefreshCw,
  Phone,
  Stethoscope,
  KeyRound,
  Users,
  Mail,
  Building2,
  FileCheck
} from "lucide-react";
import { MOCK_DOCTORS } from "../data/mockData";
import Button from "./ui/Button";
import StatusBadge from "./ui/StatusBadge";

const SLIIT_MALABE_LAT = 6.9147;
const SLIIT_MALABE_LON = 79.9733;

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371.0;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function LoginScreen({ onLoginSuccess, onPatientLogin }) {
  // Top-level Role Switcher: "doctor" | "patient"
  const [portalRole, setPortalRole] = useState("doctor");

  // Doctor Mode: "login" | "register"
  const [activeMode, setActiveMode] = useState("login");

  // Doctor Login Form State
  const [selectedPreset, setSelectedPreset] = useState(MOCK_DOCTORS[0]);
  const [username, setUsername] = useState(MOCK_DOCTORS[0].username);
  const [password, setPassword] = useState("Password123!");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Doctor Registration Form State
  const [regName, setRegName] = useState("");
  const [regSlmc, setRegSlmc] = useState("");
  const [regSpecialty, setRegSpecialty] = useState("Consultant Cardiologist");
  const [regCampus, setRegCampus] = useState("SLIIT Malabe Campus Health Center");
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPhone, setRegPhone] = useState("");

  // Patient Login Form State
  const [patientIdentifier, setPatientIdentifier] = useState("PHN-772910");
  const [patientAccounts, setPatientAccounts] = useState([
    { id: "patient-123", phn: "PHN-772910", nic: "198511204592", name: "John Doe", bloodGroup: "O+", assignedTo: "Dr. Alice Vance" },
    { id: "patient-789", phn: "PHN-553198", nic: "197412903341", name: "Priyantha Jayawardena", bloodGroup: "B+", assignedTo: "Dr. Sarah Jenkins" },
    { id: "patient-456", phn: "PHN-661902", nic: "199023401123", name: "Kusal Silva", bloodGroup: "A-", assignedTo: "Dr. Kasun Perera" },
    { id: "patient-321", phn: "PHN-442109", nic: "198810293847", name: "Rohitha Senaratne", bloodGroup: "AB+", assignedTo: "General OPD" }
  ]);

  // Real Geolocation
  const [deviceLocation, setDeviceLocation] = useState(null);
  const [locLoading, setLocLoading] = useState(false);
  const [locStatus, setLocStatus] = useState("idle");

  useEffect(() => {
    fetch("/api/auth/patient-accounts")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data) && data.length > 0) {
          setPatientAccounts(data);
        }
      })
      .catch(() => {});
  }, []);

  const acquireLocation = () => {
    if (!navigator.geolocation) {
      setLocStatus("error");
      return;
    }

    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const acc = pos.coords.accuracy;
        const distKm = haversineKm(SLIIT_MALABE_LAT, SLIIT_MALABE_LON, lat, lon);
        const isInside = distKm <= 0.40;

        setDeviceLocation({
          latitude: lat,
          longitude: lon,
          accuracy: Math.round(acc),
          distanceKm: parseFloat(distKm.toFixed(2)),
          isInsideCampus: isInside,
          campusName: isInside
            ? "SLIIT Malabe Campus Health Center"
            : `Outside SLIIT Malabe (${distKm.toFixed(2)} km)`
        });
        setLocStatus("acquired");
        setLocLoading(false);
      },
      (err) => {
        console.warn("Browser geolocation denied, using fallback:", err.message);
        setDeviceLocation({
          latitude: SLIIT_MALABE_LAT,
          longitude: SLIIT_MALABE_LON,
          accuracy: 10,
          distanceKm: 0.0,
          isInsideCampus: true,
          campusName: "SLIIT Malabe Campus Health Center"
        });
        setLocStatus("denied");
        setLocLoading(false);
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    acquireLocation();
  }, []);

  const handleSelectPreset = (doc) => {
    setSelectedPreset(doc);
    setUsername(doc.username);
    setPassword(doc.password || "Password123!");
    setErrorMsg("");
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          coordinates: deviceLocation
            ? {
                latitude: deviceLocation.latitude,
                longitude: deviceLocation.longitude,
                accuracy: deviceLocation.accuracy
              }
            : null,
          deviceFingerprint: selectedPreset?.defaultDeviceFingerprint || `sha256:enrolled-workstation-${username}`
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed. Please verify credentials.");
      }

      setLoading(false);
      if (onLoginSuccess) {
        onLoginSuccess(data.doctor, data.locationInfo || deviceLocation);
      }
    } catch (err) {
      setLoading(false);
      setErrorMsg(err.message);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    if (!regName.trim() || !regUsername.trim() || !regPassword.trim() || !regEmail.trim()) {
      setErrorMsg("Doctor Name, 2FA Email, Username, and Password are required.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: regName.trim(),
          email: regEmail.trim(),
          slmcNumber: regSlmc.trim() || `SLMC-${Math.floor(10000 + Math.random() * 90000)}`,
          specialty: regSpecialty,
          baseCampus: regCampus,
          username: regUsername.trim().toLowerCase(),
          password: regPassword,
          phone: regPhone.trim(),
          deviceFingerprint: `sha256:enrolled-workstation-${regUsername.trim().toLowerCase()}`
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Registration failed.");
      }

      setLoading(false);
      setSuccessMsg(`Dr. ${data.doctor.name} registered successfully! (SLMC: ${data.doctor.slmcNumber}). You may now sign in.`);
      setUsername(regUsername.trim().toLowerCase());
      setPassword(regPassword);
      setActiveMode("login");
    } catch (err) {
      setLoading(false);
      setErrorMsg(err.message);
    }
  };

  const handlePatientLoginSubmit = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    if (!patientIdentifier.trim()) {
      setErrorMsg("Please enter your Personal Health Number (PHN) or NIC.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/patient-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: patientIdentifier.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Patient login failed.");
      }

      setLoading(false);
      if (onPatientLogin) {
        onPatientLogin(data.patient);
      }
    } catch (err) {
      setLoading(false);
      setErrorMsg(err.message);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-surface">
      {/* 1. LEFT 45% BRANDED NAVY PANEL */}
      <div className="w-full md:w-[45%] bg-sidebar-bg text-sidebar-text p-8 lg:p-12 flex flex-col justify-between border-r border-sidebar-divider">
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

          {/* Subtitle & Value Proposition */}
          <div className="mt-12 space-y-4">
            <h2 className="text-xl font-bold text-white tracking-tight leading-snug">
              Zero-Trust Clinical Access Control &amp; Patient-Sovereign Consent
            </h2>
            <p className="text-xs text-sidebar-text leading-relaxed">
              Continuous RiskBAC contextual risk evaluation, automated 2FA step-up challenges, and cryptographically immutable audit trails on Ethereum.
            </p>
          </div>

          {/* Institutional Trust Badges */}
          <div className="mt-8 space-y-3 pt-6 border-t border-sidebar-divider text-xs">
            <div className="flex items-center gap-2.5 text-sidebar-text">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>National Digital Health Blueprint Aligned</span>
            </div>
            <div className="flex items-center gap-2.5 text-sidebar-text">
              <Building2 className="w-4 h-4 text-[#38BDF8] shrink-0" />
              <span>Seylan Clinical Network Node #04</span>
            </div>
            <div className="flex items-center gap-2.5 text-sidebar-text">
              <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
              <span>SLIIT Malabe Campus Clinical Perimeter</span>
            </div>
            <div className="flex items-center gap-2.5 text-sidebar-text">
              <FileCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>SLMC Medical Practitioner Registration Gate</span>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="pt-8 border-t border-sidebar-divider text-[11px] text-sidebar-text flex items-center justify-between">
          <span>Release 2026.09.29-prod</span>
          <span className="font-mono">Node 0x5FbD...aa</span>
        </div>
      </div>

      {/* 2. RIGHT 55% CLEAN FORM AREA */}
      <div className="w-full md:w-[55%] bg-surface p-8 lg:p-12 flex flex-col justify-center max-w-2xl mx-auto">
        {/* Portal Role Switcher Tabs */}
        <div className="flex items-center justify-between border-b border-border pb-3 mb-6">
          <div className="inline-flex rounded border border-border bg-surface-muted p-0.5 text-xs select-none">
            <button
              type="button"
              onClick={() => {
                setPortalRole("doctor");
                setErrorMsg("");
              }}
              className={`px-3 py-1.5 rounded-xs font-medium transition flex items-center gap-1.5 ${
                portalRole === "doctor"
                  ? "bg-surface text-text-primary font-semibold shadow-xs"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              <Stethoscope className="w-3.5 h-3.5" />
              <span>Clinician Sign In</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPortalRole("patient");
                setErrorMsg("");
              }}
              className={`px-3 py-1.5 rounded-xs font-medium transition flex items-center gap-1.5 ${
                portalRole === "patient"
                  ? "bg-surface text-text-primary font-semibold shadow-xs"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
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
                {activeMode === "login" ? "Register New Doctor" : "Back to Sign In"}
              </button>
            </div>
          )}
        </div>

        {/* CLINICIAN LOGIN FORM */}
        {portalRole === "doctor" && activeMode === "login" && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                Clinician Session Sign In
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Authenticate with institutional credentials and hardware enclave
              </p>
            </div>

            {/* Quick-Select Persona: 3-column segmented button */}
            <div>
              <label className="text-[11px] font-medium text-text-subtle block mb-1.5">
                Quick-Select Enrolled Clinician Persona:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {MOCK_DOCTORS.map((doc) => {
                  const isSelected = selectedPreset?.id === doc.id;
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => handleSelectPreset(doc)}
                      className={`p-2 rounded border text-left text-xs transition ${
                        isSelected
                          ? "border-primary bg-primary-subtle ring-1 ring-primary/20"
                          : "border-border bg-surface hover:bg-surface-muted"
                      }`}
                    >
                      <div className="font-semibold text-text-primary truncate">
                        {doc.name}
                      </div>
                      <div className="text-[10px] text-text-subtle truncate mt-0.5">
                        {doc.specialty || doc.role}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Login Form */}
            <form onSubmit={handleLogin} className="space-y-3.5 text-xs">
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
                    className="w-full h-9 pl-8 pr-3 rounded border border-border bg-surface text-text-primary font-mono focus:outline-none focus:border-primary transition"
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
                    className="w-full h-9 pl-8 pr-3 rounded border border-border bg-surface text-text-primary font-mono focus:outline-none focus:border-primary transition"
                  />
                </div>
              </div>

              {/* Geolocation Detection Card (Subtle technical readout) */}
              <div className="p-3 rounded border border-border bg-surface-muted text-[11px] font-mono space-y-1">
                <div className="flex items-center justify-between text-text-subtle">
                  <span>Context Geofence Detection</span>
                  <span className="text-emerald-600 font-semibold">
                    {deviceLocation?.isInsideCampus ? "IN-CAMPUS (LOW RISK)" : "OFF-CAMPUS"}
                  </span>
                </div>
                <div className="text-text-muted">
                  GPS: {deviceLocation?.latitude?.toFixed(4) || "6.9147"}°, {deviceLocation?.longitude?.toFixed(4) || "79.9733"}° · Subnet: 172.20.10.8
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
                className="w-full"
                icon={LogIn}
              >
                Sign In to Clinical Workspace
              </Button>
            </form>
          </div>
        )}

        {/* CLINICIAN REGISTRATION FORM */}
        {portalRole === "doctor" && activeMode === "register" && (
          <form onSubmit={handleRegister} className="space-y-3.5 text-xs">
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                Register Clinician Credential
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Enroll under Sri Lanka Medical Council (SLMC) institutional directory
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-medium text-text-primary block mb-1">
                  Full Name (with Dr. prefix) *
                </label>
                <input
                  type="text"
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="e.g. Dr. Priyantha Silva"
                  className="w-full px-3 py-2 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="font-medium text-text-primary block mb-1">
                  SLMC Registration Number
                </label>
                <input
                  type="text"
                  value={regSlmc}
                  onChange={(e) => setRegSlmc(e.target.value)}
                  placeholder="e.g. SLMC-48192"
                  className="w-full px-3 py-2 rounded border border-border bg-surface text-text-primary font-mono focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-medium text-text-primary block mb-1">
                  2FA Step-Up Notification Email *
                </label>
                <input
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="doctor@hospital.lk"
                  className="w-full px-3 py-2 rounded border border-border bg-surface text-text-primary font-mono focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="font-medium text-text-primary block mb-1">
                  Contact Mobile
                </label>
                <input
                  type="tel"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  placeholder="+94 77 123 4567"
                  className="w-full px-3 py-2 rounded border border-border bg-surface text-text-primary font-mono focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-medium text-text-primary block mb-1">
                  Clinical Specialty
                </label>
                <select
                  value={regSpecialty}
                  onChange={(e) => setRegSpecialty(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary"
                >
                  <option value="Consultant Cardiologist">Consultant Cardiologist</option>
                  <option value="Emergency Physician">Emergency Physician</option>
                  <option value="Consultant Neurologist">Consultant Neurologist</option>
                  <option value="General OPD Medical Officer">General OPD Medical Officer</option>
                </select>
              </div>

              <div>
                <label className="font-medium text-text-primary block mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  required
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="e.g. psilva"
                  className="w-full px-3 py-2 rounded border border-border bg-surface text-text-primary font-mono focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div>
              <label className="font-medium text-text-primary block mb-1">
                Password *
              </label>
              <input
                type="password"
                required
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3 py-2 rounded border border-border bg-surface text-text-primary font-mono focus:outline-none focus:border-primary"
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
              className="w-full"
            >
              Complete Registration &amp; Issue Enclave Credential
            </Button>
          </form>
        )}

        {/* PATIENT PORTAL LOGIN FORM */}
        {portalRole === "patient" && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                Patient Consent &amp; Record Portal
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Manage doctor authorizations and view encrypted health records
              </p>
            </div>

            {/* Quick-Select Patient Account */}
            <div>
              <label className="text-[11px] font-medium text-text-subtle block mb-1.5">
                Quick-Select Enrolled Patient:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {patientAccounts.map((pat) => (
                  <button
                    key={pat.id}
                    type="button"
                    onClick={() => setPatientIdentifier(pat.phn)}
                    className={`p-2.5 rounded border text-left text-xs transition ${
                      patientIdentifier === pat.phn
                        ? "border-primary bg-primary-subtle ring-1 ring-primary/20"
                        : "border-border bg-surface hover:bg-surface-muted"
                    }`}
                  >
                    <div className="font-semibold text-text-primary">
                      {pat.name}
                    </div>
                    <div className="text-[11px] font-mono text-text-subtle mt-0.5">
                      {pat.phn} · {pat.bloodGroup}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handlePatientLoginSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="font-medium text-text-primary block mb-1">
                  Personal Health Number (PHN) or NIC
                </label>
                <input
                  type="text"
                  required
                  value={patientIdentifier}
                  onChange={(e) => setPatientIdentifier(e.target.value)}
                  placeholder="e.g. PHN-772910"
                  className="w-full h-9 px-3 rounded border border-border bg-surface text-text-primary font-mono focus:outline-none focus:border-primary transition"
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
                className="w-full"
                icon={Users}
              >
                Access Patient Consent Portal
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
