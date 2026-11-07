<script setup lang="ts">
import {computed, markRaw, nextTick, onBeforeUnmount, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {EmptyState} from '@/core/components'
import {DwIcon} from '@/core/icons'
import {
  DwGraphCanvas,
  MarkerType,
  type EdgeMouseEvent,
  type GraphCanvasEdge,
  type GraphCanvasNode,
  type NodeTypesObject,
} from '@/core/graph-canvas'
import type {LineageGraph} from '@/features/lineage/types/lineage.types'
import {
  buildColumnLineageMap,
  hasColumnLineage,
  layoutColumnLineageMap,
} from '@/features/lineage/services/lineage-column-map.service'
import LineageEntityFlowNode from '@/features/lineage/components/LineageEntityFlowNode.vue'

const props = withDefaults(defineProps<{
  graph: LineageGraph | null
  compact?: boolean
}>(), {
  compact: false,
})

const {t} = useI18n()
const canvasRef = ref<{fitView: (o?: object) => void; zoomIn: () => void; zoomOut: () => void} | null>(null)
const hoverId = ref<string | null>(null)
const flowNodes = ref<GraphCanvasNode[]>([])
const flowEdges = ref<GraphCanvasEdge[]>([])
const nodeTypes = {'lineage-entity': markRaw(LineageEntityFlowNode)} as NodeTypesObject
const FLOW_ID = 'lineage-column-map'
const HOVER_CLEAR_MS = 90

let hoverClearTimer: ReturnType<typeof setTimeout> | null = null

const columnMap = computed(() => buildColumnLineageMap(props.graph))
const layout = computed(() => layoutColumnLineageMap(columnMap.value))
const hasContent = computed(() => hasColumnLineage(columnMap.value))

const activeLinkIds = computed(() => {
  if (!hoverId.value || !layout.value) return new Set<string>()
  const id = hoverId.value
  return new Set(
      layout.value.links
          .filter((link) => link.sourceId === id || link.outputId === id)
          .map((link) => link.id),
  )
})

const activeFieldIds = computed(() => {
  if (!hoverId.value || !layout.value) return new Set<string>()
  const id = hoverId.value
  const related = new Set<string>([id])
  for (const link of layout.value.links) {
    if (link.sourceId === id) related.add(link.outputId)
    if (link.outputId === id) related.add(link.sourceId)
  }
  return related
})

function clearHoverTimer() {
  if (hoverClearTimer) {
    clearTimeout(hoverClearTimer)
    hoverClearTimer = null
  }
}

function setHover(id: string | null) {
  clearHoverTimer()
  hoverId.value = id
}

function onFieldEnter(id: string) {
  setHover(id)
}

function onFieldLeave() {
  clearHoverTimer()
  hoverClearTimer = setTimeout(() => {
    hoverId.value = null
    hoverClearTimer = null
  }, HOVER_CLEAR_MS)
}

function edgeStroke(active: boolean, transform: boolean): string {
  if (active) return 'var(--dw-primary)'
  if (transform) return 'var(--dw-warning-fg)'
  return 'var(--dw-info-fg)'
}

function buildEdgeStyle(active: boolean, dim: boolean, transform: boolean) {
  const stroke = edgeStroke(active, transform)
  return {
    stroke,
    strokeWidth: active ? 2.6 : transform ? 1.7 : 1.55,
    strokeDasharray: !active && transform ? '6 4' : undefined,
    opacity: dim ? 0.16 : active ? 1 : 0.72,
  }
}

function syncFlow() {
  const current = layout.value
  if (!current) {
    flowNodes.value = []
    flowEdges.value = []
    return
  }

  const fieldToEntity = new Map<string, string>()
  for (const entity of current.entities) {
    for (const field of entity.fields) {
      fieldToEntity.set(field.id, entity.id)
    }
  }

  const hovering = Boolean(hoverId.value)
  const activeLinks = activeLinkIds.value
  const activeFields = activeFieldIds.value

  flowNodes.value = current.entities.map((entity) => ({
    id: entity.id,
    type: 'lineage-entity',
    position: {x: entity.x, y: entity.y},
    draggable: false,
    selectable: false,
    data: {
      name: entity.name,
      side: entity.side,
      sideLabel: entity.side === 'source' ? t('lineage.sideSource') : t('lineage.sideOutput'),
      fields: entity.fields.map((field) => ({
        id: field.id,
        label: field.label,
        transform: field.transform,
      })),
      activeFieldIds: activeFields,
      hoverId: hoverId.value,
      onFieldEnter,
      onFieldLeave,
    },
  }))

  flowEdges.value = current.links.map((link) => {
    const source = fieldToEntity.get(link.sourceId)
    const target = fieldToEntity.get(link.outputId)
    const active = activeLinks.has(link.id)
    const dim = hovering && !active
    const stroke = edgeStroke(active, link.transform)
    return {
      id: link.id,
      source: source ?? link.sourceId,
      target: target ?? link.outputId,
      sourceHandle: link.sourceId,
      targetHandle: link.outputId,
      label: link.showExpression ? (link.labelLines[0] ?? link.expression ?? undefined) : undefined,
      type: 'default',
      animated: false,
      zIndex: active ? 20 : link.transform ? 2 : 1,
      interactionWidth: 24,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: active ? 15 : 12,
        height: active ? 15 : 12,
        color: stroke,
      },
      class: [
        'lineage-edge',
        link.transform ? 'lineage-edge--transform' : 'lineage-edge--direct',
        active ? 'lineage-edge--active' : '',
        dim ? 'lineage-edge--dim' : '',
      ].filter(Boolean).join(' '),
      style: buildEdgeStyle(active, dim, link.transform),
      data: {
        transform: link.transform,
        expression: link.expression,
        sourceFieldId: link.sourceId,
        outputFieldId: link.outputId,
      },
    }
  })
}

