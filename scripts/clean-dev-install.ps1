#Requires -Version 5.1
# ASCII-only. Windows PowerShell 5.1 cannot parse UTF-8 without BOM.
<#
.SYNOPSIS
    Wipe DataWise CLI install traces so this PC behaves like a fresh machine.

.DESCRIPTION
    Removes:
      - Legacy userData          %APPDATA%\datawise-cli  (pre-JCEF desktop)
      - Desktop userData         %APPDATA%\DataWiseCLI
      - Documents workspaces     %USERPROFILE%\Documents\DataWise  (opt-in)
      - Firewall rule            "DataWise CLI Backend"
      - Uninstall registry keys  DataWise / DataWiseCLI
      - Scheduled task           DataWiseCLI-Relaunch

    Does not remove:
      - Source tree
      - Repo config/ used by --datawise.config.dir

.PARAMETER IncludeWorkspaces
    Also delete Documents\DataWise (all workspace files). Off by default.

.PARAMETER DryRun
    Print actions without deleting anything.

.EXAMPLE
    .\scripts\clean-dev-install.ps1

.EXAMPLE
    .\scripts\clean-dev-install.ps1 -IncludeWorkspaces

.EXAMPLE
    .\scripts\clean-dev-install.ps1 -DryRun
#>
[CmdletBinding()]
param(
    [switch]$IncludeWorkspaces,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

function Write-Step { param([string]$Message) Write-Host ("> {0}" -f $Message) -ForegroundColor Cyan }
function Write-Done { param([string]$Message) Write-Host ("  OK  {0}" -f $Message) -ForegroundColor Green }
function Write-Skip { param([string]$Message) Write-Host ("  --  {0}" -f $Message) -ForegroundColor DarkGray }
function Write-Warn { param([string]$Message) Write-Host ("  !!  {0}" -f $Message) -ForegroundColor Yellow }

function Remove-DirSafe {
    param([string]$Target, [string]$Label)
    if (-not (Test-Path -LiteralPath $Target)) {
        Write-Skip ("missing {0}: {1}" -f $Label, $Target)
        return
    }
    if ($DryRun) {
        Write-Skip ("DryRun would remove {0}: {1}" -f $Label, $Target)
        return
    }
    Remove-Item -LiteralPath $Target -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $Target) {
        Write-Warn ("failed to remove {0}: {1}" -f $Label, $Target)
    } else {
        Write-Done ("removed {0}: {1}" -f $Label, $Target)
    }
}

function Remove-RegSafe {
    param([string]$Target)
    if (-not (Test-Path -LiteralPath $Target)) {
        Write-Skip ("registry missing: {0}" -f $Target)
        return
    }
    if ($DryRun) {
        Write-Skip ("DryRun would remove registry: {0}" -f $Target)
        return
    }
    Remove-Item -LiteralPath $Target -Recurse -Force -ErrorAction SilentlyContinue
    Write-Done ("removed registry: {0}" -f $Target)
}

Write-Step "Checking running DataWise processes..."
$running = @(
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -match 'DataWiseCLI|datawise-desktop|DatawiseDesktopApp|DatawiseBackend' -or
            ($null -ne $_.CommandLine -and $_.CommandLine -match 'datawise\.gui|datawise-frontend\\release|DataWiseCLI')
        }
)
if ($running.Count -gt 0) {
    Write-Warn "DataWise is still running. Close it first, or type Y to kill:"
    foreach ($proc in $running) {
        Write-Host ("    PID {0}  {1}" -f $proc.ProcessId, $proc.Name) -ForegroundColor Yellow
    }
    $answer = Read-Host "  Force kill and continue? [y/N]"
    if ($answer -notmatch '^[Yy]') {
        Write-Host "Cancelled." -ForegroundColor Red
        exit 1
    }
    foreach ($proc in $running) {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Write-Done "processes stopped"
    Start-Sleep -Seconds 1
}

Write-Step "Legacy userData (pre-JCEF)..."
Remove-DirSafe "$env:APPDATA\datawise-cli" "legacy userData"

Write-Step "Desktop userData..."
Remove-DirSafe "$env:APPDATA\DataWiseCLI" "desktop userData"

if ($IncludeWorkspaces) {
    Write-Step "Documents workspaces..."
    Remove-DirSafe "$env:USERPROFILE\Documents\DataWise" "Documents\DataWise"
} else {
    Write-Skip "skip Documents\DataWise (pass -IncludeWorkspaces to delete)"
}

Write-Step "Windows firewall rule..."
$ruleName = "DataWise CLI Backend"
$existingRules = @(Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)
if ($existingRules.Count -gt 0) {
    if ($DryRun) {
        Write-Skip ("DryRun would remove firewall rule: {0}" -f $ruleName)
    } else {
        Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
        Write-Done ("removed firewall rule: {0}" -f $ruleName)
    }
} else {
    Write-Skip ("firewall rule missing: {0}" -f $ruleName)
}

Write-Step "Scheduled task..."
$taskName = "DataWiseCLI-Relaunch"
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($null -ne $task) {
    if ($DryRun) {
        Write-Skip ("DryRun would remove task: {0}" -f $taskName)
    } else {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
        Write-Done ("removed scheduled task: {0}" -f $taskName)
    }
} else {
    Write-Skip ("scheduled task missing: {0}" -f $taskName)
}

Write-Step "Uninstall registry keys..."
$regPaths = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\DataWiseCLI",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\DataWiseCLI",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\DataWiseCLI",
    "HKCU:\Software\DataWise",
    "HKLM:\Software\DataWise"
)
foreach ($rp in $regPaths) {
    Remove-RegSafe $rp
}

Write-Host ""
Write-Host "Done. This machine now matches a fresh install." -ForegroundColor Green
if (-not $IncludeWorkspaces) {
    Write-Host "Documents\DataWise was kept. Re-run with -IncludeWorkspaces to wipe it too." -ForegroundColor DarkGray
}
