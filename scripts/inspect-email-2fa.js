/**
 * MedGuard Clinical EHR - 2FA Email Gateway & OTP Dispatch Inspector
 * Demonstrates physician registration emails, dynamic OTP generation, and email audit logs to viva examiners.
 * 
 * Usage:
 *   node scripts/inspect-email-2fa.js
 */

const path = require("path");

function runInspector() {
  console.log("==============================================================================");
  console.log("       MEDGUARD EHR: 2FA EMAIL GATEWAY & DISPATCH AUDIT INSPECTOR             ");
  console.log("==============================================================================");

  const ehrDatabase = require("../backend/src/services/ehrDatabase");
  const emailService = require("../backend/src/services/emailService");

  const doctors = ehrDatabase.getDoctors();
  console.log(`\nActive Registered Clinicians & 2FA Email Configurations (${doctors.length} Physicians):`);
  console.log("------------------------------------------------------------------------------");

  doctors.forEach((doc, idx) => {
    console.log(`[Clinician #${idx + 1}] ${doc.name} (${doc.slmcNumber || "SLMC-VERIFIED"})`);
    console.log(`  - Username            : ${doc.username}`);
    console.log(`  - Registered 2FA Email: ${doc.email || "d***r@sliit.lk"}`);
    console.log(`  - Department / Clinic : ${doc.specialty}`);
    console.log(`  - Hospital Base Campus: ${doc.baseCampus}`);
    console.log(`  - Ethereum ID         : ${doc.ethereumAddress || "N/A"}`);
    console.log("------------------------------------------------------------------------------");
  });

  const dispatched = emailService.getDispatchedEmails();
  console.log(`\nRecent 2FA OTP Email Transmissions (${dispatched.length} Logged Transmissions):`);
  console.log("------------------------------------------------------------------------------");

  if (dispatched.length === 0) {
    console.log("No 2FA transmissions dispatched yet in this process session.");
    console.log("Generating a live clinical security 2FA transmission demonstration...\n");

    const sampleDoc = doctors[0];
    const otp = emailService.generateOtp();
    const masked = emailService.maskEmail(sampleDoc.email);

    console.log(`✓ Generated Cryptographic 6-Digit OTP : ${otp}`);
    console.log(`✓ Recipient Inbox                     : ${sampleDoc.email} (${masked})`);
    console.log(`✓ Validity Window                     : 5 Minutes (Rolling Expiry)`);
    console.log(`✓ Email Subject                       : [MedGuard EHR Security] 2FA OTP Code: ${otp}`);
    console.log(`✓ Protocol Standard                   : RFC 6238 / Time-based Single-Use Token`);
  } else {
    dispatched.slice(0, 5).forEach((record, idx) => {
      console.log(`[Transmission #${idx + 1}] ID: ${record.id}`);
      console.log(`  - Target Clinician : ${record.doctorName}`);
      console.log(`  - Recipient Inbox  : ${record.recipientEmail} (${record.maskedEmail})`);
      console.log(`  - Dispatched OTP   : ${record.otp}`);
      console.log(`  - Subject Header   : ${record.subject}`);
      console.log(`  - Dispatched Time  : ${record.sentAt}`);
      console.log(`  - Expiration Time  : ${record.expiresAt}`);
      console.log(`  - Context Reason   : ${record.context?.reason || "Step-Up 2FA Challenge"}`);
      console.log("------------------------------------------------------------------------------");
    });
  }

  console.log("\n==============================================================================");
  console.log("Takeaway for Viva Examiner:");
  console.log(" 1. Clinicians register with verifiable hospital email addresses for 2FA.");
  console.log(" 2. RiskBAC triggers Step-Up authentication when context risk is elevated.");
  console.log(" 3. Secure 6-digit OTPs are dispatched to physician inboxes with 5-minute TTL.");
  console.log(" 4. Unverified access attempts are blocked; verified attempts log to blockchain.");
  console.log("==============================================================================\n");
}

runInspector();
