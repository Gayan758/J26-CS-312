const request = require("supertest");
const { expect } = require("chai");
const app = require("../src/server");
const authorizationService = require("../src/services/authorizationService");
const breakGlassService = require("../src/services/breakGlassService");
const ehrDatabase = require("../src/services/ehrDatabase");
const riskService = require("../src/services/riskService");

describe("Phase 4 - Server-Side Access Control, Risk, Consent & Break-Glass", function () {
  const doctorUser = { id: "doc-001", username: "alice.vance", role: "doctor", name: "Dr. Alice Vance, MD", ethereumAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" };
  const externalDoctorUser = { id: "doc-999", username: "unassigned.doc", role: "doctor", name: "Dr. External Physician", ethereumAddress: "0x9999999999999999999999999999999999999999" };
  const nurseUser = { id: "nurse-001", username: "nurse.joy", role: "nurse", name: "Staff Nurse Joy" };
  const patientUser = { id: "patient-123", username: "john.doe", role: "patient", name: "John Doe", phn: "PHN-123456", nic: "123456789V" };
  const otherPatientUser = { id: "patient-456", username: "jane.smith", role: "patient", name: "Jane Smith", phn: "PHN-654321", nic: "987654321V" };
  const adminUser = { id: "admin-001", username: "hospital.admin", role: "admin", name: "Hospital Administrator" };
  const complianceOfficer = { id: "comp-001", username: "compliance.officer", role: "compliance_officer", name: "Chief Compliance Officer" };

  const samplePatientResource = {
    id: "patient-123",
    patientId: "patient-123",
    phn: "PHN-123456",
    nic: "123456789V",
    assignedDoctorIds: ["doc-001"],
    assignedDoctorAddresses: ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8".toLowerCase()],
    consentedDoctors: ["Dr. Alice Vance, MD"]
  };

  describe("1. Role x Action x Resource Authorization Matrix", function () {
    it("should allow assigned clinician to read patient chart", function () {
      const auth = authorizationService.authorize(doctorUser, "read_patient_chart", samplePatientResource);
      expect(auth.allowed).to.be.true;
    });

    it("should forbid unassigned clinician without consent from reading patient chart", function () {
      const auth = authorizationService.authorize(externalDoctorUser, "read_patient_chart", samplePatientResource);
      expect(auth.allowed).to.be.false;
      expect(auth.code).to.equal("CONSENT_NOT_GRANTED");
    });

    it("should strictly forbid administrators from reading patient clinical charts (Separation of Duties)", function () {
      const auth = authorizationService.authorize(adminUser, "read_patient_chart", samplePatientResource);
      expect(auth.allowed).to.be.false;
      expect(auth.code).to.equal("SEPARATION_OF_DUTIES");
    });

    it("should allow patient to access their own chart", function () {
      const auth = authorizationService.authorize(patientUser, "read_patient_chart", samplePatientResource);
      expect(auth.allowed).to.be.true;
    });

    it("should strictly forbid patient from accessing another patient's clinical chart", function () {
      const otherPatientResource = { id: "patient-999", patientId: "patient-999", phn: "PHN-999999", nic: "999999999V" };
      const auth = authorizationService.authorize(patientUser, "read_patient_chart", otherPatientResource);
      expect(auth.allowed).to.be.false;
      expect(auth.code).to.equal("CROSS_PATIENT_ACCESS_DENIED");
    });

    it("should allow doctors to write encounter notes and prescriptions", function () {
      expect(authorizationService.authorize(doctorUser, "write_encounter").allowed).to.be.true;
      expect(authorizationService.authorize(doctorUser, "write_prescription").allowed).to.be.true;
    });

    it("should forbid nurses from prescribing medications but allow recording vitals", function () {
      expect(authorizationService.authorize(nurseUser, "write_prescription").allowed).to.be.false;
      expect(authorizationService.authorize(nurseUser, "write_vitals").allowed).to.be.true;
    });

    it("should forbid patients and administrators from authoring clinical notes or prescribing", function () {
      expect(authorizationService.authorize(patientUser, "write_encounter").allowed).to.be.false;
      expect(authorizationService.authorize(patientUser, "write_prescription").allowed).to.be.false;
      expect(authorizationService.authorize(adminUser, "write_encounter").allowed).to.be.false;
      expect(authorizationService.authorize(adminUser, "write_prescription").allowed).to.be.false;
    });

    it("should allow patients to manage consent only for their own record", function () {
      expect(authorizationService.authorize(patientUser, "manage_consent", { id: "patient-123" }).allowed).to.be.true;
      expect(authorizationService.authorize(patientUser, "manage_consent", { id: "patient-456" }).allowed).to.be.false;
    });

    it("should allow administrators to manage hospital operational settings and devices", function () {
      expect(authorizationService.authorize(adminUser, "manage_settings").allowed).to.be.true;
      expect(authorizationService.authorize(adminUser, "manage_devices").allowed).to.be.true;
      expect(authorizationService.authorize(doctorUser, "manage_settings").allowed).to.be.false;
      expect(authorizationService.authorize(patientUser, "manage_settings").allowed).to.be.false;
    });
  });

  describe("2. Break-Glass Governance, Expiry & Anti-Self-Review", function () {
    let emergencyTokenId = null;

    it("should activate emergency break-glass token and auto-enroll into review queue", async function () {
      const res = await request(app)
        .post("/api/break-glass/activate")
        .send({
          doctor_address: doctorUser.ethereumAddress,
          patient_id: "patient-123",
          justification: "Patient in acute cardiac arrest requiring immediate pharmacological intervention."
        });

      expect(res.status).to.equal(200);
      expect(res.body.status).to.equal("EMERGENCY_OVERRIDE_ACTIVE");
      expect(res.body).to.have.property("token_id");
      emergencyTokenId = res.body.token_id;

      // Verify incident is in the compliance review queue
      const reviewQueue = ehrDatabase.getBreakGlassReviewQueue();
      const incident = reviewQueue.find(e => e.tokenId === emergencyTokenId);
      expect(incident).to.not.be.undefined;
      expect(incident.reviewStatus).to.equal("PENDING_REVIEW");
    });

    it("should forbid the invoking clinician from reviewing their own break-glass incident", function () {
      const incident = {
        id: "bg-test-1",
        tokenId: emergencyTokenId,
        doctorId: doctorUser.id,
        doctorAddress: doctorUser.ethereumAddress
      };

      const selfReviewAuth = authorizationService.authorize(doctorUser, "review_break_glass", incident);
      expect(selfReviewAuth.allowed).to.be.false;
      expect(selfReviewAuth.code).to.equal("CONFLICT_OF_INTEREST");
    });

    it("should allow compliance officer to review break-glass incident and record decision", async function () {
      const incident = ehrDatabase.getBreakGlassReviewQueue()[0];
      const updated = ehrDatabase.recordBreakGlassReview(
        incident.id,
        complianceOfficer,
        "JUSTIFIED",
        "Clinical necessity corroborated by acute cardiac protocol logs."
      );

      expect(updated.reviewStatus).to.equal("JUSTIFIED");
      expect(updated.reviewedBy).to.equal(complianceOfficer.name);
      expect(updated.reviewedAt).to.be.a("string");
    });

    it("should detect and reject expired emergency tokens", async function () {
      const expiredTokenId = "0x" + "aa".repeat(32);
      breakGlassService.mockTokens.set(expiredTokenId, {
        tokenId: expiredTokenId,
        doctor: doctorUser.ethereumAddress,
        patientId: "patient-123",
        expiresAt: Math.floor(Date.now() / 1000) - 100, // Expired 100s ago
        revoked: false
      });

      const isValid = await breakGlassService.isTokenValid(expiredTokenId);
      expect(isValid).to.be.false;
    });
  });

  describe("3. Append-Only Clinical Records & Concurrency Control", function () {
    let createdEncounterId = null;

    it("should create initial encounter note with version: 1 and empty amendments list", async function () {
      const res = await request(app)
        .post("/api/patients/patient-123/encounters")
        .send({
          doctorName: "Dr. Alice Vance, MD",
          doctorAddress: doctorUser.ethereumAddress,
          chiefComplaint: "Persistent dry cough",
          soap: {
            subjective: "Cough lasting 3 weeks",
            objective: "Lungs clear to auscultation",
            assessment: "Post-viral bronchial hyperreactivity",
            plan: "Inhaled bronchodilator as needed"
          },
          diagnosisIcd10: ["J45.9"]
        });

      expect(res.status).to.equal(201);
      expect(res.body.encounter).to.have.property("version", 1);
      expect(res.body.encounter.amendments).to.be.an("array").that.is.empty;
      createdEncounterId = res.body.encounter.id;
    });

    it("should record immutable amendment, preserve previous state, and increment version to 2", async function () {
      const res = await request(app)
        .post(`/api/patients/patient-123/encounters/${createdEncounterId}/amend`)
        .send({
          soap: {
            plan: "Inhaled corticosteroid + bronchodilator trial for 14 days"
          },
          reason: "Clarified medication regimen following patient tolerance review.",
          expectedVersion: 1
        });

      expect(res.status).to.equal(200);
      expect(res.body.encounter.version).to.equal(2);
      expect(res.body.encounter.amendments).to.have.lengthOf(1);
      expect(res.body.encounter.amendments[0].reason).to.include("Clarified medication");
      expect(res.body.encounter.amendments[0].previousSoap.plan).to.equal("Inhaled bronchodilator as needed");
      expect(res.body.encounter.soap.plan).to.equal("Inhaled corticosteroid + bronchodilator trial for 14 days");
    });

    it("should reject concurrent amendment with version conflict (HTTP 409)", async function () {
      const res = await request(app)
        .post(`/api/patients/patient-123/encounters/${createdEncounterId}/amend`)
        .send({
          soap: { plan: "Conflicting plan" },
          reason: "Outdated clinician overwrite attempt",
          expectedVersion: 1 // Outdated version! Current is 2
        });

      expect(res.status).to.equal(409);
      expect(res.body.code).to.equal("CONCURRENCY_CONFLICT");
    });
  });

  describe("4. Dynamic Hospital Settings & Device Registry", function () {
    it("should retrieve operational hospital settings from database configuration", function () {
      const settings = ehrDatabase.getSettings();
      expect(settings).to.have.property("hospitalSites");
      expect(settings).to.have.property("trustedNetworkRanges");
      expect(settings).to.have.property("shiftRules");
      expect(settings).to.have.property("riskThresholds");
      expect(settings.hospitalSites).to.be.an("array").that.is.not.empty;
    });

    it("should update hospital settings dynamically and log administrative audit event", function () {
      const updated = ehrDatabase.updateSettings({
        hospitalSites: [
          {
            id: "site-new-kandy",
            name: "MedGuard Kandy Teaching Clinic",
            latitude: 7.2906,
            longitude: 80.6337,
            radiusKm: 0.50
          }
        ]
      }, "Hospital Admin");

      expect(updated.hospitalSites[0].name).to.equal("MedGuard Kandy Teaching Clinic");

      // Verify risk engine dynamically detects new campus location
      const evaluation = riskService._localRiskFallback({
        timestamp: "2026-10-01T10:00:00Z",
        latitude: 7.2910,
        longitude: 80.6340, // Inside Kandy campus perimeter
        ip_address: "172.20.10.5",
        device_fingerprint: "sha256:alice-workstation-secure-enclave"
      });

      expect(evaluation.signal_breakdown.geo_velocity_score).to.equal(0.05); // Verified inside new site!
    });

    it("should manage registered workstation devices with administrator approval and revocation", function () {
      const testFp = `sha256:terminal-${Date.now()}`;
      ehrDatabase.registerDevice(testFp, "Emergency Triage iPad", "doc-001");

      expect(ehrDatabase.isDeviceRegistered(testFp)).to.be.false; // Pending approval

      ehrDatabase.approveDevice(testFp, "Administrator");
      expect(ehrDatabase.isDeviceRegistered(testFp)).to.be.true; // Approved

      ehrDatabase.revokeDevice(testFp, "Administrator");
      expect(ehrDatabase.isDeviceRegistered(testFp)).to.be.false; // Revoked
    });
  });

  describe("5. Fail-Closed Behavior on Unavailable / Missing Inputs", function () {
    it("should assign elevated risk when location is missing and network is unverified", function () {
      const result = riskService._localRiskFallback({
        timestamp: "2026-10-01T10:00:00Z",
        ip_address: "203.0.113.88", // External untrusted IP
        latitude: null, // Location unavailable
        longitude: null,
        device_fingerprint: "sha256:unknown-device"
      });

      expect(result.signal_breakdown.geo_velocity_score).to.be.at.least(0.85); // Elevated risk
      expect(result.risk_level).to.be.oneOf(["MEDIUM", "HIGH"]); // Never silently allows
    });
  });
});
