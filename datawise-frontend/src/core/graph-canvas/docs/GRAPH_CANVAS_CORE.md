# Graph Canvas 通用内核

> **状态：** 模块落地（2026-07-30）  
> **使用：** [GRAPH_CANVAS_USAGE.md](./GRAPH_CANVAS_USAGE.md)

## 分层

| 层 | 路径 | 职责 |
|----|------|------|
| Engine | `@vue-flow/core` (+ background / controls) | 缩放、平移、拖拽、连线、选中 |
| Core | `src/core/graph-canvas/`（本模块） | Dw 皮肤、节点壳、ER 表节点、位置同步 |
| Feature | `features/workspace` / `features/lineage` | VQB JOIN、FK DDL、血缘 API |

业务代码应依赖 `@/core/graph-canvas`，**不要**在业务组件里直接散落 `@vue-flow/*` 皮肤样式。

## 选型边界

| 场景 | 引擎 | 说明 |
|------|------|------|
| VQB / ER / 表关系（可编辑） | **Vue Flow**（本模块） | 自定义 Vue 节点、端口、Dw 外观 |
| 血缘大图（只读、节点很多） | **AntV G6**（可选 adapter） | 当前列映射已用 Vue Flow；节点量极大再切 G6 |
| relation-graph | 不用作终态 | 定制弱 |

## 能力表

| 能力 | 模块 |
|------|------|
| 缩放 / 平移 / Controls | `DwGraphCanvas` |
| 点状背景 | `@vue-flow/background`（Dw 色） |
| 通用节点壳 | `DwGraphNodeShell` |
| ER 表节点（列 + Handle） | `DwErTableNode` |
| 自由布局位置同步 | `useGraphCanvasPositions` |

## 限制

- Schema ER 的 SVG 像素级导出需基于图模型或 DOM 快照另适配，不等同于旧手写 `<svg>` clone。
- 列级锚点依赖 `Handle` id（`in:col` / `out:col`）；业务边须带 `sourceHandle` / `targetHandle`。
- Web 扩展划词等与画布无关；勿在 core 引入 SQL / 血缘服务。
- **键盘作用域：**
  - KeepAlive 切走：`usePageLocalActive` 为 false 时，Space/Shift/Ctrl 绑定整段关闭。
  - **空格平移**：仅在指针位于**当前**画布上，且焦点/事件不在可编辑区（Monaco / input / `.nokey` 等）时生效；同页 SQL 编辑器旁开血缘时不应吞掉空格。
  - 全局快捷键：`useAppShortcutListener`（AppShell，scope=global）
  - 局部快捷键：`usePageLocalShortcuts`（按页面 owner 注入，离开页面或切模块后解绑）
  - 实现：`utils/graphCanvasKeyScope.ts`。
