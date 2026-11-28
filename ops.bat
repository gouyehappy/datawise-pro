@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title DataWise Ops

echo.
echo DataWise Ops starting...
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found in PATH.
  echo Install Node.js, then open a NEW Explorer window and double-click ops.bat again.
  echo.
  pause
  exit /b 1
)

if not exist "%~dp0scripts\desktop\ship-release-menu.mjs" (
  echo [ERROR] Menu script missing. Run ops.bat from the repo root folder.
  echo Current dir: %CD%
  echo.
  pause
  exit /b 1
)

REM Default: terminal menu
REM   ops.bat          smart release + full menu
REM   ops.bat cli      arrow-key menu
REM   ops.bat web      optional web console
REM   ops-close.bat    stop leftover ops / free port
REM   stop.bat         stop local dev (Vite/backend)

if /i "%~1"=="web" (
  echo Starting optional web console...
  node "%~dp0scripts\desktop\ops-web.mjs"
  echo.
  echo Web console stopped. Exit code %ERRORLEVEL%
  pause
  exit /b %ERRORLEVEL%
)

if /i "%~1"=="cli" (
  node "%~dp0scripts\desktop\ops-cli.mjs"
  set ERR=%ERRORLEVEL%
  if not "%ERR%"=="0" (
    echo [ERROR] exit code %ERR%
    pause
  )
  exit /b %ERR%
)

node "%~dp0scripts\desktop\ship-release-menu.mjs"
set ERR=%ERRORLEVEL%
if not "%ERR%"=="0" (
  echo.
  echo [ERROR] Menu exited with code %ERR%
  echo Scroll up for details. Common causes: Node not in PATH for Explorer, or menu crash.
  echo.
  pause
  exit /b %ERR%
)
REM Clean quit (Q): close this window without extra pause
exit /b 0