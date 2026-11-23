# DataWise → CNB 一键镜像（双击或在 PowerShell 里运行）
# 用法：
#   .\scripts\desktop\mirror-to-cnb.ps1
#   .\scripts\desktop\mirror-to-cnb.ps1 -Tag v5.0.0
#   .\scripts\desktop\mirror-to-cnb.ps1 -Tag v5.0.0 -Full
param(
    [string]$Tag = "",
    [string]$Token = $env:CNB_TOKEN,
    [string]$CnbRepo = $(if ($env:CNB_REPOSITORY) { $env:CNB_REPOSITORY } else { "gouyehappy/datawise-pro" }),
    [string]$GithubRepo = $env:DATAWISE_GITHUB_REPO,
    [switch]$Full,
    [switch]$Keep
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root

if (-not $Token -or $Token.Trim() -eq "") {
    Write-Host ""
    Write-Host "还没有 CNB_TOKEN。" -ForegroundColor Yellow
    Write-Host "请粘贴 CNB 访问令牌（输入时可见；只保存在当前窗口）："
    $secure = Read-Host -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $Token = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
    } finally {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR) | Out-Null
    }
    if (-not $Token -or $Token.Trim() -eq "") {
        Write-Host "已取消。" -ForegroundColor Red
        exit 1
    }
    $env:CNB_TOKEN = $Token.Trim()
} else {
    $env:CNB_TOKEN = $Token.Trim()
}

$env:CNB_REPOSITORY = $CnbRepo
if ($GithubRepo) { $env:DATAWISE_GITHUB_REPO = $GithubRepo }

$nodeArgs = @("scripts/desktop/mirror-to-cnb.mjs")
if ($Tag) { $nodeArgs += @("--tag", $Tag) }
if ($Full) { $nodeArgs += "--full" }
if ($Keep) { $nodeArgs += "--keep" }
if ($CnbRepo) { $nodeArgs += @("--cnb", $CnbRepo) }
if ($GithubRepo) { $nodeArgs += @("--github", $GithubRepo) }

Write-Host "运行: node $($nodeArgs -join ' ')" -ForegroundColor Cyan
& node @nodeArgs
exit $LASTEXITCODE
