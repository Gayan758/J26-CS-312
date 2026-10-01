# MedGuard Clinical EHR — Production Deployment & Operational Runbook

**System:** MedGuard EHR (v2.0.0 Production Readiness)  
**Security Classification:** OWASP ASVS Level 2 · HIPAA Security Rule · SLMC Governance  
**Target Architecture:** React/Vite Frontend · Node.js/Express API Gateway · PostgreSQL 14+ Database · Python RiskBAC Engine · Open Policy Agent (OPA) · EVM Audit Ledger  

---

## 1. System Overview & Architecture

MedGuard EHR is an enterprise clinical Electronic Health Record system engineered with a Zero-Trust, Context-Aware Risk-Based Access Control (RiskBAC) architecture and cryptographic tamper-evident audit logging.

```
                           +-------------------------------------+
                           |        MedGuard Web Frontend        |
                           |       (React + Vite + Tailwind)     |
                           +-------------------------------------+
                                              |
                                   HTTPS / TLS 1.3 (HSTS)
                                              v
                           +-------------------------------------+
                           |      MedGuard Express Backend       |
                           |   (OWASP ASVS L2 / Helmet / CORS)   |
                           +-------------------------------------+
                              /             |              \
                             v              v               v
               +-------------------+  +-----------+  +-------------------+
               | PostgreSQL 14+    |  | Python    |  | Open Policy Agent |
               | Encrypted Storage |  | RiskBAC   |  | (OPA Policy Eval) |
               | (AES-256 Envelope)|  | Engine    |  +-------------------+
               +-------------------+  +-----------+
                         |
                         v
               +-------------------+
               | Tamper-Evident    |
               | SHA-256 Ledger &  |
               | EVM Audit Anchor  |
               +-------------------+
```

### Core Security Guarantees
1. **Envelope Field Encryption**: All sensitive patient PHI (diagnoses, SOAP notes, vitals, prescriptions, national identifiers) is encrypted at rest using AES-256-GCM data encryption keys (DEKs) wrapped by a Master Encryption Key (KEK).
2. **Searchable Blind Indexing**: Deterministic HMAC-SHA256 blind indexing allows rapid query of encrypted identifiers without exposing cleartext values or decrypting the entire database.
3. **Fail-Closed Security Authorization**: Role-Based Access Control (RBAC), context-aware risk evaluation, and Dynamic Consent checks strictly fail closed (deny access) when services are unavailable or signals are anomalous.
4. **Non-Blocking Fail-Open Audit Writing**: In accordance with clinical life-safety requirements, audit writing enqueues failed writes to an asynchronous retry queue to ensure patient emergency care is never blocked by database connectivity hiccups.
5. **Tamper-Evident SHA-256 Ledger**: Every access decision, amendment, and administrative action is cryptographically chained using SHA-256 hashes ($\text{curr\_hash} = \text{SHA256}(\text{prev\_hash} : \text{CanonicalJSON}(\text{event}))$) and protected by a PostgreSQL `BEFORE UPDATE OR DELETE` immutability trigger.
6. **Separation of Duties**: Hospital IT administrators have rights to manage user provisioning, device enclaves, and hospital operational settings, but are strictly prohibited from viewing patient clinical records.

---

## 2. Infrastructure & Prerequisites

### Minimum System Requirements

| Component | Minimum Specification | Production Recommendation |
| :--- | :--- | :--- |
| **Application Server** | 2 vCPU, 4 GB RAM | 4 vCPU, 8 GB RAM (Node.js LTS cluster) |
| **Database Server** | 2 vCPU, 4 GB RAM, 20 GB SSD | 4 vCPU, 16 GB RAM, High-IOPS NVMe, Multi-AZ |
| **Microservices (Python/OPA)** | 1 vCPU, 2 GB RAM | 2 vCPU, 4 GB RAM |
| **Network** | 100 Mbps, TLS 1.3 termination | 1 Gbps redundant, Reverse Proxy (NGINX / Cloudflare) |

### Software Dependencies
- **Node.js**: v18.x or v20.x LTS
- **PostgreSQL**: v14.0 or higher
- **Python**: v3.10+ (for RiskBAC engine)
- **Open Policy Agent**: v0.50+
- **EVM Node (Optional)**: Hardhat node or private hospital EVM RPC

---

## 3. Environment Configuration & Key Protocol

MedGuard EHR enforces fail-closed startup validation. If any critical secret is missing, too short (< 32 characters), or matches a known default, the backend halts boot immediately (`process.exit(1)`).

### Production Key Generation Protocol

Generate high-entropy production secrets using standard cryptographic tools:

```bash
# 1. Generate JWT Session Secret (32 bytes / 256 bits)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Generate Master Encryption Key (AES-256-GCM KEK, 64 hex characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Generate Blind Index HMAC Secret (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 4. Generate MFA Step-Up Challenge Secret (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Required Production Environment Variables

Configure these variables via secure environment injection (e.g. AWS Secrets Manager, HashiCorp Vault, or systemd environment):

```ini
# Runtime & Network
PORT=5000
NODE_ENV=production
FRONTEND_URL=https://ehr.hospital.lk
ALLOWED_ORIGINS=https://ehr.hospital.lk,https://staff.hospital.lk

# PostgreSQL Database Connection
DATABASE_URL=postgresql://medguard_app:STRONG_RANDOM_PASSWORD@db.hospital.internal:5432/medguard?sslmode=verify-full

# Cryptographic Keys (MUST BE GENERATED UNIQUE PER DEPLOYMENT)
JWT_SECRET=<64-char-hex-string>
MASTER_ENCRYPTION_KEY=<64-char-hex-string>
IDENTIFIER_HMAC_SECRET=<64-char-hex-string>
MFA_CHALLENGE_SECRET=<64-char-hex-string>

