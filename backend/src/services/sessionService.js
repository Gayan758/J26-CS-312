const jwt = require("jsonwebtoken");
const config = require("../config");

const COOKIE_NAME = "medguard_session";
const SESSION_EXPIRY_MS = 8 * 60 * 60 * 1000; // 8 hours rolling expiry

class SessionService {
  get cookieName() {
    return COOKIE_NAME;
  }

  getCookieOptions() {
    const isProd = process.env.NODE_ENV === "production";
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_EXPIRY_MS
    };
  }

  /**
   * Generates a signed session token.
   */
  createSessionToken(payload) {
    return jwt.sign(payload, config.jwtSecret, {
      expiresIn: "8h",
      issuer: "MedGuard-EHR",
      audience: "medguard-clinical-session"
    });
  }

  signSessionToken(payload) {
    return this.createSessionToken(payload);
  }

  /**
   * Sets the HTTP-only secure session cookie on the response.
   */
  setSessionCookie(res, token) {
    res.cookie(COOKIE_NAME, token, this.getCookieOptions());
  }

  /**
   * Clears the HTTP-only session cookie upon logout.
   */
  clearSessionCookie(res) {
    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/"
    });
  }

  /**
   * Verifies a session token.
   */
  verifySessionToken(token) {
    if (!token) return null;
    try {
      return jwt.verify(token, config.jwtSecret, {
        issuer: "MedGuard-EHR",
        audience: "medguard-clinical-session"
      });
    } catch (err) {
      // Fallback verification for tokens signed without issuer/audience
      try {
        return jwt.verify(token, config.jwtSecret);
      } catch (e) {
        return null;
      }
    }
  }
}

module.exports = new SessionService();
