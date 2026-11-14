@echo off
setlocal EnableExtensions EnableDelayedExpansion
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

REM Resolve jar from pom <version>, else first datawise-desktop-*.jar under target.
set "JAR="
for /f "usebackq tokens=2 delims=<>" %%V in (`findstr /i /c:"<version>" pom.xml`) do (
  if not defined JAR (
    if exist "target\datawise-desktop-%%V.jar" set "JAR=target\datawise-desktop-%%V.jar"
  )
)
if not defined JAR (
  for %%F in ("target\datawise-desktop-*.jar") do (
    echo %%~nxF | findstr /i /c:"-sources.jar" >nul
    if errorlevel 1 set "JAR=%%F"
  )
)
if not defined JAR (
  echo Missing target\datawise-desktop-*.jar. Run: mvn -q package
  exit /b 1
)
echo [run-desktop] jar=%JAR%
"%JAVA%" -Djava.awt.headless=false -cp "%JAR%;target\lib\*" org.apache.datawise.desktop.DatawiseDesktopApp %*
