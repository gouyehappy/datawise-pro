# @datawise/sql-editor

可嵌入的 **SQL 编辑器**（Vue 3 + Monaco）— 语法驱动补全、Schema 感知提示、多方言关键字 / 格式化，以及可配置的片段与快捷键。

版本 **4.1.4** · 许可 **MIT** · [English](./README.md)

![演示](docs/demo.gif)

在 DataWise Monorepo 内由前端以 **TypeScript 源码** 引用（`file:../sql-editor` + Vite 别名），无需单独 `npm run build`。独立试用可跑下方 Demo。

---

## 功能一览

### 智能补全

| 能力 | 说明 |
|------|------|
| 语法槽位补全 | 按光标所在子句（`SELECT` / `FROM` / `JOIN` / `WHERE` / …）给出关键字、片段与 Schema 项 |
| 表 / 列补全 | 基于注入的 Schema；支持别名（`t.col`）、限定名 |
| 外键 JOIN | 有 FK 元数据时，可一键生成 `LEFT JOIN … ON …` |
| 自动表别名 | 选表后自动插入别名（可在设置中关闭） |
| 枚举 / 采样值 | 列带 `enumValues` 或 provider 实现 `loadColumnEnumValues` 时，在 `=` / `IN` 处补全取值 |
| 函数补全 | 按方言加载函数列表 |
| 近期 SQL | 宿主注入近期查询，供补全召回 |

### 片段与提示条

- **Tab 片段**：输入缩写（如 `selj`）后 Tab 展开多行模板
- **快捷芯片**：HintBar 按当前槽位展示常用片段 / 关键字，点击插入
- **多层配置**：内置 → 团队导入 → 个人覆盖，可在设置中编辑

### 编辑体验

- 多方言关键字与格式化（见下方方言表）
- 行内 **执行按钮**（gutter）：光标落在语句上时显示，触发 `run-statement`
- SQL 格式化（整篇 / 选区）
- 边写边排版（关键字换行等）
- 中 / 英 UI（`en` / `zh-CN`）
- 深色 / 浅色主题（`one-dark` / `github-light`）

### 设置面板

编辑器右上角齿轮（可关闭）打开设置抽屉，包含：

- **行为**：自动别名、HintBar、补全预览、折叠、执行按钮、字号、主题、语言、格式化、AI
- **快捷键**：可改绑 / 禁用
- **快捷芯片**：启用 / 禁用 / 自定义
- **片段**：启用 / 编辑内置与自定义片段

### AI 助手（可选）

在设置中配置 OpenAI 兼容 API 后可用：

- **生成** / **解释** / **优化** / **修错** / **Mock 数据**
- 可出现在 HintBar 与补全列表中

### 解析器（独立子包）

`@datawise/sql-editor/sql-parser` 基于 dt-sql-parser，用于校验、拆句、实体提取；与补全 grammar 并行，互不替代。

---

## 安装

```bash
npm install @datawise/sql-editor vue monaco-editor sql-formatter
```

Monorepo 本地引用：

```json
"@datawise/sql-editor": "file:../sql-editor"
```

**Peer 依赖**：`vue` ≥ 3.4、`monaco-editor` ≥ 0.44、`sql-formatter` ≥ 15。

---

## 快速开始

最简用法（静态 Schema，无需插件）：

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { SqlEditor, type SqlEditorSchema } from '@datawise/sql-editor'

const sql = ref('SELECT 1')

const schema: SqlEditorSchema = {
  tables: ['orders', 'users'],
  columns: {
    orders: [
      { name: 'id', type: 'bigint', pk: true },
      { name: 'user_id', type: 'bigint' },
      { name: 'status', type: 'varchar', enumValues: ['paid', 'pending'] },
    ],
    users: [
      { name: 'id', type: 'bigint', pk: true },
      { name: 'name', type: 'varchar' },
    ],
  },
  foreignKeys: [
    { fromTable: 'orders', fromColumn: 'user_id', toTable: 'users', toColumn: 'id' },
  ],
}
</script>

<template>
  <SqlEditor v-model="sql" dialect="mysql" :schema="schema" />
