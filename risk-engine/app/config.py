import os
from typing import Dict, List

# Configurable Weights for Risk Sub-Scores (Must sum to 1.0)
WEIGHT_TIME = float(os.getenv("MEDGUARD_WEIGHT_TIME", "0.15"))
WEIGHT_GEO = float(os.getenv("MEDGUARD_WEIGHT_GEO", "0.35"))
WEIGHT_DEVICE = float(os.getenv("MEDGUARD_WEIGHT_DEVICE", "0.25"))
WEIGHT_BEHAVIOR = float(os.getenv("MEDGUARD_WEIGHT_BEHAVIOR", "0.25"))

_total_weight = WEIGHT_TIME + WEIGHT_GEO + WEIGHT_DEVICE + WEIGHT_BEHAVIOR
assert abs(_total_weight - 1.0) < 1e-4, f"Weights must sum to 1.0, got {_total_weight}"

# Formula Constants
ALPHA_WEIGHTED = float(os.getenv("MEDGUARD_ALPHA_WEIGHTED", "0.7"))
BETA_MAX = float(os.getenv("MEDGUARD_BETA_MAX", "0.3"))

# Decision Thresholds
THRESHOLD_LOW_MAX = float(os.getenv("MEDGUARD_THRESHOLD_LOW", "0.30"))
THRESHOLD_MED_MAX = float(os.getenv("MEDGUARD_THRESHOLD_MED", "0.65"))

# Sri Lanka Standard Time (SLST: UTC+05:30) Shift Hours
# Normal Doctor Hours: 08:30 to 17:00 Sri Lanka Time (Asia/Colombo)
SLST_OFFSET_MINUTES = 330 # +5 hours 30 mins
SLST_SHIFT_START_MINUTE = int(os.getenv("MEDGUARD_SLST_SHIFT_START_MIN", str(8 * 60 + 30))) # 08:30 -> 510
SLST_SHIFT_END_MINUTE = int(os.getenv("MEDGUARD_SLST_SHIFT_END_MIN", str(17 * 60)))       # 17:00 -> 1020

# Hospital Campus Subnets & Facilities (CIDR and Prefix Matching)
HOSPITAL_RANGES: Dict[str, Dict[str, any]] = {
    "SLIIT_MALABE": {
        "name": "SLIIT Malabe Campus (demo range)",
        "cidrs": ["172.20.10.0/28", "10.100.0.0/16", "192.248.0.0/16", "127.0.0.1/32"],
        "subnets": ["172.20.10.", "10.100.", "192.248.", "127.0.0.1", "::1"],
        "coordinates": {"lat": 6.9147, "lng": 79.9733},
        "risk_subscore": 0.05
    },
    "SEYLAN_TOWER_1": {
        "name": "Seylan Tower 1, Colombo (demo range)",
        "cidrs": ["10.200.0.0/16", "192.168.10.0/24"],
        "subnets": ["10.200.", "192.168.10."],
        "coordinates": {"lat": 6.9147, "lng": 79.8460},
        "risk_subscore": 0.08
    },
    "GENERAL_INTERNAL_LAN": {
        "name": "Hospital Core LAN",
        "cidrs": ["10.0.0.0/8", "192.168.1.0/24"],
        "subnets": ["10.0.", "192.168.1."],
        "coordinates": {"lat": 6.9271, "lng": 79.8612},
        "risk_subscore": 0.05
    }
}

# Enrolled secure doctor devices
ENROLLED_DEVICES: Dict[str, str] = {
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8": "sha256:alice-workstation-secure-enclave",
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC": "sha256:kasun-mdm-tablet",
    "0x90F79bf6EB2c4f870365E785982E1f101E93b906": "sha256:sarah-laptop"
}
