# DW SSH 插件 · Motty / dbx-plugin-ssh 对标分析与本轮落地

> 日期：2026-11-27  
> 对象：`community-plugins/ssh`（`io.datawise.community.ssh`，v0.7.11-beta.37）  
> 蓝本：`E:\phenixanworkspaces\gitprojects\motty`（Go + viva 立即模式 UI）、`E:\phenixanworkspaces\gitprojects\dbx-plugin-ssh`（Rust sidecar + Vue 3 + xterm.js，v0.7.17-beta.1）  
> 目标：找出两个项目做得好的地方，对比 dw ssh 提炼可借鉴功能；**以「功能正常」为前提，同时拿到明确的性能提升**。  
> 约束：遵守 `community-plugins/AGENTS.md`（宿主零特例、文案在插件、偏好白名单），不改动协议线形状。

---

## 0. 结论先行

dw ssh 本身是 dbx-plugin-ssh 的早期派生（backend 约 60 个同名模块、`shared/frontend` 同源、`.dbx-ref` / `.dbx-clone` 痕迹），之后**各自演进**：

- dw 侧沿 Motty 方向补齐了终端设置与交互（见 `docs/motty-terminal-parity.md`，P0/P1/P2 全齐，仅 X-MOSH deferred），并加入 JumpServer、SSH config 双向同步、Copilot LLM、命令面板等自有能力；
- dbx 侧继续快速迭代（CHANGELOG 79 个版本，0.7.x 集中在近两个月），主线变成**生产事故复盘**：洪峰卡顿、SFTP 吞吐、只读门控、MCP 稳定性；
- Motty 的强项不在功能数量，而在**贯穿全仓的工程约束**：所有输入有界、所有 I/O 非阻塞、所有状态变更单线程、所有外发先脱敏。

因此本轮不重复堆功能，而是精确补上 **dw 落后于两个蓝本、且直接决定「正确性 / 性能」** 的三处：

| # | 项 | 来源 | 性质 | 状态 |
|---|-----|------|------|------|
| 1 | ZMODEM 合帧检测定界器（`sz` 无反馈修复） | dbx #307 / 0.7.15-beta.2 | 功能正确性（真实 bug） | ✅ 本轮落地 |
| 2 | MCP 只读连接 inspection-only 硬门 | dbx 0.7.17-beta.1 P0 | 功能正确性 / 安全 | ✅ 本轮落地 |
| 3 | 终端帧排水的字节+时间预算分片 | motty `pumpBudget` / dbx #302 | 性能（洪流不卡 UI） | ✅ 本轮落地 |

另修复了一个既有失败：只读门工具分类守卫漏了 `ssh_session_context`（守卫自 HEAD 起一直报警）。

---

## 1. Motty：特点与做得好的地方

Motty 是 Go 写的原生跨平台终端客户端（SSH / Local / Telnet / Serial / Mosh / RDP / VNC），UI 用 viva 立即模式渲染。它最值得学的不是某个开关，而是**选对度量单位**：`pumpBudget` 用「时间」而非字节做帧预算、`histBudget` 用「字节」而非行数做回滚上限、`workBudget` 用「工作量」而非正则超时做风险分类上限。

### 1.1 架构

- **单线程状态机 + 拉取式 drain**：`internal/workbench/terminal.go:32` 把传输抽象成 6 方法 `Shell{Drain,Write,Resize,Done,Err,Close}`，SSH/Local/Mosh/Telnet/Serial 全部实现同一接口；注释明确「everything touched only on the window thread」，网络 goroutine 只攒字节 + 唤醒。天然消除渲染态竞态。
- **数据流**：`sshconn.Shell reader → outputBuffer(1 MiB 有界) → Shell.Drain → pumpFor(时间预算) → applyOutput(注入过滤/传输检测/字符集) → term.Terminal.Write(VT500 状态机) → Row{ID,Version} 脏行 → rowCache 复用 → GPU 文字缓存按行 ID 命中`。
- **本地回显预测**（`predictedInput`）：高延迟时把未 echo 的输入画在光标格上，**不进终端 buffer**，不污染选区/查找。

### 1.2 性能工程（最值得抄）

| 机制 | 位置 | 关键量 |
|------|------|--------|
| 双层背压 | `internal/sshconn/shell.go:23,320,329,336`、`internal/workbench/terminal.go:1296-1371` | `maxPendingOutput=1<<20`、`pumpBudget=1s/240≈4.17ms`、`pumpSlice=32<<10`、`maxPumpBacklog=1<<20` |
| 唤醒合并 | `shell.go:329` | 仅「空→非空」才 `Wake()` |
| 洪峰回归测试 | `internal/workbench/terminal_output_backlog_test.go:82` | `TestPumpBacklogStaysBoundedUnderFlood`（120 次 wake、峰值 ≤8 MiB） |
| 回滚双上限 | `internal/term/terminal.go:24-31,149-160,520` | `defaultHistoryBytes=16<<20` + 行数上限，`histSpare` 复用被淘汰行 |
| 行级绘制缓存 | `internal/workbench/termview.go:39,58,102,106,163` | 缓存恒为一屏大小，运行再久不涨；`generation` 淘汰 |
| 脏矩形塌缩 | `internal/desktop/frame.go:25,56` | `maxDirty=16`，超了合成包围盒 |
| 内联图片异步解码 | `internal/term/image_decode.go:35-44,58,81` | `queueDepth=8 / 96 MiB / parallel=2`，超限丢弃而非堆积；`ApplyImages` 保序 |
| 后台持久化有界队列 | `internal/sessionlog/queue.go:10,82,93,113,123`、`internal/cmdhistory/queue.go:11,74,93` | `select/default` 非阻塞 + `ErrQueueFull`；100ms 批量；失败整批回滚；`Close` 排空 |
| 解析器热路径 | `internal/term/parser.go:68-85,233` | ground 态 ASCII 连续段批量 `printASCII`，`runBuf` 跨 Write 复用 |

`pumpFor` 的注释直接点名真实事故 `t8y2/motty#976`：此前「draining everything regardless」会让 `rx` 无限增长直到进程被 OOM kill。修法是**达到 1 MiB 就停止 drain，把字节留在 shell 的有界缓冲里反压发送方**，且按墙钟预算切片、保证一个 slice 总被解析。

### 1.3 正确性 / 健壮性

- **重连**（`internal/workbench/reconnect.go:14,42,46,57,81`）：1s 起指数退避封顶 30s；`ErrAuthFailed / ErrHostKeyChanged / ErrHostKeyRejected` 判为终止性错误**绝不重试**；`scheduleWake` 而非阻塞 sleep（隐藏/最小化窗口不绘制也要推进状态）。
- **known_hosts 事务化**（`internal/sshconn/hostkey.go:23,77,108,122,142,174,203,218,235`、`internal/knownhosts/write.go:45,72-81`）：临时文件 + fsync + **重读原文 CAS 校验** + rename；hashed host 用 HMAC-SHA1 匹配；只向已信任主机提供其已有 key type 的算法（避免「服务端加一种 key 就误报 changed」）。
- **终端模式回收**（`internal/term/reclaim.go:18`）：崩溃/断连后 `softReset` + 清 mouse/kitty/alt-screen，刻意保留 bracketed paste。
- **SFTP 可恢复状态机**（`internal/sftpclient/worker.go:23-27,88,101,338,2030-2047,3268`）：`maxQueuedRequests=32`、`DefaultParallel=2`、`ExistingPolicy{Fail,Replace,Resume,Skip}`；`Resume` 会 `verifyPrefix` 读回比对，确认前缀确属当前源文件才续，而不是盲目按 offset 续。
- **诊断导出**（`internal/diag/diag.go:19,34,86,98,112,129`）：纯文本分节、用户发送前可读完；脱敏忽略长度 <3 的短密钥、按长度降序替换、home 替 `~`。

### 1.4 AI / 安全

- **终端上下文采集三件套**（`internal/ai/capture/{wrap,tap,record}.go`）：`Wrap()` 用 nonce marker 包住命令一次性拿「退出码 + 结束边界」，marker 拆段使 echo 永不伪装成真 marker，未闭合引号超时 + Abort + Ctrl-C；`Tap` 从原始 PTY 字节旁路剥 marker、替换显示命令行；`recorder` 是逐字节 ANSI 状态机，`head/tail 64 KiB` 有界 + `[... N bytes omitted ...]`、UTF-8 边界分页。**不依赖终端内部 buffer**——正好是 xterm.js 架构最需要的。
- **单一 Gate**（`internal/ai/gate/gate.go:1-6,69,105`）：「Nothing else in the assistant touches a session, so the approval rules cannot be bypassed by a new caller」；工具定义单一来源（`tools.go:2-3`），in-app agent 与 MCP 共用；`dec.DisallowUnknownFields()` 严格解码。
- **命令风险分级**（`internal/ai/risk/risk.go:1-18,26,62-67,71,92,134`）：包注释诚实写明「NOT a security boundary」；`maxInput=8 KiB / maxDepth=10 / workBudget=4000` 三重资源上限；`sudo/chroot/env/timeout` 包装命令递归下探；输出 `Low→Critical` + `Safer` 建议。
- **Vault**（`internal/vault/vault.go:1-13,96,99,108`）：AES-256-GCM + 系统 keystore，**记录名也隐藏**（id 是名称的 keyed hash）；`maxFileSize=8 MiB` 按整文件大小设上限。

### 1.5 仅原生适用、不迁移

Go runtime `debug.SetCrashOutput` / `debug.SetMemoryLimit`、GPU 字形 atlas（在外部 viva 仓库）、`sync.Cond` 阻塞式 reader、ConPTY / 串口 / FIDO askpass、单实例与托盘、自更新替换运行中 exe、Mosh UDP/SSP。但 `ScreenDiff`、`screenState` 的「基线不可变 + diff 相对编号」、以及「签名 comment 绑定 version+file 防降级」的思路可借鉴。

---

## 2. dbx-plugin-ssh：特点与做得好的地方

一个 **79 个发布版本、227 个前端测试文件、1381 个 Rust 单测、46 个冒烟/性能脚本** 的成熟插件。真正优势不是功能多，而是三件事：

1. 把「性能」和「正确性」都做成**可单测的纯函数层**（`transfer_multistream.rs` / `progress_throttle.rs` / `transfer_throttle.rs` / `terminalFrameBatch.ts` / `virtualWindow.ts`），I/O 与决策分离；
2. **协议契约极度保守**：性能改造一律「线协议形状零变化」，靠 sidecar 内部并发提速，前端驱动方式不变；
3. CHANGELOG 是一部**生产事故复盘集**——大量条目是「用户实测卡死 → 定位到链路某一层 → 有界/滞回/降级修复」。

### 2.1 架构与协议

- `stdio-framed` + JSON-RPC 2.0，二进制帧带 channel 名；`shared/sdk/rust/dbx-plugin-sdk/src/lib.rs` 的 **`ChannelExecutor`** 按 channel 维护 `ChannelLane{running, pending: VecDeque}`，lane 内 FIFO 串行、lane 间完全并发（注释：「`l` 和 `s` 乱序会让远端 shell 看到错内容」）。
- `MAX_JSON_BYTES=8 MiB` / `MAX_BINARY_BYTES=64 MiB` / `DEFAULT_WORK_QUEUE_CAPACITY=256` / `HOST_REQUEST_TIMEOUT=330s`。
- 终端输出保留 **2 MiB 序号制环形回放缓存**（`backend/src/model.rs:4` `TERMINAL_REPLAY_LIMIT`），前端检测序号缺口即停乱序输出并调 `*/replay`；文件传输**逐块 RPC 确认，不依赖广播队列可靠送达**。
- 断连 reason 三分：`connection-disconnect` / `remote-exit` / `remote-killed`，分别对应「不自动重连 / 关工作台 / 保留工作台提示」，普通断开才走有界退避。
- `shared/frontend` 的**宿主桥适配公共代码唯一实现点**（`binaryEvent.ts` 零拷贝 `Uint8Array` 与旧桥 `dataBase64` 双形状归一化），四插件以相对路径引用，禁止各抄一份；跨语言 DTO 用 Rust serde round-trip 单测冻结镜像。

### 2.2 性能工程（与 dw 架构完全同构，可直接迁移）

| 机制 | 位置 | 关键量 |
|------|------|--------|
| 帧到达只入队、rAF 合帧排水 | `frontend/src/App.vue:4290-4343`、`lib/terminalFrameBatch.ts` | `TERMINAL_MERGED_FLUSH_BYTES`、`TERMINAL_PENDING_FRAME_LIMIT=1024`；控制帧 `stream=2` 绝不合并且保序；隐藏页回落 `setTimeout 0` |
| xterm 写节流 + DECSET 2026 | `lib/terminalWriteThrottle.ts` | `maxBufferBytes=1 MiB`、`holdFlushDelayMs=100`（防止 `2026h/2026l` 被 PTY 读边界切到两帧导致永久卡死） |
| 输出滞回门 | `lib/terminalBackpressure.ts` | `STRAINED=128 KiB / RESUME=64 KiB / CHUNK=32 KiB`；strained 挂起 gutter、关键字高亮、action-link 扫描，release 补扫一次 |
| 输入超时拥塞判别 | `lib/terminalInputGuard.ts` | `INPUT_TIMEOUT_FRESH_OUTPUT_GRACE_MS=2s`：超时但 2s 内仍有输出 ⇒ 判拥塞，**不误触发重连梯子** |
| SFTP 写在途窗口 | `backend/src/ssh.rs:13862-13890` | `SFTP_REQUEST_TIMEOUT_SECS=60`（默认 10s 会误杀大文件上传 #206）、`SFTP_WRITE_PIPELINE_DEPTH=64`（64×32 KiB=2 MiB，对齐 OpenSSH `sftp -R 64`） |
| 多流预读纯函数 | `backend/src/transfer_multistream.rs` | `MAX_STREAMS=4`、`ReadaheadWindow::{plan,take,complete}`；`(offset,len)` 精确匹配，任一并发读失败整窗 `degraded` 降级单流；**线协议零变化** |
| 进度节流 | `backend/src/progress_throttle.rs` | 100ms；首帧/边界/终帧必发，终态不节流 |
| 传输决策纯函数 | `backend/src/transfer_schedule.rs` | `EMA_ALPHA=0.3`、`MIN_SAMPLES_FOR_CONFIDENCE=3`、`DEFAULT_GAIN_THRESHOLD=0.10`；样本不足沉默、负收益仅日志不拦截 |
| 大目录虚拟滚动 | `lib/virtualWindow.ts` | `overscan=10`，上下等高 spacer；选中/范围选择作用于全量 `visibleEntries`（0.7.5-beta.2 修过 2000 行大目录滚动） |
| 零拷贝 ArrayBuffer | `lib/standaloneBuffer.ts`、`shared/frontend/binaryEvent.ts` | 宿主桥把 payload 放进 `postMessage` transfer list 时 Chromium 拒绝 `Uint8Array` view；转成独立 ArrayBuffer，已是独立时零拷贝 |
| 终态/ACK 兜底 | `composables/useTransferQueue.ts:76,77,487` | watchdog `[1000,2000,4000,8000]`、ACK 阶梯 `[3000,8000,15000,30000]` |