</template>
```

本地 Demo：

```bash
cd sql-editor
npm install && npm run dev   # http://localhost:5175
```

试一下：`selj` + Tab · `FROM` 后空格选表 · `lf` + Tab · `Ctrl+Space` 强制补全。

---

## 推荐接入：Vue 插件

应用启动时安装一次，统一注入主题、Monaco 选项与 Runtime：

```ts
import { createApp } from 'vue'
import { installSqlEditorPlugin, createSqlEditorRuntime } from '@datawise/sql-editor'
import App from './App.vue'

const app = createApp(App)

installSqlEditorPlugin(app, {
  config: {
    theme: 'one-dark', // 或 'github-light'
    // monacoOptions: () => ({ fontSize: 14, … }),
  },
  runtime: createSqlEditorRuntime({
    dialect: 'mysql',
    // schema / snippetLayers 可后续通过 runtime API 更新
  }),
  // registerComponents: true（默认）会全局注册 SqlEditor 等组件
})

app.mount('#app')
```

安装后可直接使用：

```vue
<template>
  <SqlEditor v-model="sql" dialect="postgresql" :schema="schema" />
</template>
```

---

## Schema 两种方式

### 1. 静态 Schema（演示 / 无后端）

通过 `schema` prop，或 `createStaticSchemaProvider`：

```ts
import { createStaticSchemaProvider } from '@datawise/sql-editor'

const provider = createStaticSchemaProvider(schema)
```

```vue
<SqlEditor
  v-model="sql"
  dialect="mysql"
  connection-id="demo"
  database-name="ecommerce"
  :schema-provider="provider"
/>
```

### 2. 动态 Provider（接 Explorer / API）

实现 `SqlSchemaProvider`，按连接与库懒加载表、列、外键：

```ts
import type { SqlSchemaProvider } from '@datawise/sql-editor'

const schemaProvider: SqlSchemaProvider = {
  async loadTables(connectionId, databaseName) {
    // 返回 { tables, tableIds, catalog? }
  },
  async loadColumns(tableId) {
    // 返回 { columns, foreignKeys? } 或 SqlColumnMeta[]
  },
  // 可选：Trino / Presto 等
  // async loadCatalogSchemaIndex(connectionId) { … }
  // async loadColumnEnumValues(tableId, columnName) { … }
}
```

```vue
<SqlEditor
  v-model="sql"
  :dialect="dialect"
  :connection-id="connectionId"
  :database-name="databaseName"
  :schema-provider="schemaProvider"
/>
```

组件内部用 `useSqlIntelliSense` 根据 SQL 引用自动拉列；也可在宿主侧自行调用该 composable。

---

## 组件 API

### Props

| Prop | 类型 | 默认 | 说明 |
|------|------|------|------|
| `v-model` | `string` | 必填 | SQL 文本 |
| `dialect` | `string` | — | 数据源类型，决定关键字 / 片段 / 格式化 |
| `schema` | `SqlEditorSchema` | — | 静态 Schema |
| `schemaProvider` | `SqlSchemaProvider` | — | 动态 Schema |
| `connectionId` | `string` | — | 与 provider 配合 |
| `databaseName` | `string` | — | 与 provider 配合 |
| `theme` | `string` | — | 覆盖注入主题 |
| `monacoOptions` | `IStandaloneEditorConstructionOptions` | — | 覆盖 Monaco 选项 |
| `readonly` | `boolean` | `false` | 只读 |
| `preview` | `boolean` | `false` | 设置页预览：不写全局补全上下文 |
| `showHintBar` | `boolean` | 跟随设置 | `true`/`false` 强制开关 HintBar |
| `showSettingsButton` | `boolean` | `true` | 是否显示设置按钮 |

### 事件

| 事件 | 载荷 | 说明 |
|------|------|------|
| `run-statement` | `{ sql, anchorLine }` | 点击 gutter 执行按钮 |
| `contextmenu` | `{ x, y, selectedText }` | 自定义右键菜单 |

### 暴露方法（`ref`）

```ts
import type { SqlEditorExpose } from '@datawise/sql-editor'

const editorRef = ref<SqlEditorExpose | null>(null)

