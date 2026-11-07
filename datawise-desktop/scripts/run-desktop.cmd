@echo off
setlocal EnableExtensions
cd /d "%~dp0\.."

REM Prefer cached jbr_jcef from ensure-jbr-jcef / dist (has CEF natives).
set "JBR_JAVA="
for /d %%D in ("target\jbr-cache\jbr_jcef-*") do (
  if exist "%%D\bin\java.exe" set "JBR_JAVA=%%D\bin\java.exe"
  if exist "%%D\Contents\Home\bin\java.exe" set "JBR_JAVA=%%D\Contents\Home\bin\java.exe"
)
if defined JBR_JAVA (
  set "JAVA=%JBR_JAVA%"
  echo [run-desktop] using jbr_jcef: %JAVA%
) else (
  set "JAVA=java"
  echo [run-desktop] WARNING: no target\jbr-cache jbr_jcef found; plain JDK may fail CEF.
  echo            Run: node scripts/ensure-and-run.mjs   ^(downloads jbr_jcef^)
)

set "JAR=target\datawise-desktop-4.1.7.jar"
if not exist "%JAR%" (
  echo Missing %JAR%. Run: mvn -q package
  exit /b 1
)
"%JAVA%" -Djava.awt.headless=false -cp "%JAR%;target\lib\*" org.apache.datawise.desktop.DatawiseDesktopApp %*
