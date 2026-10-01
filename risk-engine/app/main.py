from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .models import RiskScoreRequest, RiskScoreResponse, SignalBreakdown, GpsRiskRequest, GpsRiskResponse
from .signals import extract_all_signals, calculate_geofence_departure_risk
from .scoring import compute_risk_score

app = FastAPI(
    title="MedGuard Risk Scoring Engine",
    description="Context-Aware Risk-Based Access Control (RiskBAC) Scoring Engine implementing the exact MedGuard v2 formula.",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "risk-engine"}

@app.post("/score", response_model=RiskScoreResponse)
def score_access_request(req: RiskScoreRequest):
    """
    Computes risk score from contextual metadata signals.
    Formula: R = 0.7 * (w_t*R_t + w_l*R_l + w_d*R_d + w_b*R_b) + 0.3 * R_max
    """
    try:
        r_t, r_l, r_d, r_b = extract_all_signals(
            user_id=req.user_id,
            timestamp=req.timestamp,
            ip_address=req.ip_address,
            device_fingerprint=req.device_fingerprint,
            requested_sensitivity=req.requested_record_sensitivity,
            device_is_trusted=req.device_is_trusted,
            behavior_deviation_score=req.behavior_deviation_score,
            latitude=req.latitude,
            longitude=req.longitude
        )

        final_score, risk_level, breakdown = compute_risk_score(
            r_t=r_t,
            r_l=r_l,
            r_d=r_d,
            r_b=r_b
        )

        return RiskScoreResponse(
            risk_score=final_score,
            risk_level=risk_level,
            signal_breakdown=SignalBreakdown(**breakdown)
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Risk evaluation error: {str(e)}")

@app.post("/gps-risk", response_model=GpsRiskResponse)
def score_geofence_departure(req: GpsRiskRequest):
    """
    Staff Safety & Location Tracking: Secondary GPS risk evaluation.
    Calculates departure risk when a doctor exits the hospital campus (e.g. SLIIT Malabe),
    factoring in distance and time of day (SLST).
    NOTE: Strictly used for staff safety dispatch and emergency monitoring. Never replaces
    the primary IP CIDR check in RiskBAC.
    """
    try:
        result = calculate_geofence_departure_risk(
            doctor_id=req.doctor_id,
            timestamp_str=req.timestamp,
            latitude=req.latitude,
            longitude=req.longitude,
            reference_campus=req.reference_campus or "SLIIT_MALABE",
            geofence_id=req.geofence_id or "sliit-malabe"
        )
        return GpsRiskResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"GPS risk evaluation error: {str(e)}")
