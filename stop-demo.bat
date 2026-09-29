@echo off
title MedGuard v2 Stopper
echo Stopping MedGuard processes on ports 3000, 5000, 8000, 8181...
echo.

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 "') do taskkill /f /pid %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000 "') do taskkill /f /pid %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000 "') do taskkill /f /pid %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8181 "') do taskkill /f /pid %%a 2>nul

echo All MedGuard services stopped.
pause
