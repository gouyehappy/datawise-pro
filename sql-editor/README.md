# @datawise/sql-editor

Embeddable **SQL editor** for Vue 3 + Monaco — grammar-driven completion, schema-aware hints, multi-dialect keywords/formatting, and configurable snippets & shortcuts.

Version **4.1.4** · License **MIT** · [中文文档](./README.zh-CN.md)

![Demo](docs/demo.gif)

Inside the DataWise monorepo the frontend consumes this package as **TypeScript source** (`file:../sql-editor` + Vite alias) — no separate `npm run build`. For a standalone tryout, use the Demo below.

---

## Features

### Intelligent completion

| Capability | Description |
|------------|-------------|
| Slot-aware completion | Keywords, snippets, and schema items by clause (`SELECT` / `FROM` / `JOIN` / `WHERE` / …) |
| Table / column IntelliSense | From injected schema; aliases (`t.col`) and qualified names |
| FK JOIN lines | One-click `LEFT JOIN … ON …` when foreign keys are present |
| Auto table alias | Inserts an alias after picking a table (toggle in settings) |
| Enum / sample values | Completes `=` / `IN` values from `enumValues` or `loadColumnEnumValues` |
| Function completion | Dialect-specific function lists |
| Recent SQL | Host-injected recent queries for completion recall |

### Snippets & hint bar

- **Tab snippets**: type an abbreviation (e.g. `selj`) then Tab to expand
- **Quick chips**: HintBar shows slot-relevant inserts; click to insert
- **Layered config**: builtin → team import → personal overrides (editable in settings)

### Editing UX

- Multi-dialect keywords and formatting (see dialects below)
- Inline **run gutter** button on the current statement → emits `run-statement`
- Format document / selection
- Format-as-you-type (keyword newlines, etc.)
- UI locales: `en` / `zh-CN`
- Themes: `one-dark` / `github-light`

### Settings drawer

Gear icon (optional) opens settings:

- **Behavior**: auto-alias, HintBar, suggest details, folding, run gutter, font size, theme, locale, formatter, AI
- **Keybindings**: remap / disable
- **Quick chips**: enable / disable / custom
- **Snippets**: edit builtin and custom snippets

### Optional AI assistant

Configure an OpenAI-compatible API in settings:

- **Generate** / **Explain** / **Optimize** / **Fix** / **Mock data**
- Can appear in HintBar and the suggest widget

### Parser (separate subpath)

`@datawise/sql-editor/sql-parser` (dt-sql-parser) for validate / split / entity extract — parallel to the completion grammar, not a replacement.

---

## Install

```bash
npm install @datawise/sql-editor vue monaco-editor sql-formatter
```

Monorepo:

```json
"@datawise/sql-editor": "file:../sql-editor"
```

**Peers**: `vue` ≥ 3.4, `monaco-editor` ≥ 0.44, `sql-formatter` ≥ 15.

Optional prebuilt bundle (after `npm run build:lib`):

```ts
import { SqlEditor } from '@datawise/sql-editor/prebuilt'
import '@datawise/sql-editor/prebuilt/style.css'
```

DataWise desktop still consumes **TypeScript source** via Vite alias by default. CI runs `npm run build:lib` as a smoke check so `/prebuilt` stays buildable for external consumers.

---

## Quick start

Minimal (static schema, no plugin):

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

Local demo:

```bash
cd sql-editor
npm install && npm run dev   # http://localhost:5175
```

Try: `selj` + Tab · space after `FROM` to pick a table · `lf` + Tab · `Ctrl+Space` to force suggest.

---

## Recommended: Vue plugin

Install once at app bootstrap for theme, Monaco options, and shared Runtime:

```ts
import { createApp } from 'vue'
import { installSqlEditorPlugin, createSqlEditorRuntime } from '@datawise/sql-editor'
import App from './App.vue'

const app = createApp(App)

installSqlEditorPlugin(app, {
  config: {
    theme: 'one-dark', // or 'github-light'
    // monacoOptions: () => ({ fontSize: 14, … }),
  },
  runtime: createSqlEditorRuntime({
    dialect: 'mysql',
  }),
  // registerComponents: true (default) registers SqlEditor globally
})

app.mount('#app')
```

Then:

```vue
<template>
  <SqlEditor v-model="sql" dialect="postgresql" :schema="schema" />
</template>
```

---

## Schema: two modes

### 1. Static schema (demo / offline)

Pass `schema`, or wrap with `createStaticSchemaProvider`:

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

### 2. Dynamic provider (Explorer / API)

Implement `SqlSchemaProvider` to lazy-load tables, columns, and FKs:

