# DataWise VS Code Extension

把 VS Code 里的 SQL（选区或整文件）一键送到 **DataWise 桌面版** SQL 控制台。

扩展名 `datawise-vscode` · 显示名 **DataWise** · 版本 **4.1.4**

---

## 功能

- **Open in DataWise** — 通过 `datawise://` Deep Link 打开（或聚焦）桌面应用，并载入当前 SQL

就这一件事，刻意保持轻量：编辑在 VS Code，执行与治理在 DataWise。

---

## 要求

- 已安装 [DataWise 桌面应用](../datawise-frontend/)，且系统已注册 `datawise://` 协议处理器

---

## 设置

| 设置项 | 说明 |
|--------|------|
| `datawise.connectionId` | `connections.xml` 中的连接 ID（推荐填写） |
| `datawise.database` | 可选默认库 / schema |

工作区示例（`.vscode/settings.json`）：

```json
{
  "datawise.connectionId": "mysql-local",
  "datawise.database": "app_db"
}
```

未配置 `connectionId` 时仍会打开桌面版，但可能需要手动选择连接。

---

## 用法

1. 在编辑器中打开或选中 SQL
2. 命令面板运行 **DataWise: Open in DataWise**，或右键 → **Open in DataWise**
3. DataWise 打开并在控制台 Tab 中载入 SQL

桌面端也可在 **设置 → 基础 → Deep Link** 查看协议说明。

---

## Deep Link 格式

```
datawise://open?connectionId=<id>&database=<db>&sql=<encoded-sql>
```

---

## 开发

```bash
cd datawise-vscode
npm install
npm run compile
npm test
```

在 VS Code 中打开本目录，按 **F5**（Run Extension）调试。

打包 `.vsix`（可选）：

```bash
npx @vscode/vsce package
```

---

## 相关

- 桌面打包：[../datawise-frontend/README.md](../datawise-frontend/README.md)
- 生态说明：[../docs/user-manual/12-desktop-ecosystem.md](../docs/user-manual/12-desktop-ecosystem.md)
