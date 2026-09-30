# MedGuard EHR: Production Readiness Audit Report
**Date:** September 30, 2026  
**Auditor:** Principal Engineer & Healthcare Information Security Architect  
**Target System:** MedGuard EHR (Clinical Information System & Risk-Aware Access Gate)  
**Branch:** `production-readiness`  
**Baseline Git Tag:** `demo-version`  
**Compliance Standard:** OWASP ASVS Level 2, OWASP Top 10, Healthcare Data Governance (SLMC & Clinical Privacy)

---

## Executive Summary

MedGuard EHR has been architected with powerful clinical concepts: dynamic context-aware risk-based access control (RiskBAC), granular patient consent enforcement, emergency override (ER break-glass protocols), staff location safety tracking, and an immutable audit ledger. 

However, an exhaustive audit reveals that the current codebase is an **academic demonstration prototype**. Authorization decisions are dictated by unverified client headers; 2FA one-time passcodes are leaked directly in API response payloads and server console logs; passwords are stored in cleartext in a flat JSON file; cryptographic keys are trivial deterministic hashes; and the immutable audit ledger relies on an ephemeral local development blockchain node initialized with universally known Hardhat private keys.

This audit provides a comprehensive inventory of demo artifacts, ranks security vulnerabilities, outlines architectural gaps against OWASP ASVS Level 2, presents 7 pivotal architectural decisions for executive confirmation, and details the execution roadmap for Phases 1 through 9.

---

## a) System Architecture & Technology Stack Analysis

### 1. Framework, Router, and Language
* **Frontend:**
  * **Framework:** React 18.2.0 bundled via Vite 5.2.0.
  * **Styling & Tokens:** Tailwind CSS 3.4.3 with custom color tokens (`navy`, `surface`, `border`, `primary`, `critical`, `warning`, `success`).
  * **Icons & Maps:** Lucide React (v0.363.0) and Leaflet (v1.9.4).
  * **Routing:** Monolithic single-page application (SPA) state router in `frontend/src/App.jsx` using `useState` (`activeTab: "queue" | "chart" | "audit" | "tracking" | "portal" | "admin"`). No framework router (React Router or Next.js App Router).
* **Backend:**
  * **Framework:** Node.js with Express 4.19.2.
  * **Routing:** Modular Express routers mounted in `backend/src/server.js`:
    * `/api/auth` -> `backend/src/routes/auth.js`
    * `/api/patients` -> `backend/src/routes/patients.js`
    * `/api/tracking` -> `backend/src/routes/tracking.js`
    * `/api/admin` -> `backend/src/routes/admin.js`
    * `/api` -> `backend/src/routes/accessRequest.js` & `breakGlass.js`
* **Risk Engine:**
  * Python 3 with FastAPI (`risk-engine/app/main.py`) running on `http://127.0.0.1:8000`.
* **Policy Engine:**
  * Open Policy Agent (OPA) server running on `http://127.0.0.1:8181`, evaluating Rego policies (`policy/access_policy.rego`).
* **Smart Contracts & Blockchain:**
  * Solidity 0.8.20 compiled with Hardhat (`contracts/AccessAuditLog.sol`, `contracts/ConsentRegistry.sol`, `contracts/BreakGlassRegistry.sol`).

### 2. Database and ORM
* **Engine:** There is **no database engine** (no PostgreSQL, SQLite, MySQL, or MongoDB) and **no ORM/query builder** (no Prisma, Knex, or TypeORM).
* **Primary Store:** A single JSON file on local disk: `backend/data/ehr_database.json` (49 KB).
  * All reads and writes are performed synchronously via Node.js `fs.readFileSync` and `fs.writeFileSync` in `backend/src/services/ehrDatabase.js`.
  * Lacks atomic transactions, connection pooling, concurrency locks, indexing, and data integrity constraints.
* **Secondary Store (Encrypted Records):** Directory at `backend/data/ipfs_storage/` containing individual JSON files per patient (e.g., `patient-123.json`), simulating an IPFS blockstore.

### 3. Authentication & Session Management
* **Auth Library:** `jsonwebtoken` (v9.0.2). No authentication framework (Passport, Auth.js/NextAuth, Lucia).
* **Session Mechanism:**
  * Clinician and administrator logins generate a stateless JWT signed with a hardcoded fallback string (`config.jwtSecret`) valid for 8 hours (`backend/src/routes/auth.js:320`).
  * The JWT is transmitted in the response body and held in client-side React memory.
  * There is **no server-side session registry**, no HTTP-only cookies, no token revocation list, and no Redis cache.
  * Crucially, clinical data routes (`/api/patients`, `/api/patients/:id`, `/api/admin/*`) **do not inspect the JWT**. They rely on unauthenticated custom headers (`x-doctor-address`, `x-device-fingerprint`).

