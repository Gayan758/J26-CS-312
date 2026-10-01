const sessionService = require("../services/sessionService");
const {
  accessRequestLimiter,
  breakGlassLimiter,
  loginLimiter
} = require("./rateLimiter");

/**
 * Extracts and verifies the user session from the HTTP-only cookie or Authorization header.
 */
function authenticate(req, res, next) {
  let token = null;

  // 1. Primary: HTTP-only session cookie
  if (req.cookies && req.cookies[sessionService.cookieName]) {
    token = req.cookies[sessionService.cookieName];
  }

  // 2. Fallback: Authorization header (Bearer token)
  if (!token) {
    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return res.status(401).json({ error: "No active clinical session. Please sign in." });
  }

  const decoded = sessionService.verifySessionToken(token);
  if (!decoded) {
    return res.status(401).json({ error: "Session expired or invalid. Please sign in again." });
  }

  req.user = decoded;
  req.userId = decoded.id;
  req.userRole = (decoded.role || "Clinician").toLowerCase();

  // Rolling session refresh on authenticated requests
  try {
    sessionService.setSessionCookie(res, token);
  } catch (e) {
    // Non-fatal if headers already sent
  }

  next();
}

/**
 * Optional authentication middleware: attaches user if valid session exists, proceeds either way.
 */
function optionalAuthenticate(req, res, next) {
  let token = null;

  if (req.cookies && req.cookies[sessionService.cookieName]) {
    token = req.cookies[sessionService.cookieName];
  }

  if (!token) {
    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }
  }

  if (token) {
    const decoded = sessionService.verifySessionToken(token);
    if (decoded) {
      req.user = decoded;
      req.userId = decoded.id;
      req.userRole = (decoded.role || "Clinician").toLowerCase();
    }
  }

  next();
}

/**
 * Enforces Role-Based Access Control (RBAC).
 */
function requireRole(...allowedRoles) {
  const normalizedAllowed = allowedRoles.map((r) => r.toLowerCase());

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const currentRole = (req.user.role || "Clinician").toLowerCase();
    const isAllowed = normalizedAllowed.includes(currentRole) ||
                      (normalizedAllowed.includes("clinician") && (currentRole === "doctor" || currentRole === "nurse")) ||
                      (normalizedAllowed.includes("doctor") && currentRole === "clinician") ||
                      (normalizedAllowed.includes("admin") && currentRole === "administrator");

    if (!isAllowed) {
      return res.status(403).json({
        error: `Access Denied: Role "${req.user.role}" does not have required permissions for this resource.`
      });
    }

    next();
  };
}

/**
 * Enforces Separation of Duties:
 * Administrators are strictly prohibited from viewing patient clinical health records.
 */
function enforceSeparationOfDuties(req, res, next) {
  if (req.user) {
    const role = (req.user.role || "").toLowerCase();
    if (role === "admin" || role === "administrator") {
      return res.status(403).json({
        error: "Separation of Duties: Hospital administrators are prohibited from viewing patient clinical health records."
      });
    }
  }
  next();
}

/**
 * Validates doctor identity for access request and break-glass routes.
 */
function validateDoctorIdentity(req, res, next) {
  const doctorAddress = req.body.doctor_address || req.headers["x-doctor-address"] || (req.user ? (req.user.ethereumAddress || req.user.id) : null);
  if (!doctorAddress) {
    return res.status(400).json({ error: "Missing doctor identity or address" });
  }
  req.doctorAddress = doctorAddress;
  next();
}

module.exports = {
  accessRequestLimiter,
  breakGlassLimiter,
  loginLimiter,
  authenticate,
  optionalAuthenticate,
  requireRole,
  enforceSeparationOfDuties,
  validateDoctorIdentity
};
