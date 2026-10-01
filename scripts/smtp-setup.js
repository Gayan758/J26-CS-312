#!/usr/bin/env node
/**
 * scripts/smtp-setup.js
 * Interactive & Automated SMTP Configuration & Testing Utility for MedGuard EHR
 *
 * Configures real outgoing SMTP email delivery for 2FA OTPs and alerts.
 * Supports:
 *  1. Google Gmail (via Google App Password)
 *  2. Microsoft 365 / SLIIT Student Mail
 *  3. Custom SMTP (Brevo, SendGrid, Mailgun, Amazon SES)
 *
 * Safely verifies connection, sends an immediate live test email, and updates backend/.env.
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const nodemailer = require("nodemailer");

const BACKEND_ENV_PATH = path.join(__dirname, "../backend/.env");

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--host" && args[i + 1]) params.host = args[++i];
    if (args[i] === "--port" && args[i + 1]) params.port = parseInt(args[++i], 10);
    if (args[i] === "--user" && args[i + 1]) params.user = args[++i];
    if (args[i] === "--pass" && args[i + 1]) params.pass = args[++i];
    if (args[i] === "--secure" && args[i + 1]) params.secure = args[++i] === "true";
    if (args[i] === "--from" && args[i + 1]) params.from = args[++i];
    if (args[i] === "--to" && args[i + 1]) params.to = args[++i];
  }
  return params;
}

function promptLine(rl, query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

function promptSecret(query) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(query, (ans) => {
        rl.close();
        resolve(ans.trim());
      });
      return;
    }

    process.stdout.write(query);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let input = "";
    const onData = (char) => {
      char = char.toString();
      if (char === "\n" || char === "\r" || char === "\u0004") {
        stdin.setRawMode(wasRaw || false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(input.trim());
      } else if (char === "\u0003") {
        process.exit(1);
      } else if (char === "\u007f" || char === "\b") {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else {
        input += char;
        process.stdout.write("*");
      }
    };
    stdin.on("data", onData);
  });
}

function updateEnvFile(config) {
  let content = "";
  if (fs.existsSync(BACKEND_ENV_PATH)) {
    content = fs.readFileSync(BACKEND_ENV_PATH, "utf8");
  }

  const lines = content.split("\n");
  const keysToUpdate = {
    SMTP_HOST: config.host,
    SMTP_PORT: String(config.port),
    SMTP_SECURE: String(config.secure),
    SMTP_USER: config.user,
    SMTP_PASS: config.pass,
    SMTP_FROM: config.from
  };

  const updatedLines = [];
  const processedKeys = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    let handled = false;
    for (const [key, value] of Object.entries(keysToUpdate)) {
      if (trimmed.startsWith(`${key}=`)) {
        updatedLines.push(`${key}=${value}`);
        processedKeys.add(key);
        handled = true;
        break;
      }
    }
    if (!handled) {
      updatedLines.push(line);
    }
  }

  // Append any keys that weren't already present
  for (const [key, value] of Object.entries(keysToUpdate)) {
    if (!processedKeys.has(key)) {
      updatedLines.push(`${key}=${value}`);
    }
  }

  fs.writeFileSync(BACKEND_ENV_PATH, updatedLines.join("\n"), "utf8");
}

async function main() {
  process.stdout.write("==============================================================================\n");
  process.stdout.write("           MEDGUARD EHR: OUTGOING SMTP 2FA CONFIGURATION UTILITY              \n");
  process.stdout.write("==============================================================================\n\n");

  const cliArgs = parseArgs();
  let smtpConfig = {};
  let targetRecipient = cliArgs.to || "it23270374@my.sliit.lk";

  if (cliArgs.host && cliArgs.user && cliArgs.pass) {
    smtpConfig = {
      host: cliArgs.host,
      port: cliArgs.port || 587,
      secure: cliArgs.secure || false,
      user: cliArgs.user,
      pass: cliArgs.pass,
      from: cliArgs.from || `"MedGuard Clinical Security" <${cliArgs.user}>`
    };
  } else {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    process.stdout.write("Select your email SMTP provider:\n");
    process.stdout.write("  [1] Google Gmail (Recommended - uses Google App Password)\n");
    process.stdout.write("  [2] Microsoft 365 / SLIIT Student Mail (smtp.office365.com)\n");
    process.stdout.write("  [3] Custom SMTP Server (Brevo, SendGrid, Mailgun, Amazon SES)\n\n");

    const choice = (await promptLine(rl, "Enter choice [1-3] (Default: 1): ")).trim() || "1";

    let host = "smtp.gmail.com";
    let port = 587;
    let secure = false;

    if (choice === "2") {
      host = "smtp.office365.com";
      port = 587;
      secure = false;
    } else if (choice === "3") {
      host = (await promptLine(rl, "Enter SMTP Host: ")).trim();
      const portInput = (await promptLine(rl, "Enter SMTP Port (Default 587): ")).trim();
      port = portInput ? parseInt(portInput, 10) : 587;
      const secInput = (await promptLine(rl, "Use SSL/TLS secure connection? (y/N): ")).trim().toLowerCase();
      secure = secInput === "y" || secInput === "yes" || port === 465;
    }

    process.stdout.write(`\nConfiguring ${host}:${port}...\n`);
    const user = (await promptLine(rl, "Enter SMTP Account / Email: ")).trim();

    rl.close();

    process.stdout.write("\nNOTE: For Gmail, please enter a 16-character Google App Password\n");
    process.stdout.write("(Generate at: https://myaccount.google.com/apppasswords)\n");
    const pass = await promptSecret("Enter SMTP Password / App Password (typing hidden): ");

    const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
    const from = (await promptLine(rl2, `Sender Display Name & Address (Default: "MedGuard Clinical Security" <${user}>): `)).trim() || `"MedGuard Clinical Security" <${user}>`;
    const toInput = (await promptLine(rl2, `Test Recipient Email (Default: ${targetRecipient}): `)).trim();
    if (toInput) targetRecipient = toInput;
    rl2.close();

    smtpConfig = { host, port, secure, user, pass, from };
  }

  process.stdout.write("\nConnecting to SMTP server and verifying credentials...\n");

  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.pass
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  try {
    await transporter.verify();
    process.stdout.write("✓ SMTP Server connection and authentication verified successfully!\n\n");
  } catch (err) {
    process.stderr.write(`\nFAILED to connect or authenticate to SMTP server:\n  ${err.message}\n\n`);
    process.stderr.write("Troubleshooting Tips:\n");
    if (smtpConfig.host.includes("gmail")) {
      process.stderr.write(" - For Gmail, you MUST use an App Password, not your normal Google password.\n");
      process.stderr.write(" - Create an App Password at: https://myaccount.google.com/apppasswords\n");
    } else if (smtpConfig.host.includes("office365")) {
      process.stderr.write(" - Ensure SMTP Client Submission (AUTH SMTP) is enabled for your Microsoft 365 tenant.\n");
    }
    process.exit(1);
  }

  process.stdout.write(`Sending live test 2FA verification email to: ${targetRecipient}...\n`);

  const testOtp = Math.floor(100000 + Math.random() * 900000).toString();
  const testSubject = `[MedGuard EHR Security] 2FA OTP Code: ${testOtp} (Live SMTP Test)`;
  const testHtml = `
    <div style="font-family: Arial, sans-serif; background: #0F172A; color: #FFF; padding: 24px; border-radius: 12px; max-width: 500px;">
      <h2 style="color: #38BDF8; margin-top: 0;">MedGuard EHR Clinical Security</h2>
      <p>This is a live test email confirming your SMTP configuration is active and working.</p>
      <div style="background: #1E293B; border: 2px dashed #38BDF8; padding: 16px; text-align: center; border-radius: 8px; margin: 20px 0;">
        <span style="font-size: 32px; letter-spacing: 6px; font-weight: bold; color: #38BDF8;">${testOtp}</span>
      </div>
      <p style="font-size: 12px; color: #94A3B8;">Recipient: ${targetRecipient}<br>Timestamp: ${new Date().toISOString()}</p>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: smtpConfig.from,
      to: targetRecipient,
      subject: testSubject,
      text: `MedGuard Live SMTP Test OTP Code: ${testOtp}. Configured for ${targetRecipient}.`,
      html: testHtml
    });

    process.stdout.write(`✓ Live email dispatched successfully! Message ID: ${info.messageId}\n\n`);
    process.stdout.write("Saving validated configuration to backend/.env...\n");

    updateEnvFile(smtpConfig);

    process.stdout.write("✓ Updated backend/.env successfully.\n\n");
    process.stdout.write("==============================================================================\n");
    process.stdout.write(` SUCCESS: Real 2FA OTP emails will now be sent to ${targetRecipient}!\n`);
    process.stdout.write(" Please restart the backend server to apply the new SMTP configuration:\n");
    process.stdout.write("   cd backend && node src/server.js\n");
    process.stdout.write("==============================================================================\n");
  } catch (sendErr) {
    process.stderr.write(`\nFAILED to dispatch test email:\n  ${sendErr.message}\n`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
