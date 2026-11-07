# 插件 Brief · Nacos Ops

## 1 · 一句话定位

```
连接 Nacos / rNacos，浏览命名空间与配置并发布，浏览服务与实例（服务发现）。
```

## 2 · 连接(connection-provider)

| key | label(中文) | type | binding | required | default | 说明/选项 |
|-----|--------------|------|---------|----------|---------|-----------|
| display_name | 显示名称 | text | name | | Nacos | |
| connect_mode | 连接方式 | select | config | ✓ | url | url / host |
| base_url | 控制台 URL | text | config | when url | | 如 http://host:8848/nacos |
| protocol | 协议 | select | config | when host | http | http / https |
| host | 主机 | text | host | when host | | |
| port | 端口 | number | port | when host | 8848 | |
| context_path | 上下文路径 | text | config | when host | | v2 默认 /nacos；v3 可空 |
| auth_mode | 认证方式 | select | config | ✓ | password | password / access_key |
| username | 用户名 | text | user | when password | | 空=匿名 |
| password | 密码 | password | password | when password | | |
| access_key | Access Key | text | config/secrets | when access_key | | Spas AK |
| secret_key | Secret Key | password | secrets | when access_key | | Spas SK |
| implementation | 实现 | select | config | ✓ | nacos | nacos / rnacos |
| version_mode | API 版本 | select | config | ✓ | auto | auto / v2 / v3；仅 nacos 可见 |
| namespace | 默认命名空间 | text | config | | | |
| read_only | 只读模式 | boolean | config | | false | 开启后禁止写操作 |
| insecure_skip_tls | 跳过 TLS 校验 | boolean | config | | false | |
| connect_timeout_secs | 连接超时(秒) | number | config | | 20 | |

- 测连接：是（test / connect / disconnect）
- 连接级动作：否
- 方言别名：否

## 3 · 工作台(workbench)

```
左侧图标栏：总览 / 配置 / 服务。
Overview：连通信息、命名空间数、API 模式。
Configs：命名空间树（新建/删除命名空间）→ 多标签编辑 → Publish / 历史恢复。
Services：命名空间筛选 + 服务列表 → 实例表。
```

## 4 · 私有 RPC

| 方法名 | 入参 | 出参 | 说明 |
|--------|------|------|------|
| nacos/info | {connectionId} | {host,baseUrl,authenticated,namespaceCount,v3Api,readOnly} | |
| nacos/namespaces | {connectionId} | {namespaces:[…],totalCount} | |
| nacos/namespaces/create | {connectionId,id?,name,desc?} | {ok,id,name,desc} | read_only 拒绝 |
| nacos/namespaces/update | {connectionId,id,name,desc?} | {ok,id,name,desc} | read_only 拒绝；禁止 public |
| nacos/namespaces/delete | {connectionId,id} | {ok,id} | read_only 拒绝；禁止 public |
| nacos/configs/list | {connectionId,namespaceId?,dataId?,group?,pageSize?} | {configs:[…],totalCount} | |
| nacos/configs/get | {connectionId,dataId,group?,namespaceId?} | detail | |
| nacos/configs/publish | {connectionId,dataId,content,group?,namespaceId?,type?} | detail | create-or-update；read_only 拒绝 |
| nacos/configs/delete | {connectionId,dataId,group?,namespaceId?} | {ok} | read_only 拒绝 |
| nacos/configs/history/list | {connectionId,dataId,group?,namespaceId?,pageSize?} | {histories:[…],totalCount} | |
| nacos/configs/history/get | {connectionId,dataId,group?,namespaceId?,nid} | detail | |
| nacos/services/list | {connectionId,namespaceId?,pageSize?} | {services:[…],totalCount} | |
| nacos/instances/list | {connectionId,serviceName,groupName?,namespaceId?} | {instances:[…],totalCount} | |

## 5 · 事件 / 二进制 / 文件贡献

- 事件推送：否
- 终端/PTY：否
- 文件贡献：无

## 6 · 权限与参考

- permissions: host.workbench, host.events, host.clipboard
- 模板：http-client（Go jsonl）+ React singlefile UI
- sidecar：Go
- 多语言：中英（manifest localizations + UI i18n）

| 项 | 值 |
|----|-----|
| transport | stdio-jsonl |
| 模板来源 | http-client + vite-plugin-singlefile React |
| permissions 终值 | host.workbench, host.events, host.clipboard |
| 插件 id | io.datawise.community.nacos-ops |
| version | 0.5.12 |
