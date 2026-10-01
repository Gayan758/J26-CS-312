const request = require("supertest");
const { expect } = require("chai");
const crypto = require("crypto");
const app = require("../src/server");
const passwordService = require("../src/services/passwordService");
const twoFactorService = require("../src/services/twoFactorService");
const sessionService = require("../src/services/sessionService");
const ehrDatabase = require("../src/services/ehrDatabase");

describe("Phase 2 - Authentication, Sessions, & Access Control (OWASP ASVS)", function () {
  this.timeout(15000);

  describe("1. Password Policy & Bcrypt Hashing (OWASP ASVS V2)", function () {
    it("should reject passwords shorter than 12 characters", function () {
      const res = passwordService.validatePasswordPolicy("Short1!Aa");
      expect(res.valid).to.be.false;
      expect(res.error).to.include("at least 12 characters");
    });

    it("should reject passwords missing uppercase letters", function () {
      const res = passwordService.validatePasswordPolicy("lowercase12345!@#");
      expect(res.valid).to.be.false;
      expect(res.error).to.include("uppercase letter");
    });

    it("should reject passwords missing lowercase letters", function () {
      const res = passwordService.validatePasswordPolicy("UPPERCASE12345!@#");
      expect(res.valid).to.be.false;
      expect(res.error).to.include("lowercase letter");
    });

    it("should reject passwords missing numeric digits", function () {
      const res = passwordService.validatePasswordPolicy("NoNumbersHere!@#");
      expect(res.valid).to.be.false;
      expect(res.error).to.include("numerical digit");
    });

    it("should reject passwords missing special symbols", function () {
      const res = passwordService.validatePasswordPolicy("NoSpecialSymbols123");
      expect(res.valid).to.be.false;
      expect(res.error).to.include("special symbol");
    });

    it("should accept valid OWASP-compliant 12+ char password", function () {
      const res = passwordService.validatePasswordPolicy("MedGuard#Sec2026!");
      expect(res.valid).to.be.true;
      expect(res.error).to.be.null;
    });

    it("should hash password with bcrypt cost factor 12", async function () {
      const hash = await passwordService.hashPassword("MedGuard#Sec2026!");
      expect(hash).to.match(/^\$2[ab]\$12\$/);
      const isMatch = await passwordService.comparePassword("MedGuard#Sec2026!", hash);
      expect(isMatch).to.be.true;
    });

    it("should detect legacy passwords and indicate need for rehashing", function () {
      expect(passwordService.needsRehash("plaintext123")).to.be.true;
      expect(passwordService.needsRehash("$2a$10$abcdefghijklmnopqrstuu")).to.be.true;
      expect(passwordService.needsRehash("$2b$12$abcdefghijklmnopqrstuv")).to.be.false;
    });
  });

  describe("2. HTTP-Only Cookie Session Management (OWASP ASVS V3)", function () {
    let sessionCookie = "";

    it("should set HttpOnly, SameSite=Lax cookie on successful doctor login", async function () {
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          username: "alice.vance",
          password: "Password123!"
        });

      expect(res.status).to.equal(200);
      const cookies = res.headers["set-cookie"];
      expect(cookies).to.be.an("array");
      const cookieStr = cookies.join("; ");
      expect(cookieStr).to.include("medguard_session=");
      expect(cookieStr.toLowerCase()).to.include("httponly");
      expect(cookieStr.toLowerCase()).to.include("samesite=lax");

      // Extract cookie for subsequent authenticated requests
      const match = cookieStr.match(/medguard_session=([^;]+)/);
      expect(match).to.not.be.null;
      sessionCookie = `medguard_session=${match[1]}`;
    });

    it("should authenticate /api/auth/me using the HttpOnly session cookie", async function () {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Cookie", sessionCookie);

      expect(res.status).to.equal(200);
      expect(res.body.user).to.exist;
      expect(res.body.user.username).to.equal("alice.vance");
      expect(res.body.user.role.toLowerCase()).to.equal("doctor");
    });

    it("should clear the session cookie on /api/auth/logout", async function () {
      const res = await request(app)
        .post("/api/auth/logout")
        .set("Cookie", sessionCookie);

      expect(res.status).to.equal(200);
      const cookies = res.headers["set-cookie"];
      expect(cookies).to.be.an("array");
      const cookieStr = cookies.join("; ");
      expect(cookieStr).to.include("medguard_session=;");
    });
  });

  describe("3. Separation of Duties: Admin Clinical Access Restrictions (OWASP ASVS V4)", function () {
    let adminToken = "";

    before(function () {
      // Sign administrative session token
      adminToken = sessionService.signSessionToken({
        id: "admin-hospital-test",
        name: "Hospital IT Administrator",
        username: "admin.compliance",
        role: "admin"
      });
    });

    it("should forbid admin from accessing patient clinical chart (403 Forbidden)", async function () {
      const res = await request(app)
        .get("/api/patients/patient-123")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).to.equal(403);
      expect(res.body.error).to.include("Separation of Duties");
    });

    it("should forbid admin from authoring clinical SOAP encounter notes (403 Forbidden)", async function () {
      const res = await request(app)
        .post("/api/patients/patient-123/encounters")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          chiefComplaint: "Unauthorized clinical note",
          soap: { subjective: "Sub", objective: "Obj", assessment: "Ass", plan: "Pla" }
        });

      expect(res.status).to.equal(403);
      expect(res.body.error).to.include("Access Denied");
    });

    it("should forbid admin from prescribing medications (403 Forbidden)", async function () {
      const res = await request(app)
        .post("/api/patients/patient-123/prescriptions")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          drugName: "Aspirin",
          dosage: "100mg",
          frequency: "Once daily"
        });

      expect(res.status).to.equal(403);
      expect(res.body.error).to.include("Access Denied");
    });

    it("should forbid admin from recording vitals (403 Forbidden)", async function () {
      const res = await request(app)
        .post("/api/patients/patient-123/vitals")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          bp: "120/80",
          hr: 72
        });

      expect(res.status).to.equal(403);
      expect(res.body.error).to.include("Access Denied");
    });
  });

  describe("4. Patient Role Isolation & Self-Access (OWASP ASVS V4)", function () {
    let patientToken = "";

    before(async function () {
      // Authenticate as verified patient
      const res = await request(app)
        .post("/api/auth/patient-login")
        .send({
          identifier: "PHN-772910"
        });

      expect(res.status).to.equal(200);
      patientToken = res.body.token;
    });

    it("should allow verified patient to retrieve their own clinical record", async function () {
      const res = await request(app)
        .get("/api/patients/patient-123")
        .set("Authorization", `Bearer ${patientToken}`);

      expect(res.status).to.equal(200);
      expect(res.body.status).to.equal("ALLOW");
      expect(res.body.record.phn).to.equal("PHN-772910");
    });

    it("should forbid patient from accessing another patient's clinical chart (403)", async function () {
      const res = await request(app)
        .get("/api/patients/patient-456")
        .set("Authorization", `Bearer ${patientToken}`);

      expect(res.status).to.equal(403);
      expect(res.body.error).to.include("Access Denied");
    });

    it("should allow patient to update their own care team consent", async function () {
      const res = await request(app)
        .put("/api/patients/patient-123/consent")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          assignedDoctorIds: ["doc-alice"],
          assignedDoctorAddresses: ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8"],
          consentStatus: true
        });

      expect(res.status).to.equal(200);
      expect(res.body.status).to.equal("SUCCESS");
    });

    it("should forbid patient from authoring clinical notes on their own chart (403)", async function () {
      const res = await request(app)
        .post("/api/patients/patient-123/encounters")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          chiefComplaint: "Patient self note",
          soap: { subjective: "Sub" }
        });

      expect(res.status).to.equal(403);
      expect(res.body.error).to.include("Access Denied");
    });
  });

  describe("5. Emergency Break-Glass Protocol Governance", function () {
    let doctorToken = "";
    let adminToken = "";

    before(async function () {
      const docRes = await request(app)
        .post("/api/auth/login")
        .send({ username: "alice.vance", password: "Password123!" });
      doctorToken = docRes.body.token;

      adminToken = sessionService.signSessionToken({
        id: "admin-hospital-test",
        name: "Hospital IT Administrator",
        username: "admin.compliance",
        role: "admin"
      });
    });

    it("should reject break-glass activation without clinician role (403)", async function () {
      const res = await request(app)
        .post("/api/break-glass/activate")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          patient_id: "patient-456",
          justification: "Emergency bypass requested by IT Administrator"
        });

      expect(res.status).to.equal(403);
      expect(res.body.error).to.include("Access Denied");
    });

    it("should reject break-glass activation with justification < 15 characters (400)", async function () {
      const res = await request(app)
        .post("/api/break-glass/activate")
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({
          patient_id: "patient-456",
          justification: "Short reason"
        });

      expect(res.status).to.equal(400);
      expect(res.body.error).to.include("at least 15 characters");
    });

    it("should grant 4-hour emergency token for valid clinician justification", async function () {
      const res = await request(app)
        .post("/api/break-glass/activate")
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({
          patient_id: "patient-456",
          justification: "Acute hemodynamic shock in trauma resuscitation room"
        });

      expect(res.status).to.equal(200);
      expect(res.body.status).to.include("EMERGENCY_OVERRIDE");
      expect(res.body.token).to.be.a("string");
      expect(res.body.expires_at).to.be.greaterThan(Math.floor(Date.now() / 1000) + 14000); // 4 hours TTL
    });
  });

  describe("6. RFC 6238 TOTP Engine & Authenticator App Support", function () {
    let totpSecret = "";

    it("should generate a valid RFC 6238 TOTP setup payload", function () {
      const setup = twoFactorService.generateTotpSecret("alice.vance", "MedGuard EHR");
      expect(setup).to.have.property("secret");
      expect(setup).to.have.property("otpauthUrl");
      expect(setup.otpauthUrl).to.include("otpauth://totp/MedGuard%20EHR:alice.vance");
      expect(setup.secret).to.match(/^[A-Z2-7]{16,32}$/);
      totpSecret = setup.secret;
    });

    it("should generate and verify an RFC 6238 TOTP code with time-step tolerance", function () {
      const code = twoFactorService.generateTotpCode(totpSecret);
      expect(code).to.match(/^\d{6}$/);

      const isValid = twoFactorService.verifyTotp(totpSecret, code);
      expect(isValid).to.be.true;
    });

    it("should reject invalid TOTP codes", function () {
      const isValid = twoFactorService.verifyTotp(totpSecret, "000000");
      expect(isValid).to.be.false;
    });
  });
});
