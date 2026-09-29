@echo off
setlocal
echo ==============================================================================
echo                 MEDGUARD EHR - GITHUB REPOSITORY UPLOAD
echo ==============================================================================
echo Repository: https://github.com/Gayan758/J26-CS-312.git
echo.

set "PATH=%USERPROFILE%\AppData\Local\Microsoft\WinGet\Packages\Git.MinGit_Microsoft.Winget.Source_8wekyb3d8bbwe\cmd;%USERPROFILE%\AppData\Local\Programs\Git\cmd;C:\Program Files\Git\cmd;%PATH%"

echo [1/2] Verifying Git repository...
git status --short

echo.
echo [2/2] Pushing files to https://github.com/Gayan758/J26-CS-312.git (main branch)...
echo.
echo If a GitHub Sign-in prompt or browser window appears, please authorize your login.
echo If it asks for Password, you can paste your GitHub Personal Access Token (PAT).
echo.

git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ==============================================================================
    echo [SUCCESS] MedGuard EHR repository uploaded successfully to GitHub!
    echo Check it here: https://github.com/Gayan758/J26-CS-312
    echo ==============================================================================
) else (
    echo.
    echo [NOTICE] Push failed or authentication was cancelled.
    echo If your repository was created with a README or License, run:
    echo   git pull origin main --rebase
    echo   git push -u origin main
)

echo.
pause
