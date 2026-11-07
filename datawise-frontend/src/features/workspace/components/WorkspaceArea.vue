<!--
  工作区：首页无 Tab 栏；打开控制台/表等后才显示 Tab。
  会话型 / 社区 / 小窗 / 当前主面共用 WorkspaceTabPane 壳，弹出不换挂载点。
-->
<script setup lang="ts">
import {computed, nextTick, onMounted, onBeforeUnmount, ref, watch} from 'vue'
import type {WorkspaceTab} from '@/core/types'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {isWorkspaceSessionStickyType} from '@/features/workspace/services/workspace-keepalive.policy'
import {resolveWorkspaceTab} from '../tab-registry'
import {usesConnectionReconnectOverlay} from '@/features/explorer/services/explorer-connection-state.service'
import WorkspaceTabs from './WorkspaceTabs.vue'
import WelcomeTab from './tabs/WelcomeTab.vue'
import ConnectionReconnectOverlay from './ConnectionReconnectOverlay.vue'
import WorkspaceTabPane from './WorkspaceTabPane.vue'
import FloatingTabToolbar from './FloatingTabToolbar.vue'
import {isCommunityWorkbenchPaintReady} from '@/features/community-plugin/lib/community-workbench-paint-gate'
import {
  LOCAL_FILE_ABS_PATH_MIME,
  dataTransferHasType,
  readLocalAbsPathFromDataTransfer,
} from '@/features/local-files/services/local-files-dnd'
import {openLocalWorkspaceFile} from '@/features/local-files/services/open-local-file.service'
import type {WorkspaceTabPaneMode} from '@/features/workspace/services/workspace-tab-float.service'

const workspace = useWorkspaceStore()
const explorer = useExplorerStore()

/** Last docked (non-floated) tab shown in the main surface while floats stay visible. */
const lastDockedTabId = ref<string | null>(null)

function syncLastDockedTab() {
  const activeId = workspace.activeTabId
  if (activeId && !workspace.isTabFloated(activeId)) {
    lastDockedTabId.value = activeId
    return
  }
  if (lastDockedTabId.value) {
    const still = workspace.tabs.find(
        (tab) => tab.id === lastDockedTabId.value && !workspace.isTabFloated(tab.id),
    )
    if (still) return
  }
  lastDockedTabId.value =
      workspace.tabs.find((tab) => !workspace.isTabFloated(tab.id))?.id ?? null
}

watch(
    () => [workspace.activeTabId, workspace.tabs, workspace.tabFloats] as const,
    () => syncLastDockedTab(),
    {immediate: true, deep: true},
)

const mainTab = computed(() => {
  const id = lastDockedTabId.value
  if (!id) return null
  return workspace.tabs.find((tab) => tab.id === id && !workspace.isTabFloated(tab.id)) ?? null
})

const tabComponent = computed(() => (mainTab.value ? resolveWorkspaceTab(mainTab.value.type) : null))

/** Hold welcome while the first community iframe warms (CEF white-flash gate). */
const holdWelcomeForCommunityPaint = computed(() => {
  const tab = mainTab.value
  if (!tab || tab.type !== 'community-workbench') return false
  if (isCommunityWorkbenchPaintReady(tab.id)) return false
  const dockedCount = workspace.tabs.filter((item) => !workspace.isTabFloated(item.id)).length
  return dockedCount === 1
})

const showWelcome = computed(
  () => !mainTab.value || !tabComponent.value || holdWelcomeForCommunityPaint.value,
)

const mainForeground = computed(() => {
  if (showWelcome.value) return false
  if (!mainTab.value) return false
  if (holdWelcomeForCommunityPaint.value) return false
  return true
})

function shouldShellPersist(tab: WorkspaceTab): boolean {
  if (workspace.isTabFloated(tab.id)) return true
  if (mainTab.value?.id === tab.id) return true
  if (tab.type === 'community-workbench' && tab.pluginId) return true
  if (isWorkspaceSessionStickyType(tab.type)) return true
  return false
}

/** Stable ordered shells — key=tab.id never remounts on float/dock. */
const shelledTabs = computed(() => {
  const out: WorkspaceTab[] = []
  const seen = new Set<string>()
  for (const tab of workspace.tabs) {
    if (!shouldShellPersist(tab) || seen.has(tab.id)) continue
    if (!resolveWorkspaceTab(tab.type) && tab.type !== 'community-workbench') continue
    seen.add(tab.id)
    out.push(tab)
  }
  return out
})

function paneMode(tab: WorkspaceTab): WorkspaceTabPaneMode {
  if (workspace.isTabFloated(tab.id)) return 'float'
  if (mainTab.value?.id === tab.id) return 'main'
  return 'hidden'
}

const workspaceBodyRef = ref<HTMLElement | null>(null)
const floatBounds = ref({width: 960, height: 640})

function measureFloatBounds() {
  const el = workspaceBodyRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  if (rect.width < 32 || rect.height < 32) return
  floatBounds.value = {width: rect.width, height: rect.height}
}

let bodyResizeObserver: ResizeObserver | null = null

function onWorkspaceKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  const activeId = workspace.activeTabId
  if (!activeId || !workspace.isTabFloated(activeId)) return
  const target = event.target as HTMLElement | null
  // Don't steal Esc from editors / dialogs / selects.
  if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
  event.preventDefault()
  workspace.dockTab(activeId)
}

