-- ==============================================================================
-- MEDGUARD CLINICAL HEALTHCARE SYSTEM
-- Module: Staff Real-Time Location Tracking & Safety (Traccar / OsmAnd Integration)
-- Database DDL Schema (PostgreSQL / SQLite Compatible)
--
-- ETHICAL SEPARATION NOTE:
-- This schema is strictly dedicated to physical staff safety, emergency SOS, and
-- lone-worker dispatch. It is architecturally decoupled from patient clinical EMRs
-- and the primary IP CIDR access control tables used by RiskBAC.
-- ==============================================================================

-- 1. Staff Tracking Devices
-- Associates doctors/clinical staff with registered tracking devices (Traccar uniqueId / OsmAnd protocol)
CREATE TABLE IF NOT EXISTS staff_tracking_devices (
    device_id VARCHAR(64) PRIMARY KEY,              -- Unique hardware/client ID (e.g. Traccar uniqueId, IMEI, or UUID)
    doctor_id VARCHAR(64) NOT NULL,                 -- Clinical Staff / Doctor identifier (e.g. doc-001, doc-002)
    doctor_name VARCHAR(128) NOT NULL,              -- Registered Doctor Name
    device_name VARCHAR(128) NOT NULL,              -- Device label (e.g. "Dr. Vance Mobile Phone")
    osmand_protocol_id VARCHAR(64) NOT NULL UNIQUE, -- OsmAnd tracking ID transmitted over port 5055
    consent_given BOOLEAN NOT NULL DEFAULT FALSE,   -- Mandatory explicit consent for continuous GPS tracking
    consent_timestamp TIMESTAMP WITH TIME ZONE,     -- Timestamp when consent was signed/opted-in
    consent_version VARCHAR(32) DEFAULT 'v1.0',     -- Version of the Staff Safety Privacy Policy agreed to
    tracking_enabled BOOLEAN NOT NULL DEFAULT TRUE, -- Doctor can toggle tracking off at any time (privacy override)
    sos_active BOOLEAN NOT NULL DEFAULT FALSE,      -- Emergency SOS distress flag (overrides tracking_enabled)
    last_position_lat DECIMAL(10, 7),               -- Latest reported GPS latitude
    last_position_lon DECIMAL(10, 7),               -- Latest reported GPS longitude
    last_position_altitude DECIMAL(8, 2),           -- Altitude in meters
    last_position_speed DECIMAL(6, 2),              -- Speed in km/h
    last_position_accuracy DECIMAL(6, 2),           -- GPS accuracy in meters
    battery_level DECIMAL(5, 2),                    -- Mobile battery percentage (0.0 to 100.0)
    last_report_time TIMESTAMP WITH TIME ZONE,      -- Timestamp of last GPS fix from phone
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_staff_devices_doctor ON staff_tracking_devices(doctor_id);
CREATE INDEX IF NOT EXISTS idx_staff_devices_osmand ON staff_tracking_devices(osmand_protocol_id);

-- 2. Staff Geofence Risk Events
-- Recorded whenever a doctor departs a designated hospital perimeter (e.g. SLIIT Malabe Campus)
CREATE TABLE IF NOT EXISTS staff_geofence_events (
    id VARCHAR(64) PRIMARY KEY,                     -- Event UUID (e.g. evt-1790057000-xxxx)
    device_id VARCHAR(64) NOT NULL,                 -- References staff_tracking_devices(device_id)
    doctor_id VARCHAR(64) NOT NULL,                 -- Clinical Staff / Doctor identifier
    geofence_id VARCHAR(64) NOT NULL,               -- e.g. "sliit-malabe", "seylan-tower-1"
    geofence_name VARCHAR(128) NOT NULL,             -- e.g. "SLIIT Malabe Campus (Main Perimeter)"
    event_type VARCHAR(32) NOT NULL,                -- "GEOFENCE_EXIT", "GEOFENCE_ENTER", "SOS_TRIGGERED"
    latitude DECIMAL(10, 7) NOT NULL,               -- Exit coordinate latitude
    longitude DECIMAL(10, 7) NOT NULL,              -- Exit coordinate longitude
    distance_from_base_km DECIMAL(8, 3) NOT NULL,   -- Great-circle distance from hospital center in kilometers
    calculated_risk_score DECIMAL(5, 3) NOT NULL,   -- Score R_gps from Python Risk Engine (0.000 to 1.000)
    risk_level VARCHAR(32) NOT NULL,                -- "LOW", "MEDIUM", "HIGH", "CRITICAL"
    time_of_day_context VARCHAR(32) NOT NULL,       -- "IN_SHIFT", "EVENING_COMMUTE", "NIGHT_OFF_HOURS", "DAWN_COMMUTE"
    security_notified BOOLEAN NOT NULL DEFAULT FALSE,-- Whether alert was dispatched to hospital security / dispatch
    security_alert_id VARCHAR(64),                  -- Optional dispatch ticket ID
    security_notes TEXT,                            -- Automated or dispatcher notes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    retention_expires_at TIMESTAMP WITH TIME ZONE NOT NULL -- Mandatory 60-day rolling data deletion deadline
);

CREATE INDEX IF NOT EXISTS idx_geofence_events_doctor ON staff_geofence_events(doctor_id);
CREATE INDEX IF NOT EXISTS idx_geofence_events_created ON staff_geofence_events(created_at);
CREATE INDEX IF NOT EXISTS idx_geofence_events_retention ON staff_geofence_events(retention_expires_at);

-- 3. Staff Safety Audit Log
-- Role-restricted access audit log: records every time an administrative or security user
-- views live locations, triggers geofence queries, or modifies staff consent.
CREATE TABLE IF NOT EXISTS staff_safety_audit_log (
    id VARCHAR(64) PRIMARY KEY,                     -- Audit Record UUID
    actor_id VARCHAR(64) NOT NULL,                  -- Staff / Admin / Security User ID viewing the data
    actor_name VARCHAR(128) NOT NULL,               -- Full name of actor
    actor_role VARCHAR(64) NOT NULL,                -- "Chief Medical Officer", "Security Dispatcher", "System Admin"
    action VARCHAR(64) NOT NULL,                    -- "VIEW_LIVE_LOCATION", "QUERY_GEOFENCE_HISTORY", "DISPATCH_SECURITY"
    target_doctor_id VARCHAR(64),                   -- Target doctor whose location was viewed
    justification VARCHAR(255) NOT NULL,            -- Mandatory clinical/security justification for location query
    ip_address VARCHAR(45) NOT NULL,                -- Network IP of the observer
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_safety_audit_actor ON staff_safety_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_safety_audit_timestamp ON staff_safety_audit_log(timestamp);

-- Automated Data Retention Purge Function (PostgreSQL)
-- Implements the mandatory 30-90 day data retention rule (configured to 60 days default)
-- CREATE OR REPLACE FUNCTION purge_expired_staff_location_events() RETURNS void AS $$
-- BEGIN
--     DELETE FROM staff_geofence_events WHERE retention_expires_at < CURRENT_TIMESTAMP;
-- END;
-- $$ LANGUAGE plpgsql;
