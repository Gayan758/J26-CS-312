const request = require("supertest");
const { expect } = require("chai");
const app = require("../src/server");

describe("Staff Safety & Real-Time Tracking Integration Tests", function () {
  it("should list registered staff tracking devices", async function () {
    const res = await request(app).get("/api/tracking/devices");
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property("devices");
    expect(res.body.devices).to.be.an("array");
    expect(res.body.devices.length).to.be.greaterThan(0);

    const aliceDevice = res.body.devices.find((d) => d.doctorId === "doc-001");
    expect(aliceDevice).to.exist;
    expect(aliceDevice.doctorName).to.include("Alice Vance");
  });

  it("should ingest high-accuracy OsmAnd GPS fix from staff mobile", async function () {
    const res = await request(app)
      .get("/api/tracking/osmand-ingest")
      .query({
        id: "alice_vance_mobile",
        lat: "6.9148",
        lon: "79.9734",
        speed: "0.0",
        altitude: "18.5",
        accuracy: "5.0",
        batt: "82",
        sos: "false"
      });

    expect(res.status).to.equal(200);
    expect(res.body.status).to.equal("SUCCESS");
    expect(res.body.isOutsideMalabe).to.be.false;
  });

  it("should trigger geofence exit evaluation when doctor departs Malabe to Kaduwela", async function () {
    const res = await request(app)
      .post("/api/tracking/geofence-webhook")
      .send({
        id: "alice_vance_mobile",
        lat: 6.9312,
        lon: 79.9821,
        distanceKm: 2.5,
        type: "geofenceExit"
      });

    expect(res.status).to.equal(200);
    expect(res.body.status).to.equal("SUCCESS");
    expect(res.body.evaluation.event.eventType).to.equal("GEOFENCE_EXIT");
    expect(res.body.evaluation.event.distanceFromBaseKm).to.be.greaterThan(2.0);
    expect(res.body.evaluation).to.have.property("risk_score");
    expect(res.body.evaluation).to.have.property("risk_level");
  });

  it("should allow doctor to toggle GPS tracking consent and privacy pause", async function () {
    // 1. Toggle pause
    const res1 = await request(app)
      .post("/api/tracking/toggle")
      .send({ doctorId: "doc-001", enabled: false });

    expect(res1.status).to.equal(200);
    expect(res1.body.device.trackingEnabled).to.be.false;

    // 2. Resume
    const res2 = await request(app)
      .post("/api/tracking/toggle")
      .send({ doctorId: "doc-001", enabled: true });

    expect(res2.status).to.equal(200);
    expect(res2.body.device.trackingEnabled).to.be.true;
  });

  it("should trigger emergency SOS distress beacon and record critical alert", async function () {
    const res = await request(app)
      .post("/api/tracking/sos")
      .send({ doctorId: "doc-001", lat: 6.9148, lon: 79.9734 });

    expect(res.status).to.equal(200);
    expect(res.body.status).to.equal("EMERGENCY_SOS_ACTIVE");
    expect(res.body.event.riskLevel).to.equal("CRITICAL");
    expect(res.body.event.securityNotified).to.be.true;

    // Cancel SOS
    const cancelRes = await request(app)
      .post("/api/tracking/sos/cancel")
      .send({ doctorId: "doc-001" });
    expect(cancelRes.status).to.equal(200);
  });
});
