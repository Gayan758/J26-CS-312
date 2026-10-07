const fs = require("fs");
const path = require("path");
const request = require("supertest");
const { expect } = require("chai");
const app = require("../src/server");
const consentService = require("../src/services/consentService");
const auditService = require("../src/services/auditService");
const emailService = require("../src/services/emailService");

describe("MedGuard Backend Integration Tests", function () {
  const doctorAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const patientId = "patient-123";
  const emergencyPatientId = "patient-456";

  beforeEach(() => {
    consentService.setMockConsent(doctorAddress, patientId, true);
  });

  describe("0. Doctor Authentication & Hospital Range Auto-Detection", function () {
    it("should authenticate demo doctor with username and password", async function () {
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          username: "alice.vance",
          password: "Password123!"
        });

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property("token");
      expect(res.body.doctor.name).to.equal("Dr. Alice Vance, MD");
      expect(res.body.doctor.ethereumAddress).to.equal(doctorAddress);
    });

    it("should reject login with invalid password", async function () {
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          username: "alice.vance",
          password: "WrongPassword!"
        });

      expect(res.status).to.equal(401);
      expect(res.body.error).to.include("Invalid username or password");
    });

    it("should register a new doctor with SLMC credentials and allow immediate login", async function () {
      const regRes = await request(app)
        .post("/api/auth/register")
        .send({
          name: "Dr. Nuwan Senanayake, MD",
          email: "nuwan.senanayake@hospital.lk",
          slmcNumber: "SLMC-88214",
          specialty: "Consultant Neurologist",
          username: `nuwan_${Date.now()}`,
          password: "SecurePassword123!",
          baseCampus: "SLIIT Malabe Campus Health Center",
          phone: "+94 77 555 9999"
        });

      expect(regRes.status).to.equal(201);
      expect(regRes.body.doctor.name).to.equal("Dr. Nuwan Senanayake, MD");
      expect(regRes.body.doctor.slmcNumber).to.equal("SLMC-88214");
      expect(regRes.body.doctor.ethereumAddress).to.match(/^0x[a-fA-F0-9]{40}$/);

      // Verify immediate login with the new doctor
      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({
          username: regRes.body.doctor.username,
          password: "SecurePassword123!"
        });

      expect(loginRes.status).to.equal(200);
      expect(loginRes.body).to.have.property("token");
      expect(loginRes.body.doctor.name).to.equal("Dr. Nuwan Senanayake, MD");

      // Clean up ephemeral test doctor
      const ehrDb = require("../src/services/ehrDatabase");
      ehrDb.removeUser(regRes.body.doctor.id);
    });

    it("should capture real device coordinates on login and detect inside vs outside SLIIT Malabe", async function () {
      // 1. Inside SLIIT Malabe Campus (6.9147, 79.9733)
      const insideRes = await request(app)
        .post("/api/auth/login")
        .send({
          username: "alice.vance",
          password: "Password123!",
          coordinates: { latitude: 6.9147, longitude: 79.9733, accuracy: 6 }
        });

      expect(insideRes.status).to.equal(200);
      expect(insideRes.body.locationInfo.isInsideCampus).to.be.true;
      expect(insideRes.body.locationInfo.distanceKm).to.be.lessThan(0.40);

      // 2. Outside SLIIT Malabe Campus (Colombo Fort: 6.9271, 79.8612, ~14km)
      const outsideRes = await request(app)
        .post("/api/auth/login")
        .send({
          username: "sarah.jenkins",
          password: "Password123!",
          coordinates: { latitude: 6.9271, longitude: 79.8612, accuracy: 12 }
        });

      expect(outsideRes.status).to.equal(200);
      expect(outsideRes.body.locationInfo.isInsideCampus).to.be.false;
      expect(outsideRes.body.locationInfo.distanceKm).to.be.greaterThan(10.0);
      expect(outsideRes.body.locationInfo.campusName).to.include("Outside Hospital Perimeter");
    });

    it("should auto-detect SLIIT Malabe Campus IP range", async function () {
      const res = await request(app)
        .get("/api/auth/network-status")
        .set("x-forwarded-for", "10.100.5.22");

      expect(res.status).to.equal(200);
      expect(res.body.campusKey).to.equal("SLIIT_MALABE");
      expect(res.body.campusName).to.include("SLIIT Malabe");
      expect(res.body.isInternal).to.be.true;
    });

    it("should auto-detect Seylan Tower 1 Clinic IP range", async function () {
      const res = await request(app)
        .get("/api/auth/network-status")
        .set("x-forwarded-for", "192.168.10.45");

      expect(res.status).to.equal(200);
      expect(res.body.campusKey).to.equal("SEYLAN_TOWER_1");
      expect(res.body.campusName).to.include("Seylan Tower 1");
      expect(res.body.isInternal).to.be.true;
    });
  });

  describe("1. Full Happy Path (ALLOW & Two-Branch Decryption)", function () {
    it("should evaluate low risk, execute parallel IPFS lookup + key release, and return decrypted record", async function () {
      // 09:30 UTC is 15:00 in Sri Lanka Time (08:00 - 18:00 SLST -> Low Risk R_t = 0.10)
      const res = await request(app)
        .post("/api/access-request")
        .send({
          doctor_address: doctorAddress,
          patient_id: patientId,
          requested_record_id: "record-001",
          requested_record_sensitivity: "low",
          ip_address: "10.100.1.25", // SLIIT Malabe Campus LAN (R_l ~ 0.05)
          device_fingerprint: "sha256:alice-workstation-secure-enclave",
          timestamp: "2026-09-15T09:30:00Z"
        });

      expect(res.status).to.equal(200);
      expect(res.body.status).to.equal("ALLOW");
      expect(res.body.risk_level).to.equal("LOW");
      expect(res.body.risk_score).to.be.lessThan(0.30);
      expect(res.body).to.have.property("access_decision_id");
      expect(res.body).to.have.property("record");
      expect(res.body.record.patientName).to.equal("John Doe");
      expect(res.body.record.bloodGroup).to.equal("A+");
      expect(res.body.record.allergies).to.include("Penicillin");
    });
  });

  describe("2. Step-up MFA Path (MEDIUM Risk)", function () {
    it("should return MFA_REQUIRED challenge when context signals yield medium risk, then verify & decrypt", async function () {
      const res1 = await request(app)
        .post("/api/access-request")
        .set("x-forwarded-for", "203.0.113.19")
        .send({
          doctor_address: doctorAddress,
          patient_id: patientId,
          requested_record_id: "record-001",
          requested_record_sensitivity: "medium",
          device_fingerprint: "sha256:alice-workstation-secure-enclave",
          timestamp: "2026-09-15T09:30:00Z"
        });

      expect(res1.status).to.equal(200);
      expect(res1.body.status).to.equal("MFA_REQUIRED");
      expect(res1.body.risk_level).to.equal("MEDIUM");
      expect(res1.body).to.have.property("challenge_token");

      const challengeToken = res1.body.challenge_token;

      const res2 = await request(app)
        .post("/api/mfa-verify")
        .send({
          challenge_token: challengeToken,
          otp: "123456"
        });

      expect(res2.status).to.equal(200);
      expect(res2.body.status).to.equal("ALLOW");
      expect(res2.body.mfa_verified).to.be.true;
      expect(res2.body.record.patientName).to.equal("John Doe");
    });
  });

  describe("3. Block Path (HIGH Risk or Invalid Consent)", function () {
    it("should return generic 403 when consent is revoked, overriding low risk", async function () {
      consentService.setMockConsent(doctorAddress, patientId, false);

      const res = await request(app)
        .post("/api/access-request")
        .send({
          doctor_address: doctorAddress,
          patient_id: patientId,
          requested_record_id: "record-001",
          requested_record_sensitivity: "low",
          ip_address: "10.100.1.25",
          device_fingerprint: "sha256:alice-workstation-secure-enclave",
          timestamp: "2026-09-15T09:30:00Z"
        });

      expect(res.status).to.equal(403);
      expect(res.body.error).to.equal("Access Denied by Policy");
      expect(res.body).to.not.have.property("risk_score");
    });

    it("should return generic 403 when risk is HIGH, even if consent is valid", async function () {
      consentService.setMockConsent(doctorAddress, patientId, true);

      // Deep night (3:00 AM SLST) + rogue IP + unregistered phone + restricted data
      const res = await request(app)
        .post("/api/access-request")
        .set("x-forwarded-for", "198.51.100.99")
        .send({
          doctor_address: doctorAddress,
          patient_id: patientId,
          requested_record_id: "record-001",
          requested_record_sensitivity: "restricted",
          device_fingerprint: "sha256:rogue-unregistered-phone",
          timestamp: "2026-09-15T21:30:00Z" // 03:00 SLST next day
        });

      expect(res.status).to.equal(403);
      expect(res.body.error).to.equal("Access Denied by Policy");
    });
  });

  describe("4. Break-Glass Emergency Path", function () {
    it("should activate emergency token, bypass risk scoring, execute two-branch decryption, and log isBreakGlass: true", async function () {
      const justification = "Patient in acute cardiac arrest in ER, anaphylaxis suspected, allergy history vital.";

      const resActivate = await request(app)
        .post("/api/break-glass/activate")
        .send({
          doctor_address: doctorAddress,
          patient_id: emergencyPatientId,
          justification
        });

      expect(resActivate.status).to.equal(200);
      expect(resActivate.body.status).to.equal("EMERGENCY_OVERRIDE_ACTIVE");
      expect(resActivate.body).to.have.property("token");

      const emergencyToken = resActivate.body.token;

      const resAccess = await request(app)
        .post("/api/break-glass/access-record")
        .set("Authorization", `Bearer ${emergencyToken}`)
        .send({});

      expect(resAccess.status).to.equal(200);
      expect(resAccess.body.status).to.equal("EMERGENCY_OVERRIDE_READ");
      expect(resAccess.body.record.patientName).to.equal("Jane Trauma-Smith");
      expect(resAccess.body.record.criticalAlert).to.include("latex allergy");

      const logs = auditService.getAuditLogs();
      const readLog = logs.find(l => l.decision === "BREAK_GLASS_READ");
      expect(readLog).to.not.be.undefined;
      expect(readLog.isBreakGlass).to.be.true;
    });

    it("should activate Break-Glass for two different patient IDs back-to-back in the same session, returning distinct records each time", async function () {
      // Test back-to-back activation for patient-123 and patient-456
      const res1 = await request(app)
        .post("/api/break-glass/activate")
        .send({
          doctor_address: doctorAddress,
          patientId: "patient-123",
          justification: "Acute cardiac arrest, emergency resuscitation protocol active in ICU."
        });

      expect(res1.status).to.equal(200);
      expect(res1.body).to.have.property("record");
      expect(res1.body.record.patientName || res1.body.record.name).to.equal("John Doe");

      const res2 = await request(app)
        .post("/api/break-glass/activate")
        .send({
          doctor_address: doctorAddress,
          patientId: "patient-456",
          justification: "Massive hemorrhage following polytrauma, emergency surgical override."
        });

      expect(res2.status).to.equal(200);
      expect(res2.body).to.have.property("record");
      expect(res2.body.record.patientName || res2.body.record.name).to.equal("Jane Trauma-Smith");

      // Verify that records never cross-contaminated
      expect(res1.body.record.name || res1.body.record.patientName).to.not.equal(
        res2.body.record.name || res2.body.record.patientName
      );
    });
  });

  describe("5. Clinical EHR Workflows & Chart Management", function () {
    it("should return the clinical patient queue with summaries", async function () {
      const res = await request(app).get("/api/patients");
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property("patients");
      expect(res.body.patients).to.be.an("array");
      expect(res.body.patients.length).to.be.at.least(4);
      expect(res.body.patients[0]).to.have.property("phn");
      expect(res.body.patients[0]).to.have.property("bloodGroup");
    });

    it("should silently evaluate RiskBAC and decrypt full EMR chart for in-hospital doctor", async function () {
      const res = await request(app)
        .get(`/api/patients/${patientId}`)
        .set("x-doctor-address", doctorAddress)
        .set("x-device-fingerprint", "sha256:alice-workstation-secure-enclave")
        .set("x-forwarded-for", "10.100.1.25");

      expect(res.status).to.equal(200);
      expect(res.body.status).to.equal("ALLOW");
      expect(res.body).to.have.property("record");
      expect(res.body.record.name).to.equal("John Doe");
      expect(res.body.record.encounters).to.be.an("array");
      expect(res.body.record.prescriptions).to.be.an("array");
      expect(res.body.record.vitals).to.be.an("array");
    });

    it("should add a new doctor SOAP clinical note to the patient chart", async function () {
      const soapData = {
        doctorName: "Dr. Alice Vance, MD",
        doctorAddress,
        chiefComplaint: "Follow-up blood sugar check",
        soap: {
          subjective: "Patient adhering to low carb diet.",
          objective: "Random blood glucose 110 mg/dL, BP 124/80.",
          assessment: "Diabetes mellitus under optimal management.",
          plan: "Maintain current therapy. Repeat labs in 6 months."
        },
        diagnosisIcd10: ["E11.9"]
      };

      const res = await request(app)
        .post(`/api/patients/${patientId}/encounters`)
        .send(soapData);

      expect(res.status).to.equal(201);
      expect(res.body.status).to.equal("SUCCESS");
      expect(res.body.encounter.chiefComplaint).to.equal("Follow-up blood sugar check");
    });

    it("should prescribe a medication and update the encrypted record", async function () {
      const rxData = {
        drugName: "Atorvastatin Calcium",
        dosage: "20mg",
        route: "Oral",
        frequency: "Once daily at bedtime",
        duration: "90 days",
        refills: 2,
        instructions: "Take with water before sleep.",
        prescribedBy: "Dr. Alice Vance, MD"
      };

      const res = await request(app)
        .post(`/api/patients/${patientId}/prescriptions`)
        .send(rxData);

      expect(res.status).to.equal(201);
      expect(res.body.status).to.equal("SUCCESS");
      expect(res.body.prescription.drugName).to.equal("Atorvastatin Calcium");
    });

    it("should record clinical vitals and update the record", async function () {
      const vitalsData = {
        bp: "122/78",
        hr: 70,
        rr: 15,
        spo2: 99,
        temp: "36.7 C",
        glucose: "105 mg/dL",
        recordedBy: "Staff Nurse"
      };

      const res = await request(app)
        .post(`/api/patients/${patientId}/vitals`)
        .send(vitalsData);

      expect(res.status).to.equal(201);
      expect(res.body.status).to.equal("SUCCESS");
      expect(res.body.vitals.bp).to.equal("122/78");
    });

    it("should admit/register a new patient with encrypted baseline record", async function () {
      const newPatientData = {
        name: "Nimal Perera",
        dob: "1985-04-12",
        gender: "Male",
        nic: "851032481V",
        bloodGroup: "O+",
        allergies: ["Sulfa drugs"],
        chronicConditions: ["Hypertension"],
        sensitivity: "low"
      };

      const res = await request(app)
        .post("/api/patients")
        .send(newPatientData);

      expect(res.status).to.equal(201);
      expect(res.body.status).to.equal("SUCCESS");
      expect(res.body.patient.name).to.equal("Nimal Perera");
      expect(res.body.patient.id).to.be.a("string");

      const testFile = path.join(__dirname, `../data/ipfs_storage/${res.body.patient.id}.json`);
      if (fs.existsSync(testFile)) {
        try { fs.unlinkSync(testFile); } catch {}
      }
    });
  });

  describe("6. Email-Based Two-Factor Authentication (2FA) & Registration", function () {
    const testDocEmail = `test.physician.${Date.now()}@sliit.lk`;
    const testUsername = `doc.test.${Date.now()}`;
    let registeredDoctor = null;

    it("should register a new physician with 2FA email address and dispatch enrollment notification", async function () {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          name: "Dr. Rohana Wijesinghe, MD",
          email: testDocEmail,
          username: testUsername,
          password: "Password123!",
          slmcNumber: "SLMC-99412",
          specialty: "Consultant Pulmonologist",
          baseCampus: "SLIIT Malabe Campus Health Center",
          phone: "+94 77 444 5555"
        });

      expect(res.status).to.equal(201);
      expect(res.body.doctor).to.have.property("email", testDocEmail);
      expect(res.body.doctor).to.have.property("name", "Dr. Rohana Wijesinghe, MD");
      expect(res.body).to.have.property("emailStatus");
      expect(res.body.emailStatus.success).to.be.true;
      registeredDoctor = res.body.doctor;
    });

    it("should dispatch a dynamic 6-digit OTP to the doctor's registered email", async function () {
      const res = await request(app)
        .post("/api/auth/send-2fa-otp")
        .send({
          doctorId: registeredDoctor.id,
          reason: "Off-Campus Workstation Verification"
        });

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body).to.have.property("maskedEmail");
      // Security check: previewOtp is never leaked in the API response
      expect(res.body).to.not.have.property("previewOtp");

      const storedOtp = emailService.getStoredOtpForTest(registeredDoctor.id);
      expect(storedOtp).to.match(/^[0-9]{6}$/);
    });

    it("should reject an invalid OTP and verify device when correct dynamic OTP is provided", async function () {
      const validOtp = emailService.getStoredOtpForTest(registeredDoctor.id);
      expect(validOtp).to.exist;

      // 1. Invalid OTP
      const failRes = await request(app)
        .post("/api/auth/verify-device")
        .send({
          doctorId: registeredDoctor.id,
          fingerprint: "sha256:test-workstation-enclave-999",
          otp: "000000"
        });

      expect(failRes.status).to.equal(401);
      expect(failRes.body).to.have.property("error");

      // 2. Correct OTP
      const passRes = await request(app)
        .post("/api/auth/verify-device")
        .send({
          doctorId: registeredDoctor.id,
          fingerprint: "sha256:test-workstation-enclave-999",
          otp: validOtp
        });

      expect(passRes.status).to.equal(200);
      expect(passRes.body.success).to.be.true;
      expect(passRes.body.message).to.include("2FA verified");
    });

    after(() => {
      if (registeredDoctor && registeredDoctor.id) {
        const ehrDb = require("../src/services/ehrDatabase");
        ehrDb.removeUser(registeredDoctor.id);
      }
    });
  });

  describe("8. Role-Gating & Access Policy (Section 8)", function () {
    let doctorToken;
    let adminToken;

    before(async function () {
      const jwt = require("jsonwebtoken");
      const config = require("../src/config");
      doctorToken = jwt.sign(
        { id: "doc-001", username: "sarah.jenkins", role: "doctor", name: "Dr. Sarah Jenkins" },
        config.jwtSecret,
        { expiresIn: "1h" }
      );
      adminToken = jwt.sign(
        { id: "admin-001", username: "admin", role: "admin", name: "System Administrator" },
        config.jwtSecret,
        { expiresIn: "1h" }
      );
    });

    it("should return 403 when non-admin doctor attempts to access /api/staff-safety/devices", async function () {
      const res = await request(app)
        .get("/api/staff-safety/devices")
        .set("Authorization", `Bearer ${doctorToken}`);
      expect(res.status).to.equal(403);
      expect(res.body.error).to.include("restricted to system administrators");
    });

    it("should return 403 when non-admin doctor attempts to access /api/compliance/audit-logs", async function () {
      const res = await request(app)
        .get("/api/compliance/audit-logs")
        .set("Authorization", `Bearer ${doctorToken}`);
      expect(res.status).to.equal(403);
      expect(res.body.error).to.include("restricted to system administrators");
    });

    it("should return 403 when non-admin doctor attempts to access /api/admin/users", async function () {
      const res = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${doctorToken}`);
      expect(res.status).to.equal(403);
      expect(res.body.error).to.include("restricted to system administrators");
    });

    it("should allow admin access to /api/compliance and /api/staff-safety", async function () {
      const resComp = await request(app)
        .get("/api/compliance/audit-logs")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(resComp.status).to.equal(200);

      const resStaff = await request(app)
        .get("/api/staff-safety/devices")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(resStaff.status).to.equal(200);
    });

    it("should provide self-service transparency via GET /api/tracking/my-history for doctors", async function () {
      const res = await request(app)
        .get("/api/tracking/my-history?doctorId=doc-001")
        .set("Authorization", `Bearer ${doctorToken}`);
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property("doctorId", "doc-001");
      expect(res.body).to.have.property("history");
    });
  });
});

