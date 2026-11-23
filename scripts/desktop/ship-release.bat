@echo off
setlocal
cd /d "%~dp0..\.."
node "%~dp0ship-release-menu.mjs" %*
set ERR=%ERRORLEVEL%
if %ERR% NEQ 0 (
  echo.
  echo [ship-release] exit code %ERR%
  pause
)
exit /b %ERR%