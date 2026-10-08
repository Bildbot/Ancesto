@echo off
title Rodoslovnaya - Family Tree
echo ========================================================
echo   Launching Rodoslovnaya Family Tree on Windows
echo ========================================================
echo.

REM 1. Check Node.js and npm versions
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found on your system.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)
node -e "const v=process.versions.node.split('.').map(Number); if(v[0]<22 || (v[0]===22 && v[1]<12)) process.exit(1)"
if %errorlevel% neq 0 (
    echo [ERROR] Node.js 22.12 or newer is required.
    pause
    exit /b 1
)

REM 2. Check dependencies
if not exist node_modules (
    echo [INFO] Installing dependencies...
    call npm install
    if errorlevel 1 exit /b 1
)

REM 3. Build if not built
if not exist dist (
    echo [INFO] Building frontend...
    call npm run build
    if errorlevel 1 exit /b 1
)

REM 4. Start server, wait for health-check, then open browser
echo [INFO] Starting preview server...
start "Rodoslovnaya server" /min cmd /c "npm run preview -- --host 127.0.0.1 --port 3000"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$url='http://127.0.0.1:3000'; for($i=0; $i -lt 60; $i++){ try { $r=Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2; if($r.StatusCode -eq 200){ exit 0 } } catch {}; Start-Sleep -Seconds 1 }; exit 1"
if %errorlevel% neq 0 (
    echo [ERROR] Server did not become ready at http://127.0.0.1:3000
    pause
    exit /b 1
)
echo [INFO] Opening application...
start "" msedge --app=http://127.0.0.1:3000 --window-size=1280,850 2>nul
if %errorlevel% neq 0 start "" http://127.0.0.1:3000
