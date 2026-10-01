#!/usr/bin/env node
/**
 * scripts/verify-audit-chain.js
 * Cryptographic Audit Chain Verification Tool
 *
 * Mathematically validates the SHA-256 hash chain of the MedGuard
 * compliance audit ledger from genesis block to current head.
 *
 * Exit Codes:
 *   0: Integrity verified, zero tampering detected.
 *   1: Integrity violation, broken link or tampered content found.
 */

const path = require("path");

try {
  require("dotenv").config({ path: path.join(__dirname, "../backend/.env") });
} catch {}

const auditService = require("../backend/src/services/auditService");

async function runVerification() {
  process.stdout.write("============================================================\n");
  process.stdout.write("  MEDGUARD EHR - AUDIT LEDGER INTEGRITY VERIFICATION\n");
  process.stdout.write("============================================================\n\n");

  const result = auditService.verifyIntegrity();

  if (result.verified) {
    process.stdout.write(`✓ STATUS: INTEGRITY VERIFIED\n`);
    process.stdout.write(`  Total Verified Events:  ${result.count}\n`);
    process.stdout.write(`  Genesis Root:           0000000000000000000000000000000000000000000000000000000000000000\n`);
    process.stdout.write(`  Current Head Hash:      ${result.headHash}\n\n`);
    process.stdout.write(`Result: All ${result.count} audit records sequentially chained and mathematically verified.\n`);
    process.stdout.write(`Zero tampering, modification, or row deletions detected.\n\n`);
    process.exit(0);
  } else {
    process.stderr.write(`✗ ALERT: INTEGRITY VIOLATION DETECTED!\n`);
    process.stderr.write(`  First Broken Index:     ${result.brokenIndex}\n`);
    process.stderr.write(`  Corrupted Event ID:     ${result.eventId}\n`);
    process.stderr.write(`  Failure Reason:         ${result.reason}\n`);
    process.stderr.write(`  Expected Cryptographic: ${result.expectedHash}\n`);
    process.stderr.write(`  Found Stored Hash:      ${result.actualHash}\n\n`);
    process.stderr.write(`CRITICAL: The audit trail has been tampered with or corrupted at index ${result.brokenIndex}.\n`);
    process.exit(1);
  }
}

runVerification().catch((err) => {
  process.stderr.write(`Execution error during ledger verification: ${err.message}\n`);
  process.exit(1);
});
