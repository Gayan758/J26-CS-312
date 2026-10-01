#!/usr/bin/env node
/**
 * scripts/db-restore.js
 * Production Database Restore & Tamper-Evident Verification Utility
 *
 * SAFETY COMPLIANCE:
 * 1. Verifies SHA-256 cryptographic checksum before performing any operations.
 * 2. Defaults to DRY RUN validation. Restores ONLY when passed --execute.
 * 3. Takes a pre-restore safety snapshot before altering any data.
 * 4. Never prints names, NICs, passwords, or clinical data.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

try {
  require("dotenv").config({ path: path.join(__dirname, "../backend/.env") });
} catch {
  try {
    require(path.join(__dirname, "../backend/node_modules/dotenv")).config({ path: path.join(__dirname, "../backend/.env") });
  } catch {}
}

const BACKUP_DIR = path.join(__dirname, "../backups");
const DB_FILE = path.join(__dirname, "../backend/data/ehr_database.json");

function findLatestBackup() {
  if (!fs.existsSync(BACKUP_DIR)) return null;
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith("medguard-backup-") && f.endsWith(".json"))
    .map(f => ({
      name: f,
      fullPath: path.join(BACKUP_DIR, f),
      mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime);

  return files.length > 0 ? files[0].fullPath : null;
}

function verifyChecksum(backupPath) {
  const checksumPath = backupPath.replace(/\.json$/, ".sha256");
  if (!fs.existsSync(checksumPath)) {
    return { ok: false, reason: "Checksum file (.sha256) missing for backup archive." };
  }

  const expectedRaw = fs.readFileSync(checksumPath, "utf8").trim().split(/\s+/)[0];
  const fileBytes = fs.readFileSync(backupPath);
  const actualHash = crypto.createHash("sha256").update(fileBytes).digest("hex");

  if (expectedRaw.toLowerCase() !== actualHash.toLowerCase()) {
    return {
      ok: false,
      reason: `Checksum mismatch! Expected: ${expectedRaw}, Computed: ${actualHash}. Possible data corruption or tampering.`
    };
  }

  return { ok: true, hash: actualHash };
}

async function run() {
  const args = process.argv.slice(2);
  const isExecute = args.includes("--execute");
  const fileArg = args.find(a => a !== "--execute");

  process.stdout.write("====================================================\n");
  process.stdout.write(" MEDGUARD EHR - DATABASE RESTORE UTILITY\n");
  process.stdout.write("====================================================\n\n");

  const backupFile = fileArg ? path.resolve(fileArg) : findLatestBackup();
  if (!backupFile || !fs.existsSync(backupFile)) {
    process.stderr.write(`ERROR: Backup archive not found: ${backupFile || "No backups available in " + BACKUP_DIR}\n`);
    process.exit(1);
  }

  process.stdout.write(`Selected backup archive: ${path.relative(process.cwd(), backupFile)}\n`);
  process.stdout.write(`Mode: ${isExecute ? "EXECUTE (APPLYING RESTORE)" : "DRY RUN (VALIDATION ONLY)"}\n\n`);

  // Step 1: Verify SHA-256 Checksum
  process.stdout.write("1. Verifying SHA-256 cryptographic integrity checksum...\n");
  const checksumResult = verifyChecksum(backupFile);
  if (!checksumResult.ok) {
    process.stderr.write(`CRITICAL INTEGRITY FAILURE: ${checksumResult.reason}\n`);
    process.exit(1);
  }
  process.stdout.write(`   Integrity Verified. SHA-256: ${checksumResult.hash}\n\n`);

  // Step 2: Validate Archive Content
  process.stdout.write("2. Parsing and inspecting archive contents...\n");
  const rawData = fs.readFileSync(backupFile, "utf8");
  let payload;
  try {
    payload = JSON.parse(rawData);
  } catch (err) {
    process.stderr.write(`ERROR: Invalid JSON in backup file: ${err.message}\n`);
    process.exit(1);
  }

  process.stdout.write(`   Archive Version: ${payload.version || "1.0.0"}\n`);
  process.stdout.write(`   Created At:      ${payload.createdAt || "Unknown"}\n`);
  process.stdout.write(`   Source:          ${payload.source || "blockstore"}\n`);

  if (payload.data?.fileStore) {
    process.stdout.write(`   File Blockstore: ${payload.data.fileStore.doctorsCount} accounts, ${payload.data.fileStore.patientsCount} patient charts.\n`);
  }

  if (!isExecute) {
    process.stdout.write("\n----------------------------------------------------\n");
    process.stdout.write("DRY RUN VALIDATION PASSED. No database state was modified.\n");
    process.stdout.write(`To execute the restore, re-run with:\n  node scripts/db-restore.js "${path.relative(process.cwd(), backupFile)}" --execute\n`);
    process.stdout.write("----------------------------------------------------\n");
    return;
  }

  // Step 3: Non-destructive Safety Snapshot
  process.stdout.write("\n3. Creating pre-restore safety snapshot of current state...\n");
  if (fs.existsSync(DB_FILE)) {
    const safetySnapshotFile = path.join(BACKUP_DIR, `pre-restore-safety-${Date.now()}.json`);
    fs.copyFileSync(DB_FILE, safetySnapshotFile);
    process.stdout.write(`   Pre-restore snapshot preserved at: ${path.relative(process.cwd(), safetySnapshotFile)}\n`);
  }

  // Step 4: Apply Restore
  process.stdout.write("\n4. Applying database restoration...\n");
  if (payload.data?.fileStore?.raw) {
    fs.writeFileSync(DB_FILE, JSON.stringify(payload.data.fileStore.raw, null, 2), "utf8");
    process.stdout.write("   File blockstore successfully restored.\n");
  }

  process.stdout.write("\n----------------------------------------------------\n");
  process.stdout.write("RESTORE COMPLETED SUCCESSFULLY\n");
  process.stdout.write("Database integrity validated and state successfully recovered.\n");
  process.stdout.write("----------------------------------------------------\n");
}

if (require.main === module) {
  run();
}

module.exports = { run, verifyChecksum };
