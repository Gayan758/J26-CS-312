const crypto = require("crypto");
const logger = require("../utils/logger");

/**
 * Enterprise Central Error Handler
 *
 * OWASP ASVS Level 2:
 * - Details go strictly to structured logs; users see a plain message and an errorId.
 * - Redacts internal stack traces and database implementation details in HTTP responses.
 */
function errorHandler(err, req, res, next) {
  const errorId = `err-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const requestId = req.id || req.headers["x-request-id"] || "unknown";
  const statusCode = err.status || err.statusCode || 500;

  // Log full error details to structured JSON log
  logger.error({
    type: "unhandled_error",
    errorId,
    requestId,
    method: req.method,
    path: req.originalUrl || req.url,
    statusCode,
    message: err.message,
    stack: err.stack,
    code: err.code || null
  }, "Request handling failure");

  if (statusCode === 403 || err.code === "ACCESS_DENIED") {
    return res.status(403).json({
      error: "Access Denied by Policy",
      message: "Access to requested health record was blocked by the access control policy.",
      errorId,
      requestId
    });
  }

  // Safe client error responses
  if (statusCode >= 400 && statusCode < 500) {
    return res.status(statusCode).json({
      error: err.message || "Invalid Request",
      errorId,
      requestId
    });
  }

  // 500 Internal Server Error: Never leak internal error messages or stacks
  res.status(500).json({
    error: "An unexpected system error occurred. Please contact the hospital technical administrator.",
    errorId,
    requestId
  });
}

module.exports = errorHandler;
