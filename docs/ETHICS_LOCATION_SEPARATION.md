# MedGuard Clinical EHR: Ethics, Location Separation & Data Protection Architecture

## 1. Executive Summary & Core Ethical Imperative

In healthcare information security, conflating **clinical data access authorization** with **employee physical location tracking** creates severe bioethical, legal, and operational risks:
1. **Surveillance Creep:** Subjecting healthcare workers to continuous personal GPS tracking as a prerequisite for reviewing patient charts creates an intrusive panopticon that destroys clinician trust.
2. **Signal Dilution & Denial of Care:** A doctor legitimately reviewing an urgent laboratory report from their hospital desk might be blocked if personal GPS drifts or fails indoors (multipath attenuation).
3. **Regulatory Illegality:** Storing high-frequency personal GPS coordinates alongside Protected Health Information (PHI) violates data minimisation under the **Sri Lanka Personal Data Protection Act No. 9 of 2022 (PDPA)**, the **EU General Data Protection Regulation (GDPR)**, and the **HIPAA Privacy Rule**.

To resolve these tensions, the **MedGuard Clinical EHR** architecture strictly isolates **Risk-Based Access Control (RiskBAC)** from **Staff Physical Safety & Lone-Worker Tracking (Traccar + Flutter)**.

---

## 2. The 5 Axioms of Architectural & Ethical Separation

```
+-----------------------------------------------------------------------------------+
|                            CLINICAL WORKSTATION LAYER                             |
|                                                                                   |
|  Doctor requests EMR Access (Browser)                                             |
|        |                                                                          |
|        v                                                                          |
|  [ IP Subnet Match: 172.20.10.0/28 ]  --> [ RiskBAC Engine (OPA + Python) ]       |
|        |                                          |                               |
|        | (Zero GPS coordinates)                   v                               |
|        |                                  [ Access Decision: ALLOW / MFA / BLOCK ]|
|        |                                          |                               |
|        +----------------------------------------> v                               |
|                                         [ Ethereum Blockchain Audit: AccessAuditLog.sol ]
+-----------------------------------------------------------------------------------+
                                          ||
                        STRICT ARCHITECTURAL SEPARATION
                        NO SHARED DATA PATHS OR STORAGE
                                          ||
+-----------------------------------------------------------------------------------+
|                              STAFF SAFETY LAYER                                   |
|                                                                                   |
|  Doctor's Mobile Device (Flutter App)                                             |
|        |                                                                          |
|        | (Voluntary Opt-In, Pauseable)                                            |
|        v                                                                          |
|  [ OsmAnd HTTP Ingestion :5055 ] ------> [ Traccar Engine / Webhook Service ]     |
|        |                                          |                               |
|        v                                          v                               |
|  [ Campus Geofence Boundary Check ] ----> [ Python Risk Engine: POST /gps-risk ]  |
|                                                   |                               |
|                                                   v                               |
|                                      [ Campus Security Dispatch & Rolling 60d DB ]|
+-----------------------------------------------------------------------------------+
```

---

### Axiom 1: Two Distinct Purposes

| Dimension | Primary Clinical Gate (RiskBAC) | Staff Safety & Lone-Worker Module |
|---|---|---|
| **Mission** | Safeguard patient electronic health records (EHR) against unauthorized exfiltration, session hijacking, and credential misuse. | Fulfil institutional *duty of care* to protect physicians, nurses, and field teams from physical assault, acute accidents, or isolation distress. |
| **Protected Entity** | Patient medical privacy & record integrity. | Clinician physical safety & life. |
| **Operational Trigger** | User action: clicking "Open Medical Chart" or executing a clinical mutation. | Background telemetry: continuous or geofenced periodic GPS pings from mobile smartphone. |

---

### Axiom 2: Two Distinct Technologies & Signal Mediums

1. **RiskBAC Network Location ($R_l$):**
   - Evaluates **only** the institutional network origin of the HTTP/WebSocket connection.
   - Matches against trusted CIDR subnets:
     - `172.20.10.0/28` (SLIIT Malabe Campus Health Center)
     - `10.200.0.0/16` (Seylan Tower 1 Clinic)
   - Operates with **zero reliance on GPS coordinates**. A doctor accessing records inside an electromagnetically shielded Radiology suite or underground bunker is never locked out due to satellite signal loss.
2. **Staff Safety Location:**
   - Ingests mobile satellite coordinates (WGS-84 latitude/longitude) via standard **OsmAnd protocol** over HTTP to Traccar on port 5055.
   - Evaluates campus geofence perimeters (SLIIT Malabe $400\text{m}$, Seylan Tower $250\text{m}$).
   - Computes physical transit distance via Haversine spherical geometry:
     $$d = 2r \arcsin \left( \sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)} \right)$$

---

### Axiom 3: Two Distinct Consent Paradigms

* **RiskBAC Consent (Non-Voluntary Institutional Rule):**
  - Access logging and context verification are mandatory conditions of clinical employment and institutional accreditation.
  - A clinician cannot "turn off" RiskBAC or disable blockchain audit logging while accessing patient records.