### 4. Subsystems
* **Location & Geofence Ingestion:**
  * Frontend acquires GPS coordinates via browser `navigator.geolocation.getCurrentPosition` and calculates distance to SLIIT Malabe Campus `(6.9147, 79.9733)` using Haversine formula.
  * Backend matches IP addresses against hardcoded CIDRs in `TRUSTED_NETWORKS` (`backend/src/routes/auth.js:67-70`).
  * Tracking webhook receiver (`POST /api/tracking/geofence-webhook`) accepts unauthenticated payloads.
  * A dedicated simulation endpoint (`POST /api/tracking/simulate-exit`) manually overrides coordinates to trigger geofence alerts.
* **Risk Engine (RiskBAC):**
  * Evaluates 4 signals: Time (15%, SLST 08:30–17:00), Location (35%, IP CIDR + GPS), Device Trust (25%, fingerprint), and Behavioral Velocity (25%, access frequency).
  * Composite risk formula: $\text{Risk} = 0.7 \times \text{WeightedSum} + 0.3 \times \text{MaxSignal}$.
  * Evaluated by Python FastAPI (`/evaluate-risk`). If the Python service is offline, falls back to an in-process JavaScript formula (`backend/src/services/riskService.js:125`).
* **Audit Ledger:**
  * Backed by `AccessAuditLog.sol` deployed on a local Hardhat EVM node (`http://127.0.0.1:8545`).
  * When transactions fail or the node is offline, records are pushed to `mockAuditLedger`—an in-memory JavaScript array in `backend/src/services/auditService.js:19` that is wiped when the process restarts.
* **Email & 2FA:**
  * Uses `nodemailer`. If SMTP credentials are missing, falls back to console logging and in-memory storage (`backend/src/services/emailService.js:140-165`).
  * 2FA generation uses `crypto.randomInt(100000, 999999)` stored in a local `Map` with a 5-minute TTL.

---

## b) Comprehensive Demo Inventory

The following table catalogs all demo-only code, seeded accounts, hardcoded secrets, simulation hooks, and mock artifacts:

