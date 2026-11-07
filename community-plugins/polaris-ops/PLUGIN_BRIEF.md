# 插件 Brief · Polaris Ops

## 1 · 一句话定位

```
连接腾讯 PolarIS，浏览命名空间、服务与实例，浏览并创建/更新/删除/克隆配置。
```

## 2 · 连接(connection-provider)

| key | label(中文) | type | binding | required | default | 说明/选项 |
|-----|--------------|------|---------|----------|---------|-----------|
| display_name | 显示名称 | text | name | | Polaris | |
| connect_mode | 连接方式 | select | config | ✓ | url | url / host |
| base_url | 控制台 URL | text | config | when url | | 如 http://host:8090 |
| protocol | 协议 | select | config | when host | http | http / https |
| host | 主机 | text | host | when host | | |
| port | 端口 | number | port | when host | 8090 | |
| context_path | 上下文路径 | text | config | when host | | |
| auth_method | 认证方式 | select | config | ✓ | password | password / token |
| username | 用户名 | text | user | when password | | |
| password | 密码 | password | password | when password | | |
| token | Token | password | secrets | when token | | 静态 Token |
| owner | Owner | text | config | | | |
| read_only | 只读模式 | boolean | config | | false | 开启后禁止写操作 |
| insecure_skip_tls | 跳过 TLS 校验 | boolean | config | | false | |
| connect_timeout_secs | 连接超时(秒) | number | config | | 20 | |

- 测连接：是（test / connect / disconnect）
- 连接级动作：否
- 方言别名：否

## 3 · 工作台(workbench)

```
左侧图标栏：总览 / 配置 / 服务。
Overview：连通信息、命名空间列表。
Configs：命名空间树（新建/删除）→ 多标签编辑 → 创建/更新发布/删除/克隆/历史。
Services：命名空间筛选 + 服务列表 → 实例表。
```

## 4 · 私有 RPC

| 方法名 | 入参 | 出参 | 说明 |
|--------|------|------|------|
| polaris/info | {connectionId} | {host,baseUrl,authenticated,namespaceCount,readOnly} | |
| polaris/namespaces | {connectionId} | {namespaces:[…],totalCount} | |
| polaris/namespaces/create | {connectionId,name,comment?} | {ok,name,comment} | read_only 拒绝 |
| polaris/namespaces/delete | {connectionId,name} | {ok,name} | read_only 拒绝 |
| polaris/configs/list | {connectionId,namespace?,group?,name?,limit?} | {configs:[…],totalCount,truncated?} | |
| polaris/configs/get | {connectionId,namespace,group,name} | detail | |
| polaris/configs/create | {connectionId,namespace,group,name,content,format?} | detail | read_only 拒绝 |
| polaris/configs/update | {connectionId,namespace,group,name,content,format?} | detail | read_only 拒绝 |
| polaris/configs/delete | {connectionId,namespace,group,name} | {ok} | read_only 拒绝 |
| polaris/configs/history | {connectionId,namespace,group,name,limit?} | {histories:[…],totalCount} | |
| polaris/services/list | {connectionId,namespace?,limit?} | {services:[…],totalCount,truncated?} | |
| polaris/instances/list | {connectionId,namespace,service,limit?} | {instances:[…],totalCount,truncated?} | |

## 5 · 事件 / 二进制 / 文件贡献

- 事件推送：否
- 终端/PTY：否
- 文件贡献：无

## 6 · 权限与参考

- permissions: host.workbench, host.events, host.clipboard
- 模板：http-client（Go jsonl）+ React DATAWISE_INLINE（Monaco）
- sidecar：Go
- 多语言：中英（manifest localizations + UI i18n）

| 项 | 值 |
|----|-----|
| transport | stdio-jsonl |
| 模板来源 | nacos-ops IDE shell + PolarIS RPC |
| permissions 终值 | host.workbench, host.events, host.clipboard |
| 插件 id | io.datawise.community.polaris-ops |
| version | 0.3.12 |