onMounted(() => {
  window.addEventListener('keydown', onWorkspaceKeydown)
  nextTick(() => {
    reconcileBrokenActiveTab()
    measureFloatBounds()
    const el = workspaceBodyRef.value
    if (el && typeof ResizeObserver !== 'undefined') {
      bodyResizeObserver = new ResizeObserver(() => measureFloatBounds())
      bodyResizeObserver.observe(el)
    }
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWorkspaceKeydown)
  bodyResizeObserver?.disconnect()
  bodyResizeObserver = null
})

watch(mainTab, () => nextTick(reconcileBrokenActiveTab))

watch(floatBounds, (bounds) => {
  workspace.clampOpenTabFloatsToBounds(bounds)
  workspace.relayoutMinimizedFloats(bounds)
})

const reconnectConnectionId = computed(() => {
  const tab = mainTab.value ?? workspace.activeTab
  if (!tab?.connectionId) return null
  if (tab.type === 'create-database' || tab.type === 'connection') return null
  if (tab.type === 'community-workbench' || tab.type === 'community-filesystem') return null
  const dbType = tab.dbType ?? explorer.findNode(tab.connectionId)?.dbType
  if (!usesConnectionReconnectOverlay(dbType)) return null
  if (!explorer.connectionNeedsReconnect(tab.connectionId)) return null
  return tab.connectionId
})

const reconnectConnectionName = computed(() => {
  const id = reconnectConnectionId.value
  if (!id) return ''
  return explorer.findNode(id)?.label || id
})

function reconcileBrokenActiveTab() {
  const tab = mainTab.value
  if (!tab) return
  if (resolveWorkspaceTab(tab.type)) return
  workspace.closeTab(tab.id)
}

function onFloatClose(tabId: string) {
  workspace.closeTab(tabId)
}

function onWorkspaceDragOver(event: DragEvent) {
  if (!dataTransferHasType(event.dataTransfer, LOCAL_FILE_ABS_PATH_MIME)) return
  if (event.altKey) return
  event.preventDefault()
  event.stopPropagation()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function onWorkspaceDrop(event: DragEvent) {
  if (!dataTransferHasType(event.dataTransfer, LOCAL_FILE_ABS_PATH_MIME)) return
  if (event.altKey) return
  const path = readLocalAbsPathFromDataTransfer(event.dataTransfer)
  if (!path) return
  event.preventDefault()
  event.stopPropagation()
  void openLocalWorkspaceFile(path)
}

</script>

<template>
  <main
      class="workspace dw-surface dw-surface--editor"
      :class="{ 'workspace--home': showWelcome }"
      data-onboarding="workspace-main"
      @dragover.capture="onWorkspaceDragOver"
      @drop.capture="onWorkspaceDrop"
  >
    <WorkspaceTabs v-if="workspace.hasOpenTabs" :float-bounds="floatBounds"/>
    <div
        ref="workspaceBodyRef"
        class="workspace-body"
        data-workspace-float-surface
    >
      <WelcomeTab v-if="showWelcome"/>

      <!--
        统一壳：社区 iframe / SSH / K8s 等与小窗共用同一 vnode（key=tab.id）。
        弹出只改 mode，visibility 隐藏后台壳（勿用 display:none，CEF 会丢合成层）。
      -->
      <div
          v-if="shelledTabs.length"
          class="workspace-body__shells"
      >
        <WorkspaceTabPane
            v-for="tab in shelledTabs"
            :key="tab.id"
            :tab="tab"
            :mode="paneMode(tab)"
            :bounds="floatBounds"
            :main-foreground="mainForeground && mainTab?.id === tab.id"
            @close="onFloatClose"
        />
      </div>

      <div
          v-if="workspace.tabFloatSnapGuide"
          class="workspace-body__snap-guide"
          :class="`is-${workspace.tabFloatSnapGuide.edge}`"
          :style="{
            left: `${workspace.tabFloatSnapGuide.rect.x}px`,
            top: `${workspace.tabFloatSnapGuide.rect.y}px`,
            width: `${workspace.tabFloatSnapGuide.rect.width}px`,
            height: `${workspace.tabFloatSnapGuide.rect.height}px`,
          }"
          aria-hidden="true"
      />

      <FloatingTabToolbar :bounds="floatBounds"/>

      <ConnectionReconnectOverlay
          v-if="reconnectConnectionId"
          :connection-id="reconnectConnectionId"
          :connection-name="reconnectConnectionName"
      />
    </div>
  </main>
</template>

<style scoped>
.workspace {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.workspace-body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--dw-bg-editor);
}

.workspace-body > :deep(.welcome) {
  flex: 1;
  min-height: 0;
}

.workspace-body__shells {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
}

.workspace-body__shells > :deep(.workspace-tab-pane.is-main.is-main-foreground),
.workspace-body__shells > :deep(.workspace-tab-pane.is-float) {
  pointer-events: auto;
}

.workspace-body__snap-guide {
  position: absolute;
  z-index: 35;
  pointer-events: none;
  border: 1.5px dashed color-mix(in srgb, var(--dw-accent) 70%, transparent);
  border-radius: var(--dw-panel-radius);
  background: color-mix(in srgb, var(--dw-accent) 12%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dw-accent) 18%, transparent);
  transition: left 0.08s linear, top 0.08s linear, width 0.08s linear, height 0.08s linear;
}

.workspace-body__snap-guide.is-top-left,
.workspace-body__snap-guide.is-top-right,
.workspace-body__snap-guide.is-bottom-left,
.workspace-body__snap-guide.is-bottom-right {
  background: color-mix(in srgb, var(--dw-accent) 16%, transparent);
  border-style: solid;
}

.workspace-body > :deep(.connection-reconnect-overlay) {
  position: absolute;
  inset: 0;
  z-index: 30;
  flex: none;
  width: auto;
  height: auto;
  min-height: 0;
}

.workspace-body > :deep(.panel-loading-shell),
.workspace-body > :deep(.panel-load-error) {
  position: absolute;
  inset: 0;
  flex: none;
  width: auto;
  height: auto;
  min-height: 0;
}
</style>