| Category | File | Line(s) | Description |
| :--- | :--- | :--- | :--- |
| **Seeded Accounts** | `backend/src/routes/auth.js` | 8–57 | `DEMO_DOCTORS` array with 4 clinician personas, all sharing plain password `Password123!` and hardcoded dev Ethereum addresses. |
| **Seeded Accounts** | `backend/src/routes/auth.js` | 223–236 | Hardcoded root administrator login (`username: "admin"`, `password: "Admin123!"`) with Hardhat Account #0 address. |
| **Seeded Accounts** | `backend/src/services/ehrDatabase.js` | 30–43, 98–150 | Automatically re-seeds `DEMO_DOCTORS` with plain-text passwords into `ehr_database.json` on startup. |
| **Seeded Accounts** | `frontend/src/data/mockData.js` | 8–70 | `MOCK_DOCTORS` array hardcoding 5 doctor/admin credentials (`Password123!`, `Admin123!`). |
| **Persona Selectors** | `frontend/src/components/LoginScreen.jsx` | 412–441 | "Quick-Select Enrolled Clinician Persona" 3-column button grid prefilling credentials. |
| **Persona Selectors** | `frontend/src/components/LoginScreen.jsx` | 662–688 | "Quick-Select Enrolled Patient" 1-click login allowing patient chart access without authentication. |
| **Persona Selectors** | `frontend/src/components/LoginScreen.jsx` | 370–381 | "Hospital Administrator" button automatically setting username to `admin` and password to `Admin123!`. |
| **Persona Selectors** | `backend/src/routes/auth.js` | 412–421 | `GET /api/auth/demo-accounts` exposing all clinician accounts and passwords to the public browser. |
| **Persona Selectors** | `backend/src/routes/auth.js` | 394–409 | `GET /api/auth/patient-accounts` exposing seeded patient demographics for 1-click login. |
| **Prefilled Fields** | `frontend/src/components/LoginScreen.jsx` | 49–51 | Initial state prefilled to `selectedPreset: MOCK_DOCTORS[0]`, `password: "Password123!"`. |
| **Prefilled Fields** | `frontend/src/components/LoginScreen.jsx` | 67 | Initial patient identifier state prefilled to `"PHN-772910"`. |
| **Prefilled Fields** | `frontend/src/components/PatientChart.jsx` | 54, 57–60 | Clinical forms prefilled with mock vitals (`120/80`, `72`, `98`, `36.8°C`). |
| **Mock Data** | `frontend/src/data/mockData.js` | 1–561 | Static arrays: `MOCK_DOCTORS`, `INITIAL_PATIENTS`, and `INITIAL_AUDIT_LOGS`. |
| **Mock Data** | `frontend/src/App.jsx` | 4–7, 26–27 | Patient queue and audit ledger initialized from static frontend arrays. |
| **Mock Data** | `backend/src/services/ehrDatabase.js` | 520–750 | Synthetic patient database seeded with mock Sri Lankan demographics, vitals, and encounters. |
| **Simulated Location** | `backend/src/routes/tracking.js` | 180–237 | `POST /api/tracking/simulate-exit` endpoint forcing doctor location to Kaduwela Junction `(6.9421, 79.9912)`. |
| **Simulated Location** | `frontend/src/components/StaffSafetyMap.jsx` | 170–215 | Client-side simulation handler executing `/api/tracking/simulate-exit`. |
| **Simulated Location** | `backend/src/routes/auth.js` | 428, 438 | Accepts `simulated_ip` query parameter and `x-simulated-ip` header to spoof internal hospital network. |
| **Simulated Location** | `backend/src/routes/patients.js` | 84 | Accepts `ip_address` query parameter and `x-simulated-ip` header to spoof risk engine location checks. |
| **Bypass Codes** | `backend/src/services/emailService.js` | 175–176 | Dispatched OTP returned directly in API response body (`previewOtp: otp`, `latestEmail.otp`). |
| **Bypass Codes** | `backend/src/routes/auth.js` | 532–544 | `GET /api/auth/latest-email` returns the active 2FA OTP to any unauthenticated caller. |
| **Bypass Codes** | `backend/src/routes/patients.js` | 91–94 | Device trust check bypassed if fingerprint contains `"enrolled"`, `"alice"`, or `"secure"`. |
| **Bypass Codes** | `backend/src/routes/auth.js` | 353–379 | `POST /api/auth/patient-login` requires no password or secret; any valid PHN issues a full JWT. |
| **Hardcoded Secrets** | `backend/src/config/index.js` | 11 | Hardhat Account #0 default private key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`. |
| **Hardcoded Secrets** | `backend/src/config/index.js` | 17 | Default fallback JWT secret: `"medguard_v2_super_secure_backend_jwt_secret_2026"`. |
| **Hardcoded Secrets** | `backend/src/config/index.js` | 18 | Default fallback MFA secret: `"medguard_mfa_stepup_secret_2026"`. |
| **Hardcoded Secrets** | `backend/src/config/contracts.json` | 2–6 | Hardcoded contract addresses (`0x5FbDB2...`), Hardhat RPC (`http://127.0.0.1:8545`), and dev private key. |
| **Hardcoded Secrets** | `backend/src/services/consentService.js` | 29–32 | Deterministic AES keys derived from strings `"patient-123-key"` and `"patient-456-key"`. |
| **Hardcoded Secrets** | `backend/src/routes/patients.js` | 430, 468, 501 | Deterministic AES key calculation: `sha256("${patientId}-key")`. |
| **Hardcoded Config** | `risk-engine/app/config.py` | 28–57 | Hardcoded CIDR ranges, subnets, and mock device fingerprints. |
| **Hardcoded Config** | `frontend/src/components/layout/AppShell.jsx` | 587–589 | Static footer text: `Smart Contract: 0x5FbD...aa`, `Node #04 (SLIIT Perimeter)`. |
| **Hardcoded Config** | `frontend/src/components/LoginScreen.jsx` | 325 | Static footer text: `Node 0x5FbD...aa`. |
| **Hardcoded Config** | `frontend/src/components/ComplianceAuditCenter.jsx` | 205 | Static contract address display: `0x5FbDB2315678afecb367f032d93F642f64180aa3`. |
| **Demo Banners & Claims** | `frontend/src/components/layout/AppShell.jsx` | 531 | Exposed technical name: `Engine: RiskBAC OPA Policy Gate`. |
| **Demo Banners & Claims** | `frontend/src/components/layout/AppShell.jsx` | 568 | Technical acronym: `ER Break-Glass (RAP)`. |
| **Demo Banners & Claims** | `frontend/src/components/layout/AppShell.jsx` | 594 | Invented claim: `All clinical records audited under SLMC & HIPAA data governance protocols.` |
| **Demo Banners & Claims** | `frontend/src/components/LoginScreen.jsx` | 313, 317 | `SLIIT Malabe Campus Clinical Perimeter`, `SLMC Medical Practitioner Registration Gate`. |
| **Demo Banners & Claims** | `frontend/src/components/ComplianceAuditCenter.jsx` | 196 | Solidity file name exposed in UI header: `AccessAuditLog.sol`. |
| **Demo Banners & Claims** | `risk-engine/app/config.py` | 30, 37 | Facility names explicitly tagged with `(demo range)`. |
| **Raw JSON Output** | `backend/src/server.js` | 26 | `GET /api/audit-logs` exposes raw JSON audit log entries without formatting or protection. |
| **Console Logs** | `backend/src/server.js` | 42 | Server startup log. |
| **Console Logs** | `backend/src/services/auditService.js` | 50 | Audit event string log. |
| **Console Logs** | `backend/src/services/emailService.js` | 24, 31 | SMTP initialization logs. |
| **Console Logs** | `backend/src/services/emailService.js` | 166 | **High Risk:** Plaintext 2FA OTP printed to console log (`2FA OTP [123456] dispatched...`). |
| **Sample Identifiers** | `frontend/src/components/LoginScreen.jsx` | 69–72 | Synthetic Sri Lankan NICs (`198511204592`, `197412903341`, `199023401123`, `198810293847`). |
| **HTML / Metadata** | `frontend/index.html` | 6 | Generic title: `MedGuard EHR — Clinical Information System` (does not follow standard). |
| **HTML / Metadata** | `frontend/index.html` | 7–9 | External Google Fonts CDN links (`fonts.googleapis.com`, `fonts.gstatic.com`). |
| **HTML / Metadata** | `frontend/index.html` | 1–16 | Missing custom favicon and missing `<meta name="robots" content="noindex, nofollow" />`. |
| **Blockchain Verification** | `backend/src/config/contracts.json` | 2–6 | **Confirms Dev Node:** The ledger runs strictly against a local Hardhat node (`http://127.0.0.1:8545`) using standard Hardhat Account #0 default keys. It is not an enterprise consortium blockchain. |

