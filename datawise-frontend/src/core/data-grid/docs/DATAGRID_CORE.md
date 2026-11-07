# DataGrid 通用内核

> **状态：** 模块收拢完成；SQL Facade **宿主专用 by design**（2026-11）  
> **使用：** [DATAGRID_USAGE.md](./DATAGRID_USAGE.md)  
> **Portable API：** `@datawise/data-grid`（`DwDataGrid` / Table / hooks / Export & CellDetail）

## 分层

| 层 | 路径 | 职责 |
|----|------|------|
| Package | `@datawise/data-grid` | SPI + Dw 呈现 + 虚拟化/选择 hooks + Export/CellDetail（可发布） |
| Core (host) | `src/core/data-grid/`（本模块） | 宿主薄包装 + 仍本地的列面板 / Clause / 产品服务；通用 hooks 多已对齐包 |
| Workspace | `src/features/workspace/data-grid/` | view-state、日期、WHERE；Export 等为 **shim → core/package** |
| Facade (H) | `components/DataGrid.vue` | **Host-only** SQL 结果产品格；不迁包；新工作勿仿造整文件迁入 |

旧路径（`core/components/DataGrid.vue`、`features/workspace/services/grid-*.ts` 等）保留 shim。

## 对外契约

- `DataGrid` props / emits / slots / `v-model:viewState` **不变**
- e2e class：`.data-grid`、`.th-label`、`.data-cell` **保留**
- `GridViewState` 可选扩展：`pinnedColumns`、`pinnedRightColumns`、`hiddenColumns`、`sortSpecs`（旧 JSON 缺省为空）

## AG 对齐能力（自研实现）

| 能力 | 模块 |
|------|------|
| 列宽 / 顺序 / 左右 pin / 显隐 / autosize | `useGridColumnLayout` |
| Ctrl/Shift 行多选 | `useGridSelection` |
| 矩形块选 + Shift 扩展 | `useGridRangeSelection` |
| 方向键 / Tab / Home/End / Page / F2 / Enter / Esc / Ctrl+C/V | `useGridKeyboard` |
| TSV 复制粘贴（含块选） | `useGridClipboard` |
| 虚拟滚动 | `useGridVirtualWindow` |
| 多列排序（Ctrl+点击表头） | `grid-view-state` + 表头点击 |
| 列管理面板 | `GridColumnPanel` |
| 右键向下填充 | Facade 单元格菜单 |
| 划词插件抑制 | `useSuppressSelectionPlugins`（单元格为轻量 DOM，不再每格 Shadow） |

> **限制：** Web 应用无法真正禁用 Chrome 扩展；只能阻断划词触发。桌面 JCEF 通常不加载浏览器扩展。

## 扩展方式

1. 新通用能力：加在 `core/data-grid/`  
2. 新视觉块：改 `components/DwDataGridTable` / `styles/`  
3. 新 SQL/导出：加在 `features/workspace/data-grid/`  
4. 细节见 [DATAGRID_USAGE.md](./DATAGRID_USAGE.md)

## 测试

- `grid-clipboard.test.ts`、`grid-column-layout.test.ts`、`grid-virtual-window.test.ts`
- `use-grid-pending-edit.test.ts`、`grid-view-state.service.test.ts`、`data-grid-column-meta.test.ts`
