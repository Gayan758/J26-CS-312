-- ====================================================================
-- MedGuard EHR - Production Database Schema (PostgreSQL)
-- Migration: 001_initial_schema_down.sql (DOWN)
-- Standard: Non-destructive rollback safeguard
-- ====================================================================

DROP TABLE IF EXISTS staff_devices CASCADE;
DROP TABLE IF EXISTS break_glass_events CASCADE;
DROP TABLE IF EXISTS audit_ledger CASCADE;
DROP TABLE IF EXISTS vitals CASCADE;
DROP TABLE IF EXISTS prescriptions CASCADE;
DROP TABLE IF EXISTS encounters CASCADE;
DROP TABLE IF EXISTS patients CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS schema_migrations CASCADE;
