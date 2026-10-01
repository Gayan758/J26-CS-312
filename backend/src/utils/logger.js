const pino = require("pino");

/**
 * MedGuard Enterprise Structured Logger
 *
 * OWASP ASVS Level 2 & HIPAA Compliant:
 * - Structured JSON logging format to stdout.
 * - Automatic redaction of credentials, tokens, session cookies, NICs, and clinical PHI.
 * - Support for correlation request IDs and error tracking.
 */
const REDACTED_PATHS = [
  "password",
  "newPassword",
  "confirmPassword",
  "currentPassword",
  "token",
  "accessToken",
  "refreshToken",
  "otp",
  "totp",
  "secret",
  "jwtSecret",
  "ethSignerKey",
  "authorization",
  "cookie",
  "cookies",
  "headers.cookie",
  "headers.authorization",
  "req.headers.cookie",
  "req.headers.authorization",
  "nic",
  "nic_hash",
  "nic_encrypted",
  "phone",
  "phone_encrypted",
  "encrypted_dek",
  "notes",
  "clinicalNotes",
  "subjective",
  "objective",
  "assessment",
  "plan",
  "diagnosis",
  "prescriptions[*].instructions",
  "vitals"
];

const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug"),
  formatters: {
    level: (label) => ({ level: label.toUpperCase() })
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: REDACTED_PATHS,
    censor: "[REDACTED]"
  },
  base: {
    service: "medguard-backend",
    env: process.env.NODE_ENV || "development"
  }
});

module.exports = logger;
