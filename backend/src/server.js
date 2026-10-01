const express = require("express");
const cors = require("cors");
const config = require("./config");
const { router: authRoutes } = require("./routes/auth");
const accessRequestRoutes = require("./routes/accessRequest");
const breakGlassRoutes = require("./routes/breakGlass");
const patientsRoutes = require("./routes/patients");
const trackingRoutes = require("./routes/tracking");
const adminRoutes = require("./routes/admin");
const errorHandler = require("./middleware/errorHandler");
const auditService = require("./services/auditService");

const cookieParser = require("cookie-parser");
const requestLogger = require("./middleware/requestLogger");
const logger = require("./utils/logger");
const { optionalAuthenticate } = require("./middleware/auth");
const app = express();

// Middleware
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, same-origin, supertest)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, true); // Dev/test permissive fallback
  },
  credentials: true
}));
app.use(cookieParser(config.jwtSecret));
app.use(express.json());
app.use(requestLogger);

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
    console.log(`[MedGuard Backend] Server listening on port ${config.port}`);
  });
}

module.exports = app;
