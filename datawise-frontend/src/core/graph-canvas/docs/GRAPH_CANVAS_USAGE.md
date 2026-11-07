# Graph Canvas 使用指南

> **模块主目录：** `src/core/graph-canvas/`  
> **设计：** [GRAPH_CANVAS_CORE.md](./GRAPH_CANVAS_CORE.md)

## 1. 选哪个组件？

| 场景 | 用什么 |
|------|--------|
| 任意可缩放平移画布 | `DwGraphCanvas` |
| 简单标题节点（如 VQB 表卡） | `DwGraphNodeShell` |
| 带列清单的表节点（ER / 表关系） | `DwErTableNode` |
| 只读超大血缘 | 暂用现有 column-map；大图再挂 G6 adapter |

## 2. 基础用法

```ts
import {markRaw} from 'vue'
import {
  DwGraphCanvas,
  DwGraphNodeShell,
  type GraphCanvasNode,
  type GraphCanvasEdge,
} from '@/core/graph-canvas'

const nodeTypes = {vqb: markRaw(MyVqbNode)}

const nodes: GraphCanvasNode[] = [
  {id: 'a', type: 'vqb', position: {x: 40, y: 40}, data: {title: 'orders'}},
]
const edges: GraphCanvasEdge[] = [
  {id: 'e1', source: 'a', target: 'b', label: 'INNER', type: 'smoothstep'},
]
```

```vue
<DwGraphCanvas
  v-model:nodes="nodes"
  v-model:edges="edges"
  :node-types="nodeTypes"
  @node-drag-stop="onDragStop"
  @pane-drop="onDrop"
/>
```

自定义节点内可组合 `DwGraphNodeShell`，并使用 `Handle` / `Position`（从 `@/core/graph-canvas` 再导出）。

## 3. ER 表节点

```vue
<script setup>
import {DwErTableNode} from '@/core/graph-canvas'
</script>

<template>
  <DwErTableNode
    :title="data.tableName"
    :role-label="data.roleLabel"
    :columns="data.columns"
    :accent="data.role === 'center'"
  />
</template>
```

边示例（列端口）：

```ts
{
  id: 'fk1',
  source: 'table:orders',
  target: 'table:users',
  sourceHandle: 'out:user_id',
  targetHandle: 'in:id',
  label: 'user_id → id',
}
```

## 4. 扩展约定

1. **新通用交互**（框选多边、对齐辅助线）→ `core/graph-canvas/`
2. **新业务节点内容** → 各 feature，不要塞进 core
3. **皮肤** → 只改 `components/styles/dw-graph-canvas.css` 与节点 scoped 样式（`--dw-*`）
4. **血缘大规模** → 另开 G6 adapter，API 尽量贴近 `DwGraphCanvas` 的 nodes/edges 形状

## 5. 现成接入点

| 功能 | 入口 |
|------|------|
| Visual Query | `VisualQueryCanvas.vue` |
| 表关系图 | `TableRelationGraphPanel.vue` |
| Schema ER | `SchemaErGraphPanel.vue`（`DwGraphCanvas` + 列检视 / FK 连线 / 模型导出） |
| 血缘列映射 | `LineageColumnMapView.vue` |

## 6. 测试建议

```bash
cd datawise-frontend
npm run typecheck
```

画布交互以手工验收为主：缩放、拖拽、拖表入 VQB、ER 选边。
