<!--
  左侧 Explorer：经典工具窗口顶栏；视图切换收进标题下拉（无独立 Tab 条）
-->
<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {CollapseButton, ConfirmDialog, DwOverlayScroll, IconButton} from '@/core/components'
import {DwIcon} from '@/core/icons'
import {ContextMenuHost, useContextMenu} from '@/core/context-menu'
import type {ContextMenuItem} from '@/core/types'
import ExplorerToolbar from './ExplorerToolbar.vue'
import ConnectionTree from './ConnectionTree.vue'
import ScriptHistoryDrawer from '@/features/explorer/components/ScriptHistoryDrawer.vue'
import TeamSharedConnectionsBar from '@/features/team/components/TeamSharedConnectionsBar.vue'
import LocalFilesToolbar from '@/features/local-files/components/LocalFilesToolbar.vue'
import LocalFilesTree from '@/features/local-files/components/LocalFilesTree.vue'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {canUseLocalFilesWorkspace} from '@/features/local-files/services/local-files.service'
import {useLocalFilesTabSync} from '@/features/local-files/composables/useLocalFilesTabSync'
import {useLocalOpenFilesDiskWatch} from '@/features/local-files/composables/useLocalOpenFilesDiskWatch'
import {useLocalFilesGitStatusWatch} from '@/features/local-files/composables/useLocalFilesGitStatusWatch'
import {usePanelHeaderDrag} from '@/features/dock/composables/usePanelHeaderDrag'
import {useDockFloatChrome} from '@/features/dock/composables/useDockFloatChrome'
import DockDragGrip from '@/features/dock/components/DockDragGrip.vue'
import DockFloatActions from '@/features/dock/components/DockFloatActions.vue'

const props = withDefaults(
  defineProps<{
    /** dock = 侧栏停靠；flyout = 收起后悬停弹出的临时树 */
    variant?: 'dock' | 'flyout'
  }>(),
  {variant: 'dock'},
)

const emit = defineEmits<{
  dismiss: []
  pin: []
}>()

const {t} = useI18n()
const explorer = useExplorerStore()
const appConfig = useAppConfigStore()
const {onPointerDown: onDockHeaderPointerDown} = usePanelHeaderDrag('explorer')
const {isFloating} = useDockFloatChrome('explorer')
const isFlyout = computed(() => props.variant === 'flyout')
const showFilesMode = computed(() => canUseLocalFilesWorkspace())
const isFilesMode = computed(() => showFilesMode.value && explorer.panelMode === 'files')
const panelTitle = computed(() =>
    isFilesMode.value ? t('explorer.filesTitle') : t('explorer.title'),
)
const titleBtnRef = ref<HTMLButtonElement | null>(null)
const viewMenu = useContextMenu()
const connectionTreeRef = ref<{beginCreateRootGroup: () => void} | null>(null)
useLocalFilesTabSync()
const diskWatch = useLocalOpenFilesDiskWatch()
useLocalFilesGitStatusWatch()

function collapseExplorer() {
  if (isFlyout.value) {
    emit('dismiss')
    return
  }
  appConfig.setShowExplorerPanel(false)
}

function pinExplorer() {
  emit('pin')
}

function onHeaderPointerDown(event: PointerEvent) {
  if (isFlyout.value) return
  onDockHeaderPointerDown(event)
}

function setMode(mode: 'database' | 'files') {
  if (mode === 'files' && !showFilesMode.value) return
  explorer.setPanelMode(mode)
}

function openViewMenu() {
  if (!showFilesMode.value || !titleBtnRef.value) return
  const items: ContextMenuItem[] = [
    {
      id: 'database',
      label: t('explorer.viewDatabase'),
      icon: 'database',
      selected: !isFilesMode.value,
    },
    {
      id: 'files',
      label: t('explorer.viewFiles'),
      icon: 'folder',
      selected: isFilesMode.value,
    },
  ]
  viewMenu.openBelow(titleBtnRef.value, items, 4)
}

function onViewMenuSelect(id: string) {
  viewMenu.close()
  if (id === 'database' || id === 'files') setMode(id)
}
</script>

