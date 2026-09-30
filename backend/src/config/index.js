require("dotenv").config();

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
  smtpFrom: process.env.SMTP_FROM || "MedGuard Clinical Security <security@medguard.sliit.lk>"
};
