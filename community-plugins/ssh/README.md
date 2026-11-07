# DataWise SSH Terminal（社区插件）

DataWise 社区插件：SSH 终端 + SFTP（`io.datawise.community.ssh`）。

| 项 | 说明 |
|----|------|
| 包格式 | `.dwp` |
| UI 桥 | `window.datawisePlugin` |
| Transport | `stdio-framed` |
| Sidecar | Rust `datawise-plugin-ssh` |
| 文件系统 | `sessionBound` + `intent.reveal-files` |
| 当前版本 | `0.7.11-beta.17`（见 `manifest.datawise.json`） |

协议（宿主只定义契约）：[`_private/docs/design/COMMUNITY_PLUGIN.md#platform`](../../_private/docs/design/COMMUNITY_PLUGIN.md#platform)  
按协议开发：[`_private/docs/design/COMMUNITY_PLUGIN.md#implementation`](../../_private/docs/design/COMMUNITY_PLUGIN.md#implementation)

## JumpServer / KoKo 怎么配

**JumpServer 模式** = 登录堡垒一次 → 工作台「资产」列表 → 点击进入某一台（终端经 `Opt>`；一次一台）。  
**Direct SSH** 不变（直连或 ProxyJump）。

| 表单字段 | 含义 |
|----------|------|
| JumpServer host | 堡垒地址（与网页同一台机，如 `192.0.2.32`） |
| JumpServer SSH port | KoKo SSH，默认 **2222**（不是网页 801） |
| JumpServer web port | 网页 / HTTP API 端口（如 801；拉「我的资产」全量列表） |
| JumpServer user / Password | 堡垒登录账号 |

连上后打开工具栏 **资产**（优先用网页 API 拉全量权限资产；失败再回退 `Opt> p`）。星标同步 JumpServer 网页收藏（不可用时落本地）。点「进入」在终端 `Opt>` 输入主机名/IP。空闲踢人时终端 keepalive 默认 60 秒。

经典 OpenSSH 跳板请继续用 **Direct SSH** + ProxyJump。

## 功能矩阵（摘要）

| 能力 | 状态 |
|------|------|
| 密码 / 私钥 / Agent 登录 | 已支持 |
| JumpServer / KoKo 堡垒 + 资产列表 | 已支持（登堡垒 → 资产面板 → Opt> 进入） |
| ProxyJump（连接表单 JSON / MCP） | 已支持（高级选项；JSON 校验见 `jumpHosts.ts`；JumpServer 模式勿用） |
| keyboard-interactive + TOTP | 已支持 |
| 复制会话（复用已认证 transport，免 MFA） | 已支持（`reuseAuthenticatedTransport`） |
| 端口转发 -L / -R / -D | 已支持；连上后自动启用已保存映射；重连恢复 |
| SFTP 浏览 / 上传下载 / tar·zip 解压 | 已支持（zip 需远端 `unzip`） |
| lzpack `.dbxz` 压缩上传 / 解压下载 | 已支持（本机编解码，远端零依赖；菜单「压缩上传为 .dbxz」） |
| 下载预取 + 大文件多流（≤4，默认 ≥256 MiB） | 已支持（偏好 `transfer_multistream_min_mib`，0=关） |
| 多格式预览（图片 / Office / PDF / 媒体 / 表格 / Markdown） | 部分：文本/图片/Markdown/浏览器媒体可用；Office/PDF/解码类图片诚实不可用（宿主 file-viewer 未进单文件包） |
| 外部编辑器 / 打开方式 + 回传监视 | 已支持（设置 → 传输；右键「打开方式」） |
| 本机半栏浏览并点选上传 | 已支持 |
| 快速命令（每作用域 ≤200，可选分组） | 已支持 |
| 每连接启动命令（≤20，交互 shell） | 已支持（`startup_commands` 偏好） |
| 会话导入预览（Xshell / Moba / WindTerm 等 8 源） | 已支持（流式 `import/preview/*`，脱敏导出；不落库） |
| 命令历史（PTY / 失败标记 / 连接范围） | 已支持 |
| Fig 静态补全 + 远端路径 generator | 已支持（精选 Wave 1+2 语料；完整 withfig 语料暂缓） |
| bash/zsh/fish OSC 7 + OSC 633 注入 | 已支持（SSH 注入 + 本机 shell integration；Telnet 被动 OSC 7；串口诚实不可用） |
| 终端配色方案（约 192 套可选覆盖） | 已支持（设置 → 终端；默认跟随宿主） |
| ZMODEM / trzsz | 已支持；收完自动定位下载目录 |
| 会话顶栏常驻资源条（CPU/MEM/DISK/NET） | 已支持（默认开；设置 → 终端可关；点条打开完整指标） |
| Docker 列表启停日志 | 基础面板 |
| OTP 独立库（list/save/generate/QR） | 已支持（`otp/*`） |
| 本机 editors / shells | 已支持（`local/editors/list`、`local/shells/list`） |
| Local Shell / Telnet / Serial | 已支持（插件内对话框 + 主终端 I/O） |
| VNC / RDP | 已支持（插件内对话框 + surface 收帧） |
| X11 转发 | 已支持（设置开关；新会话 `x11-req` + 入站 channel 桥接） |
| Task Provider（task/*） | 已支持（插件内 Task 对话框，envelope 契约） |
| MCP sidecar（`--mcp`）+ 只读门禁加固 | 已支持（`--mcp` stdio + 工作台 `mcp/*` RPC；**无**宿主 `contributions` MCP 声明——待宿主契约后再挂贡献点，避免空壳声明） |
| 七语 i18n | 不做（仅 en + zh-CN） |
| FIDO / PKCS#11 / GSSAPI | 未做 |
| latin-1 裸包上传流水线写 | 已接线（`sftpNameEncoding` + RawSftp `write_file_pipelined` / list decode） |

## 构建

```bash
node package.mjs
# node package.mjs --skip-backend
# node package.mjs --skip-frontend
```

产物：`dist/io.datawise.community.ssh-<version>-<os-arch>.dwp`

安装：DataWise → 社区插件 → 允许未签名开发包 → 本地安装。

## 许可

MIT（见 `LICENSE`）。
