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

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health & Status
app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy", service: "medguard-backend", version: "2.0.0" });
});

// Audit ledger endpoint for GRC observation
app.get("/api/audit-logs", (req, res) => {
  res.status(200).json(auditService.getAuditLogs());
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
