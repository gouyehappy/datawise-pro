@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Uninstall DataWise CLI
echo.
echo  DataWise CLI 卸载
echo  ----------------------------------------
echo  将从「应用和功能」中移除本机安装的 DataWise CLI。
echo  用户数据（工作区配置）默认保留在 %%APPDATA%%\DataWiseCLI。
echo.
choice /C YN /M "确认卸载"
if errorlevel 2 exit /b 0
if errorlevel 1 goto do_uninstall
exit /b 0

:do_uninstall
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$keys=@('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall','HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall');" ^
  "$hit=$null; foreach($root in $keys){ if(-not (Test-Path $root)){continue}; Get-ChildItem $root -EA SilentlyContinue | ForEach-Object { $p=Get-ItemProperty $_.PSPath -EA SilentlyContinue; if($p.DisplayName -eq 'DataWiseCLI' -or $p.DisplayName -like 'DataWise CLI*'){ $hit=$p; break } }; if($hit){break} };" ^
  "if(-not $hit){ Write-Host '未找到已安装的 DataWise CLI（可能已卸载，或当前为便携版 ZIP）。'; exit 1 };" ^
  "Write-Host ('正在卸载: '+$hit.DisplayName+' '+$hit.DisplayVersion);" ^
  "$id=$hit.PSChildName; if($id -notmatch '^\{.+\}$'){ Write-Host ('无法解析产品代码: '+$id); exit 1 };" ^
  "$p=Start-Process -FilePath msiexec.exe -ArgumentList @('/x',$id) -Wait -PassThru;" ^
  "exit $p.ExitCode"

set "EC=%ERRORLEVEL%"
if "%EC%"=="0" (
  echo.
  echo 卸载完成。
) else (
  echo.
  echo 卸载未完成（退出码 %EC%）。也可在「设置 → 应用」中搜索 DataWise 卸载。
)
echo.
pause
exit /b %EC%