<template>
  <section
      class="explorer dw-surface dw-panel-hover-chrome"
      :class="{ 'explorer--flyout': isFlyout }"
  >
    <div class="explorer-top">
      <header
          class="header"
          :class="{ 'dock-drag-zone': !isFlyout }"
          :data-dock-grip="isFlyout ? undefined : true"
          :title="isFlyout ? undefined : t('dock.minimap.dragHint')"
          @pointerdown="onHeaderPointerDown"
      >
        <DockDragGrip v-if="!isFlyout" :interactive="false"/>
        <div class="header-title">
          <button
              v-if="showFilesMode"
              ref="titleBtnRef"
              type="button"
              class="title-switch"
              :class="{ 'is-open': viewMenu.visible.value }"
              :aria-label="t('explorer.viewMode')"
              :aria-expanded="viewMenu.visible.value"
              :aria-haspopup="true"
              @pointerdown.stop
              @click="openViewMenu"
          >
            <span class="title-dot" aria-hidden="true"/>
            <span class="title">{{ panelTitle }}</span>
            <DwIcon
                name="chevron-down"
                size="xs"
                :stroke-width="2.25"
                class="title-switch__caret"
                aria-hidden="true"
            />
          </button>
          <template v-else>
            <span class="title-dot" aria-hidden="true"/>
            <span class="title">{{ panelTitle }}</span>
          </template>
          <span
              v-if="!isFilesMode && explorer.connectionCount"
              class="title-badge"
          >{{ explorer.connectionCount }}</span>
        </div>

        <div class="header-actions dw-btn-group" @pointerdown.stop>
          <template v-if="isFlyout">
            <IconButton
                size="sm"
                :title="t('explorer.flyoutPin')"
                @click="pinExplorer"
            >
              <DwIcon name="pin" size="sm" :stroke-width="1.7"/>
            </IconButton>
            <CollapseButton :label="t('explorer.flyoutDismiss')" @click="collapseExplorer"/>
          </template>
          <template v-else>
            <DockFloatActions panel="explorer"/>
            <span v-if="!isFloating" class="dw-panel-hover-actions">
              <CollapseButton @click="collapseExplorer"/>
            </span>
          </template>
        </div>
      </header>

      <template v-if="isFilesMode">
        <LocalFilesToolbar/>
      </template>
      <template v-else>
        <ExplorerToolbar @create-folder="connectionTreeRef?.beginCreateRootGroup()"/>
        <TeamSharedConnectionsBar/>
      </template>
    </div>
    <DwOverlayScroll class="explorer-body">
      <LocalFilesTree v-if="isFilesMode"/>
      <ConnectionTree v-else ref="connectionTreeRef"/>
    </DwOverlayScroll>
    <ScriptHistoryDrawer v-if="!isFilesMode"/>

    <ContextMenuHost
        :visible="viewMenu.visible.value"
        :items="viewMenu.items.value"
        :x="viewMenu.pos.value.x"
        :y="viewMenu.pos.value.y"
        @select="onViewMenuSelect"
        @close="viewMenu.close"
    />

    <ConfirmDialog
        v-if="showFilesMode"
        :open="diskWatch.dialogOpen.value"
        :title="diskWatch.dialogTitle.value"
        :message="diskWatch.dialogMessage.value"
        :confirm-label="diskWatch.dialogConfirmLabel.value"
        :confirm-variant="diskWatch.dialogConfirmVariant.value"
        @update:open="diskWatch.onDialogOpenUpdate"
        @confirm="diskWatch.onDialogConfirm"
    />
  </section>
</template>

<style scoped>
.explorer {
  container-type: inline-size;
  container-name: explorer;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  min-height: 0;
}

.explorer--flyout {
  height: 100%;
}

.explorer-top {
  flex-shrink: 0;
  position: relative;
  z-index: var(--dw-z-rail);
  overflow: visible;
}

/* 外壳吃 flex；explorer-body class 在滚动视口上（虚拟树 closest 依赖） */
.explorer > .dw-overlay-scroll {
  flex: 1;
  min-height: 0;
  min-width: 0;
}

/* 资源树滚动视口：布局/绘制隔离（连接树与本地文件树共用此壳） */
.explorer-body {
  contain: layout paint;
}

/* Constrain tree width so connection names ellipsize and env badges stay pinned. */
.explorer > .dw-overlay-scroll :deep(.dw-overlay-scroll__content) {
  min-width: 0;
  width: 100%;
  max-width: 100%;
}

.header {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-xs);
  justify-content: space-between;
  height: var(--dw-toolbar-height);
  padding: 0 var(--dw-space-5) 0 var(--dw-space-3);
  border-bottom: none;
  background: transparent;
}

.header.dock-drag-zone {
  cursor: grab;
}

.header.dock-drag-zone:active {
  cursor: grabbing;
}

.header.dock-drag-zone:hover {
  background: color-mix(in srgb, var(--dw-text) 4%, transparent);
}

.header-title {
  flex: 1;
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap);
  min-width: 0;
}

.title-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--dw-radius-pill);
  background: var(--dw-primary);
  flex-shrink: 0;
}

.title {
  font-weight: 600;
  font-size: var(--dw-text-md);
  letter-spacing: 0.01em;
  color: var(--dw-text);
}

.title-switch {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap);
  min-width: 0;
  max-width: 100%;
  padding: 0;
  margin: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  /* 盖过全局 :where(button):hover 的 inset wash，避免看起来像按钮底 */
  box-shadow: none;
}

.title-switch:hover,
.title-switch:active,
.title-switch.is-open,
.title-switch:focus-visible {
  background: transparent;
  box-shadow: none;
}

.title-switch:hover .title-switch__caret,
.title-switch.is-open .title-switch__caret {
  color: var(--dw-text-secondary);
  opacity: 1;
}

.title-switch:focus-visible {
  outline: none;
}

.title-switch:focus-visible .title {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.title-switch__caret {
  flex-shrink: 0;
  width: 11px;
  height: 11px;
  margin-top: 1px;
  color: var(--dw-text-muted);
  opacity: 0.55;
  transition:
      transform var(--dw-duration, 0.16s) var(--dw-ease, ease),
      color var(--dw-duration-fast, 0.12s) ease,
      opacity var(--dw-duration-fast, 0.12s) ease;
}

.title-switch.is-open .title-switch__caret {
  transform: rotate(180deg);
  opacity: 0.9;
}

.title-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--dw-icon-size-lg);
  height: var(--dw-icon-size-lg);
  padding: 0 var(--dw-space-3);
  border-radius: var(--dw-radius-pill);
  background: var(--dw-bg-muted);
  border: 1px solid var(--dw-border-light);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  line-height: 1;
}

.header-actions {
  display: flex;
}
</style>
