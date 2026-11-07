# Local backend dev server (repo config at ../config, port 18421).
# Usage: .\run-dev.ps1
# If startup fails: stop desktop app / other Java on 18421, then run mvn clean install once.

$ErrorActionPreference = 'Stop'
$backendRoot = $PSScriptRoot
$configDir = Join-Path (Split-Path $backendRoot -Parent) 'config'

Write-Host "[run-dev] config dir: $configDir"
Write-Host "[run-dev] checking port 18421..."
$portUser = Get-NetTCPConnection -LocalPort 18421 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($portUser) {
    Write-Warning "Port 18421 is in use (PID $($portUser.OwningProcess)). Stop DataWise desktop / other backend first."
    exit 1
}

Push-Location $backendRoot
try {
    mvn -pl datawise-server -am spring-boot:run `
        "-Dspring-boot.run.jvmArguments=-Ddatawise.config.dir=$configDir -Ddatawise.logging.dir=$(Join-Path $configDir 'logs')"
} finally {
    Pop-Location
}
