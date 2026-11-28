@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title DataWise - Stop Dev

echo.
echo Stopping DataWise local dev...
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found in PATH.
  pause
  exit /b 1
)

node "%~dp0scripts\dev-stop.mjs"
set ERR=%ERRORLEVEL%
echo.
if not "%ERR%"=="0" (
  echo [ERROR] stop exited with code %ERR%
) else (
  echo Done. Ports should be free.
)
echo.
pause
exit /b %ERR%