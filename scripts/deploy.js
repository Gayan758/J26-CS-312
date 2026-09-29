const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

async function main() {
  console.log("=================================================");
  console.log("  Deploying MedGuard Smart Contracts to Network  ");
  console.log("=================================================");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer account:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH\n");

  // 1. Deploy ConsentRegistry
  console.log("[1/3] Deploying ConsentRegistry...");
  const ConsentRegistry = await hre.ethers.getContractFactory("ConsentRegistry");
  const consentRegistry = await ConsentRegistry.deploy();
  await consentRegistry.waitForDeployment();
  const consentAddress = await consentRegistry.getAddress();
  console.log("-> ConsentRegistry deployed at:", consentAddress);

  // 2. Deploy AccessAuditLog
  console.log("[2/3] Deploying AccessAuditLog...");
  const AccessAuditLog = await hre.ethers.getContractFactory("AccessAuditLog");
  const accessAuditLog = await AccessAuditLog.deploy();
  await accessAuditLog.waitForDeployment();
  const auditAddress = await accessAuditLog.getAddress();
  console.log("-> AccessAuditLog deployed at:", auditAddress);

  // 3. Deploy BreakGlassRegistry
  console.log("[3/3] Deploying BreakGlassRegistry (Max: 3600s, Default: 1800s)...");
  const BreakGlassRegistry = await hre.ethers.getContractFactory("BreakGlassRegistry");
  const breakGlassRegistry = await BreakGlassRegistry.deploy(3600, 1800);
  await breakGlassRegistry.waitForDeployment();
  const breakGlassAddress = await breakGlassRegistry.getAddress();
  console.log("-> BreakGlassRegistry deployed at:", breakGlassAddress);

  // 4. Configure Authorizations
  console.log("\nConfiguring permissions...");
  // Authorize deployer/backend signer on AccessAuditLog
  let tx = await accessAuditLog.setAuthorizedRecorder(deployer.address, true);
  await tx.wait();
  console.log("✓ Authorized backend signer on AccessAuditLog");

  // Authorize deployer/backend signer on ConsentRegistry
  tx = await consentRegistry.setAuthorizedCaller(deployer.address, true);
  await tx.wait();
  console.log("✓ Authorized backend signer on ConsentRegistry");

  // 5. Pre-register patient keys and consents on-chain
  console.log("\nRegistering initial clinical patient keys and doctor consents on-chain...");
  const doctorAlice = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const doctorKasun = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
  const doctorSarah = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";

  const patients = [
    { id: "patient-123", keyName: "patient-123-key", doctors: [doctorAlice, doctorKasun] },
    { id: "patient-456", keyName: "patient-456-key", doctors: [] }, // Trauma ER: no prior consent
    { id: "patient-789", keyName: "patient-789-key", doctors: [doctorSarah] },
    { id: "patient-321", keyName: "patient-321-key", doctors: [doctorAlice] }
  ];

  for (const p of patients) {
    const pIdBytes = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(p.id));
    const keyBytes = crypto.createHash("sha256").update(p.keyName).digest();

    // Register key
    const regTx = await consentRegistry.registerPatientKey(pIdBytes, keyBytes);
    await regTx.wait();
    console.log(`✓ Registered AES-256 key for ${p.id} on ConsentRegistry`);

    // Grant consents
    for (const doc of p.doctors) {
      const cTx = await consentRegistry.setConsent(doc, pIdBytes, true);
      await cTx.wait();
      console.log(`  └─ Granted consent to Dr. ${doc.slice(0, 8)}... for ${p.id}`);
    }
  }

  // 6. Save contract addresses to backend configuration
  const contractsConfig = {
    CONSENT_REGISTRY_ADDRESS: consentAddress,
    ACCESS_AUDIT_LOG_ADDRESS: auditAddress,
    BREAK_GLASS_REGISTRY_ADDRESS: breakGlassAddress,
    ETH_RPC_URL: "http://127.0.0.1:8545",
    ETH_SIGNER_PRIVATE_KEY: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    NETWORK: hre.network.name,
    DEPLOYED_AT: new Date().toISOString()
  };

  const envContent = `# MedGuard Auto-Generated Live Blockchain Configuration
PORT=5000
NODE_ENV=development
RISK_ENGINE_URL=http://127.0.0.1:8000
OPA_URL=http://127.0.0.1:8181/v1/data/medguard/access
ETH_RPC_URL=http://127.0.0.1:8545
ETH_SIGNER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

CONSENT_REGISTRY_ADDRESS=${consentAddress}
ACCESS_AUDIT_LOG_ADDRESS=${auditAddress}
BREAK_GLASS_REGISTRY_ADDRESS=${breakGlassAddress}

JWT_SECRET=medguard_v2_super_secure_backend_jwt_secret_2026
MFA_CHALLENGE_SECRET=medguard_mfa_stepup_secret_2026
`;

  const backendEnvPath = path.join(__dirname, "../backend/.env");
  fs.writeFileSync(backendEnvPath, envContent, "utf8");
  console.log(`\n✓ Successfully wrote live contract addresses to ${backendEnvPath}`);

  const contractsJsonPath = path.join(__dirname, "../backend/src/config/contracts.json");
  fs.writeFileSync(contractsJsonPath, JSON.stringify(contractsConfig, null, 2), "utf8");
  console.log(`✓ Exported deployment metadata to ${contractsJsonPath}`);

  console.log("\n=================================================");
  console.log("  Live On-Chain Deployment Complete!              ");
  console.log("=================================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
