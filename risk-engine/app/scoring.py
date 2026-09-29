from typing import Dict, Any, Tuple
from .config import (
    WEIGHT_TIME,
    WEIGHT_GEO,
    WEIGHT_DEVICE,
    WEIGHT_BEHAVIOR,
    ALPHA_WEIGHTED,
    BETA_MAX,
    THRESHOLD_LOW_MAX,
    THRESHOLD_MED_MAX,
)

def compute_risk_score(
    r_t: float,
    r_l: float,
    r_d: float,
    r_b: float,
    w_t: float = WEIGHT_TIME,
    w_l: float = WEIGHT_GEO,
    w_d: float = WEIGHT_DEVICE,
    w_b: float = WEIGHT_BEHAVIOR,
) -> Tuple[float, str, Dict[str, float]]:
    """
    Computes final risk score using the exact MedGuard v2 formula:
    R = 0.7 * (w_t*R_t + w_l*R_l + w_d*R_d + w_b*R_b) + 0.3 * R_max

    Named intermediate variables:
      - weighted_component: (w_t*R_t + w_l*R_l + w_d*R_d + w_b*R_b)
      - max_component: max(R_t, R_l, R_d, R_b)

    Returns:
      (final_score, risk_level, signal_breakdown)
    """
    # 1. Calculate the weighted average of the sub-scores
    weighted_component = (w_t * r_t) + (w_l * r_l) + (w_d * r_d) + (w_b * r_b)

    # 2. Calculate the maximum sub-score (compensating term to prevent dilution of severe anomalies)
    max_component = max(r_t, r_l, r_d, r_b)

    # 3. Calculate final blended risk score
    raw_final_score = (ALPHA_WEIGHTED * weighted_component) + (BETA_MAX * max_component)

    # Clamp to [0.0, 1.0]
    final_score = max(0.0, min(1.0, raw_final_score))
    final_score_rounded = round(final_score, 4)

    # 4. Determine risk level classification
    if final_score_rounded < THRESHOLD_LOW_MAX:
        risk_level = "LOW"
    elif final_score_rounded < THRESHOLD_MED_MAX:
        risk_level = "MEDIUM"
    else:
        risk_level = "HIGH"

    breakdown = {
        "login_time_score": round(r_t, 4),
        "geo_velocity_score": round(r_l, 4),
        "device_score": round(r_d, 4),
        "behavior_score": round(r_b, 4),
        "weighted_component": round(weighted_component, 4),
        "max_component": round(max_component, 4),
        "final_score": round(final_score, 2),
    }

    return round(final_score, 2), risk_level, breakdown
