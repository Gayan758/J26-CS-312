import pytest
from app.signals import haversine_distance, calculate_geofence_departure_risk

def test_haversine_distance():
    # SLIIT Malabe Campus reference: (6.9147, 79.9733)
    # Kaduwela Junction: (6.9333, 79.9833) -> ~ 2.3 km
    dist = haversine_distance(6.9147, 79.9733, 6.9333, 79.9833)
    assert 2.0 < dist < 3.0

def test_inside_malabe_geofence_yields_low_risk():
    # Inside Malabe campus perimeter (within 400m radius)
    result = calculate_geofence_departure_risk(
        doctor_id="doc-001",
        timestamp_str="2026-09-22T10:00:00Z", # 15:30 SLST (Shift)
        latitude=6.9148,
        longitude=79.9734,
        reference_campus="SLIIT_MALABE"
    )
    assert result["is_outside_geofence"] is False
    assert result["gps_risk_score"] == 0.05
    assert result["risk_level"] == "LOW"
    assert result["notify_security"] is False

def test_exit_malabe_geofence_during_shift_alerts_security():
    # Exited Malabe to Kaduwela / Outer ring during shift hours
    # 05:30 UTC is 11:00 SLST (active morning shift)
    result = calculate_geofence_departure_risk(
        doctor_id="doc-001",
        timestamp_str="2026-09-22T05:30:00Z",
        latitude=6.9450,
        longitude=79.9950, # ~ 4.2 km away
        reference_campus="SLIIT_MALABE"
    )
    assert result["is_outside_geofence"] is True
    assert result["distance_km"] > 3.0
    assert result["distance_risk_score"] == 0.60
    assert result["time_of_day_risk_score"] == 0.65
    assert result["gps_risk_score"] >= 0.60
    assert result["risk_level"] in ["MEDIUM", "HIGH"]
    assert result["notify_security"] == (result["risk_level"] in ["HIGH", "CRITICAL"])

def test_distant_remote_departure_yields_high_critical():
    # Galle / Southern Expressway (~ 100km away)
    result = calculate_geofence_departure_risk(
        doctor_id="doc-002",
        timestamp_str="2026-09-22T08:00:00Z",
        latitude=6.0535,
        longitude=80.2210,
        reference_campus="SLIIT_MALABE"
    )
    assert result["is_outside_geofence"] is True
    assert result["distance_km"] > 80.0
    assert result["distance_risk_score"] == 0.90
    assert result["gps_risk_score"] >= 0.75
    assert result["risk_level"] in ["HIGH", "CRITICAL"]
    assert result["notify_security"] is True
    assert "Staff Alert" in result["security_reason"]
