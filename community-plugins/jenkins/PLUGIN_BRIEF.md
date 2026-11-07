# 插件 Brief · Jenkins Ops

## 1 · 一句话定位

```
连接 Jenkins 控制器，浏览 Jobs / Nodes，触发与停止构建，跟随控制台日志，下载构建产物到本机。
```

## 2 · 连接(connection-provider)

| key | label(中文) | type | binding | required | default | 说明/选项 |
|-----|--------------|------|---------|----------|---------|-----------|
| display_name | 显示名称 | text | name | | Jenkins | |
| protocol | 协议 | select | config | ✓ | http | http=HTTP(内网) / https=HTTPS |
| host | IP / 域名 | text | host | ✓ | | |
| port | 端口 | number | port | ✓ | 8080 | |
| context_path | 上下文路径 | text | config | | | 如 /jenkins |
| username | 用户名 | text | user | ✓ | | |
| auth_method | 认证方式 | select | config | ✓ | api_token | api_token / password |
| api_token | API Token | password | password | when api_token | | |
| password | 密码 | password | password | when password | | |
| read_only | 只读模式 | boolean | config | | false | |
| download_dir | 下载目录 | text | config | | | 留空 = user.home/Downloads |
| insecure_skip_tls | 跳过 TLS 证书校验 | boolean | config | | false | 仅 https 可见 |
| connect_timeout_secs | 连接超时 (秒) | number | config | | 15 | |

- 测连接：是（test / connect / disconnect）
- 连接级动作：否
- 方言别名：username → user 槽位

## 3 · 工作台(workbench)

```
顶栏：endpoint、只读徽章、Jobs|Nodes 分段、刷新、打开 Jenkins 控制台。
Jobs：左树（folder 懒加载）+ 右详情（状态、最近构建、触发/参数、停止、日志跟随、Artifact 列表与下载）。
Nodes：节点表格（offline / executors / labels）。
```

## 4 · 私有 RPC

| 方法名 | 入参 | 出参 | 说明 |
|--------|------|------|------|
| jenkins/info | {connectionId} | {version,baseUrl,readOnly,…} | |
| jenkins/jobs/list | {connectionId,folder?,view?} | {jobs:[…]} | |
| jenkins/jobs/describe | {connectionId,jobName} | job detail | |
| jenkins/jobs/trigger | {connectionId,jobName,parameters?} | {queueUrl} | read_only 拒绝 |
| jenkins/builds/stop | {connectionId,jobName,buildNumber} | {ok} | read_only 拒绝 |
| jenkins/builds/log | {connectionId,jobName,buildNumber,start?} | {text,more,next} | |
| jenkins/builds/artifacts | {connectionId,jobName,buildNumber} | {artifacts:[…]} | |
| jenkins/builds/download | {connectionId,jobName,buildNumber,relativePath} | {path} | read_only 拒绝 |
| jenkins/nodes/list | {connectionId} | {nodes:[…]} | |
| jenkins/queue/list | {connectionId} | {items:[…]} | |

## 5 · 事件 / 二进制 / 文件贡献

- 事件推送：否（日志轮询）
- 终端/PTY：否
- 文件贡献：无（产物由 sidecar 写本机 download_dir）

## 6 · 权限与参考

- permissions: host.workbench, host.events, host.clipboard
- 模板：hello-workbench（Java）+ Vue singlefile UI
- sidecar：Java
- 多语言：中英（manifest localizations + UI i18n）

| 项 | 值 |
|----|-----|
| transport | stdio-jsonl |
| 模板来源 | hello-workbench + docker Vue |
| permissions 终值 | host.workbench, host.events, host.clipboard |
| 插件 id | io.datawise.community.jenkins |
