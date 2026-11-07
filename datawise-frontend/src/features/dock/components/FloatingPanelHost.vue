<script setup lang="ts">
/**
 * Shared float chrome for dock panels.
 * - teleport (default): `#dock-float-root` in AppShell (flattened so hosts share z-order)
 * - in-place (teleport=false): Workspace KeepAlive — toggle `floating` for center ↔ float
 */
import {computed, onBeforeUnmount} from 'vue'
import {useDockPlacementStore} from '@/features/dock/stores/dock-placement-store'
import {usePanelHeaderDrag} from '@/features/dock/composables/usePanelHeaderDrag'
import DockDragGrip from '@/features/dock/components/DockDragGrip.vue'
import WorkspaceFloatChrome from '@/features/dock/components/WorkspaceFloatChrome.vue'
import type {DockDragPanel, DockFloatRect} from '@/features/dock/types/dock.types'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'

const props = withDefaults(
  defineProps<{
    panel?: DockDragPanel
    minWidth?: number
    minHeight?: number
    /** When false, render in-place (no Teleport) — float Workspace without remount. */
    teleport?: boolean
    /**
     * Apply fixed rect + resize handle.
     * Defaults to true (dock float hosts). Workspace passes false when centered.
     */
    floating?: boolean
    /** Top dock grip for panels without a header (workspace). */
    dragSurface?: 'none' | 'grip'
  }>(),
  {
    panel: 'terminal',
    /** Prefer shell `#dock-float-root` — body paints under opaque `.app`; in-place collapses when center is empty. */
    teleport: true,
    floating: true,
    dragSurface: 'none',
  },
)

const dock = useDockPlacementStore()
const appConfig = useAppConfigStore()
const {onPointerDown: onGripPointerDown} = usePanelHeaderDrag(props.panel)

const isFloating = computed(() => props.floating ?? props.teleport)
const isDockDragging = computed(() => Boolean(dock.isDragging))

const defaults = computed(() => {
  switch (props.panel) {
    case 'explorer':
      return {minW: 180, minH: 240}
    case 'shortcut':
      return {minW: 220, minH: 280}
    case 'workspace':
      return {minW: 480, minH: 320}
    default:
      return {minW: 360, minH: 160}
  }
})

const minWidth = computed(() => props.minWidth ?? defaults.value.minW)
const minHeight = computed(() => props.minHeight ?? defaults.value.minH)
const rect = computed(() => dock.floatRect(props.panel))

const hostStyle = computed(() => {
  if (!isFloating.value) return undefined
  return {
    left: `${rect.value.x}px`,
    top: `${rect.value.y}px`,
    width: `${rect.value.width}px`,
    height: `${rect.value.height}px`,
    zIndex: dock.floatZIndex(props.panel),
  }
})

function raiseToFront() {
  if (!isFloating.value) return
  dock.raiseFloat(props.panel)
}

const hostClass = computed(() => ({
  'dock-float-host--inplace': !props.teleport,
  'is-floating': isFloating.value,
  'is-dock-dragging': isDockDragging.value,
}))

type ResizeEdge = 'se'
let activeEdge: ResizeEdge | null = null
let startX = 0
let startY = 0
let startRect: DockFloatRect = {...rect.value}

function onResizePointerDown(edge: ResizeEdge, event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  activeEdge = edge
  startX = event.clientX
  startY = event.clientY
  startRect = {...rect.value}
  window.addEventListener('pointermove', onResize)
  window.addEventListener('pointerup', endResize)
}

function onResize(event: PointerEvent) {
  if (!activeEdge) return
  const dx = event.clientX - startX
  const dy = event.clientY - startY
  let {width, height} = startRect
  if (activeEdge.includes('e')) width = Math.max(minWidth.value, startRect.width + dx)
  if (activeEdge.includes('s')) height = Math.max(minHeight.value, startRect.height + dy)
  dock.patchFloat(props.panel, {width, height})
}

function endResize() {
  if (activeEdge) appConfig.persistDockLayout()
  activeEdge = null
  window.removeEventListener('pointermove', onResize)
  window.removeEventListener('pointerup', endResize)
}

onBeforeUnmount(() => {
  endResize()
})
</script>

<template>
  <Teleport v-if="teleport" defer to="#dock-float-root">
    <div
        class="dock-float-host is-floating"
        :class="{ 'is-dock-dragging': isDockDragging }"
        :data-dock-float="panel"
        :style="hostStyle"
        @pointerdown.capture="raiseToFront"
        @focusin.capture="raiseToFront"
    >
      <div class="dock-float-host__body">
        <slot/>
      </div>
      <span
          data-float-resize
          class="dock-float-host__handle dock-float-host__handle--se"
          @pointerdown="onResizePointerDown('se', $event)"
      />
    </div>
  </Teleport>

  <div
      v-else
      class="dock-float-host"
      :class="hostClass"
      :data-dock-float="panel"
      :style="hostStyle"
      @pointerdown.capture="raiseToFront"
      @focusin.capture="raiseToFront"
  >
    <WorkspaceFloatChrome v-if="dragSurface === 'grip' && isFloating"/>
    <div
        v-else-if="dragSurface === 'grip'"
        data-dock-press
        class="dock-float-host__press"
    >
      <DockDragGrip variant="bar" @pointerdown="onGripPointerDown"/>
    </div>
    <div class="dock-float-host__body">
      <slot/>
    </div>
    <span
        v-if="isFloating"
        data-float-resize
        class="dock-float-host__handle dock-float-host__handle--se"
        @pointerdown="onResizePointerDown('se', $event)"
    />
  </div>
</template>

<style scoped>
.dock-float-host {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.dock-float-host.is-floating {
  position: fixed;
  pointer-events: auto;
  border: 1px solid var(--dw-panel-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-panel);
  box-shadow: var(--dw-panel-shadow), var(--dw-shadow-float);
  overflow: hidden;
}

/* Let DropZone minimap receive elementFromPoint while a dock drag is active. */
.dock-float-host.is-floating.is-dock-dragging {
  pointer-events: none;
}

.dock-float-host--inplace:not(.is-floating) {
  position: relative;
  flex: 1;
  align-self: stretch;
  width: auto;
  height: auto;
  /* Classic card chrome: keep top corners visible (press grip must not paint square over them). */
  border-radius: var(--dw-panel-radius);
}

.dock-float-host--inplace:not(.is-floating) .dock-float-host__press {
  border-radius: var(--dw-panel-radius) var(--dw-panel-radius) 0 0;
}

.dock-float-host--inplace:not(.is-floating) .dock-float-host__body {
  border-radius: var(--dw-panel-radius);
}

.dock-float-host--inplace.is-floating {
  flex: none;
}

.dock-float-host__press {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 5;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--dw-bg-panel) 88%, transparent) 0%,
      transparent 100%
  );
}

.dock-float-host__press :deep(.dock-drag-grip) {
  pointer-events: auto;
  margin: 0;
}

.dock-float-host__body {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dock-float-host__body > :deep(*) {
  flex: 1;
  min-height: 0;
  height: 100% !important;
  max-width: none !important;
}

.dock-float-host__handle {
  position: absolute;
  z-index: 2;
}

.dock-float-host__handle--se {
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  background:
      linear-gradient(
          135deg,
          transparent 0 46%,
          color-mix(in srgb, var(--dw-text-muted) 55%, transparent) 46% 52%,
          transparent 52% 62%,
          color-mix(in srgb, var(--dw-text-muted) 55%, transparent) 62% 68%,
          transparent 68%
      );
}
</style>
