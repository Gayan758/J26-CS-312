import React, { useState, useEffect } from "react";
import { ShieldCheck, MapPin, Clock, LogOut, AlertOctagon, Wifi, ChevronDown } from "lucide-react";
import { getNetworkStatus } from "../api/client";

const SIMULATED_NETWORKS = [
  { key: "SLIIT_MALABE", name: "SLIIT Malabe Campus (10.100.1.25)", ip: "10.100.1.25" },
  { key: "SEYLAN_TOWER_1", name: "Seylan Tower 1 Clinic (192.168.10.45)", ip: "192.168.10.45" },
  { key: "EXTERNAL", name: "External / Mobile Network (203.0.113.19)", ip: "203.0.113.19" },
  { key: "ANOMALOUS", name: "Anomalous Proxy IP (198.51.100.99)", ip: "198.51.100.99" }
];

export default function Navbar({ doctor, onLogout, onOpenBreakGlass, activeIp, onChangeIp }) {
  const [slstTime, setSlstTime] = useState("");
  const [isShiftActive, setIsShiftActive] = useState(true);
  const [networkInfo, setNetworkInfo] = useState(null);

  // Live Sri Lanka Standard Time clock (UTC+05:30)
  useEffect(() => {
    const updateSlstClock = () => {
      const now = new Date();
      // Calculate SLST time string
      const slstString = now.toLocaleTimeString("en-US", {
        timeZone: "Asia/Colombo",
        hour12: true,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
      setSlstTime(slstString);

      // Check 08:00 - 18:00 shift in Sri Lanka Time
      const slstHour = parseInt(
        now.toLocaleTimeString("en-US", {
          timeZone: "Asia/Colombo",
          hour12: false,
          hour: "2-digit"
        }),
        10
      );
      setIsShiftActive(slstHour >= 8 && slstHour < 18);
    };

    updateSlstClock();
    const timer = setInterval(updateSlstClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // Update hospital network detection whenever activeIp changes
  useEffect(() => {
    getNetworkStatus(activeIp).then(setNetworkInfo);
  }, [activeIp]);

  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-6 py-3.5 flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 z-40">
      
      {/* Brand & Doctor info */}
      <div className="flex items-center gap-3 w-full md:w-auto">
        <div className="p-2.5 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold font-outfit text-white">MedGuard</h1>
            <span className="text-[10px] bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-mono px-2 py-0.5 rounded-full">
              Sri Lanka EHR
            </span>
          </div>
          <p className="text-xs text-slate-300 font-medium">
            {doctor.name} <span className="text-slate-500">• {doctor.specialty}</span>
          </p>
        </div>
      </div>

      {/* Center status indicators: SLST Clock & Hospital Range */}
      <div className="flex items-center gap-3 flex-wrap justify-center">
        
        {/* Sri Lanka Time Shift Indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
          <Clock className="w-3.5 h-3.5 text-indigo-400" />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-semibold text-slate-200">{slstTime || "Loading..."}</span>
              <span className="text-[10px] text-slate-500 font-medium">(SLST)</span>
            </div>
            <span className={`text-[9px] font-bold ${isShiftActive ? "text-emerald-400" : "text-amber-400"}`}>
              {isShiftActive ? "ON-DUTY (08:00–18:00)" : "OFF-SHIFT HOURS"}
            </span>
          </div>
        </div>

        {/* Hospital Range Detection & Switcher */}
        <div className="relative group">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs cursor-pointer ${
            networkInfo?.isInternal
              ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-300"
              : "bg-slate-900 border-slate-800 text-slate-300"
          }`}>
            <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <div className="flex flex-col text-left">
              <span className="font-semibold truncate max-w-[190px]">
                {networkInfo?.campusName || "Detecting Hospital..."}
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                IP: {activeIp}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 ml-1" />
          </div>

          {/* Range Switcher Dropdown */}
          <div className="absolute top-full mt-1.5 left-0 w-72 bg-slate-900 border border-slate-800 rounded-xl p-2 shadow-2xl z-50 hidden group-hover:block">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
              Simulate Hospital Connection:
            </div>
            {SIMULATED_NETWORKS.map((net) => (
              <button
                key={net.key}
                type="button"
                onClick={() => onChangeIp(net.ip)}
                className={`w-full text-left p-2 rounded-lg text-xs transition flex items-center justify-between ${
                  activeIp === net.ip
                    ? "bg-indigo-600/20 text-indigo-300 font-semibold border border-indigo-500/30"
                    : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <span>{net.name}</span>
                {activeIp === net.ip && <span className="text-[10px] text-indigo-400">Active</span>}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Right actions: Break-Glass & Logout */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onOpenBreakGlass}
          className="px-3.5 py-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-red-600/25 transition"
        >
          <AlertOctagon className="w-4 h-4" />
          <span>Break-Glass (RAP)</span>
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl border border-slate-800 transition"
          title="Sign Out Doctor Session"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

    </header>
  );
}
