@echo off
echo ════════════════════════════════════════════════════════════════
echo    RESTART SERVER - Kill All Processes and Start Fresh
echo ════════════════════════════════════════════════════════════════
echo.

echo [1/5] Killing all node.exe processes...
taskkill /IM node.exe /F 2>nul
if %errorlevel% equ 0 (
    echo ✓ Node processes killed
) else (
    echo ℹ No node processes running
)
echo.

echo [2/5] Killing PM2 processes...
taskkill /IM pm2.exe /F 2>nul
if %errorlevel% equ 0 (
    echo ✓ PM2 processes killed
) else (
    echo ℹ No PM2 processes running
)
echo.

echo [3/5] Waiting for port to be released...
timeout /t 2 /nobreak >nul
echo ✓ Wait complete
echo.

echo [4/5] Checking if port 3007 is free...
netstat -ano | findstr :3007 >nul
if %errorlevel% equ 0 (
    echo ⚠ Port 3007 still in use, waiting...
    timeout /t 3 /nobreak >nul
) else (
    echo ✓ Port 3007 is free
)
echo.

echo [5/5] Starting backend server...
echo.
echo ════════════════════════════════════════════════════════════════
echo    Backend is starting... Watch for these messages:
echo    ✓ "Server running on port 3007"
echo    ✓ "Database connected"
echo.
echo    KEEP THIS WINDOW OPEN!
echo    Press Ctrl+C to stop the server
echo ════════════════════════════════════════════════════════════════
echo.

cd /d "%~dp0backend"
npm run dev
