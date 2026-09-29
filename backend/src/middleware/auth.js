const rateLimit = require("express-rate-limit");

// Rate limit access-request and break-glass/activate per IP/user to blunt brute-force / signal probing
const accessRequestLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many access attempts. Please try again later." }
});

const breakGlassLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10, // 10 break-glass requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many break-glass activation attempts. Please try again later." }
});

function validateDoctorIdentity(req, res, next) {
  const doctorAddress = req.body.doctor_address || req.headers["x-doctor-address"];
  if (!doctorAddress) {
    return res.status(400).json({ error: "Missing doctor identity or address" });
  }
  req.doctorAddress = doctorAddress;
  next();
}

module.exports = {
  accessRequestLimiter,
  breakGlassLimiter,
  validateDoctorIdentity
};
