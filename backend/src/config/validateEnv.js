const logger = require("../utils/logger");

const KNOWN_INSECURE_SECRETS = new Set([
  "medguard_v2_super_secure_backend_jwt_secret_2026",
  "medguard_mfa_stepup_secret_2026",
  "secret",
  "changeme",
  "password",
  "12345678901234567890123456789012",
  "default_secret_key_change_in_production",
  "0000000000000000000000000000000000000000000000000000000000000000"
]);

/**
 * Validates runtime environment configuration against OWASP ASVS Level 2 security criteria.
 * Fails closed in production on weak entropy, placeholder secrets, or insecure defaults.
 */
function validateEnvironment(options = {}) {
  const env = options.env || process.env;
  const isProduction = options.isProduction !== undefined
    ? options.isProduction
    : (env.NODE_ENV === "production");
  const exitOnError = options.exitOnError !== undefined
    ? options.exitOnError
    : isProduction;
  const throwOnError = options.throwOnError || false;

  const errors = [];
  const warnings = [];

  // 1. JWT_SECRET validation
  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret) {
    if (isProduction) {
      errors.push("JWT_SECRET must be defined in production environment.");
    } else {
      warnings.push("JWT_SECRET is not set; falling back to development secret.");
    }
  } else {
    if (jwtSecret.length < 32) {
      if (isProduction) {
        errors.push(`JWT_SECRET is too short (${jwtSecret.length} chars). Minimum 32 characters (256-bit entropy) required in production.`);
      } else {
        warnings.push(`JWT_SECRET is short (${jwtSecret.length} chars). Use >= 32 characters in production.`);
      }
    }
    if (KNOWN_INSECURE_SECRETS.has(jwtSecret.toLowerCase())) {
      if (isProduction) {
        errors.push("JWT_SECRET cannot use an insecure default or placeholder secret in production.");
      } else {
        warnings.push("JWT_SECRET uses development placeholder. Set a unique secret before deploying.");
      }
    }
  }

  // 2. MASTER_ENCRYPTION_KEY validation (AES-256-GCM envelope encryption)
  const masterKey = env.MASTER_ENCRYPTION_KEY;
  if (!masterKey) {
    if (isProduction) {
      errors.push("MASTER_ENCRYPTION_KEY must be defined in production (64-char hex or 32 raw bytes).");
    } else {
      warnings.push("MASTER_ENCRYPTION_KEY is not set; falling back to local key derivation.");
    }
  } else {
    const isHex64 = /^[0-9a-fA-F]{64}$/.test(masterKey);
    const isRaw32 = Buffer.byteLength(masterKey, "utf8") === 32;
    if (!isHex64 && !isRaw32) {
      if (isProduction) {
        errors.push("MASTER_ENCRYPTION_KEY must be a valid 64-character hexadecimal string or 32-byte string.");
      } else {
        warnings.push("MASTER_ENCRYPTION_KEY format is unexpected. Expected 64 hex characters.");
      }
    }
    if (KNOWN_INSECURE_SECRETS.has(masterKey.toLowerCase())) {
      if (isProduction) {
        errors.push("MASTER_ENCRYPTION_KEY cannot use an insecure known default.");
      }
    }
  }

  // 3. MFA_CHALLENGE_SECRET validation
  const mfaSecret = env.MFA_CHALLENGE_SECRET;
  if (mfaSecret) {
    if (mfaSecret.length < 32 && isProduction) {
      errors.push(`MFA_CHALLENGE_SECRET is too short (${mfaSecret.length} chars). Minimum 32 characters required in production.`);
    }
    if (KNOWN_INSECURE_SECRETS.has(mfaSecret.toLowerCase()) && isProduction) {
      errors.push("MFA_CHALLENGE_SECRET cannot use an insecure known default in production.");
    }
  }

  // 4. CORS & FRONTEND_URL validation
  const frontendUrl = env.FRONTEND_URL;
  if (isProduction) {
    if (!frontendUrl) {
      warnings.push("FRONTEND_URL is not set in production. Default hospital origins will be enforced.");
    } else if (frontendUrl === "*") {
      errors.push("FRONTEND_URL cannot be wildcard '*' in production with credentialed sessions.");
    }
  }

  // 5. DATABASE_URL validation
  const dbUrl = env.DATABASE_URL;
  if (isProduction && !dbUrl) {
    warnings.push("DATABASE_URL is not configured in production; ensure dedicated PostgreSQL cluster is configured.");
  }

  const valid = errors.length === 0;

  if (!valid) {
    logger.error({
      type: "config_validation_failure",
      environment: env.NODE_ENV,
      errorsCount: errors.length,
      errors
    }, "FATAL CONFIGURATION ERROR: Startup checks failed due to missing or insecure configuration.");

    if (exitOnError) {
      process.exit(1);
    }

    if (throwOnError) {
      throw new Error(`Environment validation failed with ${errors.length} error(s):\n- ${errors.join("\n- ")}`);
    }
  } else if (warnings.length > 0) {
    logger.warn({
      type: "config_validation_warnings",
      environment: env.NODE_ENV,
      warningsCount: warnings.length,
      warnings
    }, "Environment configuration loaded with warnings.");
  }

  return {
    valid,
    errors,
    warnings
  };
}

module.exports = {
  validateEnvironment,
  KNOWN_INSECURE_SECRETS
};