function onEdgeMouseEnter(event: EdgeMouseEvent) {
  const fieldId = (event.edge.data as {sourceFieldId?: string} | undefined)?.sourceFieldId
  if (fieldId) setHover(fieldId)
}

function onEdgeMouseLeave() {
  onFieldLeave()
}

function fitView() {
  canvasRef.value?.fitView({padding: 0.18})
}

function zoomIn() {
  canvasRef.value?.zoomIn()
}

function zoomOut() {
  canvasRef.value?.zoomOut()
}

watch(
    layout,
    async () => {
      syncFlow()
      await nextTick()
      fitView()
    },
    {immediate: true},
)

watch(hoverId, () => {
  syncFlow()
})

watch(
    () => props.graph,
    () => {
      setHover(null)
    },
)

onBeforeUnmount(() => {
  clearHoverTimer()
})

defineExpose({fitView, zoomIn, zoomOut})
</script>

<template>
  <div class="er-lineage" :class="{ 'er-lineage--compact': compact }">
    <EmptyState
        v-if="!hasContent"
        embedded
        compact
        class="er-lineage__empty"
        :title="t('lineage.columnMapEmpty')"
    />
    <div v-else class="er-lineage__canvas-wrap">
      <div class="er-lineage__zoom" role="toolbar" :aria-label="t('lineage.canvasControls')">
        <button
            type="button"
            class="er-lineage__zoom-btn"
            :title="t('lineage.zoomOut')"
            @click="zoomOut"
        >
          <DwIcon name="minus" size="sm"/>
        </button>
        <button
            type="button"
            class="er-lineage__zoom-btn"
            :title="t('lineage.zoomIn')"
            @click="zoomIn"
        >
          <DwIcon name="plus" size="sm"/>
        </button>
        <span class="er-lineage__zoom-divider" aria-hidden="true"/>
        <button
            type="button"
            class="er-lineage__zoom-btn"
            :title="t('lineage.fitView')"
            @click="fitView"
        >
          <DwIcon name="fullscreen" size="sm"/>
        </button>
      </div>

      <div class="er-lineage__chrome">
        <div class="er-lineage__legend">
          <span class="er-lineage__legend-item">
            <i class="er-lineage__swatch er-lineage__swatch--direct" aria-hidden="true"/>
            {{ t('lineage.directLineage') }}
          </span>
          <span class="er-lineage__legend-sep" aria-hidden="true"/>
          <span class="er-lineage__legend-item">
            <i class="er-lineage__swatch er-lineage__swatch--transform" aria-hidden="true"/>
            {{ t('lineage.transformLineage') }}
          </span>
        </div>
        <p class="er-lineage__hint">{{ t('lineage.hoverHint') }}</p>
      </div>

      <DwGraphCanvas
          ref="canvasRef"
          class="er-lineage__flow"
          :flow-id="FLOW_ID"
          v-model:nodes="flowNodes"
          v-model:edges="flowEdges"
          :node-types="nodeTypes"
          :show-controls="false"
          :nodes-draggable="false"
          :elements-selectable="false"
          :fit-view-on-init="true"
          :min-zoom="0.35"
          :max-zoom="2.5"
          :background-gap="22"
          :background-size="0.9"
          @edge-mouse-enter="onEdgeMouseEnter"
          @edge-mouse-leave="onEdgeMouseLeave"
      />
    </div>
  </div>
