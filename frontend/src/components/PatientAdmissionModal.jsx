import React, { useState } from "react";
import Sheet from "./ui/Sheet";
import Button from "./ui/Button";
import { UserPlus, AlertCircle } from "lucide-react";

export default function PatientAdmissionModal({ doctor, onClose, onAdmitted }) {
  const [name, setName] = useState("");
  const [nic, setNic] = useState("");
  const [gender, setGender] = useState("Male");
  const [dob, setDob] = useState("");
  const [bloodGroup, setBloodGroup] = useState("O+");
  const [department, setDepartment] = useState("Outpatient General OPD");
  const [conditions, setConditions] = useState("");
  const [allergies, setAllergies] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    const randomPhnNumber = Math.floor(100000 + Math.random() * 900000);
    const newPatient = {
      id: `patient-${Date.now()}`,
      phn: `PHN-${randomPhnNumber}`,
      nic: nic.trim(),
      name: name.trim(),
      gender,
      dob,
      bloodGroup,
      department,
      statusType: department.includes("Trauma") ? "emergency" : "routine",
      assignedDoctorIds: doctor?.id ? [doctor.id] : [],
      assignedDoctorAddresses: doctor?.ethereumAddress ? [doctor.ethereumAddress] : [],
      consentedDoctors: doctor?.name ? [doctor.name] : [],
      admittingDoctorId: doctor?.id || "",
      admittingDoctorAddress: doctor?.ethereumAddress || "",
      admittingDoctorName: doctor?.name || "",
      granularPermissions: {
        vitals: { view: true, modify: true },
        soap: { view: true, modify: true },
        prescriptions: { view: true, modify: true },
        labs: { view: true, modify: true },
        sensitiveRecords: { view: false, modify: false }
      },
      chronicConditions: conditions ? conditions.split(",").map((c) => c.trim()) : [],
      allergies: allergies ? allergies.split(",").map((a) => a.trim()) : [],
      criticalAlert: allergies.toLowerCase().includes("penicillin")
        ? "CRITICAL ALLERGY ALERT: Anaphylactic reaction to Penicillin documented."
        : "",
      vitals: {
        bp: "--/--",
        hr: null,
        rr: null,
        spo2: null,
        temp: "--",
        glucose: "--",
        recordedAt: "Admitted Today"
      },
      notesCount: 0,
      prescriptionsCount: 0,
      encounters: [],
      prescriptions: [],
      labs: []
    };

    // Synchronize to backend persistent EHR & IPFS
    const token = localStorage.getItem("medguard_doctor_token");
    fetch("/api/patients/admit", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        ...newPatient,
        admittingDoctorId: doctor.id,
        admittingDoctorAddress: doctor.ethereumAddress,
        admittingDoctorName: doctor.name
      })
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setIsSubmitting(false);
        if (data?.patient) {
          onAdmitted(data.patient);
        } else {
          onAdmitted(newPatient);
        }
      })
      .catch((err) => {
        setIsSubmitting(false);
        console.warn("Backend admit failed, using local patient:", err.message);
        onAdmitted(newPatient);
      });

    onClose();
  };

  const footerActions = (
    <>
      <Button variant="secondary" size="md" onClick={onClose}>
        Cancel
      </Button>
      <Button
        variant="primary"
        size="md"
        type="submit"
        loading={isSubmitting}
        onClick={handleSubmit}
        icon={UserPlus}
      >
        Complete Intake &amp; Assign
      </Button>
    </>
  );

  return (
    <Sheet
      isOpen={true}
      onClose={onClose}
      title="Clinical Patient Admission"
      subtitle="Intake registration for outpatient clinic or emergency trauma bay"
      footer={footerActions}
      width="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div>
          <label className="font-medium text-text-primary block mb-1">
            Full Legal Name <span className="text-critical">*</span>
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Rohitha Senaratne"
            className="w-full px-3 py-2 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary transition"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-medium text-text-primary block mb-1">
              National Identity Card (NIC)
            </label>
            <input
              type="text"
              value={nic}
              onChange={(e) => setNic(e.target.value)}
              placeholder="e.g. 198212409812"
              className="w-full px-3 py-2 rounded border border-border bg-surface text-text-primary font-mono focus:outline-none focus:border-primary transition"
            />
          </div>

          <div>
            <label className="font-medium text-text-primary block mb-1">
              Blood Group
            </label>
            <select
              value={bloodGroup}
              onChange={(e) => setBloodGroup(e.target.value)}
              className="w-full px-3 py-2 rounded border border-border bg-surface text-text-primary font-mono focus:outline-none focus:border-primary transition"
            >
              <option value="A+">A+</option>
              <option value="A-">A-</option>
              <option value="B+">B+</option>
              <option value="B-">B-</option>
              <option value="AB+">AB+</option>
              <option value="AB-">AB-</option>
              <option value="O+">O+</option>
              <option value="O-">O-</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-medium text-text-primary block mb-1">
              Biological Sex
            </label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="w-full px-3 py-2 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary transition"
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="font-medium text-text-primary block mb-1">
              Date of Birth
            </label>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full px-3 py-2 rounded border border-border bg-surface text-text-primary font-mono focus:outline-none focus:border-primary transition"
            />
          </div>
        </div>

        <div>
          <label className="font-medium text-text-primary block mb-1">
            Triage Department &amp; Location
          </label>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="w-full px-3 py-2 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary transition"
          >
            <option value="Outpatient General OPD (Room 1)">Outpatient General OPD (Room 1)</option>
            <option value="Cardiology Review Clinic (Room 3)">Cardiology Review Clinic (Room 3)</option>
            <option value="Nephrology Specialist Clinic">Nephrology Specialist Clinic</option>
            <option value="Emergency Trauma Bay 1 (Resuscitation)">Emergency Trauma Bay 1 (Resuscitation)</option>
          </select>
        </div>

        <div>
          <label className="font-medium text-text-primary block mb-1">
            Chronic Conditions / Primary Diagnosis
          </label>
          <input
            type="text"
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
            placeholder="e.g. Hypertension, Type 2 Diabetes"
            className="w-full px-3 py-2 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary transition"
          />
        </div>

        <div>
          <label className="font-medium text-text-primary block mb-1">
            Known Drug Allergies (comma-separated)
          </label>
          <input
            type="text"
            value={allergies}
            onChange={(e) => setAllergies(e.target.value)}
            placeholder="e.g. Penicillin, Sulfa drugs"
            className="w-full px-3 py-2 rounded border border-border bg-surface text-text-primary focus:outline-none focus:border-primary transition"
          />
        </div>

        <div className="p-3 rounded border border-border bg-surface-muted text-text-muted text-[11px] leading-relaxed">
          <div className="flex items-center gap-1.5 font-medium text-text-primary mb-1">
            <AlertCircle className="w-3.5 h-3.5 text-info" />
            <span>Consent &amp; Care Team Assignment</span>
          </div>
          Patient will be enrolled under your clinical credential (
          <span className="font-semibold text-text-primary">{doctor.name}</span>
          ) with baseline granular consent permissions seeded for immediate encounter documentation.
        </div>
      </form>
    </Sheet>
  );
}
