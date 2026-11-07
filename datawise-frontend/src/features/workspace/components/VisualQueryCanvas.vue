<script setup lang="ts">
import {computed, markRaw, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import {DwInput, EmptyState, FormField} from '@/core/components'
import DwSelect from '@/core/components/DwSelect.vue'
import type {SelectOption} from '@/core/components/select.types'
import type {VisualQueryJoin} from '@/features/workspace/services/visual-query-builder.service'
import {
  layoutVisualQueryCanvas,
  type VisualQueryCanvasPositionOverrides,
} from '@/features/workspace/services/visual-query-canvas.service'
import {
  DwGraphCanvas,
  type GraphCanvasEdge,
  type GraphCanvasNode,
  type NodeTypesObject,
} from '@/core/graph-canvas'
import VisualQueryTableNode from './VisualQueryTableNode.vue'

const props = defineProps<{
  fromTable: string
  fromAlias: string
  joins: VisualQueryJoin[]
  availableTables: string[]
  joinTypeOptions: SelectOption[]
  leftOnOptions: (index: number) => SelectOption[]
  rightOnOptions: (index: number) => SelectOption[]
  canAddJoin: boolean
}>()

const emit = defineEmits<{
  'drop-table': [table: string]
  'select-join': [index: number]
  'remove-join': [index: number]
  'set-join-type': [index: number, type: string]
  'set-join-on-left': [index: number, value: string]
  'set-join-on-right': [index: number, value: string]
}>()

const {t} = useI18n()
const selectedJoinIndex = ref<number | null>(null)
const dragOver = ref(false)
const paletteFilter = ref('')
const positionOverrides = ref<VisualQueryCanvasPositionOverrides>({})
const flowNodes = ref<GraphCanvasNode[]>([])
const flowEdges = ref<GraphCanvasEdge[]>([])

const nodeTypes = {vqb: markRaw(VisualQueryTableNode)} as NodeTypesObject

function pruneOverrides(allowedIds: Iterable<string>) {
  const allowed = new Set(allowedIds)
  const next: VisualQueryCanvasPositionOverrides = {}
  for (const [id, pos] of Object.entries(positionOverrides.value)) {
    if (allowed.has(id)) next[id] = pos
  }
  positionOverrides.value = next
}

function resetOverrides() {
  positionOverrides.value = {}
}

watch(
    () =>
        [
          props.fromTable,
          props.fromAlias,
          props.joins.map((j) => `${j.table}:${j.alias}:${j.type}`).join('|'),
          selectedJoinIndex.value,
          Object.entries(positionOverrides.value)
              .map(([id, pos]) => `${id}:${pos.x},${pos.y}`)
              .join(';'),
        ] as const,
    () => {
      const allowed = new Set<string>(['from'])
      props.joins.forEach((join, index) => {
        if (join.table.trim()) allowed.add(`join-${index}`)
      })
      pruneOverrides(allowed)

      const nextLayout = layoutVisualQueryCanvas({
        fromTable: props.fromTable,
        fromAlias: props.fromAlias,
        joins: props.joins,
        positionOverrides: positionOverrides.value,
      })

      flowNodes.value = nextLayout.nodes.map((node) => ({
        id: node.id,
        type: 'vqb',
        position: {x: node.x, y: node.y},
        data: {
          kind: node.kind,
          joinIndex: node.joinIndex,
          table: node.table,
          alias: node.alias,
          roleLabel: node.kind === 'from'
              ? t('console.visualQuery.canvasMain')
              : t('console.visualQuery.canvasJoin', {n: (node.joinIndex ?? 0) + 1}),
          selected: node.kind === 'join' && node.joinIndex === selectedJoinIndex.value,
        },
        draggable: true,
      }))

      flowEdges.value = nextLayout.edges.map((edge) => ({
        id: edge.id,
        source: edge.fromId,
        target: edge.toId,
        sourceHandle: 'out',
        targetHandle: 'in',
        label: edge.label,
        type: 'smoothstep',
      }))
    },
    {immediate: true},
)

const filteredPalette = computed(() => {
  const query = paletteFilter.value.trim().toLowerCase()
  if (!query) return props.availableTables
  return props.availableTables.filter((name) => name.toLowerCase().includes(query))
})

const selectedJoin = computed(() => {
  if (selectedJoinIndex.value == null) return null
  return props.joins[selectedJoinIndex.value] ?? null
})

function onPaletteDragStart(event: DragEvent, table: string) {
  event.dataTransfer?.setData('text/vqb-table', table)
  event.dataTransfer?.setData('text/plain', table)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}

function onPaneDragOver() {
  dragOver.value = true
}

function onPaneDragLeave() {
  dragOver.value = false
}

function onPaneDrop(event: DragEvent) {
  dragOver.value = false
  const table = (
      event.dataTransfer?.getData('text/vqb-table')
      || event.dataTransfer?.getData('text/plain')
      || ''
  ).trim()
  if (!table) return
  if (!props.fromTable) {
    emit('drop-table', table)
    return
  }
  if (!props.canAddJoin) return
  emit('drop-table', table)
}

function onNodeClick(event: {node: GraphCanvasNode}) {
  const data = event.node.data as {kind?: string; joinIndex?: number} | undefined
  if (data?.kind === 'join' && data.joinIndex != null) {
    selectedJoinIndex.value = data.joinIndex
    emit('select-join', data.joinIndex)
  }
}

function onNodeDragStop(event: {node: GraphCanvasNode}) {
  positionOverrides.value = {
    ...positionOverrides.value,
    [event.node.id]: {
      x: Math.round(event.node.position.x),
      y: Math.round(event.node.position.y),
    },
  }
}

function removeSelected() {
  if (selectedJoinIndex.value == null) return
  const index = selectedJoinIndex.value
  emit('remove-join', index)
  selectedJoinIndex.value = null
}

function resetLayout() {
  resetOverrides()
}
</script>

<template>
  <div class="vqb-canvas" data-wb-recipe="wb-canvas">
    <aside class="vqb-canvas__palette">
      <header class="vqb-canvas__palette-head">
        <strong>{{ t('console.visualQuery.canvasPalette') }}</strong>
        <DwInput
            v-model="paletteFilter"
            type="search"
            :placeholder="t('console.visualQuery.filterTables')"
        />
      </header>
      <ul class="vqb-canvas__palette-list">
        <li v-for="table in filteredPalette" :key="table">
          <button
              type="button"
              class="vqb-canvas__palette-item"
              draggable="true"
              @dragstart="onPaletteDragStart($event, table)"
              @dblclick="emit('drop-table', table)"
          >
            <DwIcon name="table" size="xs" :stroke-width="1.5"/>
            <span>{{ table }}</span>
          </button>
        </li>
        <li v-if="!filteredPalette.length" class="vqb-canvas__palette-empty">
          {{ t('console.visualQuery.canvasPaletteEmpty') }}
        </li>
      </ul>
      <p class="vqb-canvas__hint">{{ t('console.visualQuery.canvasPaletteHint') }}</p>
    </aside>

    <div class="vqb-canvas__main">
      <div v-if="fromTable" class="vqb-canvas__toolbar">
        <p class="vqb-canvas__hint">{{ t('console.visualQuery.canvasDragNodesHint') }}</p>
        <button
            v-if="Object.keys(positionOverrides).length"
            type="button"
            class="vqb-canvas__link"
            @click="resetLayout"
        >
          {{ t('console.visualQuery.canvasResetLayout') }}
        </button>
      </div>

      <div class="vqb-canvas__stage">
        <EmptyState
            v-if="!fromTable"
            bordered
            compact
            class="vqb-canvas__empty"
            :title="t('console.visualQuery.canvasEmpty')"
        />
        <DwGraphCanvas
            v-else
            v-model:nodes="flowNodes"
            v-model:edges="flowEdges"
            :node-types="nodeTypes"
            :drag-over="dragOver"
            :fit-view-on-init="true"
            :min-zoom="0.4"
            :max-zoom="1.8"
            @pane-drop="onPaneDrop"
            @pane-drag-over="onPaneDragOver"
            @pane-drag-leave="onPaneDragLeave"
            @node-click="onNodeClick"
            @node-drag-stop="onNodeDragStop"
        />
      </div>

      <div v-if="selectedJoin" class="vqb-canvas__inspector">
        <header class="vqb-canvas__inspector-head">
          <strong>{{ t('console.visualQuery.joinCardTitle', {n: (selectedJoinIndex ?? 0) + 1}) }}</strong>
          <button type="button" class="vqb-canvas__link" @click="removeSelected">
            {{ t('console.visualQuery.removeJoin') }}
          </button>
        </header>
        <div class="vqb-canvas__inspector-form">
          <FormField :label="t('console.visualQuery.joinType')">
            <DwSelect
                :model-value="selectedJoin.type"
                size="sm"
                :options="joinTypeOptions"
                @update:model-value="emit('set-join-type', selectedJoinIndex!, $event)"
            />
          </FormField>
          <div v-if="selectedJoin.type !== 'CROSS'" class="vqb-canvas__on">
            <FormField :label="t('console.visualQuery.joinOnLeft')">
              <DwSelect
                  :model-value="selectedJoin.onLeft"
                  size="sm"
                  :options="leftOnOptions(selectedJoinIndex!)"
                  @update:model-value="emit('set-join-on-left', selectedJoinIndex!, $event)"
              />
            </FormField>
            <span class="vqb-canvas__eq" aria-hidden="true">=</span>
            <FormField :label="t('console.visualQuery.joinOnRight')">
              <DwSelect
                  :model-value="selectedJoin.onRight"
                  size="sm"
                  :options="rightOnOptions(selectedJoinIndex!)"
                  @update:model-value="emit('set-join-on-right', selectedJoinIndex!, $event)"
              />
            </FormField>
          </div>
        </div>
      </div>
      <p v-else-if="fromTable && joins.some((j) => j.table)" class="vqb-canvas__hint">
        {{ t('console.visualQuery.canvasSelectJoin') }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.vqb-canvas {
  display: grid;
  grid-template-columns: minmax(160px, 200px) minmax(0, 1fr);
  gap: var(--dw-space-4);
  min-height: 280px;
}

.vqb-canvas__palette {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-sm);
  min-width: 0;
}

.vqb-canvas__palette-head {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-sm);
}

