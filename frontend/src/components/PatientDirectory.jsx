import React from "react";
import { User, Activity, AlertCircle, ShieldAlert, ArrowUpRight } from "lucide-react";

export const CLINICAL_PATIENTS = [
  {
    id: "patient-123",
    name: "John Doe",
    age: 44,
    gender: "Male",
    primaryCondition: "Type 2 Diabetes, Hypertension",
    sensitivity: "medium",
    consentStatus: "Valid Consent Active",
    bloodGroup: "A+"
  },
  {
    id: "patient-456",
    name: "Jane Trauma-Smith",
    age: 30,
    gender: "Female",
    primaryCondition: "Acute Intracranial Hemorrhage (ER Trauma)",
    sensitivity: "restricted",
    consentStatus: "Unconscious / Emergency Break-Glass Required",
    bloodGroup: "O-"
  },
  {
    id: "patient-789",
    name: "Kusal Silva",
    age: 28,
    gender: "Male",
    primaryCondition: "Routine Cardiology Checkup",
    sensitivity: "low",
    consentStatus: "Valid Consent Active",
    bloodGroup: "B+"
  }
];

export default function PatientDirectory({ selectedPatientId, onSelectPatient }) {
  const getSensitivityBadge = (sens) => {
    switch (sens) {
      case "low":
        return "bg-emerald-500/15 border-emerald-500/30 text-emerald-400";
      case "medium":
        return "bg-amber-500/15 border-amber-500/30 text-amber-400";
      case "restricted":
        return "bg-red-500/15 border-red-500/30 text-red-400 font-bold";
      default:
        return "bg-indigo-500/15 border-indigo-500/30 text-indigo-400";
    }
  };

  return (
    <div className="glass-card rounded-2xl p-5 border border-slate-800 flex flex-col gap-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-bold font-outfit text-white">Patient Record Directory</h3>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">3 Registered Patients</span>
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        {CLINICAL_PATIENTS.map((p) => {
          const isSelected = selectedPatientId === p.id;
          return (
            <div
              key={p.id}
              onClick={() => onSelectPatient(p)}
              className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                isSelected
                  ? "bg-indigo-600/15 border-indigo-500/50 shadow-md shadow-indigo-600/10"
                  : "bg-slate-900/50 border-slate-800 hover:bg-slate-850 hover:border-slate-700"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border ${
                  isSelected ? "bg-indigo-600 text-white border-indigo-400" : "bg-slate-900 text-slate-400 border-slate-800"
                }`}>
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{p.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">({p.id})</span>
                    <span className={`text-[9px] px-2 py-0.5 rounded-full border uppercase ${getSensitivityBadge(p.sensitivity)}`}>
                      {p.sensitivity}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">{p.primaryCondition}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-semibold px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300">
                  {p.bloodGroup}
                </span>
                <ArrowUpRight className={`w-4 h-4 ${isSelected ? "text-indigo-400" : "text-slate-600"}`} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