```ts
import type { SqlSchemaProvider } from '@datawise/sql-editor'

const schemaProvider: SqlSchemaProvider = {
  async loadTables(connectionId, databaseName) {
    // return { tables, tableIds, catalog? }
  },
  async loadColumns(tableId) {
    // return { columns, foreignKeys? } or SqlColumnMeta[]
  },
  // optional for Trino / Presto:
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

`SqlEditor` uses `useSqlIntelliSense` internally to fetch columns for tables referenced in SQL; hosts may also call that composable directly.

---

## Component API

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `v-model` | `string` | required | SQL text |
| `dialect` | `string` | — | Datasource type → keywords / snippets / format |
| `schema` | `SqlEditorSchema` | — | Static schema |
| `schemaProvider` | `SqlSchemaProvider` | — | Dynamic schema |
| `connectionId` | `string` | — | With provider |
| `databaseName` | `string` | — | With provider |
| `theme` | `string` | — | Override injected theme |
| `monacoOptions` | `IStandaloneEditorConstructionOptions` | — | Override Monaco options |
| `readonly` | `boolean` | `false` | Read-only |
| `preview` | `boolean` | `false` | Settings preview; does not own global completion |
| `showHintBar` | `boolean` | settings | Force HintBar on/off |
| `showSettingsButton` | `boolean` | `true` | Show settings gear |

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `run-statement` | `{ sql, anchorLine }` | Run gutter click |
| `contextmenu` | `{ x, y, selectedText }` | Custom context menu |

### Exposed methods (`ref`)

```ts
import type { SqlEditorExpose } from '@datawise/sql-editor'

const editorRef = ref<SqlEditorExpose | null>(null)

editorRef.value?.getExecutableSql()   // selection, else full / current statement
editorRef.value?.formatDocument()
editorRef.value?.formatSelection()
editorRef.value?.insertTextAtCursor('…')
editorRef.value?.insertSnippetAtCursor('SELECT ${1:*} …')
editorRef.value?.triggerSuggest()
editorRef.value?.setErrorLine(12)
editorRef.value?.clearErrorLine()
editorRef.value?.layout()
```

See `SqlEditorExpose` for the full surface.

---

## Runtime (multi-instance / host control)

Share schema, dialect, and snippet layers across editors, or update from a store:

```ts
import {
  createSqlEditorRuntime,
  setDefaultSqlEditorRuntime,
} from '@datawise/sql-editor'

const runtime = createSqlEditorRuntime({ dialect: 'mysql' })
setDefaultSqlEditorRuntime(runtime)

runtime.setSchema(nextSchema)
runtime.setDialect('postgresql')
runtime.setRecentQueries([{ id: '1', sql: 'SELECT …' }])
runtime.sync()
```

| Method | Purpose |
|--------|---------|
| `setSchema` / `getSchema` | Schema |
| `setDialect` / `getDialect` | Dialect |
| `setSnippetLayers` | Team / personal layers |
| `setRecentQueries` | Recent SQL |
| `getEffectiveSettings` | Merged behavior / snippets / keybindings |
| `sync()` | Push to the completion engine |

---

## Built-in snippets (common)

Type the abbreviation at a matching slot, then **Tab** (or pick from suggest):

| Label | Expands to |
|-------|------------|
| `sel` | `SELECT … FROM … WHERE` |
| `selj` | `SELECT` + `INNER JOIN` template |
| `self` | `SELECT` + `LIMIT` |
| `cte` | `WITH … AS (…) SELECT` |
| `lf` / `ij` | `LEFT JOIN` / `INNER JOIN` |
| `grp` | `GROUP BY` |
| `ord` | `ORDER BY` |
| `lim` | `LIMIT` (dialect-equivalent on Oracle / SQL Server, etc.) |
| `ins` / `upd` / `del` | DML templates |
| `crt` / `alt` / `drop` | DDL templates |
| `dt7` / `dt30` | Last 7 / 30 days predicates (dialect-aware) |

Full list: `src/config/sql-snippets.shared.json`. Edit under Settings → Snippets.

---

## Dialects

Keyword packs (`keywords-config/`):

`mysql` · `postgresql` · `flink` · `hive` · `clickhouse` · `oracle` · `sqlserver` · `sqlite` · `common`

Aliases (resolved from `dialect`):

| Input | Resolves to |
|-------|-------------|
| `mariadb` / `oceanbase` / `tidb` / `starrocks` / `doris` | `mysql` |
| `kingbase` | `postgresql` |
| `dm` | `oracle` |
| `presto` | `hive` |
| `db2` | `sqlserver` |

The `sql-parser` subpath also covers Spark and other dt-sql-parser dialects — see that module’s docs.

---

## Exports

| Import | Purpose |
|--------|---------|
| `@datawise/sql-editor` | Components, plugin, runtime, types, i18n |
| `@datawise/sql-editor/plugin` | Plugin entry only |
| `@datawise/sql-editor/completion` | Grammar, provider, snapshot |
| `@datawise/sql-editor/sql-parser` | Parse / validate / entities |
| `@datawise/sql-editor/types` | TypeScript types |

Advanced hosts may also import `@datawise/sql-editor/settings/*`, `config/snippets`, `editor/shortcut-config`, `utils/*`, etc. (see `package.json` `exports`).

---

## Development

```bash
npm run typecheck
npm test
npm run test:regression
npm run test:grammar
npm run build:demo
```

| Script | Description |
|--------|-------------|
| `dev` | Standalone demo (port 5175) |
| `gen:snippets` | Regenerate snippet-related artifacts |
| `gen:demo-gif` | Record / build demo GIF |

---

## License

MIT
