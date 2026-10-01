#!/usr/bin/env node
/**
 * scripts/admin-create.js
 * Interactive Administrator Provisioning Utility for MedGuard EHR
 *
 * Provisions a hospital administrator with administrative credentials and 2FA email.
 * Password is never logged or printed to stdout.
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const passwordService = require("../backend/src/services/passwordService");

const DB_FILE = path.join(__dirname, "../backend/data/ehr_database.json");

function readDb() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = { doctors: [], patients: [], sessionLocations: {}, trustedDevices: {}, accessEvents: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), "utf8");
    return initial;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
}

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--username" && args[i + 1]) params.username = args[++i];
    if (args[i] === "--password" && args[i + 1]) params.password = args[++i];
    if (args[i] === "--name" && args[i + 1]) params.name = args[++i];
    if (args[i] === "--email" && args[i + 1]) params.email = args[++i];
  }
  return params;
}

async function promptUser() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query) => new Promise((resolve) => rl.question(query, resolve));

  try {
    const name = await question("Enter Administrator Full Name: ");
    const username = await question("Enter Administrator Username: ");
    const email = await question("Enter Notification / 2FA Email: ");
    const password = await question("Enter Secure Admin Password (min 12 chars, upper, lower, number, symbol): ");
    rl.close();
    return { name, username, email, password };
  } catch (err) {
    rl.close();
    throw err;
  }
}

async function run() {
  const cliArgs = parseArgs();
  let credentials;

  if (cliArgs.username && cliArgs.password) {
    credentials = {
      name: cliArgs.name || "Hospital System Administrator",
      username: cliArgs.username.trim(),
      email: cliArgs.email || `${cliArgs.username.trim()}@hospital.local`,
      password: cliArgs.password
    };
  } else {
    process.stdout.write("=== MedGuard EHR Hospital Administrator Provisioning ===\n");
    credentials = await promptUser();
  }

  if (!credentials.username || !credentials.password) {
    process.stderr.write("ERROR: Username and password are required.\n");
    process.exit(1);
  }

  const policy = passwordService.validatePasswordPolicy(credentials.password);
  if (!policy.valid) {
    process.stderr.write(`ERROR: Password policy violation: ${policy.error}\n`);
    process.exit(1);
  }

  const db = readDb();
  if (!db.doctors) db.doctors = [];

  const existing = db.doctors.find(d => d.username && d.username.toLowerCase() === credentials.username.toLowerCase());
  if (existing) {
    process.stderr.write(`ERROR: A user with username "${credentials.username}" already exists.\n`);
    process.exit(1);
  }

  const hashedPassword = await passwordService.hashPassword(credentials.password);

  const adminUser = {
    id: `admin-${Date.now().toString().slice(-6)}`,
    name: credentials.name.trim() || "Hospital Administrator",
    username: credentials.username.toLowerCase(),
    password: hashedPassword,
    email: (credentials.email || "").trim(),
    role: "admin",
    status: "active",
    specialty: "Hospital Health-IT Administration",
    baseCampus: "Information Security & Compliance Center",
    phone: "",
    registeredAt: new Date().toISOString()
  };

  db.doctors.push(adminUser);
  writeDb(db);

  process.stdout.write(`SUCCESS: Administrator "${adminUser.name}" (${adminUser.username}) provisioned successfully.\n`);
}

run().catch((err) => {
  process.stderr.write(`ERROR: ${err.message}\n`);
  process.exit(1);
});