### 2.3 正确性 / 安全

- **SDK 级静默死亡防护（#286）**：`dispatch_json` / `WorkerPool` / `ChannelExecutor` 三层 `catch_unwind`、`lock_output` 遇 poisoned mutex 用 `PoisonError::into_inner()` 恢复；6 个具名回归测试（含 `ReorderingProbe` 用递减 sleep 复现乱序）。
- **ZMODEM 合帧兼容（#307）**：`lib/terminalZmodem.ts` 的 `createZmodemDetectionFeeder` 按完整 hex 首帧定界喂入 sentry，否则合帧会把 ZRQINIT 与回显/提示符拼进同一 burst，导致 `sz` 状态条/进度/完成提示全部静默消失。后端 `backend/src/zmodem_detect.rs` 另有 40s 事件窗 + 候选上限。
- **只读连接 inspection-only（0.7.17-beta.1 P0）**：`backend/src/mcp.rs:1169-1224`、`mcp_safety.rs`。放弃「只读命令白名单」，因为对 shell 解析不 sound——`cat <(rm -rf /tmp/x)`、输入重定向、`hostname NEW`、`date -s`、`git log --output=FILE`、`ss -K`、`journalctl --flush` 都能穿透；`ssh_terminal_input` 的「纯控制字符」门也挡不住一个 `\r` 执行 PTY 里已有的输入。要点：① 只读直接拒 `ssh_exec`/`ssh_terminal_input`；② 只读判定用 `host+port+username` endpoint identity 而非 connectionId 防换 id 绕过；③ 人工编辑后的命令与 `confirmDestructive` 都要重跑全部门；④ 进程级 kill switch；⑤ 只读下 SFTP 读工具仍有敏感路径 denylist。
- **shell integration 安全红线**（`backend/src/shell_integration/integration.bash`、`PROTOCOL.zh-CN.md:738`）：注入数据仅用于装饰与 cwd 跟踪，**绝不进入任何执行路径**（VS Code shell integration RCE 前车之鉴）；bash 用 flag-gated DEBUG trap + PROMPT_COMMAND 防自记账伪标记。
- **下载到…按连接记忆落点**（0.7.16 #303）：`lib/downloadToMemory.ts` 纯函数；`backend/src/local_downloads.rs` 的 `local/reveal` / `local/open` 路径白名单 = 持久化传输历史中已完成的下载 localPath，不构成任意路径打开原语。
- **取消/超时/错误分类**：`backend/src/exec.rs`（`SUDO_EXEC_TIMEOUT=90s`、`MAX_EXEC_OUTPUT_BYTES=16 MiB`、取消改优雅关闭通道，避免远端进程残留 + sudo timestamp 锁死）；`sftp/transfer/cancel(reason)` 让取消文案可归因。
- **CI 方法注册四路比对**（`scripts/mock_host_registry_check.mjs`）：backend 分派臂 ↔ mock 桩 ↔ 前端 invoke ↔ 协议文档。前端调用不存在的方法在运行时只是静默 `Method not found`，这是唯一的机器看护点。

### 2.4 测试与工程化

- 前端 227 个 spec、后端 1381 个 `#[test]`、46 个脚本；`docs/TEST_MATRIX.zh-CN.md` 记录 PTY 71.9 MiB/s、SFTP 上传 220–237 MB/s、下载 113–118 MB/s、replay 2.00 MiB/601 帧 SHA-256 校验。
- `docs/PERF_REPORT_SFTP_TURBO.zh-CN.md` **明确写出对本方案不利的结论**（本机 loopback 直传 14.9 vs lzpack 6.3 MiB/s、瓶颈是 Python 客户端每块一次 RPC、高 RTT 收益未实测）——这种「承认收益边界」的性能报告比只报峰值可信得多。
- CI：真实 `linuxserver/openssh-server` 容器跑 smoke、`cargo clippy -D warnings`、musl 静态矩阵、candidate 在 debian:11 / alpine:3 真执行 `--mcp`；`AGENTS.md` 规定一个 agent 一个 worktree、认证/命令执行/协议改动高风险需人工评审。

### 2.5 不可迁移

DBX 宿主契约（18 个 contributions、`host.ai` / `host/requestUserInput`、7 语 localizations）、非 SSH 协议（RDP/vendored ironrdp、VNC、Serial XMODEM）、ConPTY/Job Object 平台细节、`.dbxp` 打包链、`shared/frontend` 多插件收敛（单插件收益低）、Fig 全量 spec vendor（dw 已有）。

---

## 3. 三方对比矩阵

| 维度 | Motty | dbx-plugin-ssh | dw ssh（本轮前） | 结论 |
|------|-------|----------------|------------------|------|
| 形态 | Go 原生 + viva GPU | Rust sidecar + Vue/xterm | Rust sidecar + Vue/xterm | 与 dbx 同构，dbx 的可迁移性最高 |
| 洪流防护 | 双层背压 + 时间预算泵（最强） | rAF 合帧 + 滞回门 + 写节流 | 已移植 #302 全套，**排水循环无预算** | 补预算分片（本轮 #3） |
| ZMODEM | `Engine{Feed,TakeOutput,Leftover}` + `Settled` 延后两字节 | #307 检测定界器 | 有合帧但**无定界器 → sz 无反馈** | 补定界器（本轮 #1） |
| 只读 / AI 门控 | 单一 Gate + 风险分级（更完整） | inspection-only 硬门 + endpoint identity | 旧版白名单 + endpoint identity + kill switch | 补硬门（本轮 #2）；Gate/风险分级列后续 |
| 传输 | 可恢复状态机 + verifyPrefix | 多流预读纯函数 + 2 MiB 在途窗口 | 已有 `transfer_multistream` / `progress_throttle` / `lzpack` | 基本对齐 |
| 主机密钥 | 原子 CAS + 错误分类重连（最强） | — | 有 `host_key.rs` / `ssh_config_sync.rs` | 可继续对标 Motty |
| AI 上下文 | Wrap/Tap/recorder 旁路采集（最强） | `aiCapture` / `transcript` | `terminalBufferText` / `terminalOutputText` / Copilot | 建议后续立项 |
| 设置/交互 | 蓝本 | Warp 式 history 面板等 | Motty 对齐全齐 + 自有增强 | dw 强项，无需回搬 |
| 文件列表 | 原生 | 虚拟滚动（`virtualWindow`） | **全量 `v-for`** | 建议后续（改动面大） |
| 工程化 | 洪峰回归测试、纯文本诊断 | 79 版本复盘 + CI 四路比对 | 有 spec 体系、docs parity | 借鉴方法论 |

**dw 强于两个蓝本、无需「搬回」**：JumpServer/KoKo、lzpack、Fig 精选补全、WebGL、no-wrap、多流下载、Quick sudo 流、SSH config 双向同步、命令面板、终端背景图、gutter、OSC 52 ask、Motty 全套终端设置。

---

## 4. 本轮落地详解

### 4.1 ZMODEM 合帧检测定界器（功能正确性，dbx #307）

**问题**：dw 已有 `mergeTerminalFrames`（#302）把连续同 stream 帧合并成单段，但 `drainTerminalFrames` 直接把合并后的 `segment.data` 喂给 `zmodemSentry.consume()`。zmodem.js 只在「hex 首帧恰为 consume burst 末尾」时发出检测；`sz` 的 ZRQINIT 常与命令回显/提示符拼在同一批，尾部杂字节会让检测**永久丢失**——远端收不到 ZRINIT，进度条、完成提示全不出现。这是「功能不正常」的实锤，与 dbx 在 0.7.15-beta.2 修的是同一个坑。

**改动**：
- `frontend/src/lib/terminalZmodem.ts`：新增 `ZMODEM_HEX_SENTINEL`、`findHexSentinel`、`classifyHexHeader`、`tailSentinelPrefixLength`、`createZmodemDetectionFeeder`。空闲路径把完整 hex 首帧切成**独立 burst**，帧尾未完的哨兵/首帧残留（≤21 字节）留到下一帧拼合；字节保证逐个恰好喂入一次、顺序不变。
- `frontend/src/App.vue`：新增 `zmodemDetectionFeeder`（consume 闭包晚绑定 `zmodemSentry`，sentry 重建后自动跟随）；`drainTerminalFrames` 中 **`zmodemBusy` 时整帧直喂**（会话内是真流式解析，与 burst 边界无关），空闲时才经定界器。

**验证**：`terminalZmodem.spec.ts` 新增 6 个用例（普通输出转发、合帧首帧独占、跨帧拼合、帧尾哨兵前缀、形状破坏不丢字节、XON 首帧字节守恒），26/26 通过。

### 4.2 MCP 只读连接 inspection-only（功能正确性 / 安全，dbx 0.7.17-beta.1 P0）

**问题**：dw 的 `backend/src/mcp.rs` 只读门仍是「写工具拒绝 + `ssh_exec` 只读命令白名单」。白名单对 shell 解析不 sound：`cat <(rm -rf /tmp/x)`、`date -s`、`git log --output=FILE` 等形状可穿透；`ssh_terminal_input` 的「纯控制字符」门挡不住一个 `\r` 回车执行 PTY 里已有的输入。

**改动**：
- `backend/src/mcp.rs`：在 `is_write_tool` 门之后、敏感路径门之前加硬门 `read_only && matches!(name, "ssh_exec" | "ssh_terminal_input" | "ssh_multi_exec")` → 直接返回「use the SFTP read tools ... for inspection」。门在所有网络 I/O 之前，`confirmDestructive` 与人工编辑后的命令都无法放宽。SFTP 读工具的 `sensitive_read_path` 门、destructive 门、sudo allowlist 全部保留（普通连接仍生效）。
- 同步更新 3 组测试断言（改为「所有命令形状一律被拒」），并把 `ssh_session_context` 补进 `SAFE` 分类表——该守卫自 HEAD 起就一直因漏分类而失败，本轮顺带修复。
- 新增覆盖：进程替换 `cat <(rm -rf /tmp/x)`、`df -h`、`ls /tmp`、带 `confirmDestructive` 的灾难命令。

**验证**：`cargo test read_only` 14/14 通过（含 `every_tool_is_classified_for_the_read_only_gate`、`gate_combo_matrix...`）。

### 4.3 终端帧排水有界分片（性能，motty `pumpBudget`）

**问题**：#302 之后帧先入 `pendingTerminalFrames` 再由 rAF 排水，但排水循环 `while (frame)` 会一次性收齐**所有**连续序号帧。洪流（`tail -f` / 构建日志 / `sz` 大文件）时，一个 rAF 里可能同步合帧并扫过数 MiB，zmodem sentry / trzsz / 关键字高亮这条中间件链把主线程吃满，输入与绘制一起卡住。dw 已有「渲染侧降级」（写节流 1 MiB、outputGate 滞回、gutter 跳过重绘），缺的是**「接收/排水侧有界」**。

**改动**：
- 新建 `frontend/src/lib/terminalDrainBatch.ts`：`collectDrainBatch(pending, lastSequence, {maxBytes, budgetMs, now})` 纯函数，至少推进一帧（慢机器也前进），达到 `TERMINAL_DRAIN_BATCH_BYTES=256 KiB` 或 `TERMINAL_DRAIN_BUDGET_MS=4ms`（≈120Hz 半帧，对齐 motty）即停，剩余连续帧留在 map，返回 `hasMore`。
- `frontend/src/App.vue`：`drainTerminalFrames` 改用该纯函数；末尾 `if (hasMore) scheduleTerminalDrain()` 再排一次 rAF。序号连续性由 pending map 保证，`firstPending === lastSequence+1` 不会误触发 replay。

**收益**：与既有 256 KiB 合帧上限、1 MiB 写节流、128/64 KiB 滞回门叠加，形成「接收有界 → 排水有界 → 渲染有界」完整链路；单次 rAF 的同步工作量被钉在 256 KiB / 4ms，洪峰时输入响应与帧率不再被一个长任务拖死。

**验证**：`terminalDrainBatch.spec.ts` 7 个用例（空队列、预算内全收、序号缺口、字节预算续排、超大单帧仍前进、墙钟预算、控制帧保序）7/7 通过。

---

## 5. 验证结果

| 项 | 结果 |
|----|------|
| 前端新增/相关单测 | `terminalDrainBatch` 7/7、`terminalFrameBatch` 6/6、`terminalZmodem` 26/26 → **39/39 通过** |
| 前端全量单测 | 1000 用例 / **993 通过，7 失败**；4 个失败文件 = `ConnectingCard.spec.ts`(suite 加载)、`MonitorPanel.spec.ts`、`themeSync.spec.ts`(2)、`workbench.spec.ts`(3) |
| 失败基线核对 | HEAD 版 `App.vue` 同样缺 `toggleQuickMenu`（计数 0）、`uploadFilesOpen` 未接入收口（计数 3），失败集合与既有基线一致 → **本轮无新增失败** |
| 前端构建 | `node build.mjs` ✅，2865 modules，`ui/index.html` 自包含产物已更新（仅既有 chunk 体积警告） |
| 后端只读测试 | `cargo test read_only` **14/14 通过** |
| 后端全量测试 | 1119 用例 / **1099 通过，20 失败**；失败集中在 `file_watch` / `local_terminal` / `model::manifest_contract` / `monitor` / `otp_store` / `ssh::koko_login`，运行环境被沙箱拦截（`C:\Users\phenixan\.ssh\known_hosts` 不可读、`wsl.exe` 在程序黑名单）→ 环境限制，非代码回归 |
| Rust 编译 | 15 个 dead_code warning（仓库既有），无 error |

> 备注：工作区里 `community-plugins/ssh/README.md`（工作区删除）与 `docs/motty-terminal-parity.md`（已 staged 删除）处于删除状态，非本轮操作，未擅自恢复或提交。

### 交付物（v0.7.11-beta.38）

- `dist/io.datawise.community.ssh-0.7.11-beta.38-windows-x86_64.dwp`（21,853,168 字节，未签名）  
  SHA256 `a26ac4549f3a8a54cab02a2da37903b3b8a417aa4de8ee6325e2626a332876f1`
