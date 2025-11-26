@echo off
echo Stopping all Node.js processes...
taskkill /F /IM node.exe >nul 2>&1

echo Waiting 2 seconds...
timeout /t 2 /nobreak >nul

echo Starting server...
cd /d "%~dp0"
start "Cashback Server" cmd /k "node server-cashback.js"

echo Server started in new window!
