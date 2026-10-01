const rateLimit = require("express-rate-limit");

/**
 * Creates a rate limiter instance with standardized headers and test bypass support.
 */
function createLimiter(options = {}) {
  const {
    windowMs = 15 * 60 * 1000,
    max = 100,
    message = "Too many requests. Please try again later.",
    skip,
    ...rest
  } = options;

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: typeof message === "string" ? { error: message } : message,
    skip: (req, res) => {
      if (process.env.RATE_LIMIT_DISABLED === "true") return true;
      if (req.headers && req.headers["x-test-bypass-rate-limit"] === "true") return true;
      if (typeof skip === "function") return skip(req, res);
      return false;
    },
    ...rest
  });
}

// 1. Rate limit authentication attempts (brute force protection)
const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  message: "Too many sign-in attempts from this network. Please wait 15 minutes before trying again."
});

// 2. Rate limit account registration
const registerLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many registration attempts from this network. Please try again later."
});

// 3. Rate limit administrative password resets
const passwordResetLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many password reset requests. Please try again later."
});

// 4. Rate limit 2FA OTP generation and verification
const otpLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: "Too many two-factor authentication attempts. Please wait 15 minutes before requesting another code."
});

// 5. Rate limit emergency break-glass activation
const breakGlassLimiter = createLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: "Too many break-glass activation attempts. Please try again later."
});

// 6. Rate limit access-request per IP/user to blunt brute-force signal probing
const accessRequestLimiter = createLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: "Too many access attempts. Please try again later."
});

// 7. Rate limit sensitive clinical patient data endpoints to prevent scraping
const patientDataLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 120,
  message: "Excessive patient record query rate. Please throttle requests."
});

// 8. Global API volumetric rate limiter
const apiGlobalLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: "API request rate limit exceeded. Please reduce request frequency."
});

module.exports = {
  createLimiter,
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  otpLimiter,
  breakGlassLimiter,
  accessRequestLimiter,
  patientDataLimiter,
  apiGlobalLimiter
};