- 版本号已同步 `manifest.datawise.json` / `backend/Cargo.toml` / `frontend/package.json` 三处（README.md 已被删，未重建）。
- `node package.mjs` 完整链路通过：Rust release（60 个既有 dead_code warning）→ pnpm/vite build（2865 modules）→ 自包含 UI 内联 4,683,952 字节 → 组装 dwp。`unzip -t` 无错误，6 个文件、checksums.json 一致。
- 包内落地标记复核（minify 后按数值/字段特征）：内联 UI 含 `42,42,24,66`（ZMODEM 哨兵）×2、`262144`（256 KiB 预算）×9、`hasMore` ×3、`budgetMs`、`maxBytes`、`\x18B`；sidecar exe 含 `refused on read-only connections` ×8。
- 安装：DataWise → 社区插件 → 设置 → 允许未签名 → 本地安装该路径。

---

## 6. 后续建议（按 ROI 排序，本轮未做）

| 优先级 | 项 | 来源 | 理由 / 风险 |
|--------|-----|------|-------------|
| ~~P0~~ **已完成 (beta.39)** | **SFTP 文件列表虚拟滚动** | dbx | 见 §8：`sftpVirtualWindow.ts` 纯函数 + 阈值化窗口 + 搜索防抖，大目录 DOM 从 O(n) 降到 O(视口)，并配 16 个单测与 3 条模板结构守卫 |
| P0 | **AI 终端上下文采集层**（Wrap/Tap/recorder） | motty | dw 的 Copilot 目前依赖 `terminalBufferText` / `terminalOutputText`（受回滚裁剪）。旁路原始字节 + 有界 head/tail + 退出码边界，是「让 AI 拿到完整命令输出」的工程化正解 |
| P1 | **单一 Gate + 命令风险分级** | motty | 已有 inspection-only 硬门，但「模型 ↔ 会话唯一入口」与 `Low→Critical` + `Safer` 建议仍缺，决定 AI 功能能否被信任 |
| P1 | **主机密钥原子 CAS + 终止性错误不重试** | motty | `host_key.rs` 已有基础，补 CAS 重读校验与 `ErrHostKeyChanged` 分类；堡垒机场景尤其重要 |
| P1 | **CI 方法注册四路比对** | dbx | 一个脚本即可长期守住「前端调了后端不存在的 RPC」，运行时只是静默 `Method not found` |
| P2 | 「下载到…」按连接记忆落点 | dbx #303 | 纯函数 + 少量接线，体验项 |
| P2 | 洪峰回归基线脚本（`terminal_burst_test.py` 等价物） | motty / dbx | 把 4ms/256 KiB 预算做成可复现的性能回归，避免后续优化悄悄退化 |
| 不做 | Mosh、FIDO/PKCS#11、七语 i18n、云备份账号体系、宿主内置 SSH 特例 | — | 见 `docs/motty-terminal-parity.md` §6；ROI 低或违反宿主零特例 |

---

## 7. 一句话总结

Motty 教会我们「**选对度量单位**」（时间做帧预算、字节做回滚上限、工作量做分类上限），dbx 教会我们「**把每个生产事故沉淀成可单测的纯函数**」；dw ssh 的功能面已经不输两者，本轮补的是它们用真实事故换来的三块底层能力——**检测定界的正确性、只读门的不可绕过性、洪峰排水的有界性**。功能不减、协议形状不变、性能上限被钉死。

---

## 8. 第二轮：页面交互 / 功能实用性 / 流畅度（v0.7.11-beta.39）

用户把目标进一步收敛为「**页面交互合理且更稳、功能更全显实用、性能更稳且流畅**」。上一轮偏底层（协议/安全门/排水），本轮转向**用户可感知**的三条线。做法不是再堆功能，而是先把长期红灯的结构守卫当成线索——它们恰好暴露了真实的交互缺陷与欠账。

### 8.1 审计发现的 7 个既有失败（beta.38 基线）

| 失败 | 根因 | 性质 |
|------|------|------|
| `workbench.spec.ts` × 3 | `quickMenuOpen` / `agentModeOpen` / `highlightMenuOpen` / `columnsOpen` 与 4 个 `toggle*` 在**整个 src 中只存在于测试文件**（功能早已抽离/移除），清单陈旧 | 测试欠账 |
| `workbench.spec.ts` × 1 | **`uploadFilesOpen` 未接入 `closeToolbarPopovers()`** | **真实交互 bug** |
| `themeSync.spec.ts` × 2 | 期望 fallback `#131416/#d7d7db`，但 `style.css:3` 与 `shared/frontend/themeSync.ts` 均为 `#1a1b1e/#f0f0f3` | 测试陈旧（实现才是对的） |
| `MonitorPanel.spec.ts` × 1 | 期望缺少 `workbenchId`；`useMonitorPanel.ts:588` 用 `randomUUID()` 补它，否则批量条把新会话当孤儿关掉（连上即断环） | 测试陈旧（实现才是对的） |
| `ConnectingCard.spec.ts` suite | `vitest.config.ts` 缺 `server.fs.allow`，`../../../assets/plugin.svg?raw` 越过 `frontend/` 根被拒（`Denied ID`），整组 0 运行 | 测试工程配置缺失 |

### 8.2 本轮落地

**交互合理且更稳**

- `App.vue` `closeToolbarPopovers()` 补 `uploadFilesOpen.value = false`。此前上传文件列表浮层的触发按钮带 `@click.stop`，document click 收口不生效，而它又不在互斥族里 → 点开别的工具栏面板时旧浮层叠在上层、Esc 链也收不掉。
- `workbench.spec.ts` 结构守卫**泛化升级**：清掉 4 个已不存在的 ref 与 4 个不存在的 toggle 函数；新增 `declaredPopoverRoots`（正则提取模板里全部 `<Popover :open="x">`，兼容多行属性）与「每个受控 Popover 必须接入收口机制」的泛化断言。今后新增弹层漏接会立即失败，而不是靠人手维护清单。
- 修绿 `vitest.config.ts` / `themeSync.spec.ts` / `MonitorPanel.spec.ts`，让**全量测试重新可信**（此前 4 个文件长期红灯，会掩盖真实回归）。

**功能更全显实用**

- `i18n.ts` `remainingUiMessages["zh-CN"]` 补 `backpressure.engaged` / `backpressure.released` 中文翻译。此前大输出保护触发/解除时中文用户看到英文原文（en 表有、zh 表无）。
- 程序化选中（搜索后定位、右键操作、范围选择端点）落在窗口外时，通过 `scrollTopForRow` 自动滚回可见。

**性能更稳且流畅**

- 新增 `frontend/src/lib/sftpVirtualWindow.ts`：`computeWindow` 纯函数（参照 dbx `virtualWindow.ts`），**三处 dw 化加固**——
  1. `SFTP_VIRTUAL_THRESHOLD=200`：小目录返回全量窗口 + 零 spacer，DOM 几何与窗口化前完全一致，避免无谓行为变化；
  2. `start` 钳到 `total - visibleCount`：换目录后残留的大 `scrollTop` 不会让 `start > end`（列表突然全白）；
  3. `scrollTopForRow`：扣掉 28px sticky header，选中行不被表头遮住。
  行高 30px 与 `style.css:947` 对齐，`overscan=8`。
- `App.vue` 接线：`windowedEntries` 切片 + 上下等高 spacer + `fileRowsEl` / `@scroll` / `ResizeObserver`（缺失时退化成挂载测一次）+ 换目录/过滤后复位 scrollTop。选中、范围选择、右键仍作用于全量 `visibleEntries`。
- **模板用 `<template v-else>` 包住 spacer + 行列表**：dbx issue #151 的坑是 `v-else` 写在 `v-for` 上会绑定到紧邻的 `padTop` spacer，滚动过前几行后整个列表空白；本轮从结构上杜绝，并加了一条静态守卫。
- **SFTP 搜索 150ms 防抖**（`sftpSearchDraft` → `sftpSearch`）：此前每个按键触发 O(n) 过滤 + 全量行 diff，上万条目目录输入明显掉帧；现在输入始终跟手，footer 计数滞后一拍可接受。

### 8.3 验证（beta.39）

| 项 | 结果 |
|----|------|
| 本轮相关单测 | `workbench` 60/60、`sftpVirtualWindow` 16/16、`themeSync` 4/4、`MonitorPanel` 6/6、`ConnectingCard` 3/3 → **89/89** |
| **前端全量单测** | **121 文件 / 1022 用例全部通过（0 失败）** ← 基线 993/1000、4 失败文件已全部修绿 |
| 前端构建 | `node build.mjs` ✅ 2866 modules，Vue 模板（`<template v-else>` + spacer + v-for）编译通过 |
| 后端只读门 | `cargo test read_only` **14/14**（本轮未改后端，确认无回归） |
| 打包 | `node package.mjs` ✅，Rust release → 2866 modules → 内联 UI 4,686,652 B → dwp |

**交付物**：`dist/io.datawise.community.ssh-0.7.11-beta.39-windows-x86_64.dwp`（21,855,099 字节，未签名）  
SHA256 `8534b4b424b52bc75e04b19e705c6f3bd017e72fa199c456d0f0e71669503617`；`unzip -t` 无错误、6 文件、checksums.json 一致、manifest 版本 `0.7.11-beta.39`。包内复核：内联 UI 含 `padTop`×6 / `padBottom`×5 / `overscan`×2（虚拟滚动，minify 保留属性名）、`大输出保护已启动` / `大输出保护已解除`（中文提示）、`fileRowsEl`（滚动容器 ref）。

### 8.4 仍建议单独一轮（未做）

| 项 | 理由 |
|----|------|
| 换目录加载态改为绝对定位浮层（dbx 做法） | 目前 `loadingFiles` 时 `<template v-else>` 不渲染，列表会闪一下空、画面上下跳；属既有行为，本轮未改以免扩大改动面 |
| 大目录运行时回归夹具（2000 行 + 滚动/选择/右键） | 当前是纯函数单测 + 模板结构守卫，缺真实 DOM 滚动行为验证 |
| Motty AI 上下文采集层、单一 Gate + 风险分级 | 见 §6，仍为最高 ROI 的底层项 |

---

## 9. 第三轮：命令输入「又快又准」（v0.7.11-beta.40）

用户问「还可以添加啥功能，能让命令输入得又快又准」。这一问把焦点从「页面 / 传输」挪到**用户与 shell 之间那一行文本**。审计结论有点反直觉：

> **dw 的「快」侧浮层已经堆得很满，真正的空白全在「准」侧。**

### 9.1 现状盘点（去掉已实现项后的真空白）

已有且不必重复做：命令面板（Ctrl+Shift+P）、历史面板（Ctrl+Shift+H + fzf 子序列）、Fig 精选静态补全 + `compgen` 远端补全 + 路径 generator、AI Copilot（生成→审批→执行）、OSC 133/633 shell integration、危险命令确认（**仅粘贴与批量条 2 个调用点**）、输出关键字高亮、跨会话批量广播、自动应答/密码提示。

| 轴 | 真空白 | 证据 |
|----|--------|------|
| 快 | 快速命令是**死字符串**：`QuickCommand{name,command}` 无占位符、无插值、无单条快捷键 | `lib/quickCommands.ts:6`、`App.vue:9803 writeQuickCommand()` |
| 快 | **Ctrl+R 反向增量搜索不存在**；该组合键只在命令面板里作为 reconnect 的展示文案，连绑定都没有 | `App.vue:10736` vs `handleTerminalKey():3160` |
| 准 | **全角 / 智能标点纠错完全没有**：粘贴 `echo “hi”` 原样发给 shell，必然失败 | 全库无 `commandGlyphFix` 类实现 |
| 准 | **输入时零风险提示**：逐字敲 `rm -rf /` 全程无感，`dangerousCommands.inspect()` 只在粘贴与批量条跑 | `dangerousCommands.ts` 仅 2 个调用点 |
| 准 | 只读硬门只在 MCP 层，`sendTerminalBytes()` / `batch_terminal_input()` 不查 `canWrite` | `App.vue:3785`、`backend/src/ssh.rs:3055` |
| 准 | 输入行内语法着色、引号/括号闭合提示、中文标点误输检测 | 全库无（`keywordHighlight.ts` 只作用于输出） |

**参考项目证据**：Motty `internal/workbench/terminal_input_guard.go` 的 `commandGlyphFix` + `shellInputPrefix` 是「保守确认式纠错」的成熟范式（只替换待发送文本、不附 Enter、引号内/注释/转义/命令替换/heredoc 一律放弃）；`internal/ai/risk/risk.go` 的 `Classify` 四级分级 + `Reasons` 有界 + `Safer` 建议。dbx 侧最值钱的教训来自 CHANGELOG 的反复返工：`overlayArbiter.ts` 浮层键权仲裁器、`ghostAcceptKey.ts`、`suggestionGuard.ts` 都是因为「多个输入浮层同时抢按键、blur 竞争」而被迫补的——**所以本轮刻意不新增任何占按键的浮层**。

### 9.2 本轮落地（3 项，全是纯函数主导 / 零按键 / 不改 IPC）

| 项 | 轴 | 实现 |
|----|----|------|
| **全角 / 智能标点纠错** | 准 | 新增 `lib/terminalGlyphFix.ts`：15 个排版码点映射（全角空格 / NBSP / 8 种 dash / 4 种智能引号）、`advanceShellPrefix` 状态机（引号 / 转义 / `#` token 边界注释 / 换行逐行重置）、`UNSAFE_RE` 保守拒绝（控制字符、反引号、`$(`/`$[`/`${`、`<<`、fork bomb、非法 UTF-8、>4 KiB）。**接线复用既有粘贴确认弹窗**：`buildPasteConfirmation()` 新增 `glyphFix` / `glyphOnly`，短命令带智能引号也会弹一次显式确认，用户可选「使用 ASCII」或「按原文粘贴」。`confirmRiskyPaste()` 改为返回 `Promise<string \| null>`（实际要发送的文本），杜绝静默改写、不附回车。 |
| **输入时实时风险分级** | 准 | 新增 `lib/commandRisk.ts`：`stripCommandWrappers()` 有界剥离 sudo/env/timeout/watch/xargs；`assessCommandRisk()` 复用 `dangerousCommands` 的 14 条精确正则（critical）+ 2 条块设备规则、12 条 high、6 条 medium，`Reasons` 上限 6 条、`Safer` 替代建议、>8 KiB / NUL / U+FFFD **fail-closed 至少 high**；`decideRiskAction()` 默认 `warnFrom: "high"`（medium 不弹提示，避免逐字输入噪音）。`App.vue onData` 每次影子行变更后同步算一次（纯函数、有界、不拦截按键、不改发送内容），终端右下角非阻断提示条，dismiss 绑定具体行文本。 |
| **快速命令参数占位符** | 快 | 新增 `lib/quickCommandTemplate.ts`：只认 `{{name}}` / `{{name=default}}`，**刻意不认 `$1`/`${VAR}`**（shell 合法语法）；未闭合 `{{` 只报告不改写；填入值剥离 CR/LF 与控制字符、截断 200 字符（防参数偷偷注入第二条命令）；未填且无默认值列入 `unresolved`，UI 禁用执行按钮，**绝不把 `{{…}}` 原文发进 PTY**。`App.vue writeQuickCommand()` 检测变量 → 插值 Dialog（含实时命令预览）→ 确认后走原 PTY 键盘写入路径。编辑器补占位符说明。 |

