@echo off
title MedGuard v2 Launcher
echo ========================================================
echo       Starting MedGuard v2 Microservices & Demo Stack
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/4] Starting Python Risk Engine (Port 8000)...
start "MedGuard - 1. Python Risk Engine" cmd /k "cd /d %~dp0risk-engine && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

echo [2/4] Starting OPA Policy Server (Port 8181)...
start "MedGuard - 2. OPA Policy Server" cmd /k "cd /d %~dp0 && opa run --server policy/access_policy.rego --addr :8181"

echo [3/4] Starting Node.js Backend (Port 5000)...
start "MedGuard - 3. Node.js Backend" cmd /k "cd /d %~dp0backend && node src/server.js"

echo [4/4] Starting React Provider Portal (Port 3000)...
start "MedGuard - 4. React Frontend" cmd /k "cd /d %~dp0frontend && npm.cmd run dev"

echo.
echo ========================================================
echo All services launched!
echo.
echo  - Frontend Portal:  http://localhost:3000
echo  - Backend API:      http://localhost:5000/health
echo  - Python Risk API:  http://localhost:8000/docs
echo  - OPA Policy API:   http://localhost:8181/health
echo ========================================================
echo.
pause
