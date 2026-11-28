@echo off
setlocal
cd /d "%~dp0..\.."
title DataWise Helper

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js not found. Please install Node.js first.
  echo.
  pause
  exit /b 1
)

node "%~dp0ship-release-menu.mjs" %*
set ERR=%ERRORLEVEL%
if %ERR% NEQ 0 (
  echo.
  echo [ERROR] Helper exited with code %ERR%. Screenshot this window for the developer.
  echo.
  pause
)
exit /b %ERR%