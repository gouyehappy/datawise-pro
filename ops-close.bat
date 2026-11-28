@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title DataWise Ops - Close

echo.
echo Closing DataWise Ops processes...
echo.

set PORT=3927
if not "%OPS_WEB_PORT%"=="" set PORT=%OPS_WEB_PORT%

REM 1) Free web console port
set KILLED=0
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  echo  - kill PID %%P ^(port %PORT%^)
  taskkill /F /PID %%P >nul 2>nul
  if not errorlevel 1 set KILLED=1
)

REM 2) Kill known ops node scripts for this repo (by command line)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root = (Resolve-Path '%~dp0').Path.TrimEnd('\');" ^
  "$patterns = @('ops-web.mjs','ops-cli.mjs','ship-release-menu.mjs');" ^
  "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" -ErrorAction SilentlyContinue | ForEach-Object {" ^
  "  $cmd = $_.CommandLine; if (-not $cmd) { return }" ^
  "  $hit = $false; foreach ($p in $patterns) { if ($cmd -like ('*' + $p + '*')) { $hit = $true; break } }" ^
  "  if (-not $hit) { return }" ^
  "  if ($cmd -notlike ('*' + $root + '*') -and $cmd -notlike ('*datawise-cli*')) { return }" ^
  "  Write-Host ('  - kill node PID ' + $_.ProcessId);" ^
  "  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue" ^
  "}"

echo.
echo Done. You can close any leftover Ops window manually if it is still open.
echo.
pause
exit /b 0