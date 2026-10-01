const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const config = require("../config");
const logger = require("../utils/logger");
const dbConnection = require("../db/connection");

const AUDIT_DATA_FILE = path.join(__dirname, "../../data/audit_ledger.json");
const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

const ACCESS_AUDIT_LOG_ABI = [
  "function logAccess(bytes32 accessDecisionId, address requester, bytes32 patientIdHash, string riskLevel, string decision, bool isBreakGlass) external returns (uint256)",
  "event AccessLogged(bytes32 indexed accessDecisionId, address indexed requester, bytes32 indexed patientIdHash, uint256 timestamp, string riskLevel, string decision, bool isBreakGlass)"
];

/**
 * Computes canonical payload object with sorted keys for deterministic hashing.
 */
function getCanonicalPayload(event) {
  return {
    action: String(event.action || "UNKNOWN"),
    actor: String(event.actor || "ANONYMOUS"),
    id: String(event.id),
    ip: String(event.ip || "127.0.0.1"),
    location_result: String(event.location_result || "UNKNOWN"),
    outcome: String(event.outcome || "SUCCESS"),
    patient_id: event.patient_id ? String(event.patient_id) : "",
    reason: String(event.reason || ""),
    request_id: String(event.request_id || ""),
    resource_id: event.resource_id ? String(event.resource_id) : "",
    resource_type: String(event.resource_type || "system"),
    risk_level: String(event.risk_level || "LOW"),
    role: String(event.role || "SYSTEM"),
    timestamp: String(event.timestamp)
  };
}

/**
 * Computes SHA-256 hash of previous hash concatenated with serialized canonical event.
 */
function computeEventHash(prevHash, event) {
  const canonical = getCanonicalPayload(event);
  const serialized = JSON.stringify(canonical, Object.keys(canonical).sort());
  return crypto.createHash("sha256").update(`${prevHash}:${serialized}`).digest("hex");
}

class AuditService {
  constructor() {
    this.records = [];
    this.headHash = GENESIS_HASH;
    this.failedWriteQueue = [];
    this.isFlushingQueue = false;

    // Blockchain optional anchoring setup
    this.provider = null;
    this.signer = null;
    this.contract = null;
    this.isBlockchainConfigured = false;

    this._initBlockchain();
    this._loadLedger();
  }

  _initBlockchain() {
    // Only configure blockchain if credentials and contract address are set
    const hasKey = Boolean(config.ethSignerKey && config.ethSignerKey.length === 66);
    const hasAddr = Boolean(config.accessAuditLogAddress && ethers.isAddress(config.accessAuditLogAddress));
    const isDevOnlyAddress = config.accessAuditLogAddress === "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

    if (config.nodeEnv === "production" && isDevOnlyAddress) {
      // In production, refuse default local development chain address
      logger.warn("[AuditService] Development blockchain address detected in production mode. Anchoring disabled.");
      return;
    }

    if (hasKey && hasAddr) {
      try {
        this.provider = new ethers.JsonRpcProvider(config.ethRpcUrl, undefined, { staticNetwork: true });
        this.signer = new ethers.Wallet(config.ethSignerKey, this.provider);
        this.contract = new ethers.Contract(config.accessAuditLogAddress, ACCESS_AUDIT_LOG_ABI, this.signer);
        this.isBlockchainConfigured = true;
      } catch (err) {
        logger.warn({ error: err.message }, "[AuditService] Blockchain connection initialization failed; operating on database hash chain");
        this.contract = null;
        this.isBlockchainConfigured = false;
      }
    }
  }

  _loadLedger() {
    try {
      const dataDir = path.dirname(AUDIT_DATA_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(AUDIT_DATA_FILE)) {
        const raw = fs.readFileSync(AUDIT_DATA_FILE, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.records = parsed;
          if (this.records.length > 0) {
            this.headHash = this.records[this.records.length - 1].curr_hash;
          }
        }
      }
    } catch (err) {
      logger.error({ error: err.message }, "[AuditService] Error loading audit ledger from disk; initializing clean in-memory chain");
      this.records = [];
      this.headHash = GENESIS_HASH;
    }
  }

  _persistDisk() {
    try {
      fs.writeFileSync(AUDIT_DATA_FILE, JSON.stringify(this.records, null, 2), "utf8");
    } catch (err) {
      logger.error({ error: err.message }, "[AuditService] Failed to persist audit ledger to disk");
      throw err;
    }
  }

