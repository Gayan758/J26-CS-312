import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import {
  MapPin,
  Shield,
  AlertOctagon,
  Radio,
  Battery,
  Clock,
  Compass,
  UserCheck,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Lock,
  Smartphone,
  Layers,
  History
} from "lucide-react";
import Button from "./ui/Button";
import StatusBadge from "./ui/StatusBadge";

// Geofence Definitions
const GEOFENCE_SLIIT = {
  id: "sliit-malabe",
  name: "SLIIT Malabe Campus (Main Perimeter)",
  center: [6.9147, 79.9733],
  radius: 400 // meters
};

const GEOFENCE_SEYLAN = {
  id: "seylan-tower-1",
  name: "Seylan Tower 1 Clinic, Colombo",
  center: [6.9147, 79.8460],
  radius: 250 // meters
};

export default function StaffSafetyMap({ doctor, onShowToast }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});
  const geofencesRef = useRef([]);

  const [devices, setDevices] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);

  // Fetch live devices & geofence events from backend
  const fetchData = async () => {
    try {
      const [devRes, evtRes] = await Promise.all([
        fetch("/api/tracking/devices"),
        fetch("/api/tracking/events?limit=15")
      ]);

      if (devRes.ok) {
        const devData = await devRes.json();
        setDevices(devData.devices || []);
      }
      if (evtRes.ok) {
        const evtData = await evtRes.json();
        setEvents(evtData.events || []);
      }
    } catch (err) {
      console.warn("Error fetching tracking data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [6.9147, 79.9733],
      zoom: 14,
      zoomControl: true
    });
    mapInstanceRef.current = map;

    // Clean Map Tiles
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    // Geofence 1: SLIIT Malabe (Clean subtle styling: 1px border, 10% fill)
    const sliitCircle = L.circle(GEOFENCE_SLIIT.center, {
      color: "#0B5FA5",
      fillColor: "#0B5FA5",
      fillOpacity: 0.08,
      weight: 1.5,
      dashArray: "3, 5",
      radius: GEOFENCE_SLIIT.radius
    }).addTo(map);
    sliitCircle.bindPopup(
      `<div style="font-family: Inter, sans-serif; font-size: 11px;"><strong>${GEOFENCE_SLIIT.name}</strong><br/>Radius: 400m · Duty Perimeter</div>`
    );

    // Geofence 2: Seylan Tower 1
    const seylanCircle = L.circle(GEOFENCE_SEYLAN.center, {
      color: "#0E8F8A",
      fillColor: "#0E8F8A",
      fillOpacity: 0.08,
      weight: 1.5,
      dashArray: "3, 5",
      radius: GEOFENCE_SEYLAN.radius
    }).addTo(map);
    seylanCircle.bindPopup(
      `<div style="font-family: Inter, sans-serif; font-size: 11px;"><strong>${GEOFENCE_SEYLAN.name}</strong><br/>Radius: 250m · Clinic Node</div>`
    );

    geofencesRef.current = [sliitCircle, seylanCircle];

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Markers when devices change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    devices.forEach((dev) => {
      if (!dev.lastPosition?.lat || !dev.lastPosition?.lon) return;

      const { lat, lon } = dev.lastPosition;
      const isSos = dev.sosActive;
      const isOutside = lat > 6.92 || lon > 79.98;

      const iconHtml = `
        <div class="relative flex items-center justify-center">
          ${isSos ? '<span class="absolute w-7 h-7 rounded-full bg-red-500/40 animate-ping"></span>' : ''}
          <div class="w-6 h-6 rounded-full border-2 border-white shadow-xs flex items-center justify-center text-white text-[10px] font-semibold ${
            isSos ? 'bg-[#B42318]' : isOutside ? 'bg-[#B54708]' : 'bg-[#0B5FA5]'
          }">
            ${dev.doctorName ? dev.doctorName.split(' ')[1]?.[0] || 'D' : 'D'}
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: "custom-doctor-marker",
        html: iconHtml,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      if (markersRef.current[dev.deviceId]) {
        markersRef.current[dev.deviceId].setLatLng([lat, lon]);
        markersRef.current[dev.deviceId].setIcon(customIcon);
      } else {
        const marker = L.marker([lat, lon], { icon: customIcon }).addTo(map);
        marker.bindPopup(`
          <div style="font-family: Inter, sans-serif; font-size: 11px; min-width: 170px;">
            <strong style="color: #0F172A;">${dev.doctorName}</strong><br/>
            <span style="color: #64748B; font-size: 10px;">Device: ${dev.deviceName}</span>
            <hr style="margin: 4px 0; border: 0; border-top: 1px solid #E2E8F0;"/>
            <div>Status: <strong>${isSos ? 'EMERGENCY SOS' : isOutside ? 'OUTSIDE GEOFENCE' : 'ON CAMPUS'}</strong></div>
            <div>Battery: ${dev.batteryLevel || 100}% | Speed: ${dev.lastPosition.speed || 0} km/h</div>
          </div>
        `);
        markersRef.current[dev.deviceId] = marker;
      }
    });
  }, [devices]);

  // Handler: Trigger SOS Distress Beacon
  const handleTriggerSOS = async () => {
    if (!doctor) return;
    try {
      const lat = doctor.lastKnownLocation?.latitude || 6.9147;
      const lon = doctor.lastKnownLocation?.longitude || 79.9733;
      const res = await fetch("/api/tracking/sos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId: doctor.id, lat, lon })
      });

      if (res.ok) {
        await fetchData();
        if (onShowToast) {
          onShowToast("Emergency SOS broadcast activated — security dispatch notified", "critical");
        }
      }
    } catch (err) {
      if (onShowToast) onShowToast("Failed to activate SOS beacon", "critical");
    }
  };

  // Handler: Cancel SOS
  const handleCancelSOS = async () => {
    try {
      const targetDoc = doctor?.id || "doc-001";
      const res = await fetch("/api/tracking/sos/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId: targetDoc })
      });

      if (res.ok) {
        await fetchData();
        if (onShowToast) {
          onShowToast("Emergency SOS beacon deactivated", "info");
        }
      }
    } catch (err) {
      console.error("Cancel SOS error:", err);
    }
  };

  // Handler: Toggle Doctor Tracking Privacy Mode
  const handleToggleTracking = async (deviceId, currentStatus) => {
    try {
      const res = await fetch("/api/tracking/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId: deviceId, enabled: !currentStatus })
      });

      if (res.ok) {
        await fetchData();
        if (onShowToast) {
          onShowToast(
            `Staff GPS tracking ${!currentStatus ? "resumed" : "paused (Doctor Privacy Mode)"}`,
            "info"
          );
        }
      }
    } catch (err) {
      console.error("Toggle error:", err);
    }
  };

  const sosActiveCount = devices.filter((d) => d.sosActive).length;
  const outsideCount = devices.filter(
    (d) => d.lastPosition && (d.lastPosition.lat > 6.92 || d.lastPosition.lon > 79.98)
  ).length;

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-600" />
            <span>Staff Safety &amp; Real-Time Location</span>
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Physical safety monitoring, geofence boundary checks, and lone-worker emergency dispatch
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs font-mono text-text-subtle px-2.5 py-1 rounded border border-border bg-surface">
            Active: <strong className="text-text-primary">{devices.length}</strong> · Off-Campus: <strong className={outsideCount > 0 ? "text-warning" : "text-text-primary"}>{outsideCount}</strong> · SOS: <strong className={sosActiveCount > 0 ? "text-critical" : "text-text-primary"}>{sosActiveCount}</strong>
          </div>
        </div>
      </div>

      {/* 2-PANEL LAYOUT: 360px LEFT PANEL + MAP RIGHT PANEL */}
      <div className="flex flex-col lg:flex-row items-stretch gap-4">
        {/* LEFT PANEL: 360px Staff Devices List & Geofence Log */}
        <div className="w-full lg:w-[360px] shrink-0 flex flex-col gap-3">
          {/* Tracked Staff Card */}
          <div className="border border-border rounded-lg bg-surface shadow-xs p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <span className="text-xs font-semibold text-text-primary">
                Tracked Clinicians
              </span>
              <span className="text-[10px] font-mono text-text-subtle">
                {devices.length} Assigned Devices
              </span>
            </div>

            <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
              {devices.map((dev) => {
                const isOutside =
                  dev.lastPosition &&
                  (dev.lastPosition.lat > 6.92 || dev.lastPosition.lon > 79.98);
                const isSos = dev.sosActive;

                return (
                  <div
                    key={dev.deviceId}
                    onClick={() => {
                      setSelectedDeviceId(dev.deviceId);
                      if (mapInstanceRef.current && dev.lastPosition) {
                        mapInstanceRef.current.flyTo(
                          [dev.lastPosition.lat, dev.lastPosition.lon],
                          16
                        );
                      }
                    }}
                    className={`p-3 rounded border text-xs cursor-pointer transition select-none ${
                      isSos
                        ? "border-critical bg-critical-bg"
                        : isOutside
                        ? "border-warning-border bg-warning-bg"
                        : "border-border bg-surface hover:bg-surface-muted"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-text-primary">
                          {dev.doctorName}
                        </div>
                        <div className="text-[11px] font-mono text-text-subtle mt-0.5">
                          {dev.deviceName}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        {isSos ? (
                          <StatusBadge variant="critical" dot label="SOS ACTIVE" size="xs" />
                        ) : isOutside ? (
                          <StatusBadge variant="warning" dot label="Off Campus" size="xs" />
                        ) : (
                          <StatusBadge variant="success" dot label="On Campus" size="xs" />
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleTracking(dev.doctorId, dev.trackingEnabled);
                          }}
                          className="text-[10px] text-text-subtle hover:text-text-primary hover:underline font-mono"
                        >
                          {dev.trackingEnabled ? "Pause GPS" : "Resume GPS"}
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 pt-2 border-t border-border-subtle grid grid-cols-2 gap-2 text-[10px] font-mono text-text-muted">
                      <div>
                        Battery: <strong className="text-text-primary">{dev.batteryLevel || 100}%</strong>
                      </div>
                      <div className="text-right">
                        Speed: <strong className="text-text-primary">{dev.lastPosition?.speed || 0} km/h</strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Geofence Events Activity Log */}
          <div className="border border-border rounded-lg bg-surface shadow-xs p-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-text-subtle" />
                <span>Recent Boundary Events</span>
              </span>
              <span className="text-[10px] font-mono text-text-subtle">Audit Feed</span>
            </div>

            <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1 text-xs">
              {events.slice(0, 5).map((evt, idx) => (
                <div
                  key={evt.id || idx}
                  className="p-2 rounded border border-border-subtle bg-surface-muted flex flex-col gap-0.5 text-[11px]"
                >
                  <div className="flex items-center justify-between font-mono text-[10px] text-text-subtle">
                    <span>{evt.timestamp || "Recent"}</span>
                    <span className="font-semibold text-text-primary">
                      {evt.type === "EXIT" ? "EXIT PERIMETER" : "ENTER PERIMETER"}
                    </span>
                  </div>
                  <div className="text-text-muted">
                    {evt.doctorName || "Staff Clinician"} · {evt.geofenceName || "SLIIT Campus"}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ethical Separation Callout */}
          <div className="p-3 rounded border border-border bg-surface-muted text-[11px] text-text-muted leading-relaxed">
            <div className="flex items-center gap-1.5 font-medium text-text-primary mb-1">
              <Lock className="w-3 h-3 text-primary" />
              <span>Ethical Architecture Separation</span>
            </div>
            This GPS tracking system is dedicated solely to clinician physical safety and emergency response. Clinical medical chart access (RiskBAC) strictly uses <strong>IP CIDR subnet matching</strong> and never queries personal GPS.
          </div>
        </div>

        {/* RIGHT PANEL: Map Canvas & Controls */}
        <div className="flex-1 min-w-0 border border-border rounded-lg bg-surface shadow-xs overflow-hidden flex flex-col">
          {/* Map Controls Bar */}
          <div className="px-4 py-2.5 border-b border-border bg-surface-muted flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-medium text-text-primary">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              <span>Campus Safety Zones</span>
            </div>

            <div className="flex items-center gap-2">

              {sosActiveCount === 0 ? (
                <Button
                  variant="critical"
                  size="sm"
                  icon={AlertOctagon}
                  onClick={handleTriggerSOS}
                >
                  SOS Panic Beacon
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={RotateCcw}
                  onClick={handleCancelSOS}
                >
                  Cancel SOS
                </Button>
              )}
            </div>
          </div>

          {/* Interactive Leaflet Map */}
          <div className="relative w-full h-[520px] bg-surface-muted">
            <div ref={mapContainerRef} className="w-full h-full z-10" />

            {/* Map Legend */}
            <div className="absolute bottom-3 left-3 z-20 px-2.5 py-1.5 rounded border border-border bg-surface/90 backdrop-blur-xs text-[10px] font-mono text-text-muted shadow-xs flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#0B5FA5]" />
                <span>SLIIT Malabe (400m)</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#0E8F8A]" />
                <span>Seylan Tower (250m)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
