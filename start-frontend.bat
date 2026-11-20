@echo off
title Wandermap frontend
cd /d "%~dp0"
echo Starting frontend on http://localhost:5173 ...
call npm run dev
pause