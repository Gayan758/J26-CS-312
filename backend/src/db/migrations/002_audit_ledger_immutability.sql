-- 002_audit_ledger_immutability.sql
-- Production Tamper-Evident Audit Ledger Enhancement & Immutability Trigger
--
-- Adds standard compliance audit columns, indexes for query performance,
-- and a PostgreSQL trigger rejecting all UPDATE and DELETE mutations.

-- 1. Standardize Audit Ledger Table Columns
ALTER TABLE audit_ledger
  ADD COLUMN IF NOT EXISTS actor_role VARCHAR(50),
  ADD COLUMN IF NOT EXISTS resource_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS resource_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS outcome VARCHAR(20) DEFAULT 'SUCCESS',
  ADD COLUMN IF NOT EXISTS client_ip VARCHAR(50),
  ADD COLUMN IF NOT EXISTS location_result VARCHAR(50) DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS request_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS anchored BOOLEAN DEFAULT FALSE;

-- 2. Indexes for Compliance Reporting & High-Throughput Ingestion
CREATE INDEX IF NOT EXISTS idx_audit_ledger_action ON audit_ledger(action);
CREATE INDEX IF NOT EXISTS idx_audit_ledger_outcome ON audit_ledger(outcome);
CREATE INDEX IF NOT EXISTS idx_audit_ledger_actor ON audit_ledger(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_ledger_request ON audit_ledger(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_ledger_anchored ON audit_ledger(anchored);

-- 3. Immutability Trigger: Reject all UPDATE and DELETE operations
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'AUDIT_IMMUTABILITY_VIOLATION: Audit ledger records are append-only and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_ledger_immutable ON audit_ledger;
CREATE TRIGGER trg_audit_ledger_immutable
BEFORE UPDATE OR DELETE ON audit_ledger
FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

-- 4. Production Database Security Policy: Least-Privilege Role Grants
-- The production application database role ('medguard_app') must only be granted
-- INSERT and SELECT on audit_ledger. All destructive privileges are revoked.
--
-- GRANT SELECT, INSERT ON audit_ledger TO medguard_app;
-- REVOKE UPDATE, DELETE, TRUNCATE ON audit_ledger FROM medguard_app;
