-- 002_audit_ledger_immutability_down.sql
-- Rollback for audit ledger immutability trigger and columns

DROP TRIGGER IF EXISTS trg_audit_ledger_immutable ON audit_ledger;
DROP FUNCTION IF EXISTS prevent_audit_modification();

DROP INDEX IF EXISTS idx_audit_ledger_anchored;
DROP INDEX IF EXISTS idx_audit_ledger_request;
DROP INDEX IF EXISTS idx_audit_ledger_actor;
DROP INDEX IF EXISTS idx_audit_ledger_outcome;
DROP INDEX IF EXISTS idx_audit_ledger_action;

ALTER TABLE audit_ledger
  DROP COLUMN IF EXISTS actor_role,
  DROP COLUMN IF EXISTS resource_type,
  DROP COLUMN IF EXISTS resource_id,
  DROP COLUMN IF EXISTS outcome,
  DROP COLUMN IF EXISTS client_ip,
  DROP COLUMN IF EXISTS location_result,
  DROP COLUMN IF EXISTS reason,
  DROP COLUMN IF EXISTS request_id,
  DROP COLUMN IF EXISTS anchored;