editorRef.value?.getExecutableSql()   // 选区优先，否则全文 / 当前语句
editorRef.value?.formatDocument()
editorRef.value?.formatSelection()
editorRef.value?.insertTextAtCursor('…')
editorRef.value?.insertSnippetAtCursor('SELECT ${1:*} …')
editorRef.value?.triggerSuggest()
editorRef.value?.setErrorLine(12)     // 高亮错误行
editorRef.value?.clearErrorLine()
editorRef.value?.layout()
```

完整类型见 `SqlEditorExpose`。

---

## Runtime（多实例 / 宿主控制）

需要在多个编辑器间共享 Schema、方言、片段层，或在 Store 中更新时，使用 Runtime：

```ts
import {
  createSqlEditorRuntime,
  setDefaultSqlEditorRuntime,
} from '@datawise/sql-editor'

const runtime = createSqlEditorRuntime({ dialect: 'mysql' })
setDefaultSqlEditorRuntime(runtime)

// 连接切换时
runtime.setSchema(nextSchema)
runtime.setDialect('postgresql')
runtime.setRecentQueries([{ id: '1', sql: 'SELECT …' }])
runtime.sync()
```

常用方法：

| 方法 | 作用 |
|------|------|
| `setSchema` / `getSchema` | Schema |
| `setDialect` / `getDialect` | 方言 |
| `setSnippetLayers` | 团队 / 个人片段层 |
| `setRecentQueries` | 近期 SQL |
| `getEffectiveSettings` | 合并后的快捷键 / 片段 / 行为设置 |
| `sync()` | 推送到补全引擎 |

---

## 内置片段（常用）

在语句开头或对应槽位输入缩写后按 **Tab**（或从补全列表选择）：

| 缩写 | 展开内容 |
|------|----------|
| `sel` | `SELECT … FROM … WHERE` |
| `selj` | `SELECT` + `INNER JOIN` 模板 |
| `self` | `SELECT` + `LIMIT` |
| `cte` | `WITH … AS (…) SELECT` |
| `lf` / `ij` | `LEFT JOIN` / `INNER JOIN` |
| `grp` | `GROUP BY` |
| `ord` | `ORDER BY` |
| `lim` | `LIMIT`（Oracle / SQL Server 等为方言等价写法） |
| `ins` / `upd` / `del` | DML 模板 |
| `crt` / `alt` / `drop` | DDL 模板 |
| `dt7` / `dt30` | 近 7 / 30 天条件（按方言生成日期表达式） |

完整列表见 `src/config/sql-snippets.shared.json`；可在设置 → 片段中增删改。

---

## 支持的方言

关键字配置（`keywords-config/`）：

`mysql` · `postgresql` · `flink` · `hive` · `clickhouse` · `oracle` · `sqlserver` · `sqlite` · `common`

别名映射（传入 `dialect` 时自动解析）：

| 传入值 | 实际配置 |
|--------|----------|
| `mariadb` / `oceanbase` / `tidb` / `starrocks` / `doris` | `mysql` |
| `kingbase` | `postgresql` |
| `dm` | `oracle` |
| `presto` | `hive` |
| `db2` | `sqlserver` |

解析器（`sql-parser`）另支持 Spark 等 dt-sql-parser 方言，见该子路径文档注释。

---

## 子路径导出

| 导入 | 用途 |
|------|------|
| `@datawise/sql-editor` | 组件、插件、Runtime、类型、i18n |
| `@datawise/sql-editor/plugin` | 仅插件入口 |
| `@datawise/sql-editor/completion` | 补全 grammar、provider、快照 |
| `@datawise/sql-editor/sql-parser` | 解析 / 校验 / 实体提取 |
| `@datawise/sql-editor/types` | TypeScript 类型 |

高级集成还可直接引用 `@datawise/sql-editor/settings/*`、`config/snippets`、`editor/shortcut-config`、`utils/*` 等（见 `package.json` `exports`）。

---

## 开发

```bash
npm run typecheck
npm test
npm run test:regression
npm run test:grammar
npm run build:demo
```

| 脚本 | 说明 |
|------|------|
| `dev` | 独立 Demo（端口 5175） |
| `gen:snippets` | 重新生成内置片段相关产物 |
| `gen:demo-gif` | 录制 / 生成演示 GIF |

---

## License

MIT
