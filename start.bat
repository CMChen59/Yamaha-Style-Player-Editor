@echo off
cd /d "%~dp0"
title Yamaha STY Player and Editor

if not exist "node_modules" (
    echo [Info] Installing dependencies...
    call npm.cmd install
)

echo [Info] Starting Vite Dev Server...
echo [Info] Opening browser at http://localhost:5173/
call npm.cmd run dev -- --open
pause
