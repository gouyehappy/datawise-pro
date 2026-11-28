# DataWise ship-release (Windows)
#
# Bugfix release after local fixes: default bump = patch (5.0.0 -> 5.0.1)
#
# Usage:
#   .\scripts\desktop\ship-release.ps1                       # status only
#   .\scripts\desktop\ship-release.ps1 -Bump patch -Yes      # one-shot bump+commit+push+tag
#   .\scripts\desktop\ship-release.ps1 -Version 5.0.1 -Yes
#   .\scripts\desktop\ship-release.ps1 -Bump patch -Step bump
param(
    [ValidateSet('', 'patch', 'minor', 'major')]
    [string]$Bump = '',
    [string]$Version = '',
    [ValidateSet('status', 'bump', 'commit', 'tag', 'all')]
    [string]$Step = '',
    [switch]$Yes,
    [switch]$SkipCiCheck,
    [switch]$DryRun,
    [string]$Remote = 'origin'
)

$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $Root

$nodeArgs = @('scripts/desktop/ship-release.mjs')

# No args -> status; with -Yes/-Bump/-Version -> default step all
$effectiveStep = $Step
if (-not $effectiveStep) {
    if ($Yes -or $Bump -or $Version) { $effectiveStep = 'all' }
    else { $effectiveStep = 'status' }
}

if ($effectiveStep -eq 'status' -and -not $Bump -and -not $Version) {
    $nodeArgs += @('--step', 'status')
} else {
    if ($Version) {
        $nodeArgs += @('--bump', $Version)
    } elseif ($Bump) {
        $nodeArgs += @('--bump', $Bump)
    } else {
        $nodeArgs += @('--bump', 'patch')
    }
    $nodeArgs += @('--step', $effectiveStep)
    if ($Yes) { $nodeArgs += '--yes' }
    if ($SkipCiCheck) { $nodeArgs += '--skip-ci-check' }
    if ($DryRun) { $nodeArgs += '--dry-run' }
    if ($Remote) { $nodeArgs += @('--remote', $Remote) }
}

Write-Host "node $($nodeArgs -join ' ')" -ForegroundColor Cyan
& node @nodeArgs
exit $LASTEXITCODE