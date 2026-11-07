<script setup lang="ts">
/**
 * 主内容区：根据 layout.activeModule 切换数据库三栏 / AI 工作台 / 其它模块页
 * Dock：仅重排 Explorer / Terminal / Shortcut / Workspace 位置，不改面板内部样式。
 */
import {computed, defineAsyncComponent, watch} from 'vue'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useLayoutStore} from '@/features/layout/stores/layout'
import DatabaseExplorer from '@/features/explorer/components/DatabaseExplorer.vue'
import ModuleWorkbench from '@/features/layout/components/ModuleWorkbench.vue'
import WorkspaceArea from '@/features/workspace/components/WorkspaceArea.vue'
import ShortcutRail from '@/features/layout/components/ShortcutRail.vue'
import ResizeHandle from '@/core/components/ResizeHandle.vue'
import TerminalPane from '@/features/layout/components/TerminalPane.vue'
import TerminalToolWindow from '@/features/layout/components/TerminalToolWindow.vue'
import DropZoneOverlay from '@/features/dock/components/DropZoneOverlay.vue'
import FloatingPanelHost from '@/features/dock/components/FloatingPanelHost.vue'
import {useDockPlacementStore} from '@/features/dock/stores/dock-placement-store'
import {resolveWorkbenchSlots} from '@/features/dock/services/resolve-workbench-slots'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {resolveWorkbenchModule} from '@/features/layout/module-registry'
import {useSidePanelResizeBounds, EXPLORER_PANEL_RESIZE_MIN} from '@/core/composables/useSidePanelResizeBounds'

const AiWorkbench = defineAsyncComponent(() =>
    import.meta.env.VITE_DATAWISE_EDITION === 'standard'
        ? import('@/features/pack/stubs/AiWorkbenchStub.vue')
        : import('@/features/ai/AiWorkbench.vue'),
)

const layout = useLayoutStore()
const appConfig = useAppConfigStore()
const explorer = useExplorerStore()
const dock = useDockPlacementStore()

/** Docked shortcut tool window width (0 when floated / closed / stripe-only). */
const explorerPeerWidth = computed(() => {
    if (dock.isPanelFloating('shortcut')) return 0
    if (!appConfig.showShortcutRail) return 0
    const panelOpen =
        layout.showNotificationDrawer
        || layout.showAssistantDrawer
        || Boolean(layout.activeShortcutPanel)
    if (!panelOpen) return 0
    return appConfig.shortcutPanelWidth
})

const {min: explorerResizeMin, max: explorerResizeMax} = useSidePanelResizeBounds({
    min: EXPLORER_PANEL_RESIZE_MIN,
    peerWidth: explorerPeerWidth,
})

watch(explorerResizeMax, (max) => {
    if (explorer.width > max) explorer.width = max
})

const workbenchPage = computed(() => resolveWorkbenchModule(layout.activeModule))
const isDatabaseShell = computed(() => layout.activeShellSlot === 'database')
const isAiShell = computed(() => layout.activeShellSlot === 'ai')

const slots = computed(() =>
    resolveWorkbenchSlots(dock.placement, {
        showExplorer: appConfig.showExplorerPanel,
        showTerminal: layout.showTerminalPanel,
        showShortcut: appConfig.showShortcutRail,
    }),
)

const rightDockWidth = computed(() => {
    if (slots.value.explorerRight) return explorer.width
    if (slots.value.terminalRight) return Math.max(280, Math.min(480, explorer.width))
    return 0
})
</script>

<template>
  <div class="main-content">
    <div
        v-show="isDatabaseShell"
        class="module-workbench"
        :aria-hidden="isDatabaseShell ? undefined : 'true'"
    >
      <ShortcutRail v-if="slots.shortcutLeft" edge="left" chrome="panel"/>

      <div
          v-if="slots.explorerLeft"
          class="explorer-pane"
          :style="{ width: `${explorer.width}px` }"
          data-onboarding="explorer-panel"
      >
        <DatabaseExplorer class="explorer-pane__panel"/>
        <ResizeHandle
            v-model="explorer.width"
            :min="explorerResizeMin"
            :max="explorerResizeMax"
            class="explorer-pane__resize panel-resize-handle--trailing"
        />
      </div>

      <div class="module-workbench__center">
        <!-- Keep flex height when workspace is floated out of flow. -->
        <div
            v-if="slots.workspaceFloat"
            class="module-workbench__float-spacer"
            aria-hidden="true"
        />
        <FloatingPanelHost
            panel="workspace"
            :teleport="false"
            :floating="slots.workspaceFloat"
            drag-surface="grip"
        >
          <WorkspaceArea/>
        </FloatingPanelHost>
        <TerminalPane v-if="slots.terminalBottom"/>
      </div>

      <div
          v-if="slots.rightDock"
          class="workbench-right-dock"
          :style="{ width: `${rightDockWidth}px` }"
      >
        <div
            v-if="slots.explorerRight"
            class="explorer-pane explorer-pane--right"
            :class="{ 'explorer-pane--right-split': slots.rightDockSplit }"
            data-onboarding="explorer-panel"
        >
          <ResizeHandle
              v-model="explorer.width"
              invert
              :min="explorerResizeMin"
              :max="explorerResizeMax"
              class="explorer-pane__resize panel-resize-handle--leading"
          />
          <DatabaseExplorer class="explorer-pane__panel"/>
        </div>
        <div
            v-if="slots.terminalRight"
            class="terminal-side-pane"
            :class="{ 'terminal-side-pane--sized': slots.rightDockSplit }"
            :style="slots.rightDockSplit ? { height: `${layout.terminalHeight}px` } : undefined"
        >
          <ResizeHandle
              v-if="slots.rightDockSplit"
              :model-value="layout.terminalHeight"
              axis="vertical"
              :min="160"
              :max="520"
              class="terminal-side-pane__resize"
              @update:model-value="layout.setTerminalHeight"
          />
          <TerminalToolWindow class="terminal-side-pane__window"/>
        </div>
      </div>

      <!-- Tool window may sit left/right/float; icon stripe stays on the right. -->
      <ShortcutRail v-if="slots.shortcutRight" edge="right" chrome="panel"/>
      <ShortcutRail v-if="slots.shortcutStripe" edge="right" chrome="stripe"/>
    </div>

    <!--
      Teleport into AppShell #dock-float-root (fixed overlay inside .app).
      Do NOT mount on document.body (under opaque app) or in-place in main-content
      (overflow/collapse when every panel is floated).
    -->
    <FloatingPanelHost
        v-if="isDatabaseShell && slots.explorerFloat"
        panel="explorer"
        :teleport="true"
        :floating="true"
    >
      <DatabaseExplorer/>
    </FloatingPanelHost>

    <FloatingPanelHost
        v-if="isDatabaseShell && slots.terminalFloat"
        panel="terminal"
        :teleport="true"
        :floating="true"
    >
      <TerminalToolWindow/>
    </FloatingPanelHost>

    <FloatingPanelHost
        v-if="isDatabaseShell && slots.shortcutFloat"
        panel="shortcut"
        :teleport="true"
        :floating="true"
    >
      <ShortcutRail edge="right" chrome="panel"/>
    </FloatingPanelHost>

    <DropZoneOverlay v-if="isDatabaseShell"/>

    <template v-if="isAiShell">
      <AiWorkbench/>
    </template>

    <ModuleWorkbench v-else-if="!isDatabaseShell && workbenchPage">
      <component :is="workbenchPage"/>
    </ModuleWorkbench>
  </div>
</template>

<style scoped>
.main-content {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.module-workbench__float-spacer {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.module-workbench[hidden],
.module-workbench[style*='display: none'],
.module-workbench[style*='display:none'] {
  flex: none !important;
  width: 0 !important;
  height: 0 !important;
  min-width: 0 !important;
  min-height: 0 !important;
  overflow: hidden !important;
  pointer-events: none !important;
}

.explorer-pane {
  position: relative;
  flex-shrink: 0;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.explorer-pane--right {
  flex: 1;
  width: 100%;
}

.explorer-pane--right-split {
  flex: 1 1 0;
  min-height: 120px;
}

.explorer-pane :deep(.explorer-pane__panel) {
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  max-width: none;
}

.workbench-right-dock {
  position: relative;
  flex-shrink: 0;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  gap: var(--dw-panel-gap);
}

.terminal-side-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.terminal-side-pane--sized {
  position: relative;
  flex: none;
  flex-shrink: 0;
}

.terminal-side-pane--sized :deep(.terminal-side-pane__resize) {
  position: absolute;
  top: calc(var(--dw-splitter-size) * -0.5);
  left: 0;
  right: 0;
  z-index: var(--dw-z-raised);
  width: auto;
  height: var(--dw-splitter-size);
  transform: translateY(-50%);
}

.terminal-side-pane__window {
  flex: 1;
  min-height: 0;
  height: auto !important;
}
</style>