三项都配中英 i18n；新 Dialog 已接入 `modalOpenStates` 与 Esc 链（泛化结构守卫自动验证）。

### 9.3 验证（beta.40）

| 项 | 结果 |
|----|------|
| 新增纯函数单测 | `terminalGlyphFix` 40/40、`commandRisk` 22/22、`quickCommandTemplate` 21/21、`dangerousCommands` 12/12 → **95/95** |
| 相关单测（含结构守卫 / i18n 键集合） | **155/155** |
| **前端全量单测** | **125 文件 / 1117 用例全部通过（0 失败）** ← 基线 1022 → +95 |
| 前端构建 | `node build.mjs` ✅ 2869 modules（Vue 模板编译通过） |
| Vue 类型检查 | `vue-tsc --noEmit`：本轮新增 5 个文件 **0 错误**；其余 30+ 条均为既有基线（`bellStyle`、`RightToolRail`、`i18n` 重复键、`copilot-kit/modelRouter` 等），本轮未新增 |
| 后端只读门 | `cargo test read_only` **14/14**（本轮未改后端，确认无回归） |
| 打包 | `node package.mjs` ✅ Rust release → 内联 UI 4,701,762 B → dwp |

**交付物**：`dist/io.datawise.community.ssh-0.7.11-beta.40-windows-x86_64.dwp`（21,861,863 字节，未签名）  
SHA256 `66b9780289c749111e4ffeafa35cdac22a35d3780594207f707d75932c6f117d`；`unzip -t` 无错误、6 文件、checksums 一致、manifest 版本 `0.7.11-beta.40`。包内复核：中文文案「检测到全角 / 智能标点」「使用 ASCII」「高风险命令」「更安全的做法」「填写命令参数」「可用双花括号占位符」全部命中，`glyphFix`×5 / `glyphOnly`×2 / `quickCommandVars`×9 / `command-risk-hint`×10 均入包。

### 9.4 后续建议（顺序有依赖，不可跳步）

| 优先级 | 项 | 前置条件 |
|--------|----|----------|
| P0 | **浮层键权仲裁器**（dbx `overlayArbiter.ts`） | 无。必须先做：dw 已有补全菜单 / 命令建议 / 历史面板 / 批量条 / 风险条 5 类浮层，直接加 ghost 或 Ctrl+R 会复现 dbx 的抢按键返工 |
| P1 | 行内 ghost 灰字建议 + Ctrl+R 增量历史搜索 | 仲裁器；`filterHistory()` fzf 打分与 `commandHistory.ts` 已就绪，只差绑定与元数据（`exitCode` / `durationMs` / `host`） |
| P1 | **只读连接终端键盘输入硬门** | 后端 `ssh.rs` 的 `enqueue_terminal_input` / `batch_terminal_input` 补 `read_only` 检查，与已落地的 MCP 硬门合围（当前人手敲字可绕过） |
| P2 | 参数即时提示 hint 条、输入行内语法着色、AI 生成「先插入再执行」 | 仲裁器 |
| P2 | Fig generator 通道接通（`generatorScheduler.ts` 仍是 stub）、`--help` 生成 spec | 需在只读/风险门内调用 `ssh/exec` |

**本轮刻意未做**：任何新增快捷键绑定、任何拦截逐字输入主链路的改写。理由是「确保功能正常」优先——纠错走用户显式确认、风险分级只提示不拦截、模板插值填完才发，三条都把「不改用户已输入的字节」当作红线。

---

## 10. 第四轮：键权仲裁器 / Ctrl+R / 只读批量门（v0.7.11-beta.41）

> 承接 §9.4 的 P0 前置项。目标是继续推进「命令输入又快又准」，同时把上一轮埋下的**工程债**（多个浮层抢按键）先还掉，再谈加速。

### 10.0 勘误：ghost 不是空白

§9.4 把「行内 ghost 灰字建议」列为 P1 待做，**复核后不成立**。dw 早已完整实现：

| 能力 | 证据 |
|------|------|
| 行内灰字与定位 | `App.vue:1344 commandSuggestGhost`、`:1309 commandSuggestGhostTextStyle()`、`:10969 ghostRowAvailableCells()`、`:13566` 模板 |
| 整段 / 词块接受 | `matchesGhostFullAccept` / `matchesGhostWordAccept`（`commandSuggest.ts`）、`resolveCommandSuggestKey`、`ghostCommitRemainder` |
| 可配置接受键 | `interactionPrefs.acceptSuggestionKey`（→ / Tab / Shift+→）、`acceptKeyHintMenuOpen` 键位胶囊菜单、`SettingsDialog.vue:3447` |
| 防误触与归属 | `ghostClickGuard.ts`、`completionArbitration.ts`（Fig vs line suggest 单一 owner） |

所以本轮**不重复造 ghost**。真正空白是 §9.4 的 P0：`handleTerminalKey()` 里 Esc 是 7 层手写 `if` 链、裸 ↓ 是 5 个手写 `!open` 门——正是 dbx `IMPL_PLAN_OVERLAY_KEY_ARBITER.zh-CN.md` 记录的「#150/#152 整个返工周期证明超过手工维护能力」的形态。dw 甚至已有 `interactivePromptGatePending()`（#150 补丁）散落在链外，说明这个坑已经踩过一次。

### 10.1 审计：三条真空白 + 一处顺带修的真实 bug

| 项 | 轴 | 迁移前状态 | 证据 |
|----|----|-----------|------|
| 单一键权仲裁器 | 稳 | **无**。Esc 7 层 if、↓ 5 个 `!open`，新增浮层要改 N 处门 | `App.vue` 迁移前 `handleTerminalKey()`；dbx `frontend/src/lib/overlayArbiter.ts` + `docs/IMPL_PLAN_OVERLAY_KEY_ARBITER.zh-CN.md` |
| Ctrl+R 增量历史搜索 | 快 | **无**。`isHistoryOverlayShortcut` 只认 Ctrl+Shift+H；命令面板 `session.reconnect` 显示的 `"Ctrl+R"` 是**死文案**（`reconnectNow` 从未绑定该键） | `lib/historyPanel.ts:22`、`App.vue:10834`；dbx `terminalHotkeys.ts:63`（command-history 默认含 Ctrl+R）、`historyPanel.ts:303 commandHistoryHotkeyPassthrough` |
| 只读连接批量广播门 | 准 | **无**。`write_terminal` / `write_terminal_async` / `batch_terminal_input` 三条 PTY 写入路径均不查 `read_only`；`ensure_writable()` 只管 SFTP，`exec()` 只在 `sudo && read_only` 时拒 | `backend/src/ssh.rs:3039 / :3060 / :3112 / :3296 / :3507` |
| 批量条全角纠错失效 | 准 | **真 bug**。`sendBatchCommand()` 拿到 `confirmRiskyPaste()` 返回的已纠错文本却仍用原始 `draft` 发送（§9 的纠错在该路径不生效） | `App.vue` 迁移前 `sendBatchCommand()` |

### 10.2 落地三项

| 项 | 设计 |
|----|------|
| **overlayArbiter 键权仲裁器**（P0） | 新增 `lib/overlayArbiter.ts`：`ARBITER_PRIORITIES` 一张表（7 键维度 × 8 浮层）+ `resolveKeyOwners()` 唯一决策点 + `buildTerminalOverlayClaims(state)` 状态摊平 + `resolveTerminalOverlayOwners()` 便捷入口。**判定逻辑零迁移**（dbx 范式）：各浮层的开合门仍在原处，仲裁器只接收已判定布尔，只收口「谁持有键」。优先级数值从 dw **真实链序**逐字推导（与 dbx 表不同：dw 的 `historyPanel` 在 `completion` 之前），由 spec 快照钉死。<br>接线：`App.vue terminalOverlayState()` → Esc 分支从 7 层手写 if 改为 `switch (owners.escape)` 查表分发；裸 ↓ 的 5 个 `!open` 门改为 `owners.arrowDown === null`。**新增第 9 个浮层 = 表里加一行 + state 加一个布尔，Esc 链 / ↓ 门零改动**（spec 有演练用例）。 |
| **Ctrl+R 增量历史搜索**（快） | 新增 `lib/historyHotkey.ts`：`isCommandHistoryHotkey()`（Ctrl/Cmd+R + 既有 Ctrl/Cmd+Shift+H）、`commandHistoryHotkeyPassthrough({enabled, alternateActive})`（迁移 dbx #108）、`resolveHistoryHotkeyAction()` 唯一派发点。**两条必须透传远端的场景**：总开关关闭时把 Ctrl+R 归还 readline 原生 reverse-i-search（旧版会被吞键）、alternate 屏时让给 vim/less/tmux 的 redo；dw 额外保留 #150 门（交互提示待答时 ^R 落到远端，不打进 OTP）。<br>接线：`handleTerminalKey` 查表 `open / passthrough / none`，`open` 直接复用既有 `toggleHistoryPanel()`（**已内置 `focusHistorySearch()`**，打开即聚焦搜索框，Warp 心智）。修掉命令面板 `session.reconnect` 的 `"Ctrl+R"` 死文案，中英 `historyPanel.titleShortcut` 更新为双入口。 |
| **只读批量广播门**（准） | 后端 `ssh.rs` 新增 `batch_input_read_only_error()` 纯守卫，`batch_terminal_input()` 对每个 target 先判 `session.read_only`，拒绝即计入 `failed` 并在结果行给出原因。前端 `sendBatchCommand()` 提前用 `canWrite` 拦一次并给可见提示（中英 i18n），避免用户点完才看到失败行。<br>**刻意不硬拒单条 PTY 输入**：只读连接仍需 `ls` / `top` / `systemctl status` 巡检，且 PTY 是字节流后端无法可靠分类；这条路径由 §9 的 `commandRisk` 非阻断提示覆盖。这与 §9.4 「两处 read_only 检查」的建议有偏差，理由即在此——全面硬拒会造成功能回退。 |
| **批量条纠错修复**（顺带） | `sendBatchCommand()` 改用 `confirmRiskyPaste(draft)` 的返回值作为实际发送文本，§9 的全角/智能标点纠错在批量广播路径上终于生效。 |

三项共 **29 个新单测**（仲裁器 15 + 历史热键 14）+ 1 个 Rust 单测；全部纯函数主导、不改 IPC 协议形状、不拦截逐字输入主链路。

### 10.3 验证（beta.41）

| 项 | 结果 |
|----|------|
| 新增纯函数单测 | `overlayArbiter` **15/15**、`historyHotkey` **14/14** → 29/29 |
| Rust 新增单测 | `batch_input_read_only_guard_refuses_write_broadcast` ✅；`cargo test batch_input` **3/3**、`cargo test read_only` **15/15** |
| 相关前端单测（含结构守卫 / i18n / 历史 / 命令面板） | **134/134** |
| **前端全量单测** | **127 文件 / 1146 用例全部通过（0 失败）** ← 基线 1117 → +29 |
| 前端构建 | `node build.mjs` ✅ 2871 modules（Vue 模板编译通过） |
| Vue 类型检查 | `vue-tsc --noEmit`：本轮新增 2 个文件 **0 错误**；总 32 条均为既有基线（`bellStyle` ×3、`Trzsz` 回调签名、`Promise<boolean>` vs `void`、i18n 重复键等），改动区无新增 |
| 后端全量 | `cargo test` 1111 passed / 9 failed —— 9 个全部为沙箱环境限制（`wsl.exe` 被安全策略拦截、桌面路径、本机网卡、manifest parser 契约），**与本轮 `ssh.rs` batch 路径无关**，相关测试全绿 |
| 打包 | `node package.mjs` ✅ Rust release → 内联 UI 4,703,991 B → dwp |

**交付物**：`dist/io.datawise.community.ssh-0.7.11-beta.41-windows-x86_64.dwp`（21,861,917 字节，未签名）  
SHA256 `f153eebbdbae6200710f69e45eb83c7648f44f3ae56c112e460cf2fa9a9ede8f`；`unzip -t` 无错误、6 文件、checksums 一致、manifest 版本 `0.7.11-beta.41`。包内复核：`ghostTabAcceptEnabled`×2 / `interactivePromptPending`×2 / `alternateActive`×4 / 优先级数值 700…100 均在（仲裁器与 Ctrl+R 门未被 tree-shake）；旧 7 层 Esc 链特征归零；reconnect 死文案已改空；sidecar 只读门字符串 ×4；中英新文案「命令历史 (Ctrl+R / Ctrl+Shift+H)」「只读连接：已禁用批量命令广播。」均命中。

> 收尾优化：`handleTerminalKey` 开头对 `terminalOverlayState()` **只仲裁一次**并复用给 Esc 链与裸 ↓ 门（所有前置分支都会 return，状态在到达 Esc 前不会被改写），避免每次按键重复摊平 claims。改动后已重新全量回归 + 重打包，上表数字为最终包。

### 10.4 更新后的后续 ROI

| 优先级 | 项 | 说明 |
|--------|----|------|
| P1 | 历史元数据 `exitCode` / `durationMs` / `host` | 仲裁器已就位，`commandHistory.ts` 的 `markHistoryExit` / shell integration 已有数据，只差面板展示与排序权重 |
| P1 | 参数即时提示 hint 条 / 输入行内语法着色 | 现在可通过仲裁器一行 claim 接入，不会再抢按键 |
| P2 | Fig generator 通道（`generatorScheduler.ts` 仍是 stub）、`--help` 生成 spec | 需在只读/风险门内调用 `ssh/exec` |
| P2 | 2000 行真实 DOM 滚动回归夹具、换目录加载态改绝对定位浮层 | 承接 §8，属流畅度验证欠账 |

**备注**：工作区里 `community-plugins/ssh/README.md`（删除）与 `docs/motty-terminal-parity.md`（staged 删除）仍为非本轮操作的删除状态，未擅自恢复或提交；本轮改动**未 git commit**。

---

## 11. 第五轮：历史可信度 / 参数即时提示 / 加载态不闪空（v0.7.11-beta.42）

> 承接 §10.4 的两项 P1，并结清 §8.4 的流畅度欠账。焦点仍是「命令输入又快又准」与「页面交互更稳、更流畅」；同时把 β.41 承诺的「新增第 9 个浮层只加一行」做一次**真实演练**，而不是留在纸面。

### 11.1 审计：三处待补 + 一处隐含边界

