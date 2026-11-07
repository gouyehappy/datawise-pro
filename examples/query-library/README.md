# Query Library（Git + CI）

把团队 SQL 书签放进 Git，用 DataWise Headless CLI 做校验与 CI 执行。

---

## 目录约定

```text
query-library/
  query-library.json
  queries/
    health-check.sql
```

`query-library.json` 用相对路径引用 `.sql`。每条查询需要稳定的 `id`、可读的 `name`；CI 执行时还需要 DataWise `connection` id。

本目录 [`query-library.json`](./query-library.json) 是可直接试跑的示例清单。

---

## 仅校验（无需后端）

```bash
cd headless-cli
npm install && npm run build

node dist/main.js query-library validate -m ../examples/query-library/query-library.json
node dist/main.js query-library validate -m ../examples/query-library/query-library.json --strict
```

---

## CI 中执行

需要运行中的 DataWise 后端，以及带 `sql` scope 的 API Token。

```bash
export DATAWISE_API_TOKEN=...
export DATAWISE_SERVER=https://datawise.example.com

datawise query-library run -m ./query-library/query-library.json

# 只跑一条
datawise query-library run -m ./query-library/query-library.json --id health-check
```

---

## 清单字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 稳定 slug，供 `--id` 使用 |
| `name` | 是 | 展示名 |
| `file` | 是 | 相对清单的 `.sql` 路径 |
| `connection` | run 时必填 | DataWise 连接 id |
| `connectionName` | 否 | 导出时的人类可读标签 |
| `database` | 否 | 库 / schema |
| `tags` | 否 | 自由标签 |
| `ci.enabled` | 否 | 默认 `true`；`false` 则 `run` 跳过 |
| `ci.maxRows` | 否 | 传给 SQL 执行 API |
| `ci.expectMinRows` | 否 | 行数过少则失败 |
| `ci.expectMaxRows` | 否 | 行数过多则失败 |

---

## 从 DataWise UI 导出

在 **查询书签** 中，对已保存的控制台书签使用 **Export for Git CI**，会下载：

- `queries/<id>.sql`
- 起步用的 `query-library.json`

启用 CI `run` 前，请把 `connection` 改成预发 / CI 环境的连接 id。

CLI 说明：[../../headless-cli/README.md](../../headless-cli/README.md)
