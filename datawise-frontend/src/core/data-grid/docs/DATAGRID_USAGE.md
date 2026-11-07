# DataGrid 使用指南

> **模块主目录：** 本文件所在包 `src/core/data-grid/`  
> **业务目录：** [`features/workspace/data-grid/`](../../../features/workspace/data-grid/)  
> **设计：** [DATAGRID_CORE.md](./DATAGRID_CORE.md)

## 1. 目录地图

```
core/data-grid/                     # 通用网格（无 SQL 依赖）
  docs/                             # 本目录：使用 / 设计文档
  useGrid*.ts                       # 列布局 / 选择 / 键盘 / 剪贴板 / 块选 / 虚拟滚动
  meta/column-meta.ts               # 列类型启发式
  edit/useGridPendingEdit.ts        # 暂存增删改
  composables/                      # Facade 辅助（ClauseBar / Hover）
  components/
    DataGrid.vue                    # 查询结果 / 表数据 Facade
    DwDataGrid.vue                  # 目录列表壳
    DwDataGridTable.vue             # 表体呈现
    GridColumnPanel.vue             # 列显隐 / 左右固定
    styles/

features/workspace/data-grid/       # SQL / 导出 / view-state 业务
  components/                       # ClauseBar、导出、日期、表单视图
  services/                         # grid-*.service
  composables/useGridViewState.ts
```

**规则：** workspace 可依赖 core；core **不要**反向依赖 workspace 服务（`DataGrid.vue` Facade 是唯一允许的桥接层）。

## 2. 选哪个组件？

| 场景 | 用什么 |
|------|--------|
| SQL 结果集 / 表数据（编辑、ClauseBar、导出） | `DataGrid`（**宿主专用产品 Facade**；勿迁包） |
| Schema / Catalog 列表（搜索、分页） | `DwDataGrid`（portable：`@datawise/data-grid`） |
| 自研 / 第三方表体 | 包内 `useGrid*` + `DwDataGridTable`（+ 可选 Export/CellDetail） |

> **边界：** `@datawise/data-grid` 不导出 SQL-result `DataGrid.vue`。新网格请组合 Dw*；不要复制整份 Facade。

## 3. 用法示例

### 3.1 结果集 Facade（推荐路径）

```ts
import DataGrid from '@/core/data-grid/components/DataGrid.vue'
// 或兼容旧路径：
// import DataGrid from '@/core/components/DataGrid.vue'

import {useGridViewState} from '@/features/workspace/data-grid/composables/useGridViewState'
```

```vue
<DataGrid
  :columns="columns"
  :rows="rows"
  v-model:view-state="viewState"
  :editable="canEdit"
  :can-update="canUpdate"
  :column-details="columnDetails"
  :on-submit-changes="submitBatch"
/>
```

现成接入点：[`QueryResultPane.vue`](../../../features/workspace/components/QueryResultPane.vue)。

### 3.2 目录列表 `DwDataGrid`

```ts
import DwDataGrid from '@/core/data-grid/components/DwDataGrid.vue'
import type {DwDataGridColumn} from '@/core/data-grid/components/dw-data-grid.types'
```

```vue
<DwDataGrid :rows="rows" :columns="columns" row-key="id">
  <template #cell-name="{ row }">{{ row.name }}</template>
</DwDataGrid>
```

### 3.3 只拼通用内核（无业务 Facade）

```ts
import {
  useGridVirtualWindow,
  useGridColumnLayout,
  useGridSelection,
  useGridKeyboard,
  useGridClipboard,
  useGridRangeSelection,
} from '@/core/data-grid'
import DwDataGridTable from '@/core/data-grid/components/DwDataGridTable.vue'
```

自行提供行数据与编辑态；参考 `DataGrid.vue` 如何把 composable 接到 `DwDataGridTable`。

### 3.4 结果集快捷操作（Facade）

| 操作 | 行为 |
|------|------|
| 双击列宽分隔条 / 表头「按内容调整列宽」 | autosize |
| Ctrl/⌘ + 点击表头 | 多列排序（`sortSpecs`） |
| 拖拽单元格 / Shift+点击 | 矩形块选；Ctrl+C 复制 TSV |
| Home / End / Ctrl+Home/End / PageUp/Down / F2 | 键盘导航与编辑 |
| 表头右键：左右固定、隐藏、管理列 | 列布局 |
| 单元格右键：向下填充 | 同列向下复制当前值（需 `editable`） |

## 4. 扩展约定

1. **新通用能力**（框选、自动列宽等）→ `core/data-grid/`
2. **新 Dw 视觉** → `core/data-grid/components/` + `styles/`
3. **新 SQL/导出能力** → `features/workspace/data-grid/`
4. **保持 e2e class**：`.data-grid`、`.th-label`、`.data-cell`

## 5. 旧路径 → 新路径

| 旧 import | 新 import |
|-----------|-----------|
| `@/core/components/DataGrid.vue` | `@/core/data-grid/components/DataGrid.vue` |
| `@/core/components/DwDataGrid.vue` | `@/core/data-grid/components/DwDataGrid.vue` |
| `@/core/components/data-grid-column-meta` | `@/core/data-grid/meta/column-meta` |
| `@/core/composables/useGridPendingEdit` | `@/core/data-grid/edit/useGridPendingEdit` |
| `@/core/composables/useGridVirtualWindow` | `@/core/data-grid`（或 `useGridVirtualWindow`） |
| `@/features/workspace/services/grid-*.service` | `@/features/workspace/data-grid/services/grid-*` |
| `@/features/workspace/components/Grid*.vue` | `@/features/workspace/data-grid/components/Grid*` |
| `@/features/workspace/composables/useGridViewState` | `@/features/workspace/data-grid/composables/useGridViewState` |

旧路径仍提供 **shim re-export**，可渐进迁移。

公共 barrel：

```ts
import {DwDataGrid, useGridClipboard, useGridPendingEdit} from '@/core/data-grid'
import {downloadGridExport, useGridViewState} from '@/features/workspace/data-grid'
```

## 6. 已知限制

- **划词/浏览器 AI 扩展**：`useSuppressSelectionPlugins` + Shadow 单元格文案只能尽力抑制，无法真正禁用 Chrome 扩展；桌面 JCEF 通常无此问题。
- **`DataGrid.vue` = host-only 产品 Facade（by design）**：可继续削薄，但不要把 ClauseBar/导出/entitlement 下沉进通用 `useGrid*`，也不要整文件迁入 `@datawise/data-grid`。
- **勿与 `DwDataGrid` 强行合并**：生命周期不同（结果编辑 vs 目录浏览）。

## 7. 测试入口

```bash
cd datawise-frontend
npm run typecheck
npx tsx --test src/__tests__/regression/grid-clipboard.test.ts \
  src/__tests__/regression/grid-column-layout.test.ts \
  src/__tests__/regression/grid-virtual-window.test.ts \
  src/__tests__/regression/use-grid-pending-edit.test.ts \
  src/__tests__/regression/grid-view-state.service.test.ts \
  src/__tests__/regression/data-grid-column-meta.test.ts
```
