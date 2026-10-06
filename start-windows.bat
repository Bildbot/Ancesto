@echo off
title Rodoslovnaya - Family Tree
echo ========================================================
echo   Launching Rodoslovnaya Family Tree on Windows
echo ========================================================
echo.

REM 1. Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found on your system.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM 2. Check dependencies
if not exist node_modules (
    echo [INFO] Installing dependencies...
    call npm install
)

REM 3. Build if not built
if not exist dist (
    echo [INFO] Building frontend...
    call npm run build
)

REM 4. Launch in native app window (no address bar or tabs)
echo [INFO] Opening desktop application...
start "" msedge --app=http://localhost:3000 --window-size=1280,850 2>nul || start http://localhost:3000
call npm run preview -- --port 3000