---

## c) Security Vulnerability Findings (Ranked)

### Critical Severity

#### 1. Complete Absence of Server-Side Authorization & Client Identity Spoofing (OWASP A01: Broken Access Control)
* **Locations:** `backend/src/routes/patients.js:74-85`, `backend/src/routes/admin.js:8-100`, `backend/src/middleware/auth.js:20-27`.
* **Details:**
  * Endpoints fetching or modifying sensitive clinical records do not verify the bearer JWT or session cookie.
  * In `patients.js:83`, physician identity is read directly from `req.headers["x-doctor-address"]` or `req.query.doctor_address`, falling back to `"0x70997970C51812dc3A010C7d01b50e0d17dc79C8"`.
  * Administrative routes in `admin.js` (`POST /api/admin/users/:id/reset-password`, `DELETE /api/admin/users/:id`, `POST /api/admin/users/:id/toggle-status`) perform **no role checks or authentication**. An anonymous caller can permanently delete physician accounts or reset administrative passwords.

#### 2. Complete 2FA One-Time Passcode Leakage & Authentication Bypass (OWASP A07: Identification and Authentication Failures)
* **Locations:** `backend/src/services/emailService.js:166, 175-176`, `backend/src/routes/auth.js:532-544`, `backend/src/routes/patients.js:91-94`.
* **Details:**
  * When 2FA is triggered, the generated 6-digit OTP is returned directly in the HTTP JSON response body (`previewOtp: otp`, `latestEmail.otp`).
  * `GET /api/auth/latest-email` allows any unauthenticated user to fetch the active OTP.
  * The plain OTP is printed to the Node.js console log.
  * Device trust verification contains a hardcoded bypass (`patients.js:92-94`): any device fingerprint containing the substring `"enrolled"`, `"alice"`, or `"secure"` is treated as a trusted hardware enclave.

#### 3. Unauthenticated Patient Portal Access (BOLA / IDOR) (OWASP A01: Broken Access Control)
* **Locations:** `backend/src/routes/auth.js:353-379`.
* **Details:**
  * `POST /api/auth/patient-login` requires only a patient identifier (PHN or NIC). No password, challenge, or multi-factor verification is required.
  * Any party possessing a patient's public identifier can log in and view their medical history or manipulate physician consent delegations.

