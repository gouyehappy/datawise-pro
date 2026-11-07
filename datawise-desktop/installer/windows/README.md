# Windows 安装包

`npm run dist` / `dist:desktop` 在 Windows 上只打 **Inno Setup**。

产物：`datawise-frontend/release/DataWiseCLI-{ver}-windows-x64-setup.exe`

默认安装到 `%LOCALAPPDATA%\Programs\DataWiseCLI`，不要求管理员。用户数据在 `%APPDATA%\DataWiseCLI`。

| 文件 | 说明 |
|------|------|
| `DataWiseCLI.iss` | Inno Setup 脚本 |
| `ChineseSimplified.isl` | 中文语言包 |
| `license-zh.txt` | 许可协议文本 |

编译器由 `datawise-desktop/scripts/ensure-inno-setup.mjs` 在缺失时自动准备。

仅在明确需要时使用 WiX：`npm run dist:desktop -- --installer=wix`。
