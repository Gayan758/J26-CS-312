#!/usr/bin/env node
/**
 * scripts/ops/cleanup-legacy.js
 * Legacy Account & Test Data Cleanup Tool
 *
 * SAFETY COMPLIANCE RULES:
 * 1. Defaults to DRY RUN. Data is changed ONLY when explicitly called with --execute.
 * 2. Accounts are DISABLED, NEVER DELETED, to preserve audit trail referential integrity.
 * 3. Never prints names, NICs, passwords, or clinical data. Reports accounts strictly by ID.
 */

const fs = require("fs");
const path = require("path");

const DB_FILE = path.join(__dirname, "../../backend/data/ehr_database.json");

function run() {
  const isExecute = process.argv.includes("--execute");

  if (!fs.existsSync(DB_FILE)) {
    process.stdout.write("Database file does not exist. Nothing to clean.\n");
    return;
  }

  const raw = fs.readFileSync(DB_FILE, "utf8");
  const data = JSON.parse(raw);

  const doctors = data.doctors || [];
  const legacyCandidateIds = [];

  // Identify legacy / demo accounts
  for (const doc of doctors) {
    const isLegacy =
      doc._dev_seed === true ||
      doc.id === "doc-001" ||
      doc.id === "doc-002" ||
      doc.id === "doc-003" ||
      doc.username === "alice.vance" ||
      doc.username === "kasun.perera" ||
      doc.username === "sarah.jenkins" ||
      doc.username === "admin" ||
      doc.id === "doc-demo-admin" ||
      doc.id === "doc-external";

    if (isLegacy) {
      legacyCandidateIds.push({
        id: doc.id,
        alreadyDisabled: doc.status === "disabled" || doc.disabled === true
      });
    }
  }

  process.stdout.write("====================================================\n");
  process.stdout.write(" MEDGUARD EHR - LEGACY ACCOUNT CLEANUP AUDIT\n");
  process.stdout.write("====================================================\n\n");
  process.stdout.write(`Execution Mode: ${isExecute ? "EXECUTE (APPLYING CHANGES)" : "DRY RUN (SAFE MODE - NO CHANGES APPLIED)"}\n\n`);
  process.stdout.write(`Total user accounts scanned: ${doctors.length}\n`);
  process.stdout.write(`Legacy / test accounts identified: ${legacyCandidateIds.length}\n\n`);

  if (legacyCandidateIds.length === 0) {
    process.stdout.write("No legacy or test accounts detected.\n");
    return;
  }

  process.stdout.write("Identified legacy accounts (listed by ID only per privacy standard):\n");
  for (const item of legacyCandidateIds) {
    process.stdout.write(` - Account ID: ${item.id} [${item.alreadyDisabled ? "ALREADY DISABLED" : "ACTIVE -> TARGET FOR SUSPENSION"}]\n`);
  }

  process.stdout.write("\n");

  if (!isExecute) {
    process.stdout.write("----------------------------------------------------\n");
    process.stdout.write("DRY RUN COMPLETE. No data was modified.\n");
    process.stdout.write("To disable these legacy accounts, re-run with: node scripts/ops/cleanup-legacy.js --execute\n");
    process.stdout.write("----------------------------------------------------\n");
    return;
  }

  // Execute disablement
  let disabledCount = 0;
  for (const doc of doctors) {
    const match = legacyCandidateIds.find(c => c.id === doc.id);
    if (match && !match.alreadyDisabled) {
      doc.status = "disabled";
      doc.disabled = true;
      doc.disabledAt = new Date().toISOString();
      doc.disabledReason = "Legacy account disabled by security cleanup protocol";
      disabledCount++;
    }
  }

  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");

  process.stdout.write("----------------------------------------------------\n");
  process.stdout.write(`EXECUTION SUCCESS: ${disabledCount} legacy accounts successfully disabled in database.\n`);
  process.stdout.write("All audit ledger associations remain preserved.\n");
  process.stdout.write("----------------------------------------------------\n");
}

run();
