<script setup lang="ts">
import {computed, ref} from 'vue'
import {
  VueFlow,
  useVueFlow,
  type Connection,
  type Edge,
  type EdgeMouseEvent,
  type EdgeTypesObject,
  type Node,
  type NodeDragEvent,
  type NodeMouseEvent,
  type NodeTypesObject,
} from '@vue-flow/core'
import {Background} from '@vue-flow/background'
import {Controls} from '@vue-flow/controls'
import {usePageLocalActive} from '@/core/composables/usePageLocalActive'
import type {DwGraphCanvasLabels} from '../types'
import {createSpacePanKeyFilter} from '../utils/graphCanvasKeyScope'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/controls/dist/style.css'
import './styles/dw-graph-canvas.css'

const props = withDefaults(
    defineProps<{
      nodes: Node[]
      edges: Edge[]
      flowId?: string
      nodeTypes?: NodeTypesObject
      edgeTypes?: EdgeTypesObject
      fitViewOnInit?: boolean
      showBackground?: boolean
      showControls?: boolean
      nodesDraggable?: boolean
      nodesConnectable?: boolean
      elementsSelectable?: boolean
      panOnDrag?: boolean | number[]
      zoomOnScroll?: boolean
      minZoom?: number
      maxZoom?: number
      /** Caps auto fit-view zoom (keeps node text sharper when the pane is large enough). */
      fitViewMaxZoom?: number
      defaultEdgeOptions?: Partial<Edge>
      backgroundGap?: number
      backgroundSize?: number
      dragOver?: boolean
      labels?: DwGraphCanvasLabels
    }>(),
    {
      fitViewOnInit: true,
      showBackground: true,
      showControls: true,
      nodesDraggable: true,
      nodesConnectable: false,
      elementsSelectable: true,
      panOnDrag: true,
      zoomOnScroll: true,
      minZoom: 0.25,
      maxZoom: 2.5,
      fitViewMaxZoom: undefined,
      backgroundGap: 18,
      backgroundSize: 1,
      dragOver: false,
    },
)

const emit = defineEmits<{
  'update:nodes': [nodes: Node[]]
  'update:edges': [edges: Edge[]]
  nodesChange: [changes: unknown[]]
  edgesChange: [changes: unknown[]]
  nodeClick: [event: NodeMouseEvent]
  nodeDragStop: [event: NodeDragEvent]
  edgeClick: [event: EdgeMouseEvent]
  edgeMouseEnter: [event: EdgeMouseEvent]
  edgeMouseLeave: [event: EdgeMouseEvent]
  connect: [connection: Connection]
  paneClick: [event: MouseEvent]
  paneDrop: [event: DragEvent]
  paneDragOver: [event: DragEvent]
  paneDragLeave: [event: DragEvent]
}>()

const {fitView, zoomIn, zoomOut} = useVueFlow({id: props.flowId})

function fitViewCrisp(opts?: Parameters<typeof fitView>[0]) {
  const maxZoom = opts?.maxZoom ?? props.fitViewMaxZoom
  return fitView({
    padding: 0.18,
    ...opts,
    ...(maxZoom != null ? {maxZoom} : {}),
  })
}

function onNodesInitialized() {
  if (!props.fitViewOnInit || props.fitViewMaxZoom == null) return
  void fitViewCrisp()
}

defineExpose({
  fitView: (opts?: Parameters<typeof fitView>[0]) => fitViewCrisp(opts),
  zoomIn: () => zoomIn(),
  zoomOut: () => zoomOut(),
})

const flowNodes = computed({
  get: () => props.nodes,
  set: (value) => emit('update:nodes', value),
})

const flowEdges = computed({
  get: () => props.edges,
  set: (value) => emit('update:edges', value),
})

/**
 * Vue Flow binds Space/Shift/Ctrl on document and preventDefaults matches.
 * - KeepAlive: disable entirely when page deactivated.
 * - Same tab (editor + lineage): Space pan only while pointer is over THIS canvas
 *   and focus/event is not in an editable (Monaco / input / …).
 */
const pageActive = usePageLocalActive()
const pointerOverCanvas = ref(false)
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const modKey = isMac ? 'Meta' : 'Control'

const spacePanFilter = createSpacePanKeyFilter({
  isPageActive: () => pageActive.value,
  isPointerOverCanvas: () => pointerOverCanvas.value,
})

const panActivationKeyCode = computed(() => (pageActive.value ? spacePanFilter : null))
const selectionKeyCode = computed(() => (pageActive.value ? 'Shift' : null))
const multiSelectionKeyCode = computed(() => (pageActive.value ? modKey : null))
const zoomActivationKeyCode = computed(() => (pageActive.value ? modKey : null))

function onPointerEnter() {
  pointerOverCanvas.value = true
}

function onPointerLeave() {
  pointerOverCanvas.value = false
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  emit('paneDrop', event)
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  emit('paneDragOver', event)
}

function onDragLeave(event: DragEvent) {
  emit('paneDragLeave', event)
}
</script>

<template>
  <div
      class="dw-graph-canvas"
      :class="{ 'is-dragover': dragOver }"
      @pointerenter="onPointerEnter"
      @pointerleave="onPointerLeave"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
  >
    <VueFlow
        :id="flowId"
        v-model:nodes="flowNodes"
        v-model:edges="flowEdges"
        :node-types="nodeTypes"
        :edge-types="edgeTypes"
        :fit-view-on-init="fitViewOnInit && fitViewMaxZoom == null"
        :nodes-draggable="nodesDraggable"
        :nodes-connectable="nodesConnectable"
        :elements-selectable="elementsSelectable"
        :pan-on-drag="panOnDrag"
        :zoom-on-scroll="zoomOnScroll"
        :min-zoom="minZoom"
        :max-zoom="maxZoom"
        :default-edge-options="defaultEdgeOptions ?? {type: 'smoothstep'}"
        :delete-key-code="null"
        :pan-activation-key-code="panActivationKeyCode"
        :selection-key-code="selectionKeyCode"
        :multi-selection-key-code="multiSelectionKeyCode"
        :zoom-activation-key-code="zoomActivationKeyCode"
        elevate-edges-on-select
        @nodes-initialized="onNodesInitialized"
        @nodes-change="emit('nodesChange', $event)"
        @edges-change="emit('edgesChange', $event)"
        @node-click="emit('nodeClick', $event)"
        @node-drag-stop="emit('nodeDragStop', $event)"
        @edge-click="emit('edgeClick', $event)"
        @edge-mouse-enter="emit('edgeMouseEnter', $event)"
        @edge-mouse-leave="emit('edgeMouseLeave', $event)"
        @connect="emit('connect', $event)"
        @pane-click="emit('paneClick', $event)"
    >
      <Background
          v-if="showBackground"
          pattern-color="currentColor"
          :gap="backgroundGap"
          :size="backgroundSize"
      />
      <Controls v-if="showControls" :show-interactive="false"/>
      <slot/>
    </VueFlow>
  </div>
</template>