| 项 | 轴 | 迁移前状态 | 证据 |
|----|----|-----------|------|
| 历史结果元数据 | 实用 | **只有 `failed: boolean`**。`markHistoryExit()` 把 OSC 633 D 的退出码压成一个布尔，耗时与来源主机完全丢弃；历史面板除了「时间 / 置顶 / 失败红字」没有任何可判断「这条命令上次跑成没有」的信息 | `lib/commandHistory.ts` `HistoryEntry` / `markHistoryExit`；`App.vue:4305` |
| 参数即时提示 | 快 / 准 | **零**。命令面板、历史面板、Fig 补全、ghost、AI Copilot 都在「找命令」，没有任何一层在用户敲 `-` 时告诉他这个命令有哪些选项 | 全库无 `argHint` / `parameterHint` 类模块；§9.4 把此项列为 P2「需仲裁器前置」 |
| SFTP 换目录加载态 | 流畅 | `loadingFiles` 用 `v-if` 把**整个行列表替换**成一个空态 div，列表 DOM 被卸载 → 闪空、滚动位置丢失、虚拟窗口重置 | `App.vue` 迁移前 `<div v-if="loadingFiles" class="empty">` + `<template v-else>` |
| D 帧字段顺序 | 准（隐含） | `applyCommandMarker()` 在 `lastExitCode` 分支里就写历史，而 `lastCommandDuration` 在**下一行**才赋值；即使扩展元数据也拿不到耗时 | `App.vue` 迁移前 `applyCommandMarker()` |

### 11.2 落地三项

| 项 | 设计 |
|----|------|
| **历史执行元数据**（P1） | `lib/commandHistory.ts`：`HistoryEntry` 增 `exitCode` / `durationMs` / `host`（host 有 80 字符上限 + 控制字符清洗）；新增 `markHistoryResult(history, command, result, connectionId?)`（只覆盖**实际提供**的字段，D 帧没给耗时不会抹掉旧值），`markHistoryExit` 保留为兼容薄封装；`pushCommandHistory` 重跑时继承上次结果直到下个 D 帧（与既有 `failed` 同语义）；`coerceEntry` 对 localStorage 里的元数据做有限数值 / 长度硬校验，毒值被丢弃；新增 `historyResultBadge(entry, labels)` 纯函数产出 `{tone, exitText, durationText, hostText, text}`，复用 `formatCommandDuration()`。<br>`lib/historyPanel.ts`：`historySuccessBoost()` = 上次 exit 0 加 **6 分**（刻意很小，fzf 子序列分与置顶 +40 仍占主导），只打破近平分，不重排结果；空 query 保持 store 顺序不变。<br>接线：`applyCommandMarker()` 把 stamp 移到 handler **末尾**并一次带上 `exitCode` / `durationMs` / `connection.name || host`，与 D 帧字段到达顺序无关；历史面板每行加结果徽章（`ok / fail / neutral` 三态 + hover 全文），中英 i18n 各 3 键。 |
| **参数即时提示条**（P1） | 新建 `lib/argumentHint.ts`：**27 条**常用命令的静态 spec（git / kubectl / docker / systemctl 带子命令，另有 journalctl / ls / cp / mv / rm / tar / curl / ssh / scp / find / grep / tail / chmod / chown / mkdir / df / du / ps / kill / npm / cargo 等），中英双语文案内置。`resolveArgumentHint(line, locale)` 纯函数：4 KiB 行上限 / 128 token 上限 / 5 flag 上限；引号感知地取最后一段管道命令、剥离裸 `sudo` 与 `VAR=value` 前缀、按当前 token 前缀过滤 flag、子命令覆盖 usage；反引号 / `$(` / heredoc / 控制字符一律**静默放弃**。<br>`App.vue` 复用输入影子行 `liveRiskLine`（与 §9 风险条同源）计算，非阻断、零 IPC、零快捷键、不改一个字节；右下风险条在右、提示条在左，dismiss 绑定具体行文本，alternate 屏与交互提示待答时不显示。 |
| **SFTP 加载态浮层**（P2 欠账） | `.file-table` 加 `position: relative`，加载态改为 `v-if="loadingFiles" class="file-loading-overlay"` 的**绝对定位浮层**（`inset: 28px 0 0 0` 避开 28px sticky 表头，半透明遮罩吞掉误点），footer 用 `z-index: 6` 保持可见；行列表与两个 spacer **始终渲染**，彻底去掉 `v-if/v-else` 整块替换。结构守卫同步更新为「浮层存在 + 旧空态不存在 + spacer 附近无 `<template v-else>`」。 |

### 11.3 两处值得记下的细节

1. **`Number(null) === 0` 边界**：D 帧未提供耗时时传入 `null`，若不特殊处理会被记成合法的 `0ms`（并在徽章里显示）。`finiteInteger` / `finiteNonNegative` 显式把 `null` / `undefined` / `""` 判为「未知」，新增单测钉死。
2. **仲裁器第 9 浮层实战演练**：把提示条登记为 `OverlayId = "argumentHint"`，实际改动是 `ARBITER_PRIORITIES.escape` **加 1 行**（`argumentHint: 50`，最低）、`TerminalOverlayState` 加 1 个布尔、`buildTerminalOverlayClaims` 的 visible map 加 1 行、Esc 消费 `switch` 加 1 个 `case`（**分发，不是判定**）。裸 ↓ 门、所有既有浮层的开合判定、7 层旧链的优先级数值**零改动**。`overlayArbiter.spec.ts` 加 3 条演练：提示条单独可见时 Esc 归它；历史面板 / 补全同时开时让位；不认领任何导航与接受维度。

### 11.4 验证（beta.42）

| 项 | 结果 |
|----|------|
| 新增 / 修改单测 | `argumentHint` 11/11、`commandHistory` +11、`historyPanel` +1、`overlayArbiter` 18/18（+3 演练）、`workbench` 结构守卫更新后通过 |
| **前端全量单测** | **128 文件 / 1170 用例全部通过（0 失败）** ← 基线 127 文件 / 1146 → +1 文件 / +24 用例 |
| 前端构建 | `node build.mjs` ✅ **2872 modules**（基线 2871，+1 新模块），`ui/index.html` 自包含 |
| Vue 类型检查 | `vue-tsc --noEmit`：本轮新增 / 修改的 `lib/*.ts` **0 错误**；总 32 条全为既有基线（`bellStyle`、`Trzsz` 回调、`Promise<boolean>` vs `void`、i18n 重复键等），改动区无新增 |
| i18n | `remainingUiMessages` en 365 / zh-CN 365 完全对齐，新增 3 对键双端命中 |
| Rust 回归 | `cargo test read_only` **15/15**（本轮未改后端，仅确认无回归） |

### 11.5 交付物（beta.42）

`dist/io.datawise.community.ssh-0.7.11-beta.42-windows-x86_64.dwp`（**21,871,234 字节**，未签名）  
SHA256 `66e901ab5470300b5dc3cf5a9ea842eadad9c66cbdd964c8929587d291bae7dc`；`unzip -t` 无错误、6 文件、checksums.json **5/5 一致**、manifest 版本 `0.7.11-beta.42`。包内复核：`command-arg-hint` ×16 / `history-item-result` ×4 / `file-loading-overlay` ×3 / `argumentHint` ×15，中英新文案（参数提示 / 常用选项 / 关闭本条提示 / Argument hint / Dismiss this hint / exit {code} / 退出码 {code}）均命中；虚拟滚动 `padTop` ×6 / `padBottom` ×5 / `overscan` ×2 仍在；旧 `loadingFiles` 空态特征归零。内联 UI 4,728,282 B（β.41 为 4,703,991 B，+24,291 B）。

安装：DataWise → 社区插件 → 设置 → 允许未签名 → 本地安装上述路径。

### 11.6 更新后的后续 ROI

| 优先级 | 项 | 说明 |
|--------|----|------|
| P1 | Fig generator 通道（`generatorScheduler.ts` 仍是 stub）、`--help` 生成 spec | 本轮 hint 是**静态** spec；接远端 `--help` 需在只读 / 风险门内调用 `ssh/exec`，并补缓存与超时 |
| P2 | 历史元数据驱动更多排序 / 过滤（按 host 分组、只看失败命令） | 数据已落库，纯 UI 层可加 |
| P2 | 2000 行真实 DOM 滚动回归夹具 | 承接 §8；本轮只改加载态，未补性能夹具 |
| P3 | 输入行内语法着色 / 引号闭合 / 宽字符列号换算 | §9.1 里唯一未碰的「准」侧空白 |

**备注**：`community-plugins/ssh/README.md`（删除）与 `docs/motty-terminal-parity.md`（staged 删除）仍为非本轮操作的删除状态，未擅自恢复；本轮改动**未 git commit**。

---

## 12. 第六轮：历史过滤 / 远端 `--help` 选项 / 2000 行滚动夹具（v0.7.11-beta.43）

用户「继续」。按 §11.6 的 ROI 推进三项；动手前复核现状，发现上轮一处结论需要勘误。

### 12.0 勘误：Fig generator 通道不是 stub

§11.6 把 P1 写成「`generatorScheduler.ts` 仍是 stub、`--help` 生成 spec 未接」。复核结果：

- `frontend/src/lib/completion/fig/generatorScheduler.ts` 确实只有 `FigGeneratorSlot` / `FigGeneratorRun` 两个类型，但那只是**类型契约文件**；
- 真正的声明式 generator 通道**早已接通**：`App.vue` 的 `CompletionController({ generators: { slots, run } })`，`slots` 走 `pathCompletionSlots()`，`run` 走 `runPathCompletion()` → `window.datawisePlugin.invoke("sftp/list" | "sudo/listDir")`；`pathGenerator.ts` 另有 8s TTL / 64 条目录列表缓存；
- 所以本轮 P1 不是「补调度器」，而是**补静态 spec 之外的第二条来源**：从远端 `<cmd> --help` 动态生成选项，并把「只读 / 风险门 + 缓存 + 超时」落到这条新通道上。

### 12.1 历史面板 host 分组 / 失败过滤（P2，数据已落库，纯 UI 层）

`historyPanel.ts` 新增 `HistoryFilter`、`historyHosts()`、`historyEntryFailed()`、`applyHistoryFilter()`；`filterHistory(history, query, filter?)` 扩展**可选第三参**（两参调用逐字节兼容）。

- **权威字段优先**：`exitCode`（beta.42 新增）存在时压过 legacy `failed` 布尔，避免「上次失败、这次成功」被永久误判；`exitCode` 未知才回退 `failed`。
- `historyHosts()` 复用 80 字符上限与控制字符清洗，去重 + `localeCompare` 稳定排序；过滤值走同一清洗，防止带控制字符的 host 选不中。
- 面板头新增 host 下拉（「全部主机」+ 当前 scope 内去重主机）与「只看失败」toggle + 「清除过滤」；badge 从单一计数改为 `filtered / total`；空态区分「被过滤空」与「历史真的空」。
- 过滤切换统一经 `setHistoryFilter()` / `clearHistoryFilter()`，内部 `clampHistoryIndex` 保证高亮不越界；`historyScopedEntries` 抽成 computed 供列表、host 下拉、badge 共用。
- 中英各 5 个新键；CSS 新增 `.history-filter-bar` 族（含 `is-on` 破坏性色 + `aria-pressed`）。

### 12.2 远端 `--help` 动态参数 spec（P1，保守确认式）

**设计红线**：绝不自动跑远端命令。静态 spec 未命中、且用户正在敲 `-` 时，提示条只显示一个「从远端 `--help` 获取选项」按钮；**用户显式点击**才经 `ssh/exec` 拉取。零按键、零定时器、零自动 IPC、不改写一个发送字节。

新建两个纯函数模块：

| 模块 | 职责 |
|------|------|
| `lib/helpSpec.ts` | `isHelpSpecCommand()`（命令名正则 + 48 字符上限 + 破坏性/交互式黑名单 + `mkfs.` / `ip-` / `git-` 前缀拒绝）、`helpSpecCommand()`（**只**产出 `<cmd> --help`）、`parseHelpFlags()`（GNU / argparse / cobra 三种选项列，剥 ANSI、按缩进行判定、2+ 空格切列、token 级去重、400 行 / 512 字符 / 40 flag / 120 描述有界）、`mergeHelpFlags()`（静态优先、token 级前缀过滤、去重截断） |
| `lib/helpSpecScheduler.ts` | `createHelpSpecScheduler()`：5 分钟成功 TTL、30 秒负缓存（远端不可达不反复打）、32 条 LRU、并发上限 2（超限直接返回 null **不排队**）、`clear()` 用 generation 作废在途结果、`run`/`now`/`parse` 全注入可测 |

`argumentHint.ts` 新增 `hintCommandFromLine()` 并让 `resolveArgumentHint()` 复用它——**静态与远端共用同一套保守判定**（控制字符、命令替换、heredoc、sudo/环境变量剥离、token 上限），远端按钮不可能出现在我们本来就不会标注的行上。

接线安全参数：`sudo:false`、`timeoutSecs:5`（后端 clamp 下限）、前端 `timeoutMs:9000`、结果按 `sessionId` 隔离缓存、会话切换清空。read-only 连接**允许**（`--help` 是读操作，后端只在 `sudo` 时拒绝），但 `sudo` 绝不请求。解析失败 / 超时 / 异常一律静默，提示条显示「读取远端帮助失败 / 未解析到选项 + 重试」。

仲裁器第 9 浮层 `argumentHint` 的 visible 改为 `argHintVisible || remoteHelpVisible`，Esc 仍走单一 owner 的 `dismissArgumentHint()` —— **没有新增第 10 个浮层、没有改优先级表**。

### 12.3 2000 行虚拟滚动回归夹具（P2，结清 §8 欠账）

**边界说明**：`vitest.config.ts` 是 `environment: "node"`（无 DOM / 无 ResizeObserver），无法挂载 App.vue 数真实节点，因此夹具落在「渲染层唯一依赖的纯计算」上，模板窗口化由 `workbench.spec.ts` 结构守卫覆盖（断言模板中不存在全量 `v-for="entry in visibleEntries"`、且仍是 `windowedEntries`）。

`sftpVirtualWindow.spec.ts` 新增 5 条夹具：构造 2000 行数据，模拟**非整行步长**（37px 从顶滚到底 / 131px 从底滚回顶）的连续滚动序列，每帧断言

- `padTop + 已渲染行 × 30px + padBottom === 2000 × 30px`（总高守恒）；
- `end - start ≤ 36`（DOM 行数上界，峰值 < 50，绝不渲染 2000 行）；
- `rows[0] / rows[last]` 与全量数据一一对应（无错位 / 重复行）；
- 当前 `scrollTop` 命中的逻辑行落在 `[start, end)`（**不空白**）；
- start 递增段单调不减、回退段单调不增；
- `scrollTopForRow()` 对全部 2000 行往返都能把该行带进窗口；
- 极值：视口 0 → 空窗口不产生错误 spacer、scrollTop 远超总高 → 钳到最后一批行不空白、≤200 条小目录仍全量零 spacer。

### 12.4 验证（beta.43）

