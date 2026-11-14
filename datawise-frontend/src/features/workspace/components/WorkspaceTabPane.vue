<script setup lang="ts">
/**
 * Stable mount shell for a workspace tab.
 * mode flips main ↔ float ↔ hidden without moving the content vnode — no session reload.
 */
import {computed, onBeforeUnmount, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import type {WorkspaceTab} from '@/core/types'
import {IconButton, PanelErrorBoundary} from '@/core/components'
import {DwIcon} from '@/core/icons'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {resolveWorkspaceTab} from '@/features/workspace/tab-registry'
import WorkspaceTabIcon from '@/features/workspace/components/WorkspaceTabIcon.vue'
import CommunityWorkbenchTab from '@/features/community-plugin/components/CommunityWorkbenchTab.vue'
import {
  TAB_FLOAT_MIN_HEIGHT,
  TAB_FLOAT_MIN_WIDTH,
  TAB_FLOAT_MINIMIZED_HEIGHT,
  clampTabFloatToBounds,
  resolveTabFloatSnap,
  type WorkspaceTabPaneMode,
} from '@/features/workspace/services/workspace-tab-float.service'

const props = defineProps<{
  tab: WorkspaceTab
  mode: WorkspaceTabPaneMode
  bounds: {width: number; height: number}
  /** Main-surface paint gate: keep community hidden until first paint. */
  mainForeground?: boolean
}>()

const emit = defineEmits<{
  close: [tabId: string]
}>()

const {t} = useI18n()
const workspace = useWorkspaceStore()

const floatState = computed(() => workspace.getTabFloat(props.tab.id))
const minimized = computed(() => Boolean(floatState.value?.minimized))
const maximized = computed(() => Boolean(floatState.value?.maximized))
const tabComponent = computed(() => resolveWorkspaceTab(props.tab.type))
const isCommunity = computed(() => props.tab.type === 'community-workbench')
const isFloat = computed(() => props.mode === 'float')
const isMain = computed(() => props.mode === 'main')
const isHidden = computed(() => props.mode === 'hidden')
const isFocused = computed(() => workspace.activeTabId === props.tab.id)
const isDragging = ref(false)
/** UX-01: drag/resize preview — avoid patching Pinia on every pointermove. */
const liveRect = ref<{x: number; y: number; width: number; height: number} | null>(null)

/**
 * Community / session hosts: live while main or floated (not background-hidden).
 * Do not gate on mainForeground — that flag only hides the pane for the CEF
 * first-paint cover. Pausing the bridge while warming drops bridge-hello and
 * plugin invokes, so http-client / log-controller boot empty on the first tab.
 */
const contentActive = computed(() => {
  if (isHidden.value) return false
  return true
})

const hostStyle = computed(() => {
  if (!isFloat.value || !floatState.value) return undefined
  const base = floatState.value
  const rect = liveRect.value ?? base
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${minimized.value ? TAB_FLOAT_MINIMIZED_HEIGHT : rect.height}px`,
    zIndex: base.zIndex,
    '--dw-tab-float-opacity': String(workspace.tabFloatOpacity),
  }
})

function raise() {
  if (!isFloat.value) return
  workspace.raiseTabFloat(props.tab.id)
  workspace.activateTab(props.tab.id)
}

function onMainActivate() {
  if (!isMain.value) return
  if (workspace.activeTabId !== props.tab.id) {
    workspace.activateTab(props.tab.id)
  }
}

function dock() {
  workspace.dockTab(props.tab.id)
}

function toggleMinimize() {
  workspace.toggleTabFloatMinimized(props.tab.id, props.bounds)
}

function toggleMaximize() {
  workspace.toggleTabFloatMaximized(props.tab.id, props.bounds)
}

function onClose() {
  emit('close', props.tab.id)
}

function onTitleDblClick() {
  if (minimized.value) {
    toggleMinimize()
    return
  }
  toggleMaximize()
}

/* ─── drag ─── */
let dragPointerId: number | null = null
let dragStartX = 0
let dragStartY = 0
let dragOrigin = {x: 0, y: 0}

function onTitlePointerDown(event: PointerEvent) {
  if (event.button !== 0 || !isFloat.value) return
  const target = event.target as HTMLElement | null
  if (target?.closest('.workspace-tab-pane__actions')) return
  raise()
  if (maximized.value || minimized.value) return
  const rect = floatState.value
  if (!rect) return
  dragPointerId = event.pointerId
  dragStartX = event.clientX
  dragStartY = event.clientY
  dragOrigin = {x: rect.x, y: rect.y}
  isDragging.value = true
  window.addEventListener('pointermove', onTitlePointerMove)
  window.addEventListener('pointerup', onTitlePointerUp)
  window.addEventListener('pointercancel', onTitlePointerUp)
}

function onTitlePointerMove(event: PointerEvent) {
  if (dragPointerId == null || event.pointerId !== dragPointerId) return
  const next = clampTabFloatToBounds(
      {
        x: dragOrigin.x + (event.clientX - dragStartX),
        y: dragOrigin.y + (event.clientY - dragStartY),
        width: floatState.value?.width ?? TAB_FLOAT_MIN_WIDTH,
        height: floatState.value?.height ?? TAB_FLOAT_MIN_HEIGHT,
      },
      props.bounds,
  )
  liveRect.value = next
  workspace.setTabFloatSnapGuide(resolveTabFloatSnap(next, props.bounds))
}

function onTitlePointerUp(event: PointerEvent) {
  if (dragPointerId == null || event.pointerId !== dragPointerId) return
  const snap = workspace.tabFloatSnapGuide
  const preview = liveRect.value
  dragPointerId = null
  isDragging.value = false
  window.removeEventListener('pointermove', onTitlePointerMove)
  window.removeEventListener('pointerup', onTitlePointerUp)
  window.removeEventListener('pointercancel', onTitlePointerUp)
  if (snap) {
    const before = floatState.value
    workspace.patchTabFloat(props.tab.id, {
      ...snap.rect,
      maximized: snap.edge === 'top',
      // Remember pre-snap size for all edges/corners so maximize restore stays useful.
      restoreRect: before
          ? {x: before.x, y: before.y, width: before.width, height: before.height}
          : undefined,
    })
  } else if (preview) {
    workspace.patchTabFloat(props.tab.id, {x: preview.x, y: preview.y})
  }
  liveRect.value = null
  workspace.setTabFloatSnapGuide(null)
}

/* ─── resize ─── */
let resizePointerId: number | null = null
let resizeStartX = 0
let resizeStartY = 0
let resizeOrigin = {width: 0, height: 0, x: 0, y: 0}

function onResizePointerDown(event: PointerEvent) {
  if (event.button !== 0 || !isFloat.value || minimized.value || maximized.value) return
  event.preventDefault()
  event.stopPropagation()
  raise()
  const rect = floatState.value
  if (!rect) return
  resizePointerId = event.pointerId
  resizeStartX = event.clientX
  resizeStartY = event.clientY
  resizeOrigin = {width: rect.width, height: rect.height, x: rect.x, y: rect.y}
  window.addEventListener('pointermove', onResizePointerMove)
  window.addEventListener('pointerup', onResizePointerUp)
  window.addEventListener('pointercancel', onResizePointerUp)
}

function onResizePointerMove(event: PointerEvent) {
  if (resizePointerId == null || event.pointerId !== resizePointerId) return
  const next = clampTabFloatToBounds(
      {
        x: resizeOrigin.x,
        y: resizeOrigin.y,
        width: resizeOrigin.width + (event.clientX - resizeStartX),
        height: resizeOrigin.height + (event.clientY - resizeStartY),
      },
      props.bounds,
  )
  liveRect.value = next
}

function onResizePointerUp(event: PointerEvent) {
  if (resizePointerId == null || event.pointerId !== resizePointerId) return
  const preview = liveRect.value
  resizePointerId = null
  window.removeEventListener('pointermove', onResizePointerMove)
  window.removeEventListener('pointerup', onResizePointerUp)
  window.removeEventListener('pointercancel', onResizePointerUp)
  if (preview) {
    workspace.patchTabFloat(props.tab.id, {width: preview.width, height: preview.height})
  }
  liveRect.value = null
}

onBeforeUnmount(() => {
  isDragging.value = false
  liveRect.value = null
  workspace.setTabFloatSnapGuide(null)
  window.removeEventListener('pointermove', onTitlePointerMove)
  window.removeEventListener('pointerup', onTitlePointerUp)
  window.removeEventListener('pointercancel', onTitlePointerUp)
  window.removeEventListener('pointermove', onResizePointerMove)
  window.removeEventListener('pointerup', onResizePointerUp)
  window.removeEventListener('pointercancel', onResizePointerUp)
})
</script>

<template>
  <div
      class="workspace-tab-pane"
      :class="{
        'is-main': isMain,
        'is-float': isFloat,
        'is-hidden': isHidden,
        'is-focused': isFocused,
        'is-minimized': isFloat && minimized,
        'is-maximized': isFloat && maximized,
        'is-dragging': isDragging,
        'is-main-foreground': isMain && mainForeground,
      }"
      :style="hostStyle"
      :data-tab-pane-id="tab.id"
      :data-floating-tab-window="isFloat ? '' : undefined"
      :aria-hidden="isHidden || (isMain && !mainForeground) ? 'true' : undefined"
      @pointerdown.capture="isFloat ? raise() : onMainActivate()"
  >
    <header
        v-if="isFloat"
        class="workspace-tab-pane__title"
        @pointerdown="onTitlePointerDown"
        @dblclick.prevent="onTitleDblClick"
    >
      <span class="workspace-tab-pane__accent" aria-hidden="true"/>
      <div class="workspace-tab-pane__lead">
        <WorkspaceTabIcon :type="tab.type" :plugin-id="tab.pluginId"/>
        <span class="workspace-tab-pane__name" :title="tab.title">{{ tab.title }}</span>
      </div>
      <div class="workspace-tab-pane__actions">
        <IconButton
            size="sm"
            :title="minimized ? t('workspace.tabFloatRestore') : t('workspace.tabFloatMinimize')"
            @click.stop="toggleMinimize"
        >
          <DwIcon :name="minimized ? 'chevrons-up' : 'minus'" size="sm" :stroke-width="1.6"/>
        </IconButton>
        <IconButton
            size="sm"
            :title="maximized ? t('workspace.tabFloatRestoreSize') : t('workspace.tabFloatMaximize')"
            :disabled="minimized"
            @click.stop="toggleMaximize"
        >
          <DwIcon name="fullscreen" size="sm" :active="maximized" :stroke-width="1.6"/>
        </IconButton>
        <IconButton size="sm" :title="t('workspace.tabFloatDock')" @click.stop="dock">
          <DwIcon name="pin" size="sm" :stroke-width="1.6"/>
        </IconButton>
        <IconButton size="sm" :title="t('workspace.tabFloatClose')" @click.stop="onClose">
          <DwIcon name="x" size="sm" :stroke-width="1.6"/>
        </IconButton>
      </div>
    </header>

    <!--
      Never use display:none on the body (CEF iframe / xterm). Collapse with
      visibility + height so the same content instance survives minimize.
    -->
    <div
        class="workspace-tab-pane__body"
        :class="{ 'is-collapsed': isFloat && minimized }"
    >
      <PanelErrorBoundary
          :label="`tab:${tab.type}`"
          closable
          @close="onClose"
      >
        <CommunityWorkbenchTab
            v-if="isCommunity"
            :tab="tab"
            :active="contentActive"
        />
        <component
            :is="tabComponent"
            v-else-if="tabComponent"
            :tab="tab"
            :pane-active="contentActive"
        />
      </PanelErrorBoundary>
    </div>

    <span
        v-if="isFloat && !minimized && !maximized"
        class="workspace-tab-pane__resize"
        @pointerdown="onResizePointerDown"
    />
  </div>
</template>

<style scoped>
.workspace-tab-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.workspace-tab-pane.is-main {
  position: absolute;
  inset: 0;
  z-index: 2;
  visibility: hidden;
  pointer-events: none;
  /* AUDIT-03: keep visibility (not display:none) for CEF/session iframes; skip paint while shelled. */
  contain: layout style paint;
  content-visibility: hidden;
}

.workspace-tab-pane.is-main.is-main-foreground {
  visibility: visible;
  pointer-events: auto;
  contain: none;
  content-visibility: visible;
}

.workspace-tab-pane.is-hidden {
  position: absolute;
  inset: 0;
  z-index: 0;
  visibility: hidden;
  pointer-events: none;
  contain: layout style paint;
  content-visibility: hidden;
}

.workspace-tab-pane.is-float {
  position: absolute;
  pointer-events: auto;
  border: 1px solid var(--dw-panel-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-panel);
  box-shadow: var(--dw-panel-shadow), var(--dw-shadow-float);
  opacity: var(--dw-tab-float-opacity, 1);
  transform-origin: center top;
  animation: dw-tab-float-in 0.18s var(--dw-ease);
  transition:
      box-shadow 0.16s var(--dw-ease),
      border-color 0.16s var(--dw-ease),
      left 0.14s var(--dw-ease),
      top 0.14s var(--dw-ease),
      width 0.14s var(--dw-ease),
      height 0.14s var(--dw-ease),
      opacity 0.12s var(--dw-ease);
}

.workspace-tab-pane.is-float.is-dragging {
  opacity: calc(var(--dw-tab-float-opacity, 1) * 0.92);
  transition: none;
  box-shadow:
      0 18px 40px color-mix(in srgb, var(--dw-text) 18%, transparent),
      var(--dw-shadow-float);
}

.workspace-tab-pane.is-float.is-focused:not(.is-dragging) {
  opacity: 1;
  border-color: color-mix(in srgb, var(--dw-accent) 55%, var(--dw-panel-border));
  box-shadow:
      var(--dw-panel-shadow),
      var(--dw-shadow-float),
      0 0 0 1px color-mix(in srgb, var(--dw-accent) 28%, transparent);
}

.workspace-tab-pane.is-float.is-minimized {
  border-radius: 999px;
  box-shadow: var(--dw-panel-shadow);
}

.workspace-tab-pane.is-float.is-minimized.is-focused {
  border-radius: 999px;
}

@keyframes dw-tab-float-in {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.workspace-tab-pane__title {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap-xs);
  flex-shrink: 0;
  height: var(--dw-tab-height);
  padding: 0 var(--dw-space-2) 0 var(--dw-space-3);
  border-bottom: 1px solid var(--dw-border-light);
  background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--dw-bg) 92%, var(--dw-primary) 4%) 0%,
      var(--dw-bg-panel) 100%
  );
  cursor: grab;
  user-select: none;
}

.workspace-tab-pane__accent {
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 999px;
  background: transparent;
  transition: background 0.14s var(--dw-ease);
}

.workspace-tab-pane.is-focused .workspace-tab-pane__accent {
  background: var(--dw-accent);
}

.workspace-tab-pane.is-maximized .workspace-tab-pane__title {
  cursor: default;
}

.workspace-tab-pane__title:active {
  cursor: grabbing;
}

.workspace-tab-pane__lead {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-xs);
  min-width: 0;
  flex: 1;
}

.workspace-tab-pane__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--dw-text-sm);
  font-weight: 600;
  color: var(--dw-text-secondary);
}

.workspace-tab-pane__actions {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 1px;
}

.workspace-tab-pane__body {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--dw-bg-editor);
}

.workspace-tab-pane__body.is-collapsed {
  visibility: hidden;
  flex: none;
  height: 0;
  min-height: 0;
  overflow: hidden;
  pointer-events: none;
}

.workspace-tab-pane__body > :deep(*) {
  flex: 1;
  min-height: 0;
  height: 100% !important;
  max-width: none !important;
}

.workspace-tab-pane.is-minimized .workspace-tab-pane__title {
  border-bottom: none;
}

.workspace-tab-pane__resize {
  position: absolute;
  right: 0;
  bottom: 0;
  z-index: 2;
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