</template>

<style scoped>
.er-lineage {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.er-lineage--compact {
  min-height: 280px;
}

.er-lineage__empty {
  flex: 1;
  padding: var(--dw-space-6);
}

.er-lineage__canvas-wrap {
  position: relative;
  flex: 1;
  min-height: 360px;
}

.er-lineage--compact .er-lineage__canvas-wrap {
  min-height: 260px;
}

.er-lineage__flow {
  width: 100%;
  height: 100%;
  min-height: inherit;
  border: none;
  border-radius: var(--dw-control-radius);
  background: color-mix(in srgb, var(--dw-bg-muted) 70%, var(--dw-bg-panel));
}

.er-lineage__flow :deep(.vue-flow__background) {
  --vue-flow-background-pattern-color: color-mix(in srgb, var(--dw-text) 3.5%, transparent);
}

.er-lineage__flow :deep(.vue-flow__edge-path) {
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: stroke 140ms ease, stroke-width 140ms ease, opacity 140ms ease;
}

.er-lineage__flow :deep(.vue-flow__edge-text) {
  fill: var(--dw-text-secondary);
  font-size: var(--dw-text-2xs);
  font-weight: 600;
}

.er-lineage__flow :deep(.vue-flow__edge-textbg) {
  fill: color-mix(in srgb, var(--dw-bg-panel) 92%, transparent);
  rx: 3;
}

.er-lineage__zoom {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 5;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius-sm);
  background: color-mix(in srgb, var(--dw-bg-panel) 94%, transparent);
  backdrop-filter: blur(6px);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--dw-text) 6%, transparent);
}

.er-lineage__zoom-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dw-icon-btn-size);
  height: var(--dw-icon-btn-size);
  border: none;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-text-secondary);
  cursor: pointer;
}

.er-lineage__zoom-btn:hover {
  background: var(--dw-bg-hover);
  color: var(--dw-text);
}

.er-lineage__zoom-divider {
  width: 1px;
  height: var(--dw-icon-size-md);
  margin: 0 2px;
  background: var(--dw-border);
}

.er-lineage__chrome {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: min(420px, calc(100% - 96px));
  pointer-events: none;
}

.er-lineage__legend {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  width: fit-content;
  padding: 5px 10px;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius-sm);
  background: color-mix(in srgb, var(--dw-bg-panel) 94%, transparent);
  backdrop-filter: blur(6px);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--dw-text) 6%, transparent);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  font-weight: 600;
}

.er-lineage__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.er-lineage__legend-sep {
  width: 1px;
  height: var(--dw-icon-size-xs);
  background: var(--dw-border);
}

.er-lineage__swatch {
  display: inline-block;
  width: var(--dw-icon-size-lg);
  height: 0;
  border-top: 2px solid var(--dw-info-fg);
  border-radius: 1px;
}

.er-lineage__swatch--transform {
  border-top-style: dashed;
  border-top-color: var(--dw-warning-fg);
}

.er-lineage__hint {
  margin: 0;
  padding: 0 2px;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-2xs);
  font-weight: 500;
  line-height: 1.4;
  opacity: 0.9;
}

.er-lineage__flow :deep(.lineage-edge--active .vue-flow__edge-path) {
  filter: drop-shadow(0 0 1.25px color-mix(in srgb, var(--dw-primary) 40%, transparent));
}

.er-lineage__flow :deep(.lineage-edge--dim .vue-flow__edge-text),
.er-lineage__flow :deep(.lineage-edge--dim .vue-flow__edge-textbg) {
  opacity: 0.12;
}

.er-lineage__flow :deep(.vue-flow__edge) {
  cursor: pointer;
}
</style>