#### 4. Plain-Text Password Storage & Direct String Comparison (OWASP A02: Cryptographic Failures)
* **Locations:** `backend/data/ehr_database.json`, `backend/src/routes/auth.js:218`.
* **Details:**
  * User credentials in `ehr_database.json` are stored in plain text (e.g., `"Password123!"`, `"Admin123!"`).
  * Passwords are verified using non-constant-time string comparison (`doctor.password !== password`), exposing the system to credential theft and timing attacks. No hashing algorithm (Argon2id, bcrypt, PBKDF2) is implemented.

#### 5. Deterministic Pseudo-Encryption of Clinical Records (OWASP A02: Cryptographic Failures)
* **Locations:** `backend/src/routes/patients.js:430, 468, 501`, `backend/src/services/consentService.js:29-32`.
* **Details:**
  * AES-256-GCM encryption keys for patient records are derived deterministically: `sha256("${patientId}-key")`.
  * Anyone knowing the patient identifier can trivially calculate the decryption key, rendering the on-chain key release protocol and IPFS encryption moot.

---

### High Severity

#### 6. Hardcoded Secrets in Configuration & Version Control (OWASP A05: Security Misconfiguration)
* **Locations:** `backend/src/config/index.js:11, 17, 18`, `backend/src/config/contracts.json:6`.
* **Details:** Hardhat Account #0 private key, default JWT secrets, and MFA challenge secrets are committed to the repository and used as fallbacks if environment variables are unset.

#### 7. Client-Controlled IP Spoofing & Geofence Bypass (OWASP A01: Broken Access Control)
* **Locations:** `backend/src/routes/auth.js:428, 438`, `backend/src/routes/patients.js:84`.
* **Details:**
  * Backend endpoints accept `x-simulated-ip` headers or `simulated_ip` query parameters.
  * An attacker can forge an internal hospital subnet IP (`172.20.10.8`), bypassing the RiskBAC location penalty from any external network.

#### 8. Unrestricted CORS & Public Sensitive Data Endpoints (OWASP A05: Security Misconfiguration)
* **Locations:** `backend/src/server.js:16, 25-27`, `backend/src/routes/auth.js:412-421`.
* **Details:**
  * `cors()` is configured with default wildcard permissions (`*`).
  * `GET /api/audit-logs` exposes all GRC and clinical access audit records to unauthenticated external clients.
  * `GET /api/auth/demo-accounts` publicly dumps seeded doctor usernames and demo passwords.

#### 9. High-Severity npm Vulnerabilities (OWASP A06: Vulnerable and Outdated Components)
* **Details:**
  * **Backend:** `serialize-javascript` (High - Prototype Pollution / RCE via Mocha dependency).
  * **Frontend:** `vite` (High - Path Traversal / Denial of Service in Dev Server), `esbuild` (Moderate).

---

### Medium Severity

#### 10. Concurrency Race Conditions & Data Loss via JSON File Persistence (OWASP A04: Insecure Design)
* **Locations:** `backend/src/services/ehrDatabase.js:23-45`.
* **Details:** `ehr_database.json` is modified via synchronous blocking I/O without file locking. Concurrent writes from multiple clinicians risk file corruption and lost medical updates.

#### 11. Ephemeral In-Memory Fallback for Audit Ledger (OWASP A09: Security Logging and Monitoring Failures)
* **Locations:** `backend/src/services/auditService.js:19, 70-74`.
* **Details:** When the local Hardhat node is unavailable, audit events are saved to an in-memory array (`mockAuditLedger`). A server reboot silently obliterates the hospital's clinical compliance records.

#### 12. Missing HTTP Security Headers & Content Security Policy (OWASP A05: Security Misconfiguration)
* **Locations:** `backend/src/server.js:13-18`.
* **Details:** Express application does not use `helmet`. Missing headers: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, and `Referrer-Policy: no-referrer`.

#### 13. Absence of Server-Side Input Schema Validation (OWASP A03: Injection)
* **Locations:** `backend/src/routes/patients.js`, `backend/src/routes/auth.js`, `backend/src/routes/admin.js`.
* **Details:** No validation library (Zod, Joi) is used. Arbitrary strings and malformed payloads are accepted directly into application logic and storage.

---

### Low Severity

