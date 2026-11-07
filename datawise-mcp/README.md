# DataWise MCP Server

把 DataWise 的连接、Schema、SQL 审查与只读查询，通过 **MCP** 暴露给 Cursor / Claude Desktop 等 IDE 智能体。

包名 `@datawise/mcp-server` · 版本 **4.1.4** · 命令 `datawise-mcp`

---

## 前置条件

1. DataWise 后端已启动（默认 `http://localhost:18421`）
2. 具备 SQL 权限的会话或 API Token（`sql` scope）
3. **会话用户**还须具备与桌面一致的功能权限（见下表）；API Token 仍以 scope 为准

---

## 环境变量

| 变量 | 说明 |
|------|------|
| `DATAWISE_API_URL` | 后端根地址，默认 `http://localhost:18421` |
| `DATAWISE_SESSION_ID` | 浏览器会话 ID（请求头 `X-DW-Session-Id`） |
| `DATAWISE_API_TOKEN` | API Token（请求头 `X-DW-Api-Token`，可替代会话） |

### 会话权限（与桌面对齐）

| MCP 工具 | 所需桌面功能权限 |
|----------|------------------|
| `list_connections` / `list_tables` / `compare_schema` / `get_workbench_context` / `list_semantic_metrics` | `nav.database` |
| `review_sql` / `execute_readonly_sql` / `rerun_canvas` | `workbench.console.run`（写 SQL 另需 `workbench.console.dangerousSql`，但 MCP 执行路径仍只允许只读） |
| `propose_open_console` | `workbench.tab.new` |
| `generate_federated_sql` | `workbench.console.ai` + AI Pack |

---

## 安装与运行

```bash
cd datawise-mcp
npm install
npm run build
npm start
# 开发：npm run dev
```

---

## Cursor 配置示例

```json
{
  "mcpServers": {
    "datawise": {
      "command": "node",
      "args": ["E:/path/to/datawise-cli/datawise-mcp/dist/index.js"],
      "env": {
        "DATAWISE_API_URL": "http://localhost:18421",
        "DATAWISE_SESSION_ID": "your-session-id"
      }
    }
  }
}
```

将路径换成你的本机绝对路径；生产环境更推荐使用 `DATAWISE_API_TOKEN`。

---

## 工具一览

| 工具 | 作用 |
|------|------|
| `get_workbench_context` | 读取用户当前 UI 焦点（连接 / 打开 Tab / 编辑器预览） |
| `propose_open_console` | 提议打开 SQL 控制台（返回 `dw_confirm`，需在 DataWise UI 确认） |
| `list_connections` | 列出当前可见连接 |
| `list_tables` | 浏览库表 |
| `review_sql` | 执行前安全审查 |
| `execute_readonly_sql` | 仅 SELECT，经 DataWise 闸门执行 |
| `compare_schema` | 环境间 Schema 差异 |
| `list_semantic_metrics` | 语义指标目录 |
| `rerun_canvas` | 参数化重跑已保存分析画布 |
| `generate_federated_sql` | 自然语言 → 跨源联邦 SQL |

写操作与治理边界见 [../docs/GOVERNANCE.md](../docs/GOVERNANCE.md)。

---

## 相关

- 后端：[../datawise-backend/README.md](../datawise-backend/README.md)
- 使用说明书 · 桌面与生态：[../docs/user-manual/12-desktop-ecosystem.md](../docs/user-manual/12-desktop-ecosystem.md)
