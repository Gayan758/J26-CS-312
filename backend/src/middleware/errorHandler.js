function errorHandler(err, req, res, next) {
  // Structured JSON logging without leaking PHI or decryption keys
  console.error(JSON.stringify({
    level: "ERROR",
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method,
    message: err.message,
    status: err.status || 500
  }));

  if (err.status === 403 || err.code === "ACCESS_DENIED") {
    // Non-leaking generic 403 response to avoid signal probing
    return res.status(403).json({
      error: "Access Denied by Policy",
      message: "Access to requested health record was blocked by the access control policy."
    });
  }

  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error"
  });
}

module.exports = errorHandler;
