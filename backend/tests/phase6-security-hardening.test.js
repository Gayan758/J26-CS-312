const { expect } = require("chai");
const request = require("supertest");
const express = require("express");
const fs = require("fs");
const path = require("path");
const app = require("../src/server");
const { validateEnvironment, KNOWN_INSECURE_SECRETS } = require("../src/config/validateEnv");
const {
  createLimiter,
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  otpLimiter,
  breakGlassLimiter,
  accessRequestLimiter,
  patientDataLimiter,
  apiGlobalLimiter
} = require("../src/middleware/rateLimiter");

describe("Phase 6 - Security Hardening & Configuration Validation", function () {

  describe("1. HTTP Security Headers & Content Security Policy (Helmet)", function () {
    it("should set Content-Security-Policy with strict directives", async function () {
      const res = await request(app).get("/health");

      expect(res.status).to.equal(200);
      const csp = res.headers["content-security-policy"];
      expect(csp).to.be.a("string");
      expect(csp).to.include("default-src 'self'");
      expect(csp).to.include("script-src 'self'");
      expect(csp).to.include("style-src 'self' 'unsafe-inline'");
      expect(csp).to.include("object-src 'none'");
      expect(csp).to.include("frame-ancestors 'none'");
    });

    it("should set standard OWASP defense headers (nosniff, frameguard, HSTS, referrer)", async function () {
      const res = await request(app).get("/health");

      expect(res.status).to.equal(200);
      expect(res.headers["x-content-type-options"]).to.equal("nosniff");
      expect(res.headers["x-frame-options"]).to.equal("DENY");
      expect(res.headers["strict-transport-security"]).to.include("max-age=31536000");
      expect(res.headers["strict-transport-security"]).to.include("includeSubDomains");
      expect(res.headers["referrer-policy"]).to.equal("strict-origin-when-cross-origin");
    });

    it("should set clinical browser feature isolation (Permissions-Policy)", async function () {
      const res = await request(app).get("/health");

      expect(res.status).to.equal(200);
      const permPolicy = res.headers["permissions-policy"];
      expect(permPolicy).to.be.a("string");
      expect(permPolicy).to.include("camera=()");
      expect(permPolicy).to.include("microphone=()");
      expect(permPolicy).to.include("geolocation=()");
      expect(permPolicy).to.include("payment=()");
      expect(res.headers["x-permitted-cross-domain-policies"]).to.equal("none");
    });

    it("should hide X-Powered-By header to prevent technology fingerprinting", async function () {
      const res = await request(app).get("/health");

      expect(res.headers["x-powered-by"]).to.be.undefined;
    });
  });

  describe("2. Strict CORS Whitelist & Preflight Hardening", function () {
    it("should accept requests from whitelisted hospital origins", async function () {
      const res = await request(app)
        .get("/health")
        .set("Origin", "http://localhost:3000");

      expect(res.status).to.equal(200);
      expect(res.headers["access-control-allow-origin"]).to.equal("http://localhost:3000");
      expect(res.headers["access-control-allow-credentials"]).to.equal("true");
    });

    it("should handle CORS preflight OPTIONS requests for whitelisted origins", async function () {
      const res = await request(app)
        .options("/api/patients")
        .set("Origin", "http://localhost:3000")
        .set("Access-Control-Request-Method", "GET")
        .set("Access-Control-Request-Headers", "Authorization, Content-Type, X-Request-Id");

      expect([200, 204]).to.include(res.status);
      expect(res.headers["access-control-allow-origin"]).to.equal("http://localhost:3000");
      expect(res.headers["access-control-allow-methods"]).to.include("GET");
      expect(res.headers["access-control-allow-headers"]).to.include("Authorization");
    });

    it("should reject requests from unauthorized third-party origins", async function () {
      const res = await request(app)
        .get("/health")
        .set("Origin", "https://unauthorized-attacker.example.com");

      // Either 403 with CORS rejection message or origin header stripped
      if (res.status === 403) {
        expect(res.body.error).to.include("CORS Policy");
      } else {
        expect(res.headers["access-control-allow-origin"]).to.be.undefined;
      }
    });

    it("should allow internal non-browser requests without Origin header", async function () {
      const res = await request(app).get("/health");
      expect(res.status).to.equal(200);
    });
  });

  describe("3. Rate Limiting Hardening", function () {
    it("should expose configured rate limiters for all sensitive hospital operations", function () {
      expect(loginLimiter).to.be.a("function");
      expect(registerLimiter).to.be.a("function");
      expect(passwordResetLimiter).to.be.a("function");
      expect(otpLimiter).to.be.a("function");
      expect(breakGlassLimiter).to.be.a("function");
      expect(accessRequestLimiter).to.be.a("function");
      expect(patientDataLimiter).to.be.a("function");
      expect(apiGlobalLimiter).to.be.a("function");
    });

    it("should enforce rate limiting and return HTTP 429 when threshold is exceeded", async function () {
      const testApp = express();
      const testLimiter = createLimiter({
        windowMs: 60 * 1000,
        max: 3,
        message: "Test limit exceeded. Please wait."
      });

      testApp.get("/test-limit", testLimiter, (req, res) => {
        res.status(200).json({ ok: true });
      });

      // Requests 1, 2, 3 succeed
      const r1 = await request(testApp).get("/test-limit");
      expect(r1.status).to.equal(200);

      const r2 = await request(testApp).get("/test-limit");
      expect(r2.status).to.equal(200);

      const r3 = await request(testApp).get("/test-limit");
      expect(r3.status).to.equal(200);

      // Request 4 should be throttled
      const r4 = await request(testApp).get("/test-limit");
      expect(r4.status).to.equal(429);
      expect(r4.body.error).to.include("Test limit exceeded");
      expect(r4.headers["ratelimit-remaining"]).to.equal("0");
    });

    it("should bypass rate limiter when explicit test bypass header is present", async function () {
      const testApp = express();
      const testLimiter = createLimiter({
        windowMs: 60 * 1000,
        max: 1,
        message: "Rate limit reached."
      });

      testApp.get("/test-bypass", testLimiter, (req, res) => {
        res.status(200).json({ ok: true });
      });

      // Request 1 uses the 1 allowance
      const r1 = await request(testApp).get("/test-bypass");
      expect(r1.status).to.equal(200);

      // Request 2 without header triggers 429
      const r2 = await request(testApp).get("/test-bypass");
      expect(r2.status).to.equal(429);

      // Request 3 with bypass header succeeds
      const r3 = await request(testApp)
        .get("/test-bypass")
        .set("x-test-bypass-rate-limit", "true");
      expect(r3.status).to.equal(200);
    });
  });

  describe("4. Fail-Closed Environment Configuration Validation", function () {
    const validProductionEnv = {
      NODE_ENV: "production",
      JWT_SECRET: "c0a80101_production_hospital_secret_key_minimum_32_bytes_entropy",
      MASTER_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      MFA_CHALLENGE_SECRET: "production_mfa_stepup_entropy_token_at_least_32_characters",
      FRONTEND_URL: "https://ehr.hospital.lk",
      DATABASE_URL: "postgresql://medguard:secure_pass@db.hospital.internal:5432/medguard"
    };

    it("should pass validation for a sound production configuration", function () {
      const result = validateEnvironment({
        env: validProductionEnv,
        isProduction: true,
        exitOnError: false
      });

      expect(result.valid).to.be.true;
      expect(result.errors).to.be.an("array").that.is.empty;
    });

    it("should fail closed in production if JWT_SECRET is missing", function () {
      const badEnv = { ...validProductionEnv, JWT_SECRET: "" };
      const result = validateEnvironment({
        env: badEnv,
        isProduction: true,
        exitOnError: false
      });

      expect(result.valid).to.be.false;
      expect(result.errors.some(e => e.includes("JWT_SECRET must be defined"))).to.be.true;
    });

    it("should fail closed in production if JWT_SECRET is too short (< 32 chars)", function () {
      const badEnv = { ...validProductionEnv, JWT_SECRET: "short_secret_123" };
      const result = validateEnvironment({
        env: badEnv,
        isProduction: true,
        exitOnError: false
      });

      expect(result.valid).to.be.false;
      expect(result.errors.some(e => e.includes("too short"))).to.be.true;
    });

    it("should fail closed in production if JWT_SECRET is a known default", function () {
      const badEnv = {
        ...validProductionEnv,
        JWT_SECRET: "medguard_v2_super_secure_backend_jwt_secret_2026"
      };
      const result = validateEnvironment({
        env: badEnv,
        isProduction: true,
        exitOnError: false
      });

      expect(result.valid).to.be.false;
      expect(result.errors.some(e => e.includes("insecure default"))).to.be.true;
    });

    it("should fail closed in production if MASTER_ENCRYPTION_KEY is missing or malformed", function () {
      const badEnv = { ...validProductionEnv, MASTER_ENCRYPTION_KEY: "not-a-hex-key" };
      const result = validateEnvironment({
        env: badEnv,
        isProduction: true,
        exitOnError: false
      });

      expect(result.valid).to.be.false;
      expect(result.errors.some(e => e.includes("MASTER_ENCRYPTION_KEY"))).to.be.true;
    });

    it("should fail closed in production if FRONTEND_URL is wildcard '*'", function () {
      const badEnv = { ...validProductionEnv, FRONTEND_URL: "*" };
      const result = validateEnvironment({
        env: badEnv,
        isProduction: true,
        exitOnError: false
      });

      expect(result.valid).to.be.false;
      expect(result.errors.some(e => e.includes("wildcard '*'"))).to.be.true;
    });

    it("should throw an error if throwOnError option is specified", function () {
      const badEnv = { ...validProductionEnv, JWT_SECRET: "" };
      expect(() => {
        validateEnvironment({
          env: badEnv,
          isProduction: true,
          exitOnError: false,
          throwOnError: true
        });
      }).to.throw(/Environment validation failed/);
    });

    it("should allow fallbacks in development mode with warnings", function () {
      const devEnv = {
        NODE_ENV: "development",
        JWT_SECRET: "medguard_v2_super_secure_backend_jwt_secret_2026"
      };

      const result = validateEnvironment({
        env: devEnv,
        isProduction: false,
        exitOnError: false
      });

      expect(result.valid).to.be.true;
      expect(result.warnings.length).to.be.greaterThan(0);
    });
  });

  describe("5. Environment Example Documentation Integrity", function () {
    it("should have root and backend .env.example files without cleartext secrets", function () {
      const rootEnvPath = path.resolve(__dirname, "../../.env.example");
      const backendEnvPath = path.resolve(__dirname, "../.env.example");

      expect(fs.existsSync(rootEnvPath)).to.be.true;
      expect(fs.existsSync(backendEnvPath)).to.be.true;

      const rootContent = fs.readFileSync(rootEnvPath, "utf8");
      const backendContent = fs.readFileSync(backendEnvPath, "utf8");

      expect(rootContent).to.include("JWT_SECRET=");
      expect(rootContent).to.include("MASTER_ENCRYPTION_KEY=");
      expect(backendContent).to.include("JWT_SECRET=");
      expect(backendContent).to.include("MASTER_ENCRYPTION_KEY=");

      const checkEnvValues = (content) => {
        const lines = content.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const [key, ...rest] = trimmed.split("=");
          const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
          for (const banned of KNOWN_INSECURE_SECRETS) {
            if (val) {
              expect(val.toLowerCase()).to.not.equal(banned);
            }
          }
        }
      };

      checkEnvValues(rootContent);
      checkEnvValues(backendContent);
    });
  });
});