| 项 | 结果 |
|----|------|
| 新增 / 修改单测 | `helpSpec` 9/9、`helpSpecScheduler` 8/8、`historyPanel` +4、`sftpVirtualWindow` +5、`workbench` 守卫 +1（合计 **+27** 用例，与 1170 → 1197 吻合）；相关 116/116 + 82/82 |
| **前端全量单测** | **130 文件 / 1197 用例全部通过（0 失败）** ← 基线 128 文件 / 1170 |
| 前端构建 | `node build.mjs` ✅ **2874 modules**（基线 2872，+2 新模块），`ui/index.html` 自包含 |
| Vue 类型检查 | 本轮新增 / 修改的 `lib/*.ts` **0 错误**；总 32 条全为既有基线（`bellStyle`、`Trzsz` 回调、`Promise<boolean>` vs `void`、i18n 2708/2818 重复键等），改动区无新增 |
| i18n | en / zh-CN 键集**完全对齐**，新增 12 对（历史 5 + 远端 help 7）双端命中 |
| Rust 回归 | `cargo test read_only` **15/15**（本轮未改后端，仅确认无回归） |

### 12.5 交付物（beta.43）

`dist/io.datawise.community.ssh-0.7.11-beta.43-windows-x86_64.dwp`（**21,873,683 字节**，未签名）  
SHA256 `317fe7f58444b793727c707d4845dffc139f029bf3b138230ed084894d90587d`；`unzip -t` 无错误、6 文件、checksums.json **5/5 一致**、manifest 版本 `0.7.11-beta.43`。

包内复核：39 项稳定标记命中 38 —— 历史过滤 4 个 CSS 类 + 5 个 i18n 键、远端 help 4 个 CSS 类 + 7 个 i18n 键 + 中英文案（`从远端 --help 获取选项` / `远端选项` / `From {cmd} --help` / `正在读取远端帮助` 等）、` --help` ×7、`timeoutSecs` ×8、`ssh/exec` ×7、黑名单特征 `mkfs.` / `wipefs` 均命中；beta.42 的 `file-loading-overlay` ×3 / `history-item-result` ×4 / `padTop` ×6 / `padBottom` ×5 仍在。唯一未命中的 `"sudo"` 是压缩后对象键去引号所致，已单独确认新增调用被编译为 `ssh/exec`,{...,sudo:!1,timeoutSecs:5},{timeoutMs:9e3} —— **sudo 关闭、双超时入包**。内部函数名（`helpSpecCommand` / `loadRemoteHelp` 等）被 minify 改名属正常，非缺失。内联 UI **4,739,771 B**（β.42 为 4,728,282 B，+11,489 B）。

安装：DataWise → 社区插件 → 设置 → 允许未签名 → 本地安装上述路径。

### 12.6 更新后的后续 ROI

| 优先级 | 项 | 说明 |
|--------|----|------|
| P2 | 输入行内语法着色 / 引号闭合 / 宽字符列号换算 | §9.1 里唯一未碰的「准」侧空白；需 shell integration 精确定位 prompt 行，风险中等 |
| P2 | 历史元数据驱动更多排序（按 host 分组展示、按耗时排序） | 过滤已做，分组视图是纯 UI 增量 |
| P3 | `--help` spec 持久化到 localStorage / 跨会话复用 | 当前仅内存 TTL；需脱敏与容量上限 |
| P3 | 真实 DOM 2000 行夹具 | 需把 vitest 环境切成 jsdom + `@vue/test-utils`；当前以计算层夹具 + 模板守卫替代 |

**备注**：`community-plugins/ssh/README.md`（删除）与 `docs/motty-terminal-parity.md`（staged 删除）仍为非本轮操作的删除状态，未擅自恢复；本轮改动**未 git commit**。

## 13. 第七轮：输入行体检 / 历史排序分组 / `--help` 持久化（v0.7.11-beta.44）

用户「继续」。按 §12.6 推进 P2×2 + P3×1，全程沿用前几轮红线：纯函数主导、零新增按键、零自动 IPC、不改写发送字节、仲裁器不新增浮层。

### 13.0 范围与一项取舍

| §12.6 项 | 本轮 | 说明 |
|----------|------|------|
| P2 输入行语法着色 / 引号闭合 / 宽字符列号 | ✅ 落地为「输入行体检」 | 只做纯计算 + 非阻断提示，**不碰 xterm 渲染**（写 prompt 行装饰需 shell integration 精确定位，风险与收益不成比例） |
| P2 历史元数据更多排序（host 分组、耗时排序） | ✅ | β.42 落的 `durationMs` / `host` 终于可视化 |
| P3 `--help` spec 持久化 | ✅ | 脱敏 + 容量上限 + 严格回填校验 |
| P3 真实 DOM 2000 行夹具 | ❌ 本轮不做 | 需把 vitest 全局环境从 `node` 切成 `jsdom` 并引入 `@vue/test-utils`，会改变 132 个文件的运行底座；现有计算层夹具（β.43）+ 模板结构守卫已覆盖窗口化与总高守恒 |

### 13.1 输入行 shell 语法体检（§9.1 最后一块「准」侧空白）

新建 `lib/shellLineLint.ts`（21 单测）：

- `displayColumnWidth()` —— wcwidth 近似：CJK / 全角 / emoji 计 2 列，组合字符 / ZWJ / 零宽 / 控制字符计 0 列，`limit` 按**码点**而非 UTF-16 单元。解决「宽字符之前的错误列号整体偏移」。
- `lintShellLine()` —— 单遍状态机，栈跟踪 `'`、`"`、`$(`、`${`、反引号、`(`；处理 `\` 转义（单引号内反斜杠是字面量）、词首 `#` 注释、双引号内嵌套命令替换。检测 5 类问题：
  - `smart-quote`（**error**）：IME 智能引号 `“”‘’` 出现在 ASCII 引号外，shell 一定不认。与 β.40 的粘贴纠错互补——那条只管粘贴，这条管**逐字敲**。
  - `unclosed-quote` / `unclosed-substitution` / `unclosed-parenthesis` / `dangling-operator`（notice）：回车会进续行提示或命令不完整。
