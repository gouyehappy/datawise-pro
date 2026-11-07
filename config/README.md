# 本地运行时配置

本目录存放**本机数据**，默认全部被 Git 忽略 — **请勿提交**。

仓库里只保留 `*.example`、本 README，以及 [`plugins/README.md`](./plugins/README.md)。

---

## 首次使用

```bash
cp config/connections.xml.example config/connections.xml
cp config/users.json.example config/users.json
```

按需：

- 连接器 JAR → `plugins/`
- JDBC 驱动 → `drivers/`（**桌面安装包默认不带**；首次连接从 Maven 下载，见 [drivers/README.md](./drivers/README.md)）

插件说明：[plugins/README.md](./plugins/README.md)  

生产部署（JDBC 元数据、鉴权、Prometheus、多实例）：[../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md)  
旧路径 → 租户作用域：[../docs/DEPLOYMENT.md#config-migration](../docs/DEPLOYMENT.md#config-migration)（`datawise config migrate`）

---

## 安全相关默认

来自 `application.yml`（无 profile 时）：

| 配置 | 默认 | dev / desktop |
|------|------|----------------|
| `datawise.query.max-result-rows` | `10000` | 同左（可覆盖） |
| `datawise.security.auth.require-authentication` | `true` | `true` |
| `datawise.security.connection-probe.allow-private-networks` | `false` | `true` |
| `datawise.connectors.require-manifest-integrity` | `true` | `false` |

---

## 常见路径（均不入库）

| 路径 | 说明 |
|------|------|
| `connections.xml` | 数据源（含加密密码）；启动后迁至 `tenants/default/connections.xml` |
| `teams.json` / `oidc.json` | 团队 / 登录开关；同样迁到租户目录 |
| `tenants/` | 租户索引、角色/成员、租户作用域配置 |
| `tenants/{id}/outbound-webhooks.json` | 出站 Webhook |
| `tenants/{id}/data-quality-templates.json` | 数据质量规则模板 |
| `tenants/{id}/ai-usage.json` | 租户当日 AI 调用计数（`jdbc` 时为表 `dw_tenant_ai_usage`） |
| `users.json` / `sessions.json` / `api-tokens.json` | 身份元数据（`storage.backend=file`） |
| `users/{id}/app.xml` | 应用偏好与 **AI 模型 / API Key**（可用 `dwsecret:`，见 [SECRETS.md](../docs/SECRETS.md)） |
| `sql-history.json` | SQL 执行历史（`jdbc` 时为 `dw_sql_history`） |
| `scripts/` | 各连接下的 SQL 脚本 |
| `cache/` | Schema 缓存 |
| `logs/datawise.log` | 统一运行日志（后端 + 桌面 JCEF；归档在 `logs/archive/`） |
| `ai-checkpoints/` | AI 分析断点 |
| `plugins/*.jar` · `plugins/manifest.json` · `drivers/` | 插件、完整性清单、驱动 |

`jdbc` 存储模式下，上述多项会落到对应 `dw_*` 表，可一次性从文件导入。

---

## 切勿提交

- 真实连接密码、`api-tokens.json`、`.datawise-master-key`
- 含 API Key 的 `app.xml` / `.env`
- 运行日志与会话文件
