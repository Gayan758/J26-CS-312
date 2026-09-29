from pydantic import BaseModel, Field
from typing import Optional

class RiskScoreRequest(BaseModel):
    user_id: str = Field(..., example="0xDoctorAlice")
    timestamp: str = Field(..., example="2026-09-03T14:22:00Z")
    ip_address: str = Field(..., example="203.0.113.5")
    device_fingerprint: str = Field(..., example="sha256:alice-workstation-secure-enclave")
    requested_patient_id: str = Field(..., example="patient-123")
    requested_record_sensitivity: str = Field(..., example="high")
    device_is_trusted: Optional[bool] = None
    behavior_deviation_score: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class SignalBreakdown(BaseModel):
    login_time_score: float
    geo_velocity_score: float
    device_score: float
    behavior_score: float
    weighted_component: float
    max_component: float
    final_score: float

class RiskScoreResponse(BaseModel):
    risk_score: float
    risk_level: str
    signal_breakdown: SignalBreakdown

class GpsRiskRequest(BaseModel):
    doctor_id: str = Field(..., example="doc-001")
    timestamp: str = Field(..., example="2026-09-22T14:30:00Z")
    latitude: float = Field(..., example=6.9271)
    longitude: float = Field(..., example=79.9802)
    reference_campus: Optional[str] = Field("SLIIT_MALABE", example="SLIIT_MALABE")
    geofence_id: Optional[str] = Field("sliit-malabe", example="sliit-malabe")

class GpsRiskResponse(BaseModel):
    doctor_id: str
    timestamp: str
    latitude: float
    longitude: float
    reference_campus: str
    distance_km: float
    is_outside_geofence: bool
    distance_risk_score: float
    time_of_day_risk_score: float
    gps_risk_score: float
    risk_level: str
    notify_security: bool
    security_reason: Optional[str] = None
