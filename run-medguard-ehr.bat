@echo off
title MedGuard Clinical Healthcare System
echo ==============================================================================
echo             MEDGUARD CLINICAL HEALTHCARE AND BLOCKCHAIN SYSTEM
echo            (SLIIT Malabe Hospital and Seylan Medical Clinic Network)
echo ==============================================================================
echo.

cd /d "%~dp0"

echo [1/5] Starting Local Ethereum Blockchain Node (Port 8545)...
start "MedGuard - 1. Ethereum Blockchain Node" cmd /k "cd /d %~dp0 && npx.cmd hardhat node"

echo Waiting for Ethereum node to initialize on port 8545...
powershell -Command "Start-Sleep -Seconds 4"

echo [2/5] Deploying Smart Contracts and Seeding Keys on Ethereum...
call npx.cmd hardhat run scripts/deploy.js --network localhost

echo [3/5] Starting Context-Aware Risk Scoring Engine (Port 8000)...
start "MedGuard - 2. Python Risk Engine" cmd /k "cd /d %~dp0risk-engine && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

echo [4/5] Starting Open Policy Agent Policy Server (Port 8181)...
start "MedGuard - 3. OPA Policy Server" cmd /k "cd /d %~dp0 && opa run --server policy/access_policy.rego --addr :8181"

echo [5/5] Starting MedGuard Clinical Backend (Port 5000)...
start "MedGuard - 4. Clinical Backend" cmd /k "cd /d %~dp0backend && node src/server.js"

echo Starting React Clinical EHR Provider Portal (Port 3000)...
start "MedGuard - 5. Hospital EHR Portal" cmd /k "cd /d %~dp0frontend && npm.cmd run dev"

echo.
echo ==============================================================================
echo All MedGuard Clinical Healthcare Services Live!
echo.
echo  - Hospital EHR Clinical Portal: http://localhost:3000
echo  - Clinical Backend API:         http://localhost:5000/health
echo  - Ethereum JSON-RPC Node:       http://127.0.0.1:8545
echo  - Python Risk Engine Docs:      http://localhost:8000/docs
echo  - OPA Policy Health:            http://localhost:8181/health
echo ==============================================================================
echo.
pause
