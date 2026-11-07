# 插件 Brief · Process Ops

## 1 · 一句话定位

在 DataWise 中管理本机与远程 Linux 主机的进程与系统资源，支持堡垒机跳板排查、CPU/内存/磁盘、systemd 服务操作与一键诊断。

## 2 · 连接(connection-provider)

| key | label(中文) | type | binding | required | default | 说明 |
|-----|--------------|------|---------|----------|---------|------|
| display_name | 工作区名称 | text | name | ✓ | Process Ops | 连接列表显示名；主机在工作台左栏管理 |
| notes | 备注 | text | config | | | 可选 |

- 测连接 / 连接 / 断开：是
- 连接级动作：否
- 方言别名：否

## 3 · 工作台(workbench)

左栏主机清单（默认 localhost；可添加堡垒机 / 直连 SSH / 经堡垒业务机，支持从堡垒发现导入）；中心五 Tab：总览 / 进程 / 服务(systemd 或 Windows) / 诊断 / Console；底栏操作日志。经典 SSH ProxyJump 跳板已支持；JumpServer/PAM 资产目录延后。

## 4 · 私有 RPC

| 方法名 | 入参 | 出参 | 说明 |
|--------|------|------|------|
| process/targets/sync | {connectionId, targets} | {ok} | 同步主机清单到 sidecar |
| process/targets/probe | {connectionId, target(+via/jump?)} | {success, hostname?, os?, hop?} | 测连接（支持跳板；不写入会话池） |
| process/bastion/discover | {connectionId, bastionId, mode?} | {items, count} | 在堡垒上发现内网主机候选 |
| process/overview | {connectionId, targetId} | overview | CPU/MEM/load/disk/net |
| process/metrics/history | {connectionId, targetId, metric?} | {samples} | 环形历史 |
| process/list | {connectionId, targetId, query?, limit?} | {items} | 进程表 |
| process/kill | {connectionId, targetId, pid, signal?} | {ok} | TERM/KILL |
| process/services/list | {connectionId, targetId} | {items} | systemd |
| process/services/action | {connectionId, targetId, unit, action} | {ok} | start/stop/restart |
| process/diagnose | {connectionId, targetId} | report | 聚合诊断 |
| process/exec | {connectionId, targetId, command} | {result} | 受控一次性命令 |
| process/logs | {connectionId, targetId, source?, lines?} | {result} | 日志快看 |

## 5 · 事件 / 二进制 / 文件贡献

- 事件推送：否（P0）
- 终端/PTY：否
- 文件贡献：无

## 6 · 权限与参考

- permissions: host.workbench, host.events, host.clipboard
- 模板：docker Vue + translation Go/jsonl SDK
- sidecar：Go
- 多语言：中英双语

| 项 | 值 |
|----|----|
| transport | stdio-jsonl |
| 模板来源 | docker(UI) + translation(SDK) |
| permissions 终值 | host.workbench, host.events, host.clipboard |
| 插件 id | io.datawise.community.process-ops |
