#!/usr/bin/env node
/**
 * scripts/db-backup.js
 * Production Database Backup & Integrity Checksum Utility
 *
 * SAFETY COMPLIANCE:
 * 1. Exports current EHR database state to timestamped archive.
 * 2. Computes and saves SHA-256 cryptographic checksum for tamper-evidence.
 * 3. Never prints names, NICs, passwords, or clinical data. Reports record counts only.
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
const { isConfigured, query, pool } = require("../backend/src/db/connection");

async function run() {
  process.stdout.write("====================================================\n");
  process.stdout.write(" MEDGUARD EHR - DATABASE BACKUP UTILITY\n");
  process.stdout.write("====================================================\n\n");

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupBaseName = `medguard-backup-${timestamp}`;
  const jsonBackupFile = path.join(BACKUP_DIR, `${backupBaseName}.json`);
  const checksumFile = path.join(BACKUP_DIR, `${backupBaseName}.sha256`);

  let backupPayload = {
    version: "2.0.0",
    createdAt: new Date().toISOString(),
    source: isConfigured() ? "postgresql" : "file_blockstore",
    data: {}
  };

  if (isConfigured()) {
    process.stdout.write("Connecting to PostgreSQL to export database tables...\n");
    try {
      const tables = ["users", "patients", "encounters", "prescriptions", "vitals", "audit_ledger", "break_glass_events", "staff_devices"];
      for (const table of tables) {
        try {
          const res = await query(`SELECT * FROM ${table};`);
          backupPayload.data[table] = res.rows;
          process.stdout.write(` - Table '${table}': ${res.rows.length} records exported.\n`);
        } catch (tableErr) {
          process.stdout.write(` - Table '${table}': omitted (${tableErr.message}).\n`);
        }
      }
    } catch (err) {
      process.stderr.write(`PostgreSQL export warning: ${err.message}. Falling back to file store.\n`);
    } finally {
      if (pool) await pool.end();
    }
  }

  // Also include file blockstore state
  if (fs.existsSync(DB_FILE)) {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const parsed = JSON.parse(raw);
    backupPayload.data.fileStore = {
      doctorsCount: (parsed.doctors || []).length,
      patientsCount: (parsed.patients || []).length,
      auditEventsCount: (parsed.accessEvents || []).length,
      raw: parsed
    };
    process.stdout.write(` - Blockstore JSON: ${(parsed.doctors || []).length} accounts, ${(parsed.patients || []).length} patient charts.\n`);
  }

  const backupContent = JSON.stringify(backupPayload, null, 2);
  fs.writeFileSync(jsonBackupFile, backupContent, "utf8");

  // Generate SHA-256 integrity checksum
  const hash = crypto.createHash("sha256").update(backupContent, "utf8").digest("hex");
  fs.writeFileSync(checksumFile, `${hash}  ${path.basename(jsonBackupFile)}\n`, "utf8");

  const stat = fs.statSync(jsonBackupFile);

  process.stdout.write("\n----------------------------------------------------\n");
  process.stdout.write("BACKUP COMPLETED SUCCESSFULLY\n");
  process.stdout.write(`Backup Archive:  ${path.relative(process.cwd(), jsonBackupFile)}\n`);
  process.stdout.write(`Checksum File:   ${path.relative(process.cwd(), checksumFile)}\n`);
  process.stdout.write(`SHA-256 Digest:  ${hash}\n`);
  process.stdout.write(`Archive Size:    ${(stat.size / 1024).toFixed(2)} KB\n`);
  process.stdout.write("----------------------------------------------------\n");
}

if (require.main === module) {
  run();
}

module.exports = { run };
