; DataWise CLI — Windows installer (Inno Setup 6)
; 简洁向导：欢迎 → 目录 → 安装 → 完成（无许可页 / 无任务勾选页）
;
; Defines (from build-desktop.mjs):
;   MyAppVersion, MyAppSource, MyOutputDir, MyOutputBase, MySetupIcon,
;   MyWizardImage, MyWizardSmallImage

#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif
#ifndef MyAppSource
  #define MyAppSource "."
#endif
#ifndef MyOutputDir
  #define MyOutputDir "."
#endif
#ifndef MyOutputBase
  #define MyOutputBase "DataWiseCLI-setup"
#endif
#ifndef MySetupIcon
  #define MySetupIcon "icon.ico"
#endif

#define MyAppName "DataWise CLI"
#define MyAppNameShort "DataWiseCLI"
#define MyAppPublisher "DataWise"
; Override at compile time: /DMyAppURL=https://github.com/OWNER/REPO
#ifndef MyAppURL
#define MyAppURL "https://github.com/gouyehappy/datawise-cli"
#endif
#define MyAppExeName "DataWiseCLI.exe"
; Stable AppId — do not change casually
#define MyAppId "{{7F3E9C2A-4B1D-4E8F-9A6C-2D5E8F1B3C4D}"

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={localappdata}\Programs\{#MyAppNameShort}
DefaultGroupName=DataWise
OutputDir={#MyOutputDir}
OutputBaseFilename={#MyOutputBase}
SetupIconFile={#MySetupIcon}
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
WizardSizePercent=100
WizardImageStretch=yes
#ifdef MyWizardImage
WizardImageFile={#MyWizardImage}
#endif
#ifdef MyWizardSmallImage
WizardSmallImageFile={#MyWizardSmallImage}
#endif
; Per-user only — never show "install for all users" / UAC mode dialog
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
; 精简页面：跳过许可、开始菜单组、准备安装确认、附加任务
DisableWelcomePage=no
DisableDirPage=no
DisableProgramGroupPage=yes
DisableReadyPage=yes
DisableFinishedPage=no
UsePreviousAppDir=yes
CloseApplications=yes
CloseApplicationsFilter=DataWiseCLI.exe,jcef_helper.exe
RestartApplications=no
VersionInfoVersion={#MyAppVersion}.0
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription={#MyAppName} Setup
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}

[Languages]
Name: "chinesesimplified"; MessagesFile: "ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
chinesesimplified.WelcomeLabel2=将安装 [name/ver]。%n%n单击「下一步」选择安装位置。
chinesesimplified.FinishedLabel=安装完成。可从开始菜单或桌面启动。%n%n卸载：开始菜单 → 卸载 DataWise CLI。
chinesesimplified.LaunchAfterInstall=立即启动 DataWise CLI(&L)
english.WelcomeLabel2=This will install [name/ver].%n%nClick Next to choose the install folder.
english.FinishedLabel=Setup finished. Launch from the Start Menu or desktop.%n%nUninstall: Start Menu → Uninstall DataWise CLI.
english.LaunchAfterInstall=&Launch DataWise CLI

[Files]
Source: "{#MyAppSource}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\卸载 {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"

[Run]
; WorkingDir required — jpackage applauncher resolves runtime relative to cwd.
; Checked by default so setup launches only after files are fully written (postinstall).
Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Description: "{cm:LaunchAfterInstall}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\cef-cache"
Type: filesandordirs; Name: "{app}\user-data"
Type: files; Name: "{app}\*.log"