#### 14. External Third-Party CDN Dependency (Data Privacy & Leakage)
* **Locations:** `frontend/index.html:7-9`.
* **Details:** Google Fonts stylesheet and font files are loaded from external CDNs (`fonts.googleapis.com`), leaking hospital workstation IP addresses and user agents to Google (violates ASVS Level 2 and Safety Rule 6).

#### 15. Server Fingerprinting & Information Disclosure
* **Locations:** `backend/src/server.js:20-22`.
* **Details:** `GET /health` leaks service identity and version string (`medguard-backend`, `2.0.0`). Missing generic liveness/readiness probes.

---

## d) Production Readiness Gaps (OWASP ASVS Level 2 & Operations)

| OWASP ASVS v4.0 Area | Current Status | Required Production State |
| :--- | :--- | :--- |
| **V1: Architecture** | Single-tier JSON file; client controls identity via headers; hardcoded addresses. | Layered architecture with strict boundary validation, server-side identity resolution, and fail-closed security. |
| **V2: Authentication** | Cleartext passwords; client-side persona switching; 2FA OTP leaked in API responses. | Passwords hashed using Argon2id/bcrypt; real RFC 6238 TOTP with authenticator app onboarding; account lockouts. |
| **V3: Session Management** | Stateless JWT in localStorage/memory; 8-hour expiry; no revocation; no cookies. | Secure, HTTP-only, SameSite=Strict cookies; server-side session registry; explicit session revocation and idle timeouts. |
| **V4: Access Control** | Authorization missing on data endpoints; client dictates doctor ID and role. | Server-side RBAC/ABAC middleware on all API routes; authorization decisions bound strictly to authenticated session. |
| **V5: Validation** | Minimal manual string checks; no request schema validation; unvalidated inputs. | Comprehensive input validation using Zod schemas; strict sanitization; rejection of unauthorized payload fields. |
| **V6: Cryptography** | Deterministic AES keys (`sha256("${id}-key")`); hardcoded fallback JWT secrets. | Cryptographically secure random DEKs per patient; master KEK managed via environment variables; envelope encryption. |
| **V7: Error Handling & Logging** | Unstructured `console.log`; raw OTP logged; errors return internal error messages. | Structured logging (Pino/Winston); zero secret logging; sanitized user-facing error messages; correlation IDs. |
| **V8: Data Protection** | Cleartext PHI stored in flat JSON on disk; no data-at-rest encryption. | Relational database (PostgreSQL) with encrypted storage; data minimization; strict access auditing. |
| **V9: Communications** | Plain HTTP; wildcard CORS (`cors()`); external Google Fonts CDN. | Enforced TLS/HTTPS; strict CORS whitelist for hospital origin; local self-hosted fonts; zero external scripts. |
| **V10: Malicious Code** | High-severity vulnerabilities in Vite and Mocha dependencies. | Dependencies patched and updated; automated `npm audit` gate in CI/CD pipeline. |
| **Operations: Persistence** | Single flat JSON file (`ehr_database.json`); synchronous disk operations. | Relational database with versioned migrations (`db/migrations`); connection pooling; transactional integrity. |
| **Operations: Backup** | No backup or disaster recovery tooling; no point-in-time recovery. | Automated, non-destructive backup and restore scripts (`scripts/backup.sh`, `scripts/restore.sh`). |
| **Operations: Health** | Trivial `/health` endpoint returning hardcoded JSON. | Two-stage health check: `/health/live` (process alive) and `/health/ready` (DB and dependencies reachable). |
| **Operations: Audit Resilience** | In-memory array fallback on blockchain failure (data loss on restart). | Resilient audit ingestion: persistent append-only storage with background retry queues; clinical access never blocked. |

---

## e) Architectural Decisions for Confirmation (7 Key Choices)

Before commencing Phase 1, the following 7 architectural decisions require explicit confirmation:

### Decision 1: Primary Database Engine
* **Recommendation:** **PostgreSQL** using `pg` / `knex` with SQL migration scripts.
  * *Rationale:* Industrial standard for clinical EHR systems (Epic, Oracle Health). Provides ACID transactions, row-level locking, relational integrity between patients, encounters, vitals, and users, and native JSONB support for clinical observations.
* **Alternative:** **SQLite with WAL (Write-Ahead Logging) Mode**.
  * *Trade-off:* Zero configuration and runs as an embedded file without an external PostgreSQL service, but lacks robust multi-process concurrency and high-availability clustering.

### Decision 2: Authentication & Session Delivery
* **Recommendation:** **Secure, HTTP-only, SameSite=Strict Cookies** with server-side session tracking in the database.
  * *Rationale:* Eliminates token theft via Cross-Site Scripting (XSS), supports instant server-side revocation on suspicious activity or logout, and satisfies OWASP ASVS Level 2 requirements for session handling.
