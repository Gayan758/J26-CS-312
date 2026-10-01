import pytest
from app.scoring import compute_risk_score
from app.signals import extract_all_signals

def test_independent_weighted_and_max_components():
    """
    Verifies that the weighted term and max term are evaluated independently
    and combined via: R = 0.7 * weighted_component + 0.3 * max_component
    """
    r_t = 0.10
    r_l = 0.60
    r_d = 0.30
    r_b = 0.20

    w_t, w_l, w_d, w_b = 0.15, 0.35, 0.25, 0.25

    # Expected weighted component
    expected_weighted = (0.15 * 0.10) + (0.35 * 0.60) + (0.25 * 0.30) + (0.25 * 0.20)
    assert abs(expected_weighted - 0.350) < 1e-6

    # Expected max component
    expected_max = max(r_t, r_l, r_d, r_b)
    assert expected_max == 0.60

    # Expected final blended score
    expected_final = (0.7 * expected_weighted) + (0.3 * expected_max)
    assert abs(expected_final - 0.425) < 1e-6

    score, level, breakdown = compute_risk_score(r_t, r_l, r_d, r_b, w_t, w_l, w_d, w_b)

    assert abs(breakdown["weighted_component"] - 0.350) < 1e-3
    assert breakdown["max_component"] == 0.60
    assert score == 0.43 or score == 0.42  # standard rounding
    assert level == "MEDIUM"

def test_single_severe_anomaly_not_diluted():
    """
    Design rationale verification from section 4:
    A single severe anomaly (e.g. impossible-travel jump scoring 0.95)
    must NOT be diluted into a low overall score by three near-zero signals.
    Without the 0.3 * R_max term:
       Weighted average = 0.15(0.0) + 0.35(0.95) + 0.25(0.0) + 0.25(0.0) = 0.3325 -> LOW without max term
    With the 0.3 * R_max term:
       0.7 * 0.3325 + 0.3 * 0.95 = 0.23275 + 0.285 = 0.518 -> Elevated to MEDIUM!
    """
    r_t = 0.05
    r_l = 0.95  # Severe impossible travel red flag!
    r_d = 0.05
    r_b = 0.05

    score, level, breakdown = compute_risk_score(r_t, r_l, r_d, r_b)

    assert breakdown["max_component"] == 0.95
    # The final score must reflect the anomaly and not be classified as LOW (< 0.3)
    assert score >= 0.50
    assert level in ["MEDIUM", "HIGH"]

def test_low_risk_boundary_classification():
    """
    All near-zero benign signals should yield LOW risk (< 0.30) -> ALLOW
    """
    r_t = 0.05
    r_l = 0.05
    r_d = 0.05
    r_b = 0.10

    score, level, breakdown = compute_risk_score(r_t, r_l, r_d, r_b)
    assert score < 0.30
    assert level == "LOW"

def test_high_risk_boundary_classification():
    """
    Multiple high-risk signals yield HIGH risk (>= 0.65) -> BLOCK
    """
    r_t = 0.85  # 3 AM off-hours
    r_l = 0.95  # Rogue IP
    r_d = 0.85  # Unregistered rogue device
    r_b = 0.85  # Sensitive psychiatric record

    score, level, breakdown = compute_risk_score(r_t, r_l, r_d, r_b)
    assert score >= 0.65
    assert level == "HIGH"

def test_real_location_inside_sliit_malabe():
    """
    Doctor device located at SLIIT Malabe Campus (6.9147, 79.9733) on campus IP
    should evaluate r_l = 0.05 (LOW risk).
    """
    r_t, r_l, r_d, r_b = extract_all_signals(
        user_id="doc-001",
        timestamp="2026-09-22T10:00:00Z", # In-shift (15:30 SLST)
        ip_address="172.20.10.8", # SLIIT subnet
        device_fingerprint="sha256:alice-workstation-secure-enclave",
        requested_sensitivity="low",
        device_is_trusted=True,
        latitude=6.9147,
        longitude=79.9733
    )
    assert r_l == 0.05
    score, level, _ = compute_risk_score(r_t, r_l, r_d, r_b)
    assert level == "LOW"
    assert score < 0.30

def test_real_location_outside_sliit_malabe_triggers_elevated_risk():
    """
    Doctor device located outside SLIIT Malabe Campus (e.g. Colombo Fort / Kaduwela)
    triggers r_l = 0.95 and elevated risk (>= 0.50).
    """
    r_t, r_l, r_d, r_b = extract_all_signals(
        user_id="doc-001",
        timestamp="2026-09-22T10:00:00Z",
        ip_address="172.20.10.8",
        device_fingerprint="sha256:alice-workstation-secure-enclave",
        requested_sensitivity="low",
        device_is_trusted=True,
        latitude=6.9271, # Colombo Fort, ~14km away
        longitude=79.8612
    )
    # Outside SLIIT Malabe campus perimeter -> r_l must be 0.95!
    assert r_l == 0.95
    score, level, breakdown = compute_risk_score(r_t, r_l, r_d, r_b)
    assert breakdown["max_component"] == 0.95
    assert score >= 0.50
    assert level in ["MEDIUM", "HIGH"]

def test_real_location_outside_with_sensitive_record_triggers_high_risk():
    """
    Doctor device outside SLIIT Malabe accessing sensitive patient record
    crosses the threshold into HIGH risk (>= 0.65).
    """
    r_t, r_l, r_d, r_b = extract_all_signals(
        user_id="doc-001",
        timestamp="2026-09-22T10:00:00Z",
        ip_address="203.0.113.5",
        device_fingerprint="sha256:unregistered-mobile",
        requested_sensitivity="high",
        device_is_trusted=False,
        latitude=6.9271,
        longitude=79.8612
    )
    assert r_l == 0.95
    score, level, _ = compute_risk_score(r_t, r_l, r_d, r_b)
    assert score >= 0.65
    assert level == "HIGH"
