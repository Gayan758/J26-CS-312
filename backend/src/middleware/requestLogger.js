const crypto = require("crypto");
const logger = require("../utils/logger");

/**
 * MedGuard Request Correlation & Logging Middleware
 *
 * - Assigns or forwards X-Request-Id across incoming requests and outgoing responses.
 * - Logs request metadata upon response completion.
 * - Zero patient PHI or authentication credentials logged.
 */
function requestLogger(req, res, next) {
  const reqId = req.headers["x-request-id"] || `req-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  req.id = reqId;
  res.setHeader("X-Request-Id", reqId);

  const startTime = Date.now();

  res.on("finish", () => {
    // Avoid noisy debug logs on health checks
    if (req.originalUrl === "/health" || req.originalUrl === "/health/live") {
      return;
    }

    const durationMs = Date.now() - startTime;
    const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || req.ip;

    const logData = {
      type: "http_request",
      requestId: req.id,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs,
      clientIp: String(clientIp).split(",")[0].trim()
    };

    if (req.user && req.user.username) {
      logData.actor = req.user.username;
      logData.role = req.user.role;
    }

    if (res.statusCode >= 500) {
      logger.error(logData, "HTTP Request Server Error");
    } else if (res.statusCode >= 400) {
      logger.warn(logData, "HTTP Request Client Warning");
    } else {
      logger.info(logData, "HTTP Request Completed");
    }
  });

  next();
}

module.exports = requestLogger;
