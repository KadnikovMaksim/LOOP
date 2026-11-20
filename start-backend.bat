@echo off
title Wandermap backend
cd /d "%~dp0server"
echo Starting backend on http://localhost:4000 ...
call npm start
pause