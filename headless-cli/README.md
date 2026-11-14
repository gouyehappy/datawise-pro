# DataWise Headless CLI

面向 CI 与自动化的命令行客户端 — 对运行中的 DataWise 后端发起迁移、SQL 执行与 Query Library 流水线。

包名 `@datawise/headless-cli` · 版本 **4.1.4** · 命令 **`datawise`**

---

## 安装

```bash
cd headless-cli
npm install
npm run build
```

开发调试：`npm run dev -- <command> …`

---

## 鉴权

在后端配置 API Token（见 `datawise-frontend/resources/bundle-config/api-tokens.example.json`，复制为运行时 `config/api-tokens.json`）。

| Scope | 用途 |
|-------|------|
| `migration` | `POST /api/migration/batch` · config-layout migration |
| `sql` | `GET /api/sql/connections` · `POST /api/sql/execute` |
| `runtime` | Connector market install/uninstall · `POST /api/runtime/import` |

**全局选项 / 环境变量**

| 选项 | 环境变量 | 默认 |
|------|----------|------|
| `--server` | `DATAWISE_SERVER` | `http://localhost:18421` |
| `--token` | `DATAWISE_API_TOKEN` | （必填，除本地校验类命令外） |

任意命令可加 `--json` 输出机器可读结果。

---

## 命令

### `migrate run`

跨连接批量迁表：

```bash
datawise --token "$DATAWISE_API_TOKEN" migrate run \
  --source conn-src --source-db shop \
  --target conn-dst --target-db shop \
  --tables users,orders \
  --truncate
```

`overallStatus === success` 时退出码 `0`，否则 `1`。

加 `--create-missing` 时，报告附带 `structureDeployAtomicity`（`guaranteed_rollback` / `partial_effects_possible`）与说明，便于 CI/Agent 诚实处理非事务性 DDL 方言。

### `agent setup` / `agent doctor`

安装官方 Agent Skill 到本机（默认 `~/.agents/skills/datawise`）：

```bash
datawise agent setup
datawise agent setup --force
datawise agent doctor
```

源目录为仓库 `skills/datawise/`。若目标已有本地修改，需 `--force` 覆盖，或 `--target <dir>` 另装。

### `context`

为 AI Agent 生成紧凑 schema 包（只读）：

```bash
datawise --token "$DATAWISE_API_TOKEN" context shop-db --database shop --tables users,orders --json
datawise --token "$DATAWISE_API_TOKEN" context shop-db --database shop --max-tables 8
```

默认最多 8 张表（`--max-tables` 钳制 1–20）。官方 Skill 见仓库 `skills/datawise/`。

### `sql connections`

列出当前 API Token 用户**可见**的连接（与桌面 Explorer 同源：自有 + 团队共享），并显示有效权限：

```bash
datawise --token "$DATAWISE_API_TOKEN" sql connections
datawise --token "$DATAWISE_API_TOKEN" sql connections --json
```

| 列 | 含义 |
|----|------|
| ACCESS | `readonly` / `readwrite` / `ddl`（团队共享连接的有效权限） |
| SHARED | 是否来自团队共享 |

共享连接语义与桌面一致：只读成员无法写；生产写仍走团队审批（`SQL_PRODUCTION_APPROVAL_REQUIRED`），CLI **不能绕过**。见 [GOVERNANCE.md](../docs/GOVERNANCE.md)。

### `sql exec`

执行 SQL 文件（`--connection` 支持 **id 或唯一名称**）：

```bash
datawise --token "$DATAWISE_API_TOKEN" sql exec \
  --connection conn-1 \
  --database shop \
  -f ./scripts/seed.sql

# 按连接显示名（须唯一）
datawise --token "$DATAWISE_API_TOKEN" sql exec \
  --connection "Staging" \
  -f ./scripts/seed.sql
```

### `query-library validate`

校验 Git 托管的 `query-library.json` 与引用的 `.sql`（**无需后端**）：

```bash
datawise query-library validate -m ../examples/query-library/query-library.json
datawise query-library validate -m ./query-library/query-library.json --strict
```

### `query-library run`

按清单执行开启了 CI 的查询（需后端 + `sql` scope）：

```bash
datawise --token "$DATAWISE_API_TOKEN" query-library run \
  -m ./query-library/query-library.json

# 只跑一条
datawise --token "$DATAWISE_API_TOKEN" query-library run \
  -m ./query-library/query-library.json --id health-check
```

`run` 始终按 `--strict` 语义先校验。示例见 [../examples/query-library/README.md](../examples/query-library/README.md)。

### `config migrate`

将旧版配置路径迁到租户作用域布局：

```bash
datawise config migrate --dry-run
datawise config migrate
```

说明：[../docs/DEPLOYMENT.md#config-migration](../docs/DEPLOYMENT.md#config-migration)

---

## 开发

```bash
npm run typecheck
npm run test
npm run dev -- migrate run --help
```

---

## 相关

- 治理入口：[../docs/GOVERNANCE.md](../docs/GOVERNANCE.md)
- 后端 API：[../datawise-backend/README.md](../datawise-backend/README.md)
