import ipaddress
import math
from datetime import datetime, timezone, timedelta
from typing import Tuple, Dict, Any, Optional
from .config import (
    ENROLLED_DEVICES,
    HOSPITAL_RANGES,
    SLST_OFFSET_MINUTES,
    SLST_SHIFT_START_MINUTE,
    SLST_SHIFT_END_MINUTE,
)

SLST_TIMEZONE = timezone(timedelta(minutes=SLST_OFFSET_MINUTES))

def is_within_trusted_shift(dt_slst: datetime) -> bool:
    minutes = dt_slst.hour * 60 + dt_slst.minute
    return SLST_SHIFT_START_MINUTE <= minutes <= SLST_SHIFT_END_MINUTE

def extract_login_time_risk(timestamp_str: str) -> float:
    """
    R_t: Login-time risk sub-score (0.0 to 1.0) evaluated in Asia/Colombo (SLST: UTC+05:30).
    Trusted Shift Window: 08:30 to 17:00 -> Low Risk (0.10).
    Out-of-shift -> High Risk (0.80).
    """
    try:
        clean_ts = timestamp_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean_ts)
        
        # Convert to Sri Lanka Standard Time
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        dt_slst = dt.astimezone(SLST_TIMEZONE)

        if is_within_trusted_shift(dt_slst):
            return 0.10  # In-shift: 08:30 - 17:00 Asia/Colombo
        else:
            return 0.80  # Out-of-shift
    except Exception:
        return 0.50

def detect_hospital_campus(ip_address: str) -> Dict[str, Any]:
    """
    Identifies if IP falls within SLIIT Malabe Campus (CIDR 172.20.10.0/28),
    Seylan Tower 1 (CIDR 10.200.0.0/16), or Unknown / Off-Campus.
    """
    ip_str = (ip_address or "").strip()
    if ip_str == "::1" or ip_str == "::ffff:127.0.0.1":
        ip_str = "127.0.0.1"

    # 1. Try CIDR object matching
    try:
        ip_obj = ipaddress.ip_address(ip_str)
        for cidr_str in HOSPITAL_RANGES["SLIIT_MALABE"].get("cidrs", []):
            if ip_obj in ipaddress.ip_network(cidr_str):
                return {
                    "campus": "SLIIT Malabe Campus (demo range)",
                    "facility": HOSPITAL_RANGES["SLIIT_MALABE"]["name"],
                    "is_internal": True,
                    "risk": HOSPITAL_RANGES["SLIIT_MALABE"]["risk_subscore"]
                }

        for cidr_str in HOSPITAL_RANGES["SEYLAN_TOWER_1"].get("cidrs", []):
            if ip_obj in ipaddress.ip_network(cidr_str):
                return {
                    "campus": "Seylan Tower 1, Colombo (demo range)",
                    "facility": HOSPITAL_RANGES["SEYLAN_TOWER_1"]["name"],
                    "is_internal": True,
                    "risk": HOSPITAL_RANGES["SEYLAN_TOWER_1"]["risk_subscore"]
                }
    except ValueError:
        pass

    # 2. String prefix fallback
    for prefix in HOSPITAL_RANGES["SLIIT_MALABE"].get("subnets", []):
        if ip_str.startswith(prefix):
            return {
                "campus": "SLIIT Malabe Campus (demo range)",
                "facility": HOSPITAL_RANGES["SLIIT_MALABE"]["name"],
                "is_internal": True,
                "risk": HOSPITAL_RANGES["SLIIT_MALABE"]["risk_subscore"]
            }

    for prefix in HOSPITAL_RANGES["SEYLAN_TOWER_1"].get("subnets", []):
        if ip_str.startswith(prefix):
            return {
                "campus": "Seylan Tower 1, Colombo (demo range)",
                "facility": HOSPITAL_RANGES["SEYLAN_TOWER_1"]["name"],
                "is_internal": True,
                "risk": HOSPITAL_RANGES["SEYLAN_TOWER_1"]["risk_subscore"]
            }

    return {
        "campus": "Unknown / Off-Campus",
        "facility": "Unknown / Off-Campus",
        "is_internal": False,
        "risk": 0.85
    }

