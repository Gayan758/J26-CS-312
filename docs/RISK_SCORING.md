# MedGuard RiskBAC: Risk Scoring Formula & Mathematical Rationale

## 1. Final Risk Scoring Formula

The MedGuard Context-Aware Risk-Based Access Control (RiskBAC) engine calculates composite access risk using a blended weighted-average and maximum-subscore formula:

$$R = 0.7 \times \left( w_t \cdot R_t + w_l \cdot R_l + w_d \cdot R_d + w_b \cdot R_b \right) + 0.3 \times R_{\max}$$

Where:
* **$R_t \in [0, 1]$**: Login-time risk sub-score (evaluates shift adherence vs. off-hours anomaly).
* **$R_l \in [0, 1]$**: IP-geolocation / network risk sub-score (evaluates hospital LAN, VPN, or impossible travel).
* **$R_d \in [0, 1]$**: Device-fingerprint risk sub-score (evaluates enrolled secure enclave vs. rogue terminal).
* **$R_b \in [0, 1]$**: Behavioural-deviation / asset sensitivity risk sub-score (evaluates requested data classification).
* **$w_t, w_l, w_d, w_b$**: Configurable signal weights summing strictly to $1.0$.
* **$R_{\max} = \max(R_t, R_l, R_d, R_b)$**: The single highest individual risk sub-score among all extracted signals.

---

## 2. Weighting Configuration & Rationale

| Signal Parameter | Weight | Default Value | Rationale |
|---|---|---|---|
| **$w_l$ (Geolocation / IP)** | Geolocation Risk | **0.35** | Network origin and IP geo-velocity are the primary indicators of remote session hijacking and credential credential compromise. |
| **$w_d$ (Device Signature)** | Device Fingerprint | **0.25** | Device integrity and cryptographic secure-enclave verification strongly differentiate authorized clinical terminals from rogue attackers. |
| **$w_b$ (Behavior / Sensitivity)**| Asset Sensitivity | **0.25** | The sensitivity level of requested records dictates the potential impact radius of unauthorized disclosure. |
| **$w_t$ (Temporal / Time)** | Shift Schedule | **0.15** | Shift time is a helpful contextual signal but carries lower weight to avoid falsely penalizing emergency overtime or irregular clinical shifts. |

$$\sum_{i \in \{t, l, d, b\}} w_i = 0.15 + 0.35 + 0.25 + 0.25 = 1.0$$

---

## 3. The $0.3 \times R_{\max}$ Compensating Term: Design Intent

A critical vulnerability of naive linear weighted-average risk models in access control is **signal dilution**.

### The Problem: Naive Weighted Averages
Consider an attacker who obtains valid doctor credentials and logs in from an impossible-travel geolocation or known bulletproof proxy ($R_l = 0.95$), but performs the login during standard working hours ($R_t = 0.05$), spoofing a partially matching device string ($R_d = 0.05$), requesting a general record ($R_b = 0.10$).

Under a simple weighted average:
$$\text{Weighted Score} = (0.15 \times 0.05) + (0.35 \times 0.95) + (0.25 \times 0.05) + (0.25 \times 0.10) = 0.365$$

In many systems, $0.365$ falls within a benign or low-medium range, severely under-reacting to what is an unambiguous red flag (impossible travel).

### The Solution: Blended Compensating Term
The MedGuard formula explicitly incorporates $+ 0.3 \times R_{\max}$:

$$R_{\max} = \max(0.05, 0.95, 0.05, 0.10) = 0.95$$
$$R = 0.7 \times (0.365) + 0.3 \times (0.95) = 0.2555 + 0.2850 = 0.5405 \quad (\text{Elevated to MEDIUM})$$

The $0.3 \times R_{\max}$ term guarantees that:
1. One catastrophic anomaly cannot be washed out by multiple benign context features.
2. The system triggers Step-Up MFA or BLOCK whenever any individual signal breaches critical safety thresholds.
3. This blended design is a deliberate compensating mechanism, not an accident, ensuring defense-in-depth for healthcare records.

---

## 4. Policy Decision Thresholds

| Risk Range | Classification | OPA Decision | System Response |
|---|---|---|---|
| **$R < 0.30$** | **LOW** | `ALLOW` | Two-branch decryption: parallel on-chain file lookup + key release $\to$ plaintext returned. |
| **$0.30 \le R < 0.65$** | **MEDIUM** | `MFA_REQUIRED` | Time-boxed MFA challenge token issued; access blocked until 6-digit OTP is verified. |
| **$R \ge 0.65$** | **HIGH** | `BLOCK` | Access blocked immediately. Generic 403 returned with zero signal leakage to prevent probing. |

---

## 5. API Specification: `POST /score`

### Request Payload
```json
{
  "user_id": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "timestamp": "2026-09-03T14:22:00Z",
  "ip_address": "203.0.113.5",
  "device_fingerprint": "sha256:alice-workstation-secure-enclave",
  "requested_patient_id": "patient-123",
  "requested_record_sensitivity": "high"
}
```

### Response Payload
```json
{
  "risk_score": 0.42,
  "risk_level": "MEDIUM",
  "signal_breakdown": {
    "login_time_score": 0.10,
    "geo_velocity_score": 0.60,
    "device_score": 0.30,
    "behavior_score": 0.20,
    "weighted_component": 0.315,
    "max_component": 0.60,
    "final_score": 0.42
  }
}
```