* **Alternative:** **Short-lived Bearer JWTs (15 min) + Refresh Tokens in HTTP-only Cookies**.
  * *Trade-off:* Stateless API scalability, but requires maintaining a token blacklist or refresh database to support immediate revocation.

### Decision 3: Audit Ledger Architecture
* **Recommendation:** **Cryptographic SHA-256 Hash-Chained Append-Only Audit Table in PostgreSQL** (Merkle-style chained hashes with periodic digital signatures).
  * *Rationale:* Provides mathematical tamper-evidence (any modification breaks the hash chain) without the operational fragility, gas fees, latency, or RPC failures of running a local Hardhat Ethereum node.
* **Alternative:** **Hybrid Dedicated EVM Consortium Node (Hyperledger Besu / Local Geth)**.
  * *Trade-off:* Preserves the smart contract architecture (`AccessAuditLog.sol`), but requires managing an active blockchain RPC daemon, signer keys, and gas balances, with high risk of downtime during clinical emergencies.

### Decision 4: Patient Record Encryption & Key Management
* **Recommendation:** **Envelope Encryption with AES-256-GCM**. Each patient record has a randomly generated 256-bit Data Encryption Key (DEK). DEKs are encrypted using a Key Encryption Key (KEK) loaded securely from environment variables.
  * *Rationale:* Eliminates predictable deterministic keys (`sha256(patientId-key)`), ensures clinical confidentiality at rest, and allows key rotation without re-encrypting all patient historical data.
* **Alternative:** **PostgreSQL Native Transparent Data Encryption / `pgcrypto`**.
  * *Trade-off:* Simpler application code, but couples encryption directly to the database engine rather than maintaining application-level field/document encryption.

### Decision 5: Location & Staff Safety Ingest Protocol
* **Recommendation:** **HMAC-SHA256 Signed Webhook Ingest for Traccar / MDM GPS Devices**. Requests must carry an `X-Signature-SHA256` header calculated with a shared secret. All simulated IP headers (`x-simulated-ip`) and simulation endpoints are strictly removed.
  * *Rationale:* Ensures only authentic hospital MDM hardware can report staff positions. Protects against telemetry spoofing and fake geofence alerts.
* **Alternative:** **Mutual TLS (mTLS) Client-Certificate Authentication**.
  * *Trade-off:* Highest possible cryptographic assurance, but requires managing client certificates on mobile staff devices and reverse proxy termination.

### Decision 6: Multi-Factor Authentication (2FA) Implementation
* **Recommendation:** **RFC 6238 Time-Based One-Time Passwords (TOTP)** compatible with Google Authenticator / Microsoft Authenticator / 1Password.
  * *Rationale:* Eliminates dependency on external SMTP email infrastructure, functions offline on hospital intranets, prevents email interception, and removes the current security flaw where OTPs are leaked in API responses.
* **Alternative:** **Hardened SMTP Email / SMS OTP Delivery**.
  * *Trade-off:* Familiar user experience, but requires an external transactional email provider (SendGrid, Mailgun) or SMS gateway, fails when outbound Internet is restricted, and introduces network delivery latency.

### Decision 7: API Validation & Policy Gate Enforcement
* **Recommendation:** **Zod Schema Validation Middleware + In-Process Express Context Evaluator**. Every incoming request payload is validated against strict Zod schemas. RiskBAC scoring and consent checks are executed as native Express middleware before reaching route handlers.
  * *Rationale:* Zero runtime network overhead, type-safe error messages, fail-closed access control, and complete removal of client header tampering.
* **Alternative:** **External OPA (Open Policy Agent) HTTP Sidecar Delegator**.
  * *Trade-off:* Keeps Rego policies externalized, but introduces an HTTP hop per clinical request and requires maintaining an active OPA daemon.

---

## f) Phase Implementation Plan (Phases 1 through 9)