# Microservice Endpoints
RISK_ENGINE_URL=http://127.0.0.1:8000
OPA_URL=http://127.0.0.1:8181/v1/data/medguard/access

# SMTP Email Configuration for Dynamic 2FA OTP
SMTP_HOST=smtp.hospital.lk
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=medguard-mailer
SMTP_PASS=STRONG_SMTP_PASSWORD
SMTP_FROM="MedGuard Clinical Security" <security@hospital.lk>
```

---

## 4. Database Setup, Migrations & Disaster Recovery

### Step 1: Run PostgreSQL Schema Migrations

MedGuard uses automated SQL migration files in `backend/src/db/migrations/`:

```bash
# Run all pending migrations
npm run db:migrate
```

This establishes:
- Envelope-encrypted `patients` schema with blind indices.
- Append-only `clinical_encounters` and `prescriptions` with optimistic concurrency versioning.
- The `audit_ledger` table with cryptographic SHA-256 chaining.
- The PostgreSQL `prevent_audit_modification()` immutability trigger.

### Step 2: Database Backup Procedure

Perform hot backups of the encrypted database before maintenance windows or via scheduled cron:

```bash
# Execute standalone encrypted backup
npm run db:backup
```

Backups are saved to `backups/backup-<timestamp>.sql`. Ensure backup directories have strict OS permissions (`chmod 700`).

### Step 3: Database Restore Procedure

To restore from an authorized backup archive:

```bash
# Execute restore from target backup file
npm run db:restore -- backups/backup-YYYY-MM-DDTHH-MM-SS.sql
```

---

## 5. Audit Trail Verification & Integrity Tooling

MedGuard includes automated cryptographic verification to prove the mathematical integrity of the active audit chain.

### CLI Ledger Verification

```bash
# Verify active audit ledger
npm run verify:ledger
```

**Expected Healthy Output:**
```
====================================================
 MEDGUARD EHR - AUDIT LEDGER INTEGRITY SCANNER
====================================================

Checking ledger records...
Total Records: 142
Genesis Hash: 0000000000000000000000000000000000000000000000000000000000000000
Head Hash:    a4f89d38c201889ab8e472098...

RESULT: VERIFIED
The mathematical integrity of the audit chain is pristine. Zero tampering detected.
```

If an unauthorized modification, excision, or rogue insertion occurs, the verification tool reports:
```
RESULT: TAMPERING_DETECTED
Broken link at index: 48
Expected prev_hash: 7d82b...
Found prev_hash:    e349a...
```

### HTTP Health Verification Endpoint
The verification tool is also accessible via authenticated API:
- `GET /api/audit-logs/verify` (Returns `{ verified: true, count: 142, headHash: "..." }`)

---

## 6. Hospital Administrator Provisioning

Initial system bootstrapping requires an authorized administrative account. MedGuard prohibits hardcoded credentials.

### Interactive Administrator Provisioning

```bash
npm run admin:create
```

The CLI wizard prompts for:
1. Administrator Full Name (e.g. `IT Security Officer Bandara`)
2. Hospital Username (e.g. `admin_bandara`)
3. Corporate Email (for 2FA dispatch)
4. Password (must meet 12+ character entropy policy with uppercase, lowercase, digit, and symbol)

Administrative accounts are flagged with Separation of Duties: they cannot decrypt or view patient clinical notes.

---

## 7. Emergency Break-Glass (Red Alert Protocol)

In life-critical trauma bay scenarios where patient consent cannot be obtained:

1. Clinician clicks **ER Break-Glass** in the top navigation bar.
2. The system prompts for a mandatory clinical justification (minimum 10 characters, e.g., `Unconscious trauma victim, massive hemorrhage, requiring immediate cross-match`).
3. An emergency override token is generated with a strict **30-minute validity window**.
4. The activation is logged immutably to the SHA-256 audit ledger with actor, reason, timestamp, and client IP.
5. The session automatically terminates after 30 minutes without requiring manual intervention.
6. All break-glass events appear in the Compliance & Audit Center for post-incident clinical governance review.

---

## 8. Operational Commands Quick Reference

| Operational Task | Command |
| :--- | :--- |
| **Verify Code Cleanliness** | `npm run check:clean` |
| **Run Smart Contract Tests** | `npm run test:contracts` |
| **Run Python Risk Tests** | `npm run test:risk` |
| **Run Backend Integration Tests** | `npm run test:backend` |
| **Build Frontend Production Bundle** | `npm run build:frontend` |
| **Verify Audit Ledger Chain** | `npm run verify:ledger` |
| **Run Database Migrations** | `npm run db:migrate` |
| **Create Encrypted DB Backup** | `npm run db:backup` |
| **Provision Hospital Administrator** | `npm run admin:create` |
| **Start Production Server** | `npm --prefix backend start` |

---

## 9. Security Incident Response Protocol

1. **Suspected Key Compromise**:
   - Rotate `JWT_SECRET` immediately; all active sessions will be invalidated.
   - Rotate `MASTER_ENCRYPTION_KEY` using the key re-encryption utility (`npm run rekey`).
2. **Audit Ledger Inconsistency**:
   - Run `npm run verify:ledger` to pinpoint the exact index of discrepancy.
   - Cross-reference with EVM on-chain transaction hashes in `AccessAuditLog.sol`.
   - Export forensic JSON dump and quarantine the node.
3. **Suspicious Account Activity**:
   - Hospital administrators can immediately suspend any clinician account from `/api/admin/users/:id/toggle-status`.