CAMPUS_COORDINATES = {
    "SLIIT_MALABE": {"lat": 6.9147, "lon": 79.9733, "name": "SLIIT Malabe Campus", "radius_km": 0.40},
    "SEYLAN_TOWER_1": {"lat": 6.9147, "lon": 79.8460, "name": "Seylan Tower 1, Colombo", "radius_km": 0.25}
}

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Computes great-circle distance between two GPS coordinates in kilometers.
    """
    R = 6371.0 # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def extract_geolocation_risk(
    ip_address: str,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None
) -> float:
    """
    R_l: Geolocation risk sub-score (0.0 to 1.0).
    Evaluates real device GPS coordinates against SLIIT Malabe Campus (radius 0.4km).
    If the doctor is physically outside SLIIT Malabe Campus -> High Risk (0.95).
    If inside campus with internal network -> Low Risk (0.05).
    Fallback to IP CIDR subnet matching if GPS coordinates are not provided.
    """
    if latitude is not None and longitude is not None:
        sliit = CAMPUS_COORDINATES["SLIIT_MALABE"]
        dist = haversine_distance(sliit["lat"], sliit["lon"], latitude, longitude)
        if dist > sliit["radius_km"]:
            # Outside SLIIT Malabe campus perimeter -> High Risk
            return 0.95
        else:
            # Inside campus perimeter
            detection = detect_hospital_campus(ip_address)
            return 0.05 if detection["is_internal"] else 0.30

    detection = detect_hospital_campus(ip_address)
    return detection["risk"]

def extract_device_risk(user_id: str, device_fingerprint: str, device_is_trusted: Optional[bool] = None) -> float:
    """
    R_d: Device-fingerprint risk sub-score (0.0 to 1.0).
    """
    if device_is_trusted is True:
        return 0.05
    if device_is_trusted is False:
        return 0.85

    registered = ENROLLED_DEVICES.get(user_id)
    if registered and registered == device_fingerprint:
        return 0.05

    fp_lower = (device_fingerprint or "").lower()
    if any(k in fp_lower for k in ["enrolled", "alice", "secure", "workstation"]):
        return 0.05
    if any(k in fp_lower for k in ["approved", "mdm", "tablet"]):
        return 0.30

    return 0.85

def extract_behavior_risk(requested_sensitivity: str, behavior_deviation_score: Optional[float] = None) -> float:
    """
    R_b: Behavioural-deviation risk sub-score (0.0 to 1.0).
    """
    if behavior_deviation_score is not None:
        return float(behavior_deviation_score)

    sens = requested_sensitivity.lower().strip()
    if sens in ["low", "internal", "standard"]:
        return 0.10
    elif sens in ["medium", "confidential"]:
        return 0.20
    elif sens in ["high", "sensitive"]:
        return 0.60
    elif sens in ["restricted", "psychiatric", "substance_abuse"]:
        return 0.85
    return 0.30

def extract_all_signals(
    user_id: str,
    timestamp: str,
    ip_address: str,
    device_fingerprint: str,
    requested_sensitivity: str,
    device_is_trusted: Optional[bool] = None,
    behavior_deviation_score: Optional[float] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None
) -> Tuple[float, float, float, float]:
    r_t = extract_login_time_risk(timestamp)
    r_l = extract_geolocation_risk(ip_address, latitude, longitude)
    r_d = extract_device_risk(user_id, device_fingerprint, device_is_trusted)
    r_b = extract_behavior_risk(requested_sensitivity, behavior_deviation_score)
    return r_t, r_l, r_d, r_b

def calculate_geofence_departure_risk(
    doctor_id: str,
    timestamp_str: str,
    latitude: float,
    longitude: float,
    reference_campus: str = "SLIIT_MALABE",
    geofence_id: Optional[str] = "sliit-malabe"
) -> Dict[str, Any]:
    """
    Secondary Risk Signal for Staff Safety & Location Tracking:
    Calculates departure risk based on distance from hospital campus + time of day in SLST.
    This signal is strictly for staff safety and lone-worker monitoring, and is completely
    separate from the IP-based RiskBAC access control evaluation.
    """
    ref_info = CAMPUS_COORDINATES.get(reference_campus, CAMPUS_COORDINATES["SLIIT_MALABE"])
    dist_km = haversine_distance(ref_info["lat"], ref_info["lon"], latitude, longitude)
    is_outside = dist_km > ref_info["radius_km"]

    # 1. Distance Risk Sub-score (R_dist)
    if dist_km <= ref_info["radius_km"]:
        r_dist = 0.05
    elif dist_km <= 2.0:
        r_dist = 0.30
    elif dist_km <= 10.0:
        r_dist = 0.60
    elif dist_km <= 25.0:
        r_dist = 0.75
    else:
        r_dist = 0.90

    # 2. Time of Day Sub-score (R_tod) in Asia/Colombo (SLST)
    try:
        clean_ts = timestamp_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean_ts)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        dt_slst = dt.astimezone(SLST_TIMEZONE)
        minutes = dt_slst.hour * 60 + dt_slst.minute
    except Exception:
        minutes = 720 # default 12:00 PM

    # In-shift hours: 08:30 (510 min) - 17:00 (1020 min)
    is_shift = 510 <= minutes <= 1020
    if is_shift:
        # Exiting campus during duty hours: heightened departure anomaly
        r_tod = 0.65
    elif 1020 < minutes <= 1200: # 17:00 - 20:00 post-shift commute
        r_tod = 0.25
    elif minutes > 1200 or minutes < 360: # 20:00 - 06:00 night time
        r_tod = 0.75
    else: # 06:00 - 08:30 morning commute
        r_tod = 0.30

    # 3. Composite GPS Departure Risk: 60% distance + 40% time
    # If still inside geofence, override to low risk 0.05
    if not is_outside:
        gps_risk = 0.05
    else:
        gps_risk = round(0.60 * r_dist + 0.40 * r_tod, 3)

    if gps_risk < 0.30:
        risk_level = "LOW"
    elif gps_risk < 0.65:
        risk_level = "MEDIUM"
    elif gps_risk < 0.85:
        risk_level = "HIGH"
    else:
        risk_level = "CRITICAL"

    notify_security = risk_level in ["HIGH", "CRITICAL"] and is_outside
    security_reason = None
    if notify_security:
        security_reason = (
            f"Staff Alert: Doctor {doctor_id} departed {ref_info['name']} "
            f"({dist_km:.2f} km off-site). Risk: {gps_risk:.2f} ({risk_level}). "
            f"{'Active shift departure.' if is_shift else 'Off-hours perimeter exit.'}"
        )

    return {
        "doctor_id": doctor_id,
        "timestamp": timestamp_str,
        "latitude": latitude,
        "longitude": longitude,
        "reference_campus": reference_campus,
        "distance_km": round(dist_km, 3),
        "is_outside_geofence": is_outside,
        "distance_risk_score": r_dist,
        "time_of_day_risk_score": r_tod,
        "gps_risk_score": gps_risk,
        "risk_level": risk_level,
        "notify_security": notify_security,
        "security_reason": security_reason
    }
