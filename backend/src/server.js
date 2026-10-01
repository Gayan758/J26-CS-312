const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const config = require("./config");
const { router: authRoutes } = require("./routes/auth");
const accessRequestRoutes = require("./routes/accessRequest");
const breakGlassRoutes = require("./routes/breakGlass");
const patientsRoutes = require("./routes/patients");
const trackingRoutes = require("./routes/tracking");
const adminRoutes = require("./routes/admin");
const errorHandler = require("./middleware/errorHandler");
const auditService = require("./services/auditService");
const requestLogger = require("./middleware/requestLogger");
const logger = require("./utils/logger");
const { optionalAuthenticate } = require("./middleware/auth");
const { apiGlobalLimiter } = require("./middleware/rateLimiter");

const app = express();

// 1. HTTP Security Headers & Content Security Policy (OWASP ASVS Level 2)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", "data:"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "same-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: "deny" },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: false
}));

// Additional defense-in-depth security headers
app.use((req, res, next) => {
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  next();
});

// 2. Strict CORS Whitelist & Preflight Hardening
const rawAllowed = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  process.env.FRONTEND_URL,
  ...rawAllowed
].filter(Boolean)));

app.use(cors({
  origin: (origin, callback) => {
    // Non-browser or internal requests (curl, server-to-server, unit tests without Origin header)
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS policy: Origin ${origin} not allowed by Access-Control-Allow-Origin.`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Request-Id",
    "X-Requested-With",
    "Idempotency-Key",
    "X-Doctor-Address",
    "X-Device-Fingerprint",
    "Accept"
  ],
  exposedHeaders: ["X-Request-Id"],
  maxAge: 86400
}));

app.use(cookieParser(config.jwtSecret));
app.use(express.json());
app.use(requestLogger);

// 3. Volumetric Global Rate Limiting across API surface
app.use("/api", apiGlobalLimiter);

// Health & Status
app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy", service: "medguard-backend", version: "2.0.0" });
});

// Audit ledger endpoint for hospital compliance observation
app.get("/api/audit-logs", optionalAuthenticate, (req, res) => {
  res.status(200).json(auditService.getAuditLogs());
});

app.get("/api/audit-logs/verify", (req, res) => {
  res.status(200).json(auditService.verifyIntegrity());
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/patients", patientsRoutes);
app.use("/api/tracking", trackingRoutes);
app.use("/api", accessRequestRoutes);
app.use("/api", breakGlassRoutes);

// Safe Error Handling Middleware
app.use(errorHandler);

if (require.main === module) {
  app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, "MedGuard Clinical Security Server started");
    console.log(`[MedGuard Backend] Server listening on port ${config.port}`);
  });
}

module.exports = app;