- **反噪音设计（最重要）**：刚打开引号、或引号内只有空白 → **静默**（正在输入是常态，不是错误）；只报最外层 opener；每类最多 1 条、总数 ≤3；合法的单 `&` 后台、`;` 结尾、`\` 续行、引号内的 `|`、转义 `\|` 一律不报；heredoc / C0 控制字符 / U+FFFD / >4 KiB fail-closed 返回 `[]`。
- 中英文案内置（同 `argumentHint.ts` 的 `L()` 范式），不进 i18n 表；仅新增 1 个标题键。

**接线不新增浮层**：左下角原本是 `arg-hint` / `remote-help` 二选一槽位，改为三分支互斥（体检 `v-if` → 静态参数 `v-else-if` → 远端 help `v-else-if`），共用 `argHintDismissedFor` 与 `dismissArgumentHint()`；仲裁器第 9 浮层的 claim 由二 OR 改为三 OR，**优先级表、Esc 分发、裸 ↓ 门、既有 7 层链数值零改动**，浮层总数仍为 9。

### 13.2 历史排序 / host 分组（β.42 元数据的可视化收口）

`historyPanel.ts` 新增 `HistorySortMode`（recent / durationDesc / durationAsc / host）、`coerceHistorySortMode()`（持久化值防御）、`sortHistoryView()`、`historyGroupLabel()`（7 单测）：

- pinned 行在所有显式排序中恒定优先；**未知耗时双向都沉底**（升序时不让 `undefined` 冒充 0）；host 分组按 `localeCompare` 稳定排序，未知 host 单独末组 `HISTORY_UNKNOWN_HOST`；`recent` 逐字节保持 store 原序。
- **关键边界**：排序只在**空搜索框**时生效；有 query 时保持 fzf 相关性序，否则评分会被静默撤销。
- 模板改为 `<template v-for>`，在行前插入 `position: sticky` 分组头；`historyPanelIndex` 仍是扁平索引，↑↓ / Enter / Del / Ctrl+P **零改动**。排序偏好持久化到 `uiStorage`（`coerce` 防脏值）。

### 13.3 `--help` spec 持久化（P3，脱敏 + 有界）

新建 `lib/helpSpecCache.ts`（10 单测）+ scheduler 增加 `snapshot()` / `seed()`（3 单测）：

- 只存**解析后结构**（scope key / 命令名 / flag 标签与描述），**原始 `--help` 输出绝不落盘**；控制字符剥离、字段有界、`token: 实际值` 类描述脱敏置空。
- 严格回填：v1 版本、命令名过 `isHelpSpecCommand()` 白名单/黑名单、flags 形状、时间戳新鲜度（5 min TTL，未来时间拒绝）、24 条 / 64 KiB 上限；结构损坏 fail-closed 到 `[]`，坏条跳过而好条保留；去重保留最新 stamp；超限按最旧裁剪。
- `snapshot()` 只导出成功条目且带 scope key；`seed()` 不覆盖已有新条目、拒绝过期/非法。
- App.vue：`initUiStorage()` 后 restore、`loadRemoteHelp()` 成功后 persist、会话切换时**先 snapshot → `clear()` → 再 seed 回去**，scope key 保留 → 主机间不串 spec。全程零新增 IPC，`ssh/exec` 仍只在用户显式点击时发生。

### 13.4 验证（beta.44）

| 项 | 结果 |
|----|------|
| 新增单测 | `shellLineLint` 21、`helpSpecCache` 10、`helpSpecScheduler` +3、`historyPanel` +7、`workbench` 守卫 +1 = **+42**，与 1197 → 1239 精确吻合；结构守卫 / 仲裁器相关 100/100 |
| **前端全量单测** | **132 文件 / 1239 用例全部通过（0 失败）** ← 基线 130 / 1197 |
| 前端构建 | `node build.mjs` ✅ **2876 modules**（基线 2874，+2 新模块），`ui/index.html` 自包含 |
| Vue 类型检查 | 本轮新增 / 修改的 `lib/*.ts` **0 错误**；总 32 条全为既有基线（`bellStyle`、`Trzsz` 回调、`Promise<boolean>` vs `void`、i18n 2722/2832 重复键等） |
| i18n | en / zh-CN 键集**完全对齐**，新增 7 对（体检 1 + 排序 6）双端命中 |
| Rust 回归 | `cargo test read_only` **15/15**（本轮未改后端） |

### 13.5 交付物（beta.44）

`dist/io.datawise.community.ssh-0.7.11-beta.44-windows-x86_64.dwp`（**21,876,008 字节**，未签名）  
SHA256 `1793e1edb23aadb0c69a39b65c82611f57d71f48e7ef2c7cb62c58e12c67f192`；`unzip -t` 无错误、6 文件、checksums.json **5/5 一致**、manifest 版本 `0.7.11-beta.44`。

包内复核：47 项稳定标记命中 45 —— 输入行体检 4 个 CSS 类 + `shellLint.title` + 中英文案（`智能引号` / `未闭合` / `缺一条命令` / `Smart quotes` / `Unclosed`）、历史排序 2 个 CSS 类 + 6 个 i18n 键 + 中英双语文案 + `dw.ssh.historySort`、help 持久化 `dw.ssh.helpSpecCache`；β.43 的 `timeoutSecs` ×8 / `ssh/exec` ×7 / `sudo:!1`、`file-loading-overlay` ×3 / `history-item-result` ×4 / `padTop` ×6 / `padBottom` ×5 / `overscan` ×2 仍在。两项未命中为**校验口径**而非缺失：` :{{ issue.column }}` 是 Vue 模板插值（编译后为动态值）、`windowedEntries` 是内部变量（minify 改名）。内联 UI **4,750,301 B**（β.43 为 4,739,771 B，+10,530 B）。

安装：DataWise → 社区插件 → 设置 → 允许未签名 → 本地安装上述路径。

### 13.6 更新后的后续 ROI

| 优先级 | 项 | 说明 |
|--------|----|------|
| P2 | 输入行内**语法着色**（只读着色，不改写） | 本轮已把「诊断」与「宽字符列号」做实；着色需 xterm 装饰层，风险中等，可复用 `lintShellLine` 的 token 扫描结果 |
| P3 | 真实 DOM 2000 行夹具 | 仍建议单独一轮切 jsdom + `@vue/test-utils`，勿与功能改动混在一轮 |
| P3 | 历史跨连接聚合视图 | 元数据齐备，需先定义 scope 与脱敏边界 |
| P3 | `--help` spec 跨主机复用（按 host label 而非 session id） | 当前按 session 隔离最安全；放宽需解决版本差异 |

**备注**：`README.md` / `docs/motty-terminal-parity.md` 删除状态仍非本轮操作；本轮改动**未 git commit**。

## 14. 第八轮：修复「参数提示挡住输入命令行」（v0.7.11-beta.45）

### 14.1 用户反馈与根因

用户截图：`tail` 的参数提示条（「参数提示 tail tail [选项][文件]… 常用选项 -n <n> -f -c <bytes> -q」）压在终端输入行上，正在敲的命令完全看不见。

这**不是提示内容或时机的问题，是定位方式的问题**：β.40 风险提示、β.42 参数提示、β.43 远端 help、β.44 输入体检，四条提示全部沿用 `position: absolute; left/right: 8px; bottom: 8px`，直接覆盖在 xterm 画布之上（`.terminal-host` 是 `inset: 0` 填满整个 pane）。终端刚登录 / pane 较矮 / 行数未铺满时，输入光标行恰好落在底部，提示条就把它整个盖住。此前几轮验证都是纯函数 + 模板结构守卫，**没有任何用例检查「提示条是否覆盖文本」**，所以一直没暴露——这是测试视角的盲区，不是功能回归。

### 14.2 修复：从覆盖层改为 flex 停靠条

- **模板**：四条提示收进 `<div v-if="anyCommandHintVisible" class="command-hint-dock">`，`anyCommandHintVisible` = 四个 visible 的 OR；`terminal-pane` 加 `command-hint-open` 类。原来的 `v-if` / `v-else-if` 互斥链与 Esc 仲裁器第 9 浮层 claim 完全不动。
- **CSS**：`.command-hint-dock` 为 `position: relative; flex: 0 0 auto`，参与 pane 的 flex column 布局、占真实高度；四条提示改为 `position: relative`、`max-width: 100%`，dock 用 `align-items: stretch`（风险条 `align-self: flex-end` 保持靠右）。删除三条 `batch-bar-open .command-*-hint { bottom: 56px }`。
- **效果**：`terminal-shells`（`flex: 1 1 auto`）自动收缩 → `ResizeObserver(terminalHost)` → `FitAddon.fit()` 重算行数 → **输入行永远落在提示条上方，物理上不再覆盖任何终端文本或光标**。提示条出现/消失只减少 1~2 行可视区，rAF 合帧的 `scheduleFit` 保证不抖动。
- **与批量命令栏共存**：`batch-bar` 是 `absolute bottom:0` 高 46px。dock 可见时由 `margin-bottom: var(--ssh-batch-reserve, 48px)` 统一让位，并把 `.terminal-shells { margin-bottom: 0 }` 归零（避免与既有的 `batch-bar-open .terminal-shells { margin-bottom: 48px }` 重复扣减）；同时撤销既有 `batch-bar-open .terminal-host { inset: 0 0 48px 0 }` 的相对上移（`command-hint-open.batch-bar-open .terminal-host { inset: auto }`），否则底部被扣两次、顶部被裁。
- 顺带解决：风险条（原靠右）与 lint/arg/remote 条（原靠左）同屏时可能重叠，现在在 dock 里按 flex column 自动堆叠。

### 14.3 回归防线

`workbench.spec.ts` 新增结构守卫：断言 dock 存在、`command-hint-open` 接线、四个 visible 的 OR、CSS 里 dock 是 `flex: 0 0 auto`，并**逐条检查四条提示的规则不含 `position: absolute` / `bottom: 8px`**，防止以后新增提示时又退回覆盖层。CSS 用 `node:fs` 直接读盘（vite 的 CSS 插件会拦截 `?raw` 返回空串），局部 `@ts-ignore` 压掉 tsconfig 未装 node 类型导致的报错，类型基线不增加。

### 14.4 验证

| 项 | 结果 |
|--------|------|
| 前端全量单测 | **132 文件 / 1240 用例全绿**（基线 132 / 1239，+1 守卫） |
| 前端构建 | `node build.mjs` ✅（模板 `v-if/v-else-if` 链编译通过） |
| 类型检查 | `vue-tsc` 总 32 条全为既有基线，本轮文件 **0 错误** |
| Rust 回归 | `cargo test read_only` **15/15**（本轮未改后端） |
| 包校验 | `unzip -t` 无错误、6 文件、checksums **5/5** 一致；包内 CSS 实测 `.command-hint-dock{flex:none;position:relative}`、四条提示主规则**全部** `position:relative` 且无 `bottom:8px`、旧 `batch-bar-open .command-*-hint{bottom:56px}` 归零 |

### 14.5 交付物（beta.45）

- 插件包：`dist/io.datawise.community.ssh-0.7.11-beta.45-windows-x86_64.dwp`，**21,876,042 B**，SHA256 `ba44061939629b982bffc2517409cf0bb1def8b2a490ad6571547f995d6b7a45`（未签名；内联 UI 4,750,716 B，2876 modules）。
- 安装：DataWise → 社区插件 → 设置 → 允许未签名 → 本地安装上述路径。
- 版本四处同步：`manifest.datawise.json` / `frontend/package.json` / `backend/Cargo.toml` / `backend/Cargo.lock`。

### 14.6 遗留边界

- `.terminal-command-marker` / `.zmodem-status` 仍是 `absolute bottom:8px` 浮层，与提示条同屏时由 dock 的 `z-index: 4` 盖住（与修复前一致，非本轮回归）；若要彻底分离，下一轮可让它们也随 dock 让位。
- dock 出现/消失会让 xterm 少/多渲染 1~2 行（不遮挡的必要代价）；`scheduleFit` 已合帧，但本轮未做真实 DOM 帧率采集。

**备注**：`README.md` / `docs/motty-terminal-parity.md` 删除状态仍非本轮操作；本轮改动**未 git commit**。

---

## 15. 第九轮：从「占布局的停靠条」改为「悬浮在输入行上方」（v0.7.11-beta.46）

### 15.1 用户反馈与根因

用户看完 beta.45 后回复：**「这个位置也不行，会有页面跳动，可以悬浮在输入命令行上面，或者后面也行」**。

beta.45 解决了「遮挡」，但引入了「跳动」。根因是它把 dock 做成 `position: relative; flex: 0 0 auto` 的 **flex 子项，占真实高度**：

```
提示出现 → .terminal-shells(flex:1 1 auto) 可用高度减少 → ResizeObserver(terminalHost) 触发
        → FitAddon.fit() 重算 rows/cols → xterm 重绘、已输出内容整体上移/滚动位置变化
提示消失 → 反向再来一次
```

也就是说「不遮挡」是靠**动态改变终端尺寸**换来的；终端行数一变，用户就看到整页跳。§14.6 里写的「dock 出现/消失会让 xterm 少/多渲染 1~2 行」正是当时已知、但被判断为「必要代价」的问题——用户实测后判定不可接受。

连续两轮反馈把约束收敛清楚了，两个条件必须**同时**满足：

| 约束 | beta.44 及以前 | beta.45 | beta.46 |
|--------|:---:|:---:|:---:|
| 不遮挡输入行 | ✗（absolute bottom:8px 压住光标行） | ✓ | ✓ |
| 出现/消失零重排 | ✓ | ✗（fit() 重算行数） | ✓ |

### 15.2 修复：absolute 浮层 + 底边抬到输入行之上

核心思路是**把「不遮挡」从「改变终端尺寸」改成「改变浮层自身位置」**：浮层脱离布局，物理上放到输入行的上方，两件事互不耦合。

- **`.command-hint-dock` 改回 `position: absolute`**（`left/right: 8px`，`z-index: 4`）。它不再是 flex 子项，`.terminal-shells` 的高度永远由原有布局决定 → `ResizeObserver` 不会因提示而触发 → `FitAddon.fit()` 不重算 → **终端行数恒定，出现/消失零跳动**。
- **底边抬升**：`bottom: calc(var(--ssh-hint-lift, 40px) + var(--ssh-batch-reserve, 0px))`。40px ≈ xterm 底部 8px padding + 一行字符高 + 余量，浮层底边始终高于输入行顶边；`batch-bar` 打开时 `--ssh-batch-reserve: 48px`（终端本身已上移 48px），浮层再累加 48px，仍不遮挡。
- **`command-hint-open` 只定义 `--ssh-hint-lift: 40px`**，不再碰 `.terminal-shells` 的 margin 或 `.terminal-host` 的 inset。删除 beta.45 那两条会改终端尺寸的布局覆盖规则（`.command-hint-open .terminal-shells { margin-bottom: 0 }`、`command-hint-open.batch-bar-open .terminal-host { inset: auto }`），既有的 `batch-bar-open` 让位规则完整恢复。
- **事件穿透**：dock 设 `pointer-events: none`，空白区域的点击 / 框选直接落到 xterm；四条提示本体设 `pointer-events: auto`，`dismiss` × 与远端 `--help` 加载按钮照常可点、文字可选。
- **有界**：`align-items: flex-end` 让提示条靠右收窄（少挡历史输出），`max-height: calc(100% - lift - batch - 16px)` + `overflow-y: auto` 保证浮层不会顶出 pane 顶部。
- 四条提示主规则仍是 `position: relative`，只在这个 absolute 容器里按列堆叠；`v-if` / `v-else-if` 互斥链、Esc 仲裁器第 9 浮层、`argHintDismissedFor`、i18n **全部未动**。

### 15.3 回归防线

`workbench.spec.ts` 把原 beta.45 守卫拆成两条：

- **`beta.45/46`**：dock 容器、`command-hint-open` 接线、四个 visible 的 OR；逐条检查三条提示主规则**不含** `position: absolute` / `bottom: 8px`；旧 `batch-bar-open .command-arg-hint { bottom: 56px }` 不得复活（这部分在两轮里都成立）。
- **`beta.46`（新增）**：切出 `.command-hint-dock` 规则块，断言 `position: absolute`、含 `bottom: calc(var(--ssh-hint-lift, 40px) + var(--ssh-batch-reserve, 0px))`、`--ssh-hint-lift` / `--ssh-batch-reserve` 两条 var 规则存在、`pointer-events: none` + 提示条 `pointer-events: auto` 存在；并**断言块内不含 `flex: 0 0 auto` / `margin-bottom`**，且 CSS 全文**不含** beta.45 那两条布局覆盖规则。这条守卫直接锁死「不许再用改终端尺寸的办法换不遮挡」。

### 15.4 验证

| 项 | 结果 |
|--------|------|
| 前端全量单测 | **132 文件 / 1241 用例全绿**（基线 132 / 1240，+1 守卫） |
| 前端构建 | `node build.mjs` ✅（2876 modules，模板 `v-if/v-else-if` 链编译通过） |
| 类型检查 | `vue-tsc` 总 32 条全为既有基线，本轮文件 **0 错误** |
| Rust 回归 | `cargo test read_only` **15/15**（本轮未改后端逻辑） |
| 包校验 | `unzip -t` 无错误、6 文件、checksums **5/5** 一致（`ui/index.html` 实测 `6f6516a5…4087` 与清单吻合） |
| 包内 CSS 实测 | `.command-hint-dock{…position:absolute;bottom:calc(var(--ssh-hint-lift,40px) + var(--ssh-batch-reserve,0px));pointer-events:none…}`，**无** `flex:0 0 auto`、**无** `margin-bottom`；两条旧布局覆盖规则命中数 **0 / 0**；`command-risk/lint/arg-hint` 主规则全部 `position:relative` |

### 15.5 交付物（beta.46）

- 插件包：`dist/io.datawise.community.ssh-0.7.11-beta.46-windows-x86_64.dwp`，**21,879,228 B**，SHA256 `640be56ffca4ca81a6742fbc18ece09c00e8e8b5a0b34a21233a35f0824b5fbc`（未签名；内联 UI 4,750,862 B）。
- 安装：DataWise → 社区插件 → 设置 → 允许未签名 → 本地安装上述路径。
- 版本四处同步：`manifest.datawise.json` / `frontend/package.json` / `backend/Cargo.toml` / `backend/Cargo.lock`。

### 15.6 边界与下一轮 ROI

- `--ssh-hint-lift: 40px` 是静态经验值（按默认字号的一行字符高 + padding + 余量取），用户把终端字号调得很大时理论上可能贴到输入行；若要精确跟随，可从 xterm `buffer.active.cursorY` + cellHeight 动态写 CSS var，但那会引入逐帧计算，与「更稳且流畅」冲突，暂不做。
- 顺带缓解 §14.6 的遗留：`.terminal-command-marker` / `.zmodem-status` 仍是 `absolute bottom:8px`，但提示浮层现在抬到输入行上方，空间上已错开，不再互盖。
- 下一轮 ROI：输入行内语法着色（复用 `lintShellLine` token 扫描 + xterm 装饰层）、真实 DOM 帧率采集、历史跨连接聚合、`--help` spec 按 host label 跨主机复用。

**备注**：`README.md` / `docs/motty-terminal-parity.md` 删除状态仍非本轮操作；本轮改动**未 git commit**。

---

## 16. 第十轮：提示条锚定到 xterm 光标行「焦点上方」（v0.7.11-beta.47）

### 16.1 用户反馈与根因

用户截图：`# tail` 输入行在左下角，参数提示条被红框标在**右侧中上部**，回复 **「这样也不对呀，离这么开，能在焦点上方吗」**。

beta.46 虽然同时做到「不遮挡」和「零跳动」，但位置是**静态估算**的：

- `align-items: flex-end` 让横跨 pane 的 dock 把提示条贴到**右边缘**，而输入命令在左侧，水平完全不对齐；
- `bottom: calc(40px + batch 48px)` 是「距 pane 底部」的经验值，不是按光标行算的，字号 / 行数 / 批量栏一变就漂；
- 上一轮把它写成「悬浮在输入行上方」，实际只是浮在**屏幕右下方偏上**，并没有跟随焦点。

### 16.2 修复：接上项目已有的光标锚定体系

`CompletionMenu.vue` / ghost text 早就有一套成熟机制：`readXtermCssCellSize()` 读 xterm 自身 cell 尺寸、`overlayOffsetForCell()` 算光标格像素、`flippedOverlayBottom()` / `overlayLeft()` / `overlayMaxHeight()` 决定翻到光标上方与收窄。本轮把命令提示接上**同一套坐标系**，不再另造静态偏移：

- **`updateCommandHintAnchor()`**：读 `.xterm-screen` 与 `.terminal-pane` 的 rect，`cursorTop = screenTop - paneTop + cursorY * cellH`、`cursorLeft = screenLeft - paneLeft + cursorX * cellW`；
  - `bottom = flippedOverlayBottom(cursorTop, paneHeight)` → 浮层底边贴**光标行顶**、留 6px 呼吸，紧贴输入行正上方；
  - `left = overlayLeft(cursorLeft, cellW)` → 左缘跟**光标字符右缘**，右缘越界时按 dock 实测宽度整体左移；
  - `maxHeight = overlayMaxHeight("above", ...)` → 上方空间不足时内部滚动，不伸出 pane 顶部；
  - 写成内联 `left / bottom / maxWidth / maxHeight`，CSS 只保留 `position: absolute` 与兜底值。
- **删除 `--ssh-hint-lift` / `--ssh-batch-reserve` 两个静态经验值**：批量栏让位、字号、行数变化全部由实测 rect 自动吸收（§15.6 担心的「超大字号贴边」随之消失）。
- `align-items: flex-start` 替换 `flex-end`，提示条不再贴右边缘；仍是 `position: absolute`、**不参与布局** → 终端行数恒定、出现/消失零跳动。
- **更新时机 + 性能**：`watch(anyCommandHintVisible)` 提示刚出现时定位、`onCursorMove` 跟随输入、`onRender` 重绘/fit 后重测；`scheduleCommandHintAnchor()` 用 rAF 合帧，一帧只测一次 DOM，不可见时零开销、值不变不写 ref。
- `pointer-events` 穿透、四条提示主规则 `position: relative`、`v-if / v-else-if` 互斥链、Esc 仲裁器第 9 浮层、i18n **全部未动**。

### 16.3 回归防线

`workbench.spec.ts` 守卫改为 beta.47：断言模板 `ref="commandHintDockEl"` / `:style="commandHintDockStyle"`；CSS 中 dock 仍是 absolute、不含 `flex: 0 0 auto` / `margin-bottom` / `--ssh-hint-lift` / `--ssh-batch-reserve`，含 `.terminal-pane.command-hint-open .command-hint-dock { max-width: calc(100% - 16px); }`，且两条旧布局覆盖规则仍为 0；script 含 `updateCommandHintAnchor` / `scheduleCommandHintAnchor`、三个 `overlayPlacement` 纯函数调用、`readXtermCssCellSize`、`maxWidth` 内联样式、三处刷新挂接。

### 16.4 验证

| 项 | 结果 |
|--------|------|
| 前端全量单测 | **132 文件 / 1241 用例全绿** |
| 前端构建 | `node build.mjs` ✅（2876 modules，内联 UI 4,751,853 B） |
| 类型检查 | `vue-tsc` 总 32 条全为既有基线，本轮文件 **0 错误** |
| Rust 回归 | `cargo test read_only` **15/15**（本轮未改后端逻辑） |
| 包校验 | `unzip -t` 无错误、6 文件、checksums **5/5** 一致（`ui/index.html` 实测 `53086fa5…8d61d6` 与清单吻合）、manifest 版本 `0.7.11-beta.47` |
| 包内 CSS 实测 | `.command-hint-dock{…position:absolute;bottom:40px;left:14px;right:auto;pointer-events:none;align-items:flex-start…}`（兜底值，运行时由内联 style 覆盖）；静态 var 命中 **0**、旧布局覆盖 **0**；三条提示主规则全部 `position:relative` |

### 16.5 交付物（beta.47）

- 插件包：`dist/io.datawise.community.ssh-0.7.11-beta.47-windows-x86_64.dwp`，**21,877,958 B**，SHA256 `8a8257c78a291ff87de5685e218922f0a21bc1743592a1a2bfe2f29f0389b62b`（未签名）。
- 安装：DataWise → 社区插件 → 设置 → 允许未签名 → 本地安装上述路径。
- 版本四处同步：`manifest.datawise.json` / `frontend/package.json` / `backend/Cargo.toml` / `backend/Cargo.lock`。

### 16.6 边界与下一轮 ROI

- 左缘跟随**光标字符右缘**（IDE 参数提示语义）；若更想对齐命令行起始列，可把 `overlayLeft` 换成按提示符长度解析的 `lineStartX`。
- 提示刚出现的首帧用 CSS 兜底 `left:14px / bottom:40px`，rAF 后立即校正为实测坐标（同一帧内，肉眼无感）。
- 下一轮 ROI：输入行内语法着色（复用 `lintShellLine` token 扫描 + xterm 装饰层）、真实 DOM 帧率采集、历史跨连接聚合、`--help` spec 按 host label 跨主机复用。

**备注**：`README.md` / `docs/motty-terminal-parity.md` 删除状态仍非本轮操作；本轮改动**未 git commit**。

---

## 17. 第十一轮：参数提示设置开关 + 与历史命令提示框互斥（v0.7.11-beta.48）

### 17.1 诉求与判断

用户反馈两点：①「把参数提示加上开关，放在设置里配置」；②「参数提示需要跟历史命令提示框相斥，不然出现 2 个提示框不好看，怎么设置好」。

**「历史命令提示框」的界定**：代码里有两类浮层会跟 `.command-hint-dock` 抢同一块视觉空间——边输入边弹的命令/历史联想列表（`.command-suggest`，含 `source: "history"`）、Fig 补全菜单（`CompletionMenu`）、Ctrl+R 历史面板（`.history-overlay`）、快捷命令面板、命令面板。它们都是 `position:absolute` 且锚在光标附近或居中，与提示条同屏即为「两个框」。

**相斥方向的取舍（关键设计）**：**只读信息条让位给可交互选择器**。用户正在 ↑↓/Tab/Enter 选命令时，参数/语法/风险提示既挡地方又无意义；反过来压掉联想列表会直接破坏选命令，不可取。与 `overlayArbiter` 的既有优先级哲学一致（可交互浮层 escape 优先级 100~600 ≫ argumentHint 50）。因此实现为：任一选择浮层打开 → 提示条隐藏；关掉 → 自动回来（纯 computed、零副作用）。

**开关落点**：放进设置 → 终端 → 「历史与补全」交互卡片（`InteractionPrefs`），与 `historyEnabled` / `completionMode` 同组。参数提示、历史联想、补全本就是同一族输入辅助，放一起配置「互斥」心智最顺；复用既有 `update:interactionPrefs` 持久化通道，改动面最小。

### 17.2 改动明细

| 文件 | 改动 |
| --- | --- |
| `lib/commandHintVisibility.ts`（新） | `CommandHintGateState` + `commandHintPickingOverlayOpen()` + `commandHintAllowed()`；开关关闭 / 五个选择浮层任一打开 → `false`。判定纯函数化，不依赖 App.vue ref |
| `lib/commandHintVisibility.spec.ts`（新） | 6 例：默认允许、开关关、五个浮层逐个、叠加、自动恢复、不改入参 |
| `lib/interactionPrefs.ts` | 新增 `commandHintsEnabled: boolean`，`DEFAULT=true`、`sanitize` 用 `o.commandHintsEnabled !== false`（默认开不回归，坏值不误关） |
| `lib/interactionPrefs.spec.ts` | +1 例钉死默认值 / bad value / `withCompletionMode` round-trip 保留 |
| `lib/i18n.ts` | 新增 `interactionPrefs.commandHints` / `commandHintsHint` 中英双语，hint 明写「历史或补全候选框打开时自动隐藏，不会同时出现两个提示框」 |
| `components/SettingsDialog.vue` | 「历史与补全」卡片头部加 `Switch`（`data-settings-anchor="command-hints"`，emit 走既有通道）；`SETTINGS_SEARCH_INDEX` 加可搜索条目 |
| `App.vue` | import `commandHintAllowed`；新增 `commandHintsAllowed` computed 喂五个浮层状态；`anyCommandHintVisible` 与 `terminalOverlayState().argumentHintVisible` **同时**乘门 |
| `lib/workbench.spec.ts` | 更新 beta.43 的 `argumentHintVisible:` 断言；+1 条 beta.48 守卫（模型/面板/文案/接线/行为五段） |

**Esc 一致性（易漏点）**：显示门必须**同时**作用于 dock 渲染与 Esc 仲裁器。若只改 dock，开关关闭或被互斥隐藏时 `argumentHint` 仍持有 escape owner（优先级最低但唯一可见），Esc 会被一个看不见的提示条吞掉、不再透传给远端 shell。本轮两处同乘 `commandHintsAllowed` 消除该隐患。

### 17.3 验证

| 项 | 结果 |
| --- | --- |
| 前端单测 | **133 文件 / 1249 用例全绿**（较 beta.47 +8：新纯函数 6 + 设置项 1 + 接线守卫 1） |
| 类型检查 | `vue-tsc` **32 条既有基线**，本轮 0 新增 |
| 后端回归 | `cargo test read_only` **15/15** |
| 构建 | ✅ 单文件内联 UI 4,753,648 B |
| 包校验 | `unzip -t` 无错误、6 文件、checksums **5/5**（`ui/index.html` 实测 `e001db5e…bc814345c14a` 与清单吻合）、manifest 版本 `0.7.11-beta.48` |
| 包内联产物实测 | `commandHintsEnabled` 三处（`!==!1` 默认开 / `!0` 默认值 / `e===!0` 设置 emit）、五个 gate state key 各 1、`suggestionListVisible:Ei.value`、中英 hint 文案均在；`commandHintAllowed` 符号被 minify 内联属正常 |

### 17.4 交付物（beta.48）

- 插件包：`dist/io.datawise.community.ssh-0.7.11-beta.48-windows-x86_64.dwp`，**21,877,119 B**，SHA256 `e87615f4a2f501e78f84a70f3e07af60544ecab1b7fcb650a4212e931640a50c`（未签名）。
- 安装：DataWise → 社区插件 → 设置 → 允许未签名 → 本地安装上述路径。
- 版本四处同步：`manifest.datawise.json` / `frontend/package.json` / `backend/Cargo.toml` / `backend/Cargo.lock`。

### 17.5 边界与可调点

- 开关控制的是**整组命令提示浮层**（参数 / 语法体检 / 风险 / 远端 --help），不是只关参数提示——用户眼里是「同一个框」，整体开关最直观。若想拆分（例如保留风险提示），可把门拆成 `commandHintsEnabled` + `riskHintEnabled` 两个 computed 分别乘。
- 互斥集合是五个「可交互选择浮层」；行内灰字 ghost 不是框，故意不纳入，避免打字时提示条无谓闪烁。
- 若更希望**参数提示优先**（压掉联想列表），把 `commandHintAllowed` 的结果取反喂给 `commandSuggestListVisible` 即可，但会牺牲选命令体验，不推荐。
- 下一轮 ROI：输入行内语法着色（复用 `lintShellLine` token 扫描 + xterm 装饰层）、真实 DOM 帧率采集、历史跨连接聚合、`--help` spec 按 host label 跨主机复用。

**备注**：`README.md` / `docs/motty-terminal-parity.md` 删除状态仍非本轮操作；本轮改动**未 git commit**。

---

## 18. beta.49 —— 修复运行时 `ReferenceError: Cannot access 'X' before initialization`（TDZ 白屏）

### 18.1 用户反馈与现象

用户截图：控制台连续报 `Uncaught (in promise) ReferenceError: Cannot access 'ei' before initialization`、两条 `[ssh-ui] ReferenceError: Cannot access 'j1' / 'P1' before initialization`，堆栈全是 `get value → Wn.fn → … → nn.d [as fn]`（Vue computed 依赖链）；同时伴随宿主 401/400（与本 bug 无关，属环境鉴权）。这是**启动期 TDZ**，`app.config.errorHandler` 把错误吞掉，UI 看似渲染但命令提示/设置面板状态半初始化。

### 18.2 定位方法（可复用）

不靠猜压缩变量名：用 `frontend/node_modules` 里的 `happy-dom` + Node `vm` 起一个最小 harness，把 `ui/index.html` 里内联的 `<script type="module">` 抽出来执行（仅把 `import.meta` 替换成 stub、补 `window.datawisePlugin` / `ResizeObserver` / canvas 等 mock），拦截 `console.error`。**复现出真实错误** `Cannot access 'Pl' before initialization`，堆栈与截图同构。再按压缩产物 `index.html:274:6348/6578/7463` 定位到变量：

- `Pl` = `connected`（`let Pl=K(()=>le.value===\`connected\`&&!!k.value)`），声明在产物 col12922；
- 而 `riskHintVisible`(`fo`)/`argHintBaseVisible`(`go`)/`anyCommandHintVisible`(`jo`) 的 getter 在 col6348~7463 就读了 `Pl.value`。

### 18.3 根因（两处，同一模式）

Vue 的 `computed` 惰性，但 **`watch(source)` 初始化时会同步读一次 `source.value` 收集依赖**；`watch(..., {immediate:true})` 更会立即跑回调。若此时链上某个 `const/let` 还没执行到声明，就抛 TDZ。

| # | 文件 | 晚声明变量 | 首次被同步求值的位置 | 后果 |
| --- | --- | --- | --- | --- |
| 1 | `App.vue` | `connected` 声明在 **2407** | `watch(anyCommandHintVisible)`(**1957**) 求值链 → `riskHintVisible`(1779)/`argHintBaseVisible`(1798) 读 `connected.value` | `[ssh-ui]` computed 链报错，命令提示全失效 |
| 2 | `SettingsDialog.vue` | `prefsReady` 声明在 **2265** | `watch(() => props.open, …, {immediate:true})`(**1540**) 立即调 `reloadSettings()`(1453)，第一行写 `prefsReady.value` | `Uncaught (in promise)`，设置面板状态半初始化 |

放大因素：`watch(anyCommandHintVisible)` 是 beta.47 为光标锚定新增的，beta.48 又给 `anyCommandHintVisible` 加了 `commandHintsAllowed` 前置依赖——把整条 prompt computed 链提前到 setup 期间求值，于是这个一直存在的声明顺序隐患被触发。压缩后变量名随构建变化（`Pl` / `j1` / `P1` / `ei`），但根因是同一处源码顺序。

### 18.4 修复

不做 try/catch 兜底、不改判定逻辑，只**把声明提前到依赖就绪之后、所有引用之前**：

- `App.vue`：`const connected = computed(() => terminalState.value === "connected" && !!session.value)` 从 2407 移到 **931**（紧跟它唯一依赖的 `terminalState` 909 / `session` 930 之后）；原位置删除。
- `SettingsDialog.vue`：`const prefsReady = ref(false)` 从 2265 移到**草稿 ref 区顶部**（`downloadDirDraft` 之前）；原位置删除，`startupPersistTimer` 不动。

两处都补了说明性注释，讲清「为什么必须早声明」，防止后人按语义相关性搬回去。

### 18.5 结构守卫（`workbench.spec.ts` +3 例）

1. 钉死 `connected` 声明 > `terminalState`/`session`、< 四处 `connected.value` 引用与 `watch(anyCommandHintVisible, (visible) => {`，且全文件只允许一处声明。
2. 钉死 `prefsReady` 声明 < `async function reloadSettings()` < 其后的 `{ immediate: true }`，且只允许一处声明。
3. 通用防线：`anyCommandHintVisible` 依赖闭包里 14 个状态声明（`interactionPrefs` … `anyCommandHintVisible`、`connected`）全部 < watch 求值时点。

写守卫时踩了一个坑：注释里出现的 `watch(anyCommandHintVisible` 字样会被 `indexOf` 提前命中，改用完整调用签名 `watch(anyCommandHintVisible, (visible) => {` 做锚点，并顺手改掉注释措辞。

### 18.6 A/B 对照验证（决定性证据）

同一 harness、仅换 UI 产物：

| 产物 | 结果 |
| --- | --- |
| beta.48 旧包内 `ui/index.html` | `[ssh-ui] ReferenceError: Cannot access 'Pl' before initialization`（computed 链，与截图同构） |
| beta.49 新产物 | **captured 0 errors** |

补齐 `onEvent` 等 mock 让 mount 完整走完后，新产物仍为 0 错误——确认不是「错误被后续异常掩盖」。

### 18.7 验证与交付

| 项 | 结果 |
| --- | --- |
| 前端单测 | **133 文件 / 1252 用例全绿**（+3 结构守卫） |
| 类型检查 | `vue-tsc` **32 条既有基线**，本轮 0 新增 |
| 后端回归 | `cargo test read_only` **15/15** |
| 构建 | ✅ 2877 modules |
| 包校验 | `unzip -t` 无错误、6 文件、checksums **5/5**、manifest 版本 `0.7.11-beta.49` |

- 插件包：`dist/io.datawise.community.ssh-0.7.11-beta.49-windows-x86_64.dwp`，**21,876,180 B**，SHA256 `868f60dd8a78f56c5c380c6478329d9fa962180682113d2c938dc904a46f81e8`（未签名）。
- 版本四处同步；临时复现 harness 已删除，未留在仓库。

### 18.8 边界

- 截图里的 401/400 是宿主 API 鉴权（`projects/active`、`explorer/connections/pooled`、`docker.invoke`），与本次 TDZ 无关，属环境侧；若安装新包后仍出现，需单独排查登录态/`dwTicket`。
- 本次只修「声明晚于 setup 期同步求值」这一类 TDZ；`vue-tsc` 的 32 条基线里没有 `used before declaration`，说明 TypeScript 不会静态拦住这种「computed getter 内跨 setup 时点」的引用，因此结构守卫是必要防线。
- 下一轮 ROI 不变（输入行内语法着色、真实 DOM 帧率采集、历史跨连接聚合、`--help` spec 按 host label 跨主机复用）。

**备注**：`README.md` / `docs/motty-terminal-parity.md` 删除状态仍非本轮操作；本轮改动**未 git commit**。
