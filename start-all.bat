@echo off
title Wandermap launcher
cd /d "%~dp0"

echo Starting backend...
start "Wandermap backend" cmd /k "cd /d %~dp0server && npm start"

echo Starting frontend...
start "Wandermap frontend" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo Both servers are starting in separate windows.
echo Open http://localhost:5173 in your browser.
timeout /t 5 >nul