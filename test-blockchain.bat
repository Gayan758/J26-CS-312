@echo off
cd /d "%~dp0"
echo ==============================================================================
echo           MEDGUARD EHR: HARDHAT SMART CONTRACT TEST SUITE
echo ==============================================================================
echo.
npx hardhat test
echo.
pause