.vqb-canvas__palette-head strong {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-secondary);
}

.vqb-canvas__palette-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 260px;
  overflow: auto;
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg);
}

.vqb-canvas__palette-item {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  width: 100%;
  padding: var(--dw-space-2) var(--dw-space-3);
  border: none;
  border-bottom: 1px solid var(--dw-border-light);
  background: transparent;
  color: var(--dw-text);
  font-size: var(--dw-text-xs);
  font-family: var(--dw-font-mono);
  text-align: left;
  cursor: grab;
}

.vqb-canvas__palette-item:hover {
  background: var(--dw-bg-hover);
}

.vqb-canvas__palette-empty {
  padding: var(--dw-space-4);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.vqb-canvas__main {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-3);
  min-width: 0;
}

.vqb-canvas__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
}

.vqb-canvas__stage {
  height: 280px;
  min-height: 200px;
}

.vqb-canvas__empty {
  height: 100%;
  min-height: 200px;
  background: var(--dw-bg-muted);
}

.vqb-canvas__inspector {
  padding: var(--dw-pad-control-lg);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg);
}

.vqb-canvas__inspector-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
  margin-bottom: var(--dw-space-3);
}

.vqb-canvas__inspector-form {
  display: grid;
  gap: var(--dw-space-3);
}

.vqb-canvas__on {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: var(--dw-space-3);
  align-items: end;
}

.vqb-canvas__eq {
  padding-bottom: var(--dw-space-3);
  color: var(--dw-text-muted);
  font-weight: 700;
}

.vqb-canvas__link {
  border: none;
  background: transparent;
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}

.vqb-canvas__hint {
  margin: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

@media (max-width: 860px) {
  .vqb-canvas {
    grid-template-columns: 1fr;
  }

  .vqb-canvas__on {
    grid-template-columns: 1fr;
  }
}
</style>
