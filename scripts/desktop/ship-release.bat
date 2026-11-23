@echo off
setlocal
cd /d "%~dp0..\.."
title DataWise Ops Menu
node "%~dp0ship-release-menu.mjs" %*
set ERR=%ERRORLEVEL%
if %ERR% NEQ 0 (
  echo.
  echo [ops-menu] exit code %ERR%
  pause
)
exit /b %ERR%