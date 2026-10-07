require("dotenv").config();
const { validateEnvironment } = require("./validateEnv");

// Run environment validation on configuration boot
const validation = validateEnvironment({
  env: process.env,
  isProduction: process.env.NODE_ENV === "production",
  exitOnError: process.env.NODE_ENV === "production" && process.env.SKIP_ENV_VALIDATION !== "true"
});

module.exports = {
  port: parseInt(process.env.PORT || "5000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  
  riskEngineUrl: process.env.RISK_ENGINE_URL || "http://127.0.0.1:8000",
  opaUrl: process.env.OPA_URL || "http://127.0.0.1:8181/v1/data/medguard/access",

  ethRpcUrl: process.env.ETH_RPC_URL || "http://127.0.0.1:8545",
  ethSignerKey: process.env.ETH_SIGNER_PRIVATE_KEY || "",

  consentRegistryAddress: process.env.CONSENT_REGISTRY_ADDRESS || "",
  accessAuditLogAddress: process.env.ACCESS_AUDIT_LOG_ADDRESS || "",
  breakGlassRegistryAddress: process.env.BREAK_GLASS_REGISTRY_ADDRESS || "",

  jwtSecret: process.env.JWT_SECRET || "medguard_v2_super_secure_backend_jwt_secret_2026",
  mfaSecret: process.env.MFA_CHALLENGE_SECRET || "medguard_mfa_stepup_secret_2026",

  // Email / SMTP 2FA Settings
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: parseInt(process.env.SMTP_PORT || "587", 10),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  smtpFrom: process.env.SMTP_FROM || "MedGuard Clinical Security <security@medguard.sliit.lk>",

  // Traccar GPS Telemetry Server (Audit 2 Integration)
  traccarApiUrl: process.env.TRACCAR_API_URL || "http://127.0.0.1:8082",
  traccarUser: process.env.TRACCAR_USER || "admin",
  traccarPass: process.env.TRACCAR_PASS || "admin",

  // Canonical Risk Weights & Decision Thresholds (Audit 3 Single Source of Truth)
  riskWeights: {
    w_t: parseFloat(process.env.MEDGUARD_WEIGHT_TIME || "0.15"),
    w_l: parseFloat(process.env.MEDGUARD_WEIGHT_GEO || "0.35"),
    w_d: parseFloat(process.env.MEDGUARD_WEIGHT_DEVICE || "0.25"),
    w_b: parseFloat(process.env.MEDGUARD_WEIGHT_BEHAVIOR || "0.25"),
    alpha: parseFloat(process.env.MEDGUARD_ALPHA_WEIGHTED || "0.7"),
    beta: parseFloat(process.env.MEDGUARD_BETA_MAX || "0.3"),
    lowThreshold: parseFloat(process.env.MEDGUARD_THRESHOLD_LOW || "0.30"),
    mediumThreshold: parseFloat(process.env.MEDGUARD_THRESHOLD_MED || "0.65")
  },

  validation,
  validateEnvironment
};
