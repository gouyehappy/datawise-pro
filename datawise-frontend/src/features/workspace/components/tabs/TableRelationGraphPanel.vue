<script setup lang="ts">
import {computed, markRaw, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwPanelState} from '@/core/components'
import {DwIcon} from '@/core/icons'
import type {WorkspaceTab} from '@/core/types'
import {
  DwGraphCanvas,
  type GraphCanvasEdge,
  type GraphCanvasNode,
  type NodeTypesObject,
} from '@/core/graph-canvas'
import {useTableRelations} from '@/features/workspace/composables/useTableRelations'
import {useRelationGraphColumns} from '@/features/workspace/composables/useRelationGraphColumns'
import {openRelatedTableByName} from '@/features/workspace/services/table-relations.actions'
import {
  buildTableRelationGraph,
  hasRelationGraphNeighborhood,
  layoutInitialRelationGraphPositions,
  RELATION_GRAPH_MAX_ROWS,
  type RelationGraphPoint,
  type TableRelationGraphNode,
} from '@/features/workspace/services/table-relation-graph.service'
import RelationTableFlowNode from '@/features/workspace/components/RelationTableFlowNode.vue'

const props = defineProps<{tab: WorkspaceTab}>()
const {t} = useI18n()

const CANVAS_WIDTH = 980
const CANVAS_HEIGHT = 680

const {relations, loading, error, databaseName} = useTableRelations(props.tab, {
  shouldLoad: () => true,
})

const baseGraph = computed(() => buildTableRelationGraph(relations.value))
const {enrichedGraph, loadingColumns} = useRelationGraphColumns(
    props.tab,
    baseGraph,
    relations,
    databaseName,
)

const hasNeighborhood = computed(() => hasRelationGraphNeighborhood(enrichedGraph.value))
const positions = ref<Record<string, RelationGraphPoint>>({})
const flowNodes = ref<GraphCanvasNode[]>([])
const flowEdges = ref<GraphCanvasEdge[]>([])
const nodeTypes = {'er-table': markRaw(RelationTableFlowNode)} as NodeTypesObject

watch(
    enrichedGraph,
    (nextGraph) => {
      positions.value = layoutInitialRelationGraphPositions(nextGraph, CANVAS_WIDTH, CANVAS_HEIGHT)
      syncFlow()
    },
    {immediate: true},
)

function roleLabel(node: TableRelationGraphNode): string {
  if (node.role === 'center') return t('workspace.tableDetail.relationGraphCenter')
  if (node.role === 'reference') return t('workspace.tableDetail.relationGraphReference')
  return t('workspace.tableDetail.relationGraphReferrer')
}

function syncFlow() {
  const graph = enrichedGraph.value
  flowNodes.value = graph.nodes.map((node) => {
    const pos = positions.value[node.id] ?? {x: 40, y: 40}
    return {
      id: node.id,
      type: 'er-table',
      position: {x: pos.x, y: pos.y},
      draggable: node.role !== 'center',
      data: {
        tableName: node.tableName,
        role: node.role,
        roleLabel: roleLabel(node),
        columns: node.columns.slice(0, RELATION_GRAPH_MAX_ROWS).map((col) => ({
          name: col.name,
          dataType: col.dataType,
          keyType: col.keyType,
          highlighted: col.highlighted,
        })),
      },
    }
  })

  flowEdges.value = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.fromNodeId,
    target: edge.toNodeId,
    sourceHandle: edge.sourceColumn ? `out:${edge.sourceColumn}` : undefined,
    targetHandle: edge.targetColumn ? `in:${edge.targetColumn}` : undefined,
    label: edge.label,
    type: 'smoothstep',
    data: {direction: edge.direction, constraintName: edge.constraintName},
  }))
}

function resetLayout() {
  positions.value = layoutInitialRelationGraphPositions(enrichedGraph.value, CANVAS_WIDTH, CANVAS_HEIGHT)
  syncFlow()
}

function onNodeDragStop(event: {node: GraphCanvasNode}) {
  positions.value = {
    ...positions.value,
    [event.node.id]: {
      x: Math.round(event.node.position.x),
      y: Math.round(event.node.position.y),
    },
  }
}

async function onNodeClick(event: {node: GraphCanvasNode}) {
  const node = enrichedGraph.value.nodes.find((item) => item.id === event.node.id)
  if (!node || node.role === 'center') return
  await openRelatedTableByName(props.tab, node.tableName, databaseName.value, 'relationGraph')
}
</script>

<template>
  <div class="relation-graph">
    <header class="relation-graph__toolbar">
      <p class="relation-graph__hint">{{ t('workspace.tableDetail.relationGraphHint') }}</p>
      <button
          type="button"
          class="dw-text-btn"
          :disabled="!hasNeighborhood"
          @click="resetLayout"
      >
        <DwIcon name="refresh" size="sm" :stroke-width="1.5"/>
        {{ t('workspace.tableDetail.relationGraphReset') }}
      </button>
    </header>

    <DwPanelState
        v-if="loading || loadingColumns"
        status="loading"
        :message="t('workspace.tableDetail.loading')"
        fill
    />
    <DwPanelState
        v-else-if="error"
        status="error"
        :message="error"
        fill
    />
    <DwPanelState
        v-else-if="!hasNeighborhood"
        status="empty"
        :message="t('workspace.tableDetail.relationGraphEmpty')"
        compact
        fill
    />
    <div
        v-else
        class="relation-graph__canvas-wrap"
        role="img"
        :aria-label="t('workspace.tableDetail.relationGraphAria', {name: enrichedGraph.centerTableName})"
    >
      <DwGraphCanvas
          v-model:nodes="flowNodes"
          v-model:edges="flowEdges"
          :node-types="nodeTypes"
          :fit-view-on-init="true"
          :min-zoom="0.35"
          :max-zoom="2"
          @node-drag-stop="onNodeDragStop"
          @node-click="onNodeClick"
      />
    </div>
  </div>
</template>

<style scoped>
.relation-graph {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-3);
  height: 100%;
  min-height: 0;
}

.relation-graph__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
}

.relation-graph__hint {
  margin: 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.relation-graph__canvas-wrap {
  flex: 1;
  min-height: 420px;
}
</style>
