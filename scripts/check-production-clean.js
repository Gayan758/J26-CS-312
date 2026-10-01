#!/usr/bin/env node
/**
 * scripts/check-production-clean.js
 * Production Cleanliness & Anti-Demo Scanner
 *
 * Verifies that production application source code (frontend/src, backend/src)
 * contains zero demo artifacts, persona shortcuts, fake bypasses, or debug leftovers.
 */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");

// Directories and files to scan
const SCAN_TARGETS = [
  "backend/src",
  "frontend/src",
  "frontend/index.html"
];

// File extensions to scan
const SCAN_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".json"];

// Patterns forbidden in production code
const FORBIDDEN_PATTERNS = [
  { name: "Demo keyword", regex: /\bdemo\b/i },
  { name: "Persona keyword", regex: /\bpersona\b/i },
  { name: "Quick-select keyword", regex: /\bquick-select\b/i },
  { name: "Dummy placeholder", regex: /\bdummy\b/i },
  { name: "Lorem ipsum text", regex: /\blorem\b/i },
  { name: "TODO comment", regex: /\bTODO\b/ },
  { name: "FIXME comment", regex: /\bFIXME\b/ },
  { name: "Browser alert()", regex: /\balert\s*\(/ },
  { name: "Debug console.log", regex: /console\.log\s*\(/ },
  { name: "Hardcoded private key", regex: /0x[a-fA-F0-9]{64}/ },
  { name: "Hardcoded default wallet address", regex: /0x(70997970[Cc]51812[dD]c3[Aa]010[Cc]7d01b50e0d17dc79[Cc]8|f39[Ff][dD]6e51aad88[Ff]6[Ff]4ce6a[Bb]8827279cff[Ff]b92266|3[Cc]44[Cc]d[dD]d[Bb]6a900fa2b585dd299e03d12[Ff][Aa]4293[Bb][Cc]|90[Ff]79bf6[Ee][Bb]2c4f870365[Ee]785982e1f101[Ee]93b906)/i }
];

// Explicit justified exemptions (e.g. comment explaining a pattern or benign tokens)
const ALLOWED_MATCHES = [
  // Example: explanation comments or third-party license disclaimers
];

function isAllowed(filePath, line, patternName) {
  // Allow console.log in server startup listening statement
  if (patternName === "Debug console.log" && filePath.endsWith("server.js") && line.includes("Server listening")) {
    return true;
  }
  return false;
}

function getFilesToScan(targetPath) {
  const fullPath = path.join(ROOT_DIR, targetPath);
  if (!fs.existsSync(fullPath)) return [];

  const stat = fs.statSync(fullPath);
  if (stat.isFile()) return [fullPath];

  const files = [];
  const entries = fs.readdirSync(fullPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryFullPath = path.join(fullPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist" || entry.name === "build") {
        continue;
      }
      files.push(...getFilesToScan(path.relative(ROOT_DIR, entryFullPath)));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (SCAN_EXTENSIONS.includes(ext)) {
        files.push(entryFullPath);
      }
    }
  }

  return files;
}

function runCheck() {
  process.stdout.write("====================================================\n");
  process.stdout.write(" MEDGUARD EHR - PRODUCTION CLEANLINESS SCAN\n");
  process.stdout.write("====================================================\n\n");

  let totalFilesScanned = 0;
  let violationsFound = 0;
  const violations = [];

  for (const target of SCAN_TARGETS) {
    const files = getFilesToScan(target);
    for (const file of files) {
      totalFilesScanned++;
      const relativePath = path.relative(ROOT_DIR, file).replace(/\\/g, "/");
      const content = fs.readFileSync(file, "utf8");
      const lines = content.split("\n");

      lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        for (const pattern of FORBIDDEN_PATTERNS) {
          if (pattern.regex.test(line)) {
            if (!isAllowed(relativePath, line, pattern.name)) {
              violations.push({
                file: relativePath,
                line: lineNum,
                pattern: pattern.name,
                snippet: line.trim().slice(0, 100)
              });
              violationsFound++;
            }
          }
        }
      });
    }
  }

  process.stdout.write(`Total production files scanned: ${totalFilesScanned}\n`);
  process.stdout.write(`Violations detected: ${violationsFound}\n\n`);

  if (violationsFound > 0) {
    process.stderr.write("FAILED: The following forbidden demo artifacts or debug leftovers were found:\n\n");
    violations.forEach(v => {
      process.stderr.write(`  [${v.pattern}] ${v.file}:${v.line}\n    ${v.snippet}\n\n`);
    });
    process.exit(1);
  } else {
    process.stdout.write("PASSED: Zero demo artifacts, fake personas, or debug leftovers found in production code.\n");
    process.exit(0);
  }
}

runCheck();