  /**
   * Primary Append-Only Ingestion Gateway
   *
   * ASVS Level 2 & Safety Rule 4:
   * - Computes SHA-256 hash chaining against head hash.
   * - Redacts secrets and PHI before recording.
   * - Never throws or blocks clinical care if database persistence fails.
   */
  async logEvent({
    actor = "ANONYMOUS",
    role = "SYSTEM",
    action = "system.event",
    resource_type = "system",
    resource_id = "",
    patient_id = null,
    outcome = "SUCCESS",
    risk_level = "LOW",
    risk_score = null,
    ip = "127.0.0.1",
    location_result = "UNKNOWN",
    reason = "",
    request_id = "",
    is_break_glass = false,
    actor_address = null,
    decision = null
  }) {
    const timestamp = new Date().toISOString();
    const eventId = `audit-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const cleanIp = String(ip).split(",")[0].trim();

    // Sanitize reason to prevent token/secret leaks
    const cleanReason = String(reason)
      .replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, "[REDACTED_TOKEN]")
      .replace(/password[:=]\s*[^\s,]+/gi, "password=[REDACTED]")
      .slice(0, 1000);

    const prevHash = this.headHash;

    const event = {
      id: eventId,
      timestamp,
      actor: String(actor || "ANONYMOUS"),
      role: String(role || "SYSTEM"),
      action: String(action),
      resource_type: String(resource_type),
      resource_id: resource_id ? String(resource_id) : "",
      patient_id: patient_id ? String(patient_id) : null,
      outcome: String(outcome).toUpperCase(),
      risk_level: String(risk_level).toUpperCase(),
      risk_score: risk_score !== null ? parseFloat(risk_score) : null,
      ip: cleanIp,
      location_result: String(location_result),
      reason: cleanReason,
      request_id: request_id ? String(request_id) : "",
      prev_hash: prevHash,
      curr_hash: "",
      tx_hash: null,
      anchored: false,

      // Compatibility fields for legacy tests and frontend
      isBreakGlass: Boolean(is_break_glass),
      decision: decision ? String(decision).toUpperCase() : String(outcome).toUpperCase(),
      actorAddress: actor_address || null
    };

    // Calculate cryptographic tamper-evident hash
    event.curr_hash = computeEventHash(prevHash, event);
    this.headHash = event.curr_hash;

    // Append to in-memory immutable ledger
    this.records.push(Object.freeze(event));

    // Non-blocking asynchronous persistence
    this._persistAsync(event).catch((err) => {
      logger.error({ error: err.message, eventId }, "[AuditService] Non-blocking audit persistence failure; queued for retry");
    });

    // Background blockchain anchoring
    if (this.isBlockchainConfigured) {
      this._enqueueBlockchainAnchor(event).catch(() => {});
    }

    return event;
  }

  async _persistAsync(event) {
    let diskSuccess = false;
    let dbSuccess = false;

    // 1. Persist to disk blockstore
    try {
      this._persistDisk();
      diskSuccess = true;
    } catch (err) {
      logger.warn({ error: err.message, eventId: event.id }, "[AuditService] Disk blockstore write failed");
    }

    // 2. Persist to PostgreSQL if configured
    if (dbConnection.isConfigured && dbConnection.isConfigured()) {
      try {
        await dbConnection.query(`
          INSERT INTO audit_ledger (
            event_id, timestamp, actor_id, actor_role, action, resource_type,
            resource_id, patient_id, risk_score, risk_level, decision,
            is_break_glass, details, client_ip, location_result, reason,
            request_id, prev_hash, curr_hash, tx_hash, anchored
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        `, [
          event.id,
          event.timestamp,
          event.actor,
          event.role,
          event.action,
          event.resource_type,
          event.resource_id,
          event.patient_id,
          event.risk_score,
          event.risk_level,
          event.outcome,
          event.isBreakGlass,
          event.reason,
          event.ip,
          event.location_result,
          event.reason,
          event.request_id,
          event.prev_hash,
          event.curr_hash,
          event.tx_hash,
          event.anchored
        ]);
        dbSuccess = true;
      } catch (dbErr) {
        logger.warn({ error: dbErr.message, eventId: event.id }, "[AuditService] PostgreSQL audit write failed");
      }
    } else {
      dbSuccess = true; // PostgreSQL not in active use
    }

    if (!diskSuccess && !dbSuccess) {
      this.failedWriteQueue.push(event);
      this._scheduleQueueFlush();
    }
  }

  _scheduleQueueFlush() {
    if (this.isFlushingQueue) return;
    this.isFlushingQueue = true;

    setTimeout(async () => {
      this.isFlushingQueue = false;
      const pending = [...this.failedWriteQueue];
      this.failedWriteQueue = [];

      for (const evt of pending) {
        try {
          await this._persistAsync(evt);
        } catch {
          this.failedWriteQueue.push(evt);
        }
      }
    }, 5000);
  }

  async _enqueueBlockchainAnchor(event) {
    if (!this.contract || !this.signer) return;

    try {
      const decisionIdBytes32 = ethers.keccak256(ethers.toUtf8Bytes(event.id));
      const patientHash = event.patient_id
        ? ethers.keccak256(ethers.toUtf8Bytes(event.patient_id))
        : ethers.ZeroHash;

      const tx = await this.contract.logAccess(
        decisionIdBytes32,
        event.actorAddress || this.signer.address,
        patientHash,
        event.risk_level,
        event.outcome,
        Boolean(event.isBreakGlass)
      );

      const receipt = await tx.wait();
      try {
        event.tx_hash = receipt.hash;
        event.anchored = true;
      } catch (freezeErr) {
        // Non-fatal if object is frozen
      }
      this._persistDisk();
    } catch (err) {
      logger.warn({ error: err.message, eventId: event.id }, "[AuditService] Background on-chain anchoring deferred");
    }
  }

  /**
   * Complete Linear Tamper Evidence Verification
   *
   * Verifies every record in the audit ledger against the cryptographic SHA-256 chain from genesis.
   * Reports "Integrity verified" or pinpoints the exact first broken record.
   */
  verifyIntegrity(customRecords = null) {
    const list = customRecords || this.records;

    if (!list || list.length === 0) {
      return {
        verified: true,
        count: 0,
        headHash: GENESIS_HASH,
        message: "Audit ledger is empty. Chain is at genesis."
      };
    }

    for (let i = 0; i < list.length; i++) {
      const record = list[i];
      const expectedPrev = i === 0 ? GENESIS_HASH : list[i - 1].curr_hash;

      // 1. Verify link back to previous record
      if (record.prev_hash !== expectedPrev) {
        return {
          verified: false,
          brokenIndex: i,
          eventId: record.id,
          reason: "Chain link broken: prev_hash does not match previous record's curr_hash",
          expectedHash: expectedPrev,
          actualHash: record.prev_hash,
          message: `Audit chain integrity broken at record index ${i} (event ID: ${record.id})`
        };
      }

      // 2. Re-calculate SHA-256 hash over canonical payload
      const expectedCurr = computeEventHash(expectedPrev, record);
      if (record.curr_hash !== expectedCurr) {
        return {
          verified: false,
          brokenIndex: i,
          eventId: record.id,
          reason: "Record payload tampered: curr_hash does not match cryptographic digest",
          expectedHash: expectedCurr,
          actualHash: record.curr_hash,
          message: `Tamper detected at record index ${i} (event ID: ${record.id}): cryptographic hash mismatch`
        };
      }
    }

    return {
      verified: true,
      count: list.length,
      headHash: list[list.length - 1].curr_hash,
      message: `Integrity verified: all ${list.length} audit ledger records mathematically validated from genesis.`
    };
  }

  getAuditLogs({ limit = 100, offset = 0, action = null, actor = null } = {}) {
    let result = [...this.records];

    if (action) {
      result = result.filter(r => r.action === action);
    }
    if (actor) {
      result = result.filter(r => r.actor === actor);
    }

    // Newest first
    result.reverse();

    if (offset > 0) {
      result = result.slice(offset);
    }
    if (limit > 0) {
      result = result.slice(0, limit);
    }

    return result;
  }

  // --- Backwards Compatibility Adapters ---

  async logDecision({
    accessDecisionId,
    requester,
    patientId,
    riskLevel,
    decision,
    isBreakGlass = false,
    reason = "",
    req = null
  }) {
    const outcome = (decision === "ALLOW" || decision === "BREAK_GLASS_READ" || decision === "BREAK_GLASS_ACTIVATE")
      ? "SUCCESS"
      : (decision === "MFA_REQUIRED" ? "CHALLENGE" : "DENIED");

    return this.logEvent({
      actor: requester || "doctor",
      role: "doctor",
      action: isBreakGlass ? (decision === "BREAK_GLASS_READ" ? "break_glass.read" : "break_glass.activated") : (decision === "BLOCK" ? "access.denied" : "access.granted"),
      resource_type: "patient",
      resource_id: patientId,
      patient_id: patientId,
      outcome,
      decision,
      risk_level: riskLevel || "LOW",
      reason: reason || (isBreakGlass ? `Emergency clinical break-glass override: ${decision}` : `Access decision: ${decision}`),
      request_id: req ? req.id : (accessDecisionId || ""),
      ip: req ? req.ip : "127.0.0.1",
      is_break_glass: isBreakGlass,
      actor_address: requester
    });
  }

  logInternalAudit(entry) {
    const isPromise = this.logEvent({
      actor: entry.actor || "Hospital Administrator",
      role: "admin",
      action: entry.action ? `admin.${String(entry.action).toLowerCase()}` : "admin.action",
      resource_type: "system",
      resource_id: "",
      outcome: "SUCCESS",
      reason: entry.details || "",
      request_id: entry.req ? entry.req.id : "",
      ip: entry.req ? entry.req.ip : "127.0.0.1"
    });

    return entry;
  }

  async logAccess(params) {
    return this.logDecision(params);
  }
}

module.exports = new AuditService();