* **Staff Safety Consent (Sovereign Voluntary Opt-In):**
  - Tracking requires explicit, informed, signed consent (`consent_status = 'OPT_IN'`).
  - Clinicians possess an in-app **Sovereign Privacy Shield**: a toggle switch allowing them to suspend physical tracking at any moment (e.g., during off-duty hours, lunch breaks, or private consultations).
  - *Emergency Exception:* If the clinician triggers the **Emergency SOS button**, location broadcast activates immediately regardless of prior pause state, dispatching campus security to their exact coordinates.

---

### Axiom 4: Two Isolated Data Stores & Retention Cycles

1. **RiskBAC Clinical Ledger:**
   - Decisions (`ALLOW`, `MFA_REQUIRED`, `BLOCK`, `BREAK_GLASS`) are cryptographically sealed on the Ethereum blockchain via `AccessAuditLog.sol`.
   - Immutable and permanent: provides non-repudiable legal evidence for hospital compliance audits and judicial proceedings.
   - Contains **no personal GPS trajectories**.
2. **Staff Safety Database (`staff_tracking_devices`, `staff_geofence_events`):**
   - Stored in an isolated relational table schema completely detached from patient medical tables (`patients`, `medical_records`).
   - **Rolling 60-Day Auto-Purge:** Trajectory waypoints older than 60 days are permanently deleted by a background cron job to comply with data minimisation.
   - Access is strictly restricted to authorized Campus Security Officers; medical peers cannot view doctor locations.

---

### Axiom 5: Mathematical Non-Dilution Guarantee

The primary RiskBAC composite score is governed by:

$$R_{\text{access}} = 0.7 \times \left( 0.15 R_t + 0.35 R_l^{\text{CIDR}} + 0.25 R_d + 0.25 R_b \right) + 0.3 \times \max(R_t, R_l^{\text{CIDR}}, R_d, R_b)$$

Where $R_l^{\text{CIDR}} \in \{0.05, 0.95\}$ depends purely on subnet IP matching.

The secondary Staff Geofence Departure Risk is governed by:

$$R_{\text{gps}} = 0.6 \cdot R_{\text{dist}} + 0.4 \cdot R_{\text{tod}}$$

Where:
- $R_{\text{dist}} = \min\left(1.0, \frac{\text{Distance from Perimeter (km)}}{15.0}\right)$
- $R_{\text{tod}}$ evaluates whether departure occurs during active scheduled shift hours in Sri Lanka Standard Time (Asia/Colombo).

**The Non-Dilution Invariant:**
$R_{\text{gps}}$ is **never substituted** into the $R_{\text{access}}$ equation. A high $R_{\text{gps}}$ generates a campus security advisory and flags the staff member as off-campus; it does **not** dynamically alter the weights or thresholds of the clinical gatekeeper.

---

## 3. Regulatory Compliance Mapping

### Sri Lanka Personal Data Protection Act No. 9 of 2022 (PDPA)
* **Section 5 (Purpose Limitation):** Personal location telemetry collected for physical safety is processed strictly for lone-worker protection and dispatch, never reused for staff performance monitoring or access gating.
* **Section 6 (Data Minimisation):** Raw latitude/longitude points are kept for a maximum rolling window of 60 days before automatic deletion.
* **Section 14 (Right of Withdrawal of Consent):** Clinicians can withdraw consent or toggle location transmission off at will through the mobile Flutter client.

### EU General Data Protection Regulation (GDPR)
* **Article 5(1)(c) (Data Minimisation):** Clinical access systems request only IP subnet prefix; GPS coordinates are completely excluded from EMR queries.
* **Article 9 (Special Categories of Data):** Patient health records and clinician biometric/location data are separated into independent cryptographic silos.
* **Article 25 (Data Protection by Design & Default):** Privacy controls (pause toggle, opt-in consent, 60-day auto-purge) are built into the fundamental software schema.

### HIPAA Security Rule (45 CFR § 164.312)
* **Access Control (§ 164.312(a)(1)):** Unique user identification and multi-factor authentication remain independent of consumer device GPS state.
* **Audit Controls (§ 164.312(b)):** Immutably recorded on Ethereum smart contract without leaking geolocation metadata.

---

## 4. Emergency SOS Override: The "Physical Break-Glass" Protocol

Just as the clinical system provides **ER Break-Glass (RAP)** for critical patient resuscitation, the Staff Safety module provides an **Emergency SOS Protocol**:
1. **Trigger:** The doctor presses the red SOS button on their mobile Flutter app or web dashboard.
2. **Override:** If tracking was paused by the clinician, the client immediately overrides the pause and transmits high-frequency GPS fixes (every 5 seconds) to Traccar.
3. **Dispatch:** The backend broadcasts an immediate critical alert:
   - Visual red flashing alert on security map (`StaffSafetyMap.jsx`)
   - Dispatch priority set to `HIGH` / `CRITICAL`
   - Incident logged with cryptographic timestamp in `staff_safety_audit_log`
4. **Resolution:** The SOS state persists until explicitly acknowledged and resolved by either the clinician or campus security dispatch.