| Phase | Title | Scope & Objectives | Risk Level | Expected File Changes |
| :---: | :--- | :--- | :---: | :--- |
| **Phase 1** | **Database & Data Modeling** | • Establish production schema (users, patients, encounters, vitals, prescriptions, audit_ledger, devices).<br>• Write database connection pool and migration runner.<br>• Implement safe data cleanup script (`--dry-run` default).<br>• Disable legacy accounts. | Medium | • `backend/src/db/*` (new schema, migrations, connection)<br>• `scripts/cleanup-legacy-data.js`<br>• `backend/package.json` |
| **Phase 2** | **Server-Side Auth & Sessions** | • Password hashing with Argon2id/bcrypt.<br>• Secure HTTP-only SameSite cookie sessions.<br>• Real RFC 6238 TOTP 2FA onboarding & verification.<br>• Remove all demo credentials, persona switches, and OTP response leaks. | High | • `backend/src/routes/auth.js`<br>• `backend/src/services/authService.js`<br>• `frontend/src/components/LoginScreen.jsx`<br>• `frontend/src/components/MFAChallenge.jsx` |
| **Phase 3** | **Access Control & Policy** | • Server-side RBAC (Doctor, Admin, Patient).<br>• Server-enforced patient consent validation.<br>• Server-side Context-Aware RiskBAC calculation (no client IP/device spoofing).<br>• Cryptographic emergency break-glass override. | High | • `backend/src/middleware/auth.js`<br>• `backend/src/middleware/rbac.js`<br>• `backend/src/routes/patients.js`<br>• `backend/src/routes/admin.js`<br>• `backend/src/routes/breakGlass.js` |
| **Phase 4** | **Tamper-Evident Audit Ledger** | • Cryptographic SHA-256 hash-chained append-only audit trail.<br>• Asynchronous non-blocking write queue with retry logic.<br>• Cryptographic chain verification tool (`verify-ledger`).<br>• Redact PHI from all audit entries. | Medium | • `backend/src/services/auditService.js`<br>• `backend/src/routes/audit.js`<br>• `scripts/verify-audit-chain.js`<br>• `frontend/src/components/ComplianceAuditCenter.jsx` |
| **Phase 5** | **Configuration & Secrets** | • Fail-closed environment variable validation on boot.<br>• Remove all hardcoded keys, addresses, and fallback secrets.<br>• Create comprehensive `.env.example` with strict placeholders.<br>• Verify `.env` git-ignore rules. | Low | • `backend/src/config/index.js`<br>• `.env.example`<br>• `.gitignore` |
| **Phase 6** | **Operational Hardening** | • Implement Helmet, strict CORS whitelist, and strict CSP.<br>• Rate limiting on authentication and sensitive clinical routes.<br>• Structured logging (Pino) without PHI/secret leaks.<br>• Automated database backup and restore scripts.<br>• Patch high-severity npm vulnerabilities. | Medium | • `backend/src/server.js`<br>• `scripts/backup.sh` / `scripts/restore.sh`<br>• `package.json` updates across backend & frontend |
| **Phase 7** | **Interface Standard & UI Polish** | • Align all screens to Design Tokens (navy, cool-grey, single blue primary, no gradients/emojis).<br>• Remove all demo tags, simulation buttons, and exposed technical names.<br>• Implement loading skeletons, empty states, and error states.<br>• Self-host Inter and JetBrains Mono fonts (remove Google CDN).<br>• Tab titles "Page name · MedGuard EHR", custom favicon, noindex meta. | Low | • `frontend/index.html`<br>• `frontend/src/components/layout/AppShell.jsx`<br>• `frontend/src/components/*`<br>• `frontend/src/index.css` |
| **Phase 8** | **Testing & Verification** | • Unit tests for auth, password hashing, and hash-chain audit.<br>• Integration tests for clinical workflows and break-glass.<br>• Security regression test suite (unauthenticated access, BOLA, IP spoofing, rate limiting). | Low | • `backend/tests/*`<br>• `frontend/tests/*`<br>• CI test runner scripts |
| **Phase 9** | **Operating Documentation & Build** | • Operating manual and deployment guide.<br>• Disaster recovery and emergency runbooks.<br>• Production containerization (Dockerfile, docker-compose).<br>• Production build verification (`npm run build`). | Low | • `docs/OPERATING_MANUAL.md`<br>• `docs/RUNBOOK.md`<br>• `Dockerfile` / `docker-compose.prod.yml` |

---

## Conclusion & Next Steps

This Phase 0 Audit has cataloged all vulnerabilities, demo artifacts, and architectural requirements for turning MedGuard EHR into a production-grade clinical system meeting OWASP ASVS Level 2 standards.

Per execution protocols, **zero code changes have been made in Phase 0**. The repository remains clean on branch `production-readiness` tagged at `demo-version`. 

Upon your confirmation of this audit and review of the 7 Architectural Decisions in Section (e), reply with **"continue"** to proceed to **Phase 1: Database & Data Modeling**.
