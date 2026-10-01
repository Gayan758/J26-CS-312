-- ====================================================================
-- MedGuard EHR - Production Database Schema (PostgreSQL)
-- Migration: 001_initial_schema.sql (UP)
-- Standards: OWASP ASVS Level 2, Field Encryption, Tamper-Evident Audit
-- ====================================================================

-- 1. Schema Migrations Ledger
CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  version VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Staff and User Accounts
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'doctor',
  slmc_reg_no VARCHAR(50),
  department VARCHAR(100),
  email VARCHAR(255),
  ethereum_address VARCHAR(42),
  totp_secret VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  disabled BOOLEAN NOT NULL DEFAULT FALSE,
  disabled_at TIMESTAMP WITH TIME ZONE,
  disabled_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- 3. Patient Demographics & Encrypted Records
CREATE TABLE IF NOT EXISTS patients (
  id VARCHAR(64) PRIMARY KEY,
  phn VARCHAR(64) NOT NULL UNIQUE,
  nic_hash VARCHAR(64) UNIQUE, -- Blind index HMAC-SHA256 for exact-match search
  nic_encrypted JSONB,         -- AES-256-GCM encrypted demographic PHI
  phone_encrypted JSONB,       -- AES-256-GCM encrypted demographic PHI
  encrypted_dek JSONB,         -- Patient Data Encryption Key encrypted with Master KEK
  name VARCHAR(255) NOT NULL,
  dob DATE,
  gender VARCHAR(50) DEFAULT 'Unspecified',
  blood_group VARCHAR(10) DEFAULT 'O+',
  allergies JSONB DEFAULT '[]'::jsonb,
  chronic_conditions JSONB DEFAULT '[]'::jsonb,
  sensitivity VARCHAR(50) DEFAULT 'low',
  consent_status BOOLEAN DEFAULT TRUE,
  triage_queue VARCHAR(100) DEFAULT 'Outpatient General Clinic',
  emergency_status VARCHAR(50) DEFAULT 'Stable',
  critical_alert TEXT,
  assigned_doctor_ids JSONB DEFAULT '[]'::jsonb,
  assigned_doctor_addresses JSONB DEFAULT '[]'::jsonb,
  consented_doctors JSONB DEFAULT '[]'::jsonb,
  granular_permissions JSONB,
  registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patients_phn ON patients(phn);
CREATE INDEX IF NOT EXISTS idx_patients_nic_hash ON patients(nic_hash);

-- 4. Clinical Encounters (SOAP Notes)
CREATE TABLE IF NOT EXISTS encounters (
  id VARCHAR(64) PRIMARY KEY,
  patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  encounter_date DATE NOT NULL,
  doctor_id VARCHAR(64),
  doctor_name VARCHAR(255),
  doctor_address VARCHAR(42),
  chief_complaint TEXT,
  subjective TEXT,
  objective TEXT,
  assessment TEXT,
  plan TEXT,
  diagnosis_icd10 JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_encounters_patient ON encounters(patient_id);
CREATE INDEX IF NOT EXISTS idx_encounters_date ON encounters(encounter_date);

-- 5. Prescriptions
CREATE TABLE IF NOT EXISTS prescriptions (
  id VARCHAR(64) PRIMARY KEY,
  patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  drug_name VARCHAR(255) NOT NULL,
  dosage VARCHAR(100) NOT NULL,
  route VARCHAR(50) DEFAULT 'Oral',
  frequency VARCHAR(100) NOT NULL,
  duration VARCHAR(100),
  refills INT DEFAULT 0,
  instructions TEXT,
  prescribed_by VARCHAR(255),
  prescribed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'Active'
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON prescriptions(status);

-- 6. Clinical Vital Signs
CREATE TABLE IF NOT EXISTS vitals (
  id VARCHAR(64) PRIMARY KEY,
  patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  bp VARCHAR(50),
  hr INT,
  rr INT,
  spo2 INT,
  temp NUMERIC(4, 1),
  glucose NUMERIC(5, 1),
  recorded_by VARCHAR(255),
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vitals_patient ON vitals(patient_id);
CREATE INDEX IF NOT EXISTS idx_vitals_date ON vitals(recorded_at);

-- 7. Tamper-Evident Access & Compliance Audit Ledger
CREATE TABLE IF NOT EXISTS audit_ledger (
  id BIGSERIAL PRIMARY KEY,
  event_id VARCHAR(64) NOT NULL UNIQUE,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  actor_id VARCHAR(120),
  actor_address VARCHAR(42),
  action VARCHAR(100) NOT NULL,
  patient_id VARCHAR(64),
  risk_score NUMERIC(5, 4),
  risk_level VARCHAR(20),
  decision VARCHAR(20),
  is_break_glass BOOLEAN DEFAULT FALSE,
  details TEXT,
  prev_hash VARCHAR(64),
  curr_hash VARCHAR(64),
  tx_hash VARCHAR(66)
);

CREATE INDEX IF NOT EXISTS idx_audit_ledger_event ON audit_ledger(event_id);
CREATE INDEX IF NOT EXISTS idx_audit_ledger_patient ON audit_ledger(patient_id);
CREATE INDEX IF NOT EXISTS idx_audit_ledger_timestamp ON audit_ledger(timestamp);

-- 8. Emergency Break-Glass Events
CREATE TABLE IF NOT EXISTS break_glass_events (
  id VARCHAR(64) PRIMARY KEY,
  token_id VARCHAR(120) NOT NULL UNIQUE,
  patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  requester VARCHAR(120) NOT NULL,
  justification TEXT NOT NULL,
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(50) DEFAULT 'ACTIVE',
  tx_hash VARCHAR(66)
);

CREATE INDEX IF NOT EXISTS idx_break_glass_patient ON break_glass_events(patient_id);
CREATE INDEX IF NOT EXISTS idx_break_glass_token ON break_glass_events(token_id);

-- 9. Staff Safety Tracking Devices & Real-Time Presence
CREATE TABLE IF NOT EXISTS staff_devices (
  device_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  device_name VARCHAR(120),
  tracking_enabled BOOLEAN DEFAULT TRUE,
  privacy_paused BOOLEAN DEFAULT FALSE,
  last_lat NUMERIC(10, 7),
  last_lon NUMERIC(10, 7),
  last_accuracy NUMERIC(8, 2),
  last_seen TIMESTAMP WITH TIME ZONE,
  geofence_status VARCHAR(50) DEFAULT 'INSIDE_MALABE_CAMPUS'
);

CREATE INDEX IF NOT EXISTS idx_staff_devices_user ON staff_devices(user_id);
