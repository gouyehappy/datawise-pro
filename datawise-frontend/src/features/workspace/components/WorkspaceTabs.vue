<script setup lang="ts">
import {computed, defineAsyncComponent, nextTick, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {ContextMenuHost} from '@/core/context-menu'
import TabAddButton from '@/core/components/TabAddButton.vue'
import TabBar from '@/core/components/TabBar.vue'
import TabItem from '@/core/components/TabItem.vue'
import {UnsavedChangesDialog, PromptDialog} from '@/core/components'
import WorkspaceTabIcon from '@/features/workspace/components/WorkspaceTabIcon.vue'
import {useClosableTabMenu} from '@/core/composables/useClosableTabMenu'
import {getWorkspaceTabMenu} from '@/features/workspace/constants/tab-context-menu'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useFeaturePermission} from '@/features/auth/composables/useFeaturePermission'
import {FeaturePermission} from '@/features/auth/types/feature-permission.types'
import {parseConsoleTabTitle, sqlFileNameFromTabLabel} from '@/features/workspace/services/console-tab-title'
import {isValidViewModelBaseName, stripViewModelDisplayName} from '@/features/explorer/services/view-model-naming'
import {
    buildDefaultMigrationFileName,
    normalizeMigrationFileName,
    sanitizeMigrationSlug,
} from '@/features/workspace/services/migration-file-name.service'
import {isCatalogSchemaDbType} from '@/features/explorer/services/explorer-lazy-load'
import {isWorkspaceTabProduction} from '@/features/workspace/services/workspace-production-banner.service'
import {openGeneratedTableCode} from '@/features/workspace/services/table-codegen.actions'
import type {TableCodeTemplate} from '@/features/workspace/services/table-codegen.types'
import {useFakeDataDialog} from '@/features/workspace/composables/useFakeDataDialog'
import {useMruTabSwitcher} from '@/features/workspace/composables/useMruTabSwitcher'
import MruTabSwitcherOverlay from '@/features/workspace/components/MruTabSwitcherOverlay.vue'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import type {WorkspaceTab} from '@/core/types'
import {buildTabBarSegments, formatGroupDisplayTitle, stripGroupTitleCount} from '@/features/workspace/services/workspace-tab-layout.service'
import {useWorkspaceTabDrag} from '@/features/workspace/composables/useWorkspaceTabDrag'
import {
  resolveUndockDropFromPointer,
  TAB_FLOAT_DEFAULT_HEIGHT,
  TAB_FLOAT_DEFAULT_WIDTH,
} from '@/features/workspace/services/workspace-tab-float.service'
import {isWorkspaceDirtyTabType} from '@/features/workspace/utils/workspace-tab-dirty'

const props = withDefaults(
    defineProps<{
      /** Workspace body size for placing floated tabs. */
      floatBounds?: {width: number; height: number}
    }>(),
    {
      floatBounds: () => ({width: 960, height: 640}),
    },
)

const isStandardEdition = import.meta.env.VITE_DATAWISE_EDITION === 'standard'

const FakeDataDialog = defineAsyncComponent((() =>
    isStandardEdition
        ? import('@/features/pack/stubs/DatagenFakeDataStub.vue')
        : import('@/features/workspace/components/FakeDataDialog.vue')
) as any)

const {t} = useI18n()
const workspace = useWorkspaceStore()
const layout = useLayoutStore()
const explorer = useExplorerStore()
const auth = useAuthStore()
const {can} = useFeaturePermission()
const pluginStore = usePluginStore()
const entitlement = useEntitlementStore()
const tabBarRef = ref<InstanceType<typeof TabBar>>()
const renameTabId = ref<string | null>(null)
const renameGroupId = ref<string | null>(null)
const renameGroupDraft = ref('')
const groupRenameInputRef = ref<HTMLInputElement | null>(null)
let groupToggleTimer: number | null = null

function bindGroupRenameInput(el: unknown) {
  groupRenameInputRef.value = el instanceof HTMLInputElement ? el : null
}
const unsavedDialogOpen = ref(false)
const unsavedDialogTitle = ref('')
const unsavedDialogMessage = ref('')
const migrationDialogOpen = ref(false)
const migrationDialogDefault = ref('')
const migrationTabId = ref<string | null>(null)

const fakeData = useFakeDataDialog(async (target) => {
  workspace.bumpTableDataRefresh(target.id)
})
const {
  open: mruSwitcherOpen,
  highlightIndex: mruHighlightIndex,
  switcherTabs: mruSwitcherTabs,
} = useMruTabSwitcher()
const {
  open: fakeDataDialogOpen,
  loading: fakeDataLoading,
  executing: fakeDataExecuting,
  tab: fakeDataTab,
  properties: fakeDataProperties,
  previewRows: fakeDataPreviewRows,
  previewLoading: fakeDataPreviewLoading,
  previewSql: fakeDataPreviewSql,
  executeError: fakeDataExecuteError,
  canExecute: fakeDataCanExecute,
  executeDisabledHint: fakeDataExecuteHint,
  openForTable,
  execute: onFakeDataExecute,
  exportSql: onFakeDataExport,
  refreshPreview,
} = fakeData

watch(
    () => workspace.fakeDataDialogRequest?.nonce,
    () => {
      const request = workspace.fakeDataDialogRequest
      if (!request) return
      const tab = workspace.tabs.find((item) => item.id === request.tabId)
      if (tab) void openForTable(tab)
    },
)

let unsavedDialogResolver: ((action: 'save' | 'discard' | 'cancel') => void) | null = null

function promptUnsavedClose(dirtyTabIds: string[]): Promise<'save' | 'discard' | 'cancel'> {
  const dirtyTabs = dirtyTabIds
      .map((id) => workspace.tabs.find((tab) => tab.id === id))
      .filter((tab): tab is NonNullable<typeof tab> => !!tab)

  unsavedDialogTitle.value = t('workspace.unsavedTitle')
  unsavedDialogMessage.value =
      dirtyTabs.length === 1
          ? t('workspace.unsavedMessageSingle', {name: dirtyTabs[0].title})
          : t('workspace.unsavedMessageMultiple', {count: dirtyTabs.length})
  unsavedDialogOpen.value = true

  return new Promise((resolve) => {
    unsavedDialogResolver = resolve
  })
}

function resolveUnsavedDialog(action: 'save' | 'discard' | 'cancel') {
  unsavedDialogOpen.value = false
  unsavedDialogResolver?.(action)
  unsavedDialogResolver = null
}

async function requestCloseTabs(tabIds: string[]) {
  const closableIds = tabIds.filter((id) => workspace.tabs.find((tab) => tab.id === id)?.closable)
  if (!closableIds.length) return

  const dirtyIds = closableIds.filter((id) => workspace.isTabDirty(id))
  if (dirtyIds.length) {
    const action = await promptUnsavedClose(dirtyIds)
    if (action === 'cancel') return
    if (action === 'save') {
      for (const id of dirtyIds) {
        if (!workspace.canSaveDirtyTab(id)) continue
        const ok = await workspace.saveDirtyTab(id)
        if (!ok) {
          workspace.setStatus(t('console.saveFailed'))
          return
        }
      }
    }
  }

  for (const id of closableIds) {
    workspace.closeTab(id)
  }
}

async function copyTabTitle(tabId: string) {
  const title = workspace.getTabTitle(tabId)
  if (!title) return
  try {
    await navigator.clipboard.writeText(title)
  } catch {
    layout.showErrorToast(t('workspace.tabCopyFailed'))
  }
}

function isConsoleTabRenamable(tab: WorkspaceTab) {
  return tab.type === 'console' && tab.closable
}

function isViewModelEditorTabRenamable(tab: WorkspaceTab) {
  return tab.type === 'view_model_editor' && tab.closable
}

function isTabRenamable(tab: WorkspaceTab) {
  return isConsoleTabRenamable(tab) || isViewModelEditorTabRenamable(tab)
}

function migrationSlugFromTab(tab: WorkspaceTab): string {
  const parsed = parseConsoleTabTitle(tab.title)
  if (/^Script-\d+$/i.test(parsed.editableLabel.trim())) {
    return 'migration'
  }
  return sanitizeMigrationSlug(parsed.editableLabel) || 'migration'
}

function canSaveConsoleTab(tab: WorkspaceTab): boolean {
  if (tab.type !== 'console' || !tab.connectionId) return false
  const connectionNode = explorer.findNode(tab.connectionId)
  const instanceLabel = tab.database?.trim()
  if (!instanceLabel && !isCatalogSchemaDbType(connectionNode?.dbType)) return false
  return true
}

async function saveConsoleTabFromMenu(tabId: string) {
  if (auth.isGuest) return
  const tab = workspace.tabs.find((item) => item.id === tabId)
  if (!tab || !canSaveConsoleTab(tab)) {
    workspace.setStatus(t('console.saveFailed'))
    return
  }
  const ok = await workspace.saveConsoleTab(tabId)
  if (!ok) workspace.setStatus(t('console.saveFailed'))
}

function openMigrationDialog(tabId: string) {
  if (auth.isGuest) return
  const tab = workspace.tabs.find((item) => item.id === tabId)
  if (!tab || !canSaveConsoleTab(tab)) {
    workspace.setStatus(t('console.saveFailed'))
    return
  }
  migrationTabId.value = tabId
  migrationDialogDefault.value = buildDefaultMigrationFileName(migrationSlugFromTab(tab))
  migrationDialogOpen.value = true
}

function validateMigrationFileName(fileName: string) {
  return normalizeMigrationFileName(fileName) ? null : t('workspace.tabSaveMigrationInvalid')
}

async function confirmMigrationFileName(fileName: string) {
  const tabId = migrationTabId.value
  if (!tabId) return
  const normalized = normalizeMigrationFileName(fileName)
  if (!normalized) return
  const ok = await workspace.saveConsoleTabAsMigration(tabId, normalized)
  if (!ok) {
    workspace.setStatus(t('console.saveFailed'))
    return
  }
  migrationTabId.value = null
}

function runTableCodegen(tabId: string, template: TableCodeTemplate) {
  if (!entitlement.guardDevProductivity('dev.codegen')) return
  const tab = workspace.tabs.find((item) => item.id === tabId)
  if (!tab) return
  void openGeneratedTableCode({
    tab,
    template,
    tree: explorer.tree,
    openConsole: (options) => workspace.openConsole(options),
    showToast: (message) => layout.showErrorToast(message),
    t,
  })
}

async function openFakeDataDialog(tabId: string) {
  if (isStandardEdition) {
    entitlement.openPaywall('pack.datagen', 'dialog.datagen')
    return
  }
  if (!entitlement.guardPack('pack.datagen', 'dialog.datagen')) return
  const tab = workspace.tabs.find((item) => item.id === tabId)
  if (!tab) return
  await openForTable(tab)
}

const {
  menuVisible,
  menuPos,
  menuItems,
  closeMenu,
  onMenuSelect,
  onTabContextMenu,
} = useClosableTabMenu<string>(
    (tabId) => {
      const tab = workspace.tabs.find((item) => item.id === tabId)
      const index = workspace.tabs.findIndex((item) => item.id === tabId)
      return getWorkspaceTabMenu(t, {
        canCloseLeft: workspace.tabs.slice(0, index).some((item) => item.closable),
        canCloseRight: workspace.tabs.slice(index + 1).some((item) => item.closable),
        canRename: tab ? isTabRenamable(tab) : false,
        canDissolveGroup: Boolean(tab?.tabGroupId),
        isFloated: tab ? workspace.isTabFloated(tab.id) : false,
        showConsoleSave: tab?.type === 'console',
        showTableCodegen: tab?.type === 'table'
            && !!tab.tableName?.trim()
            && pluginStore.isSwitchEnabled('p-table-codegen'),
        showTableFakeData: tab?.type === 'table'
            && !!tab.tableName?.trim()
            && !isStandardEdition
            && pluginStore.isEnabled('p-fake-data'),
      })
    },
    () => ({
      close: (tabId) => void requestCloseTabs([tabId]),
      closeOthers: (tabId) => {
        const others = workspace.tabs
            .filter((tab) => tab.id !== tabId && tab.closable)
            .map((tab) => tab.id)
        void requestCloseTabs(others)
      },
      closeAll: () => {
        void requestCloseTabs(workspace.tabs.filter((tab) => tab.closable).map((tab) => tab.id))
      },
      closeLeft: (tabId) => {
        const idx = workspace.tabs.findIndex((tab) => tab.id === tabId)
        if (idx <= 0) return
        const left = workspace.tabs.slice(0, idx).filter((tab) => tab.closable).map((tab) => tab.id)
        void requestCloseTabs(left)
      },
      closeRight: (tabId) => {
        const idx = workspace.tabs.findIndex((tab) => tab.id === tabId)
        if (idx < 0 || idx >= workspace.tabs.length - 1) return
        const right = workspace.tabs.slice(idx + 1).filter((tab) => tab.closable).map((tab) => tab.id)
        void requestCloseTabs(right)
      },
      rename: (tabId) => {
        const tab = workspace.tabs.find((item) => item.id === tabId)
        if (!tab || !isTabRenamable(tab)) return
        workspace.activateTab(tabId)
        renameTabId.value = tabId
        tabBarRef.value?.ensureActiveTabVisible()
      },
      copyTitle: (tabId) => void copyTabTitle(tabId),
      dissolveGroup: (tabId) => {
        const groupId = workspace.tabs.find((tab) => tab.id === tabId)?.tabGroupId
        if (groupId) workspace.dissolveTabGroupById(groupId)
      },
      renameGroup: (tabId) => {
        const groupId = workspace.tabs.find((tab) => tab.id === tabId)?.tabGroupId
        if (groupId) void startRenameGroup(groupId)
      },
      floatTab: (tabId) => floatTabFromMenu(tabId),
      dockTab: (tabId) => workspace.dockTab(tabId),
      save: (tabId) => void saveConsoleTabFromMenu(tabId),
      saveMigration: (tabId) => openMigrationDialog(tabId),
      'codegen-jpa': (tabId) => runTableCodegen(tabId, 'jpa'),
      'codegen-mybatis': (tabId) => runTableCodegen(tabId, 'mybatis'),
      'codegen-typescript': (tabId) => runTableCodegen(tabId, 'typescript'),
      'generate-fake-data': (tabId) => void openFakeDataDialog(tabId),
    }),
)

const tabsSignature = computed(() =>
    [
        ...workspace.tabs.map((tab) => `${tab.id}:${tab.tabGroupId ?? ''}`),
        ...workspace.tabGroups.map((group) => `${group.id}:${group.collapsed ? 1 : 0}`),
    ].join(','),
)

const overflowItems = computed(() =>
    workspace.tabs.map((tab) => ({id: tab.id, label: tab.title})),
)

const tabSegments = computed(() => buildTabBarSegments(workspace.tabs, workspace.tabGroups))

const {
  draggingId,
  overId,
  overZone,
  overGroupId,
  floatAway,
  ghostX,
  ghostY,
  ghostTitle,
  active: tabDragActive,
  beginPointerDrag,
} = useWorkspaceTabDrag({
  tabs: () => workspace.tabs,
  onDrop: (draggedId, targetId, zone) => {
    // Dropping a floated tab back onto the bar docks it, then reorders.
    if (workspace.isTabFloated(draggedId)) workspace.clearTabFloat(draggedId)
    workspace.dropTab(draggedId, targetId, zone)
    workspace.activateTab(draggedId)
  },
  onFloatAway: (draggedId, clientX, clientY) => floatTabAtPoint(draggedId, clientX, clientY),
  scrollContainer: () => tabBarRef.value?.tabsScrollRef ?? null,
})

function resolveFloatBounds() {
  return props.floatBounds ?? {width: 960, height: 640}
}

function floatTabFromMenu(tabId: string) {
  workspace.floatTab(tabId, resolveFloatBounds())
}

function floatTabAtPoint(tabId: string, clientX: number, clientY: number) {
  const surface = document.querySelector('[data-workspace-float-surface]') as HTMLElement | null
  const bounds = resolveFloatBounds()
  if (!surface) {
    workspace.floatTab(tabId, bounds)
    return
  }
  const surfaceRect = surface.getBoundingClientRect()
  const freeSize = {
    width: Math.min(TAB_FLOAT_DEFAULT_WIDTH, Math.max(320, bounds.width - 48)),
    height: Math.min(TAB_FLOAT_DEFAULT_HEIGHT, Math.max(200, bounds.height - 48)),
  }
  const drop = resolveUndockDropFromPointer(clientX, clientY, surfaceRect, freeSize)
  workspace.floatTab(tabId, bounds, {
    ...drop.rect,
    maximized: drop.kind === 'top',
  })
  workspace.setTabFloatSnapGuide(null)
}

function wouldEjectFromGroup(): boolean {
  const dragged = workspace.tabs.find((tab) => tab.id === draggingId.value)
  if (!dragged?.tabGroupId || !overZone.value) return false
  if (overZone.value === 'on') return false
  if (overZone.value === 'end') return true
  const target = workspace.tabs.find((tab) => tab.id === overId.value)
  if (!target) return true
  if (target.tabGroupId !== dragged.tabGroupId) return true
  const cluster = workspace.tabs.filter((tab) => tab.tabGroupId === dragged.tabGroupId)
  if (overZone.value === 'before' && cluster[0]?.id === target.id) return true
  if (overZone.value === 'after' && cluster[cluster.length - 1]?.id === target.id) return true
  return false
}

/** IDEA-like: reorder uses the bar caret; ghost stays a quiet tab chip. Hint only for rare group ops. */
const dragHint = computed(() => {
  if (!tabDragActive.value || floatAway.value) return ''
  if (overZone.value === 'on') return t('workspace.tabDragMergeGroup')
  if (wouldEjectFromGroup()) return t('workspace.tabDragEjectGroup')
  return ''
})

const draggingTab = computed(() =>
    workspace.tabs.find((tab) => tab.id === draggingId.value) ?? null,
)

/** IDEA-like undock: free window or L/R/top snap frames under the chip. */
const undockDrop = computed(() => {
  if (!tabDragActive.value || !floatAway.value) return null
  const surface = document.querySelector('[data-workspace-float-surface]') as HTMLElement | null
  if (!surface) return null
  const surfaceRect = surface.getBoundingClientRect()
  const bounds = resolveFloatBounds()
  // Slightly compact preview while dragging — less heavy than the final default float.
  const freeSize = {
    width: Math.min(440, Math.max(300, Math.min(TAB_FLOAT_DEFAULT_WIDTH, bounds.width - 64))),
    height: Math.min(280, Math.max(180, Math.min(TAB_FLOAT_DEFAULT_HEIGHT, bounds.height - 64))),
  }
  return {
    surfaceRect,
    drop: resolveUndockDropFromPointer(ghostX.value, ghostY.value, surfaceRect, freeSize),
  }
})

const floatPreviewStyle = computed(() => {
  const state = undockDrop.value
  if (!state) return null
  const {surfaceRect, drop} = state
  return {
    left: `${surfaceRect.left + drop.rect.x}px`,
    top: `${surfaceRect.top + drop.rect.y}px`,
    width: `${drop.rect.width}px`,
    height: `${drop.rect.height}px`,
  }
})

const floatPreviewKind = computed(() => undockDrop.value?.drop.kind ?? 'free')

watch(
    () => tabDragActive.value && floatAway.value,
    (away) => {
      if (!away) workspace.setTabFloatSnapGuide(null)
    },
)

async function startRenameGroup(groupId: string) {
  if (groupToggleTimer != null) {
    window.clearTimeout(groupToggleTimer)
    groupToggleTimer = null
  }
  const group = workspace.tabGroups.find((item) => item.id === groupId)
  if (!group) return
  renameGroupId.value = groupId
  renameGroupDraft.value = stripGroupTitleCount(group.title) || group.title
  await nextTick()
  const input = groupRenameInputRef.value
  input?.focus()
  input?.select()
}

function onGroupHeaderClick(groupId: string) {
  if (renameGroupId.value === groupId) return
  if (groupToggleTimer != null) {
    window.clearTimeout(groupToggleTimer)
    groupToggleTimer = null
  }
  // Delay so dblclick (rename) does not flash collapse/expand.
  groupToggleTimer = window.setTimeout(() => {
    groupToggleTimer = null
    workspace.toggleTabGroupCollapsed(groupId)
  }, 220)
}

function commitRenameGroup() {
  const groupId = renameGroupId.value
  if (!groupId) return
  const draft = stripGroupTitleCount(renameGroupDraft.value)
  if (draft) workspace.renameTabGroup(groupId, draft)
  renameGroupId.value = null
  renameGroupDraft.value = ''
}

function cancelRenameGroup() {
  renameGroupId.value = null
  renameGroupDraft.value = ''
}

function handleTabSelect(tabId: string) {
  workspace.activateTab(tabId)
  tabBarRef.value?.ensureActiveTabVisible()
}

function tabDropClass(tabId: string) {
  const classes: string[] = []
  if (workspace.isTabFloated(tabId)) classes.push('is-tab-floated')
  if (draggingId.value === tabId) classes.push('is-tab-dragging')
  else if (overZone.value !== 'end' && overId.value === tabId && overZone.value) {
    if (overZone.value === 'on') classes.push('is-tab-drop-on')
    else if (overZone.value === 'before') classes.push('is-tab-drop-before')
    else classes.push('is-tab-drop-after')
  }
  return classes.join(' ')
}

function consoleRenameSuffix(tab: WorkspaceTab) {
  if (tab.type !== 'console') return undefined
  return parseConsoleTabTitle(tab.title).editableLabel
}

function consoleRenameSuffixOnly(tab: WorkspaceTab) {
  if (tab.type !== 'console') return false
  return parseConsoleTabTitle(tab.title).hasHostPrefix
}

async function onTabRename(tabId: string, name: string) {
  const tab = workspace.tabs.find((item) => item.id === tabId)
  if (!tab) {
    renameTabId.value = null
    return
  }

  if (tab.type === 'view_model_editor') {
    const trimmed = stripViewModelDisplayName(name)
    if (!trimmed || !isValidViewModelBaseName(trimmed)) {
      workspace.setStatus(t('viewModel.invalidName'))
      renameTabId.value = null
      return
    }
    const ok = await workspace.renameViewModelTab(tabId, trimmed)
    if (!ok) {
      workspace.setStatus(t('viewModel.renameFailed'))
    }
    renameTabId.value = null
    return
  }

  if (tab.type !== 'console') {
    renameTabId.value = null
    return
  }

  const parsed = parseConsoleTabTitle(name)
  const label = (parsed.hasHostPrefix ? parsed.editableLabel : name).trim()
  if (!sqlFileNameFromTabLabel(label)) {
    workspace.setStatus(t('explorer.invalidSqlFileName'))
    renameTabId.value = null
    return
  }

  const connectionId = tab.connectionId
  const database = tab.database
  const ok = await workspace.renameConsoleTab(tabId, name)
  if (!ok) {
    workspace.setStatus(t('explorer.renameSqlFileFailed'))
  } else if (connectionId && database) {
    try {
      await explorer.reloadWorkspacesFolder(connectionId, database)
    } catch (error) {
      console.error('[reloadWorkspacesFolder]', error)
    }
  }
  renameTabId.value = null
}

function cancelRename() {
  renameTabId.value = null
}

function isTabProduction(tab: WorkspaceTab) {
  return isWorkspaceTabProduction(tab, explorer.tree, explorer.findNode)
}
</script>

<template>
  <TabBar
      ref="tabBarRef"
      :active-tab-id="workspace.activeTabId"
      :tabs-signature="tabsSignature"
      :overflow-items="overflowItems"
      :overflow-title="t('workspace.allTabs')"
      :overflow-search-placeholder="t('workspace.searchTabs')"
      :bar-class="tabDragActive ? 'is-reordering-tabs' : undefined"
      @select="handleTabSelect"
  >
    <template #default="{ bindTabRef }">
      <template v-for="segment in tabSegments" :key="segment.kind === 'group' ? segment.group.id : segment.tab.id">
        <div
            v-if="segment.kind === 'group'"
            class="dw-tab-group"
            :class="{
              'is-collapsed': segment.group.collapsed,
              'is-drop-target': overGroupId === segment.group.id,
            }"
            :data-tab-group-id="segment.group.id"
        >
          <button
              v-if="renameGroupId !== segment.group.id"
              type="button"
              class="dw-tab-group__toggle"
              :title="t('workspace.tabGroupToggle')"
              @click="onGroupHeaderClick(segment.group.id)"
              @dblclick.stop.prevent="startRenameGroup(segment.group.id)"
          >
            <span class="dw-tab-group__chevron" aria-hidden="true">{{ segment.group.collapsed ? '▸' : '▾' }}</span>
            <span v-if="segment.group.collapsed" class="dw-tab-group__label">{{ formatGroupDisplayTitle(segment.group.title, segment.tabs.length) }}</span>
          </button>
          <div v-else class="dw-tab-group__rename">
            <input
                :ref="bindGroupRenameInput"
                v-model="renameGroupDraft"
                class="dw-tab-group__rename-input"
                type="text"
                :aria-label="t('workspace.tabGroupRenameHint')"
                @click.stop
                @keydown.enter.prevent="commitRenameGroup"
                @keydown.escape.prevent="cancelRenameGroup"
                @blur="commitRenameGroup"
            />
          </div>
          <template v-if="!segment.group.collapsed">
            <TabItem
                v-for="tab in segment.tabs"
                :key="tab.id"
                :tab-id="tab.id"
                :title="tab.title"
                :active="workspace.activeTabId === tab.id"
                :closable="tab.closable"
                :renamable="isTabRenamable(tab)"
                :renaming="renameTabId === tab.id"
                :dirty="isWorkspaceDirtyTabType(tab.type) && workspace.isTabDirty(tab.id)"
                :rename-suffix="consoleRenameSuffix(tab)"
                :rename-suffix-only="consoleRenameSuffixOnly(tab)"
                :set-ref="bindTabRef(tab.id)"
                :class="tabDropClass(tab.id)"
                @select="handleTabSelect(tab.id)"
                @close="requestCloseTabs([tab.id])"
                @contextmenu="onTabContextMenu($event, tab.id, tab.closable)"
                @request-rename="isTabRenamable(tab) && (renameTabId = tab.id)"
                @rename="onTabRename(tab.id, $event)"
                @cancel-rename="cancelRename"
                @pointer-drag-start="beginPointerDrag($event, tab.id, tab.title)"
            >
              <template #leading>
                <WorkspaceTabIcon :type="tab.type" :plugin-id="tab.pluginId"/>
                <span
                    v-if="isTabProduction(tab)"
                    class="tab-prod-dot"
                    :title="t('connection.envOptions.prod')"
                    aria-hidden="true"
                />
              </template>
            </TabItem>
          </template>
        </div>
        <TabItem
            v-else
            :tab-id="segment.tab.id"
            :title="segment.tab.title"
            :active="workspace.activeTabId === segment.tab.id"
            :closable="segment.tab.closable"
            :renamable="isTabRenamable(segment.tab)"
            :renaming="renameTabId === segment.tab.id"
            :dirty="isWorkspaceDirtyTabType(segment.tab.type) && workspace.isTabDirty(segment.tab.id)"
            :rename-suffix="consoleRenameSuffix(segment.tab)"
            :rename-suffix-only="consoleRenameSuffixOnly(segment.tab)"
            :set-ref="bindTabRef(segment.tab.id)"
            :class="tabDropClass(segment.tab.id)"
            @select="handleTabSelect(segment.tab.id)"
            @close="requestCloseTabs([segment.tab.id])"
            @contextmenu="onTabContextMenu($event, segment.tab.id, segment.tab.closable)"
            @request-rename="isTabRenamable(segment.tab) && (renameTabId = segment.tab.id)"
            @rename="onTabRename(segment.tab.id, $event)"
            @cancel-rename="cancelRename"
            @pointer-drag-start="beginPointerDrag($event, segment.tab.id, segment.tab.title)"
        >
          <template #leading>
            <WorkspaceTabIcon :type="segment.tab.type" :plugin-id="segment.tab.pluginId"/>
            <span
                v-if="isTabProduction(segment.tab)"
                class="tab-prod-dot"
                :title="t('connection.envOptions.prod')"
                aria-hidden="true"
            />
          </template>
        </TabItem>
      </template>
      <div
          class="dw-tab-bar-end"
          data-tab-bar-end
          :class="{ 'is-drop-end': tabDragActive && overZone === 'end' }"
      />
    </template>

    <template #actions>
      <TabAddButton
          v-if="can(FeaturePermission.WorkbenchTabNew)"
          :title="t('workspace.newConsole')"
          @click="workspace.openConsole()"
      />
    </template>
  </TabBar>

  <Teleport to="body">
    <!-- IDEA undock: one composition — tab chip lives in the float chrome -->
    <div
        v-if="floatPreviewStyle"
        class="dw-tab-float-preview"
        :class="{
          'is-snap': floatPreviewKind !== 'free',
          [`is-snap-${floatPreviewKind}`]: floatPreviewKind !== 'free',
        }"
        :style="floatPreviewStyle"
        :aria-label="t('workspace.tabDragFloatWindow')"
    >
      <div class="dw-tab-float-preview__chrome">
        <div class="dw-tab-float-preview__tab">
          <WorkspaceTabIcon
              v-if="draggingTab"
              class="dw-tab-float-preview__tab-icon"
              :type="draggingTab.type"
              :plugin-id="draggingTab.pluginId"
          />
          <span class="dw-tab-float-preview__tab-title">{{ ghostTitle }}</span>
        </div>
      </div>
      <div class="dw-tab-float-preview__body" aria-hidden="true">
        <i/><i/><i/><i/><i/>
      </div>
    </div>
    <!-- Strip reorder: quiet chip only -->
    <div
        v-else-if="tabDragActive"
        class="dw-tab-drag-ghost"
        :class="{
          'is-merge': overZone === 'on',
          'is-eject': Boolean(dragHint) && overZone !== 'on',
        }"
        :style="{ transform: `translate(${ghostX}px, ${ghostY}px) translate(-28%, -40%)` }"
    >
      <WorkspaceTabIcon
          v-if="draggingTab"
          class="dw-tab-drag-ghost__icon"
          :type="draggingTab.type"
          :plugin-id="draggingTab.pluginId"
      />
      <span class="dw-tab-drag-ghost__title">{{ ghostTitle }}</span>
      <span v-if="dragHint" class="dw-tab-drag-ghost__hint">{{ dragHint }}</span>
    </div>
  </Teleport>

  <ContextMenuHost
      :visible="menuVisible"
      :items="menuItems"
      :x="menuPos.x"
      :y="menuPos.y"
      @select="onMenuSelect"
      @close="closeMenu"
  />

  <UnsavedChangesDialog
      v-model:open="unsavedDialogOpen"
      :title="unsavedDialogTitle"
      :message="unsavedDialogMessage"
      @save="resolveUnsavedDialog('save')"
      @discard="resolveUnsavedDialog('discard')"
      @cancel="resolveUnsavedDialog('cancel')"
  />

  <PromptDialog
      v-model:open="migrationDialogOpen"
      :title="t('workspace.tabSaveMigrationTitle')"
      :subtitle="t('workspace.tabSaveMigrationHint')"
      :label="t('workspace.tabSaveMigrationLabel')"
      :default-value="migrationDialogDefault"
      :placeholder="t('workspace.tabSaveMigrationPlaceholder')"
      :required-message="t('workspace.tabSaveMigrationRequired')"
      :validate="validateMigrationFileName"
      :confirm-label="t('common.save')"
      @confirm="confirmMigrationFileName"
  />

  <FakeDataDialog
      v-if="!isStandardEdition"
      v-model:open="fakeDataDialogOpen"
      :loading="fakeDataLoading"
      :executing="fakeDataExecuting"
      :table-name="fakeDataTab?.tableName"
      :properties="fakeDataProperties"
      :preview-rows="fakeDataPreviewRows"
      :preview-sql="fakeDataPreviewSql"
      :preview-loading="fakeDataPreviewLoading"
      :error-message="fakeDataExecuteError"
      :can-execute="fakeDataCanExecute"
      :execute-disabled-hint="fakeDataExecuteHint"
      @execute="onFakeDataExecute"
      @export="onFakeDataExport"
      @refresh-preview="refreshPreview"
  />

  <MruTabSwitcherOverlay
      :open="mruSwitcherOpen"
      :tabs="mruSwitcherTabs"
      :highlight-index="mruHighlightIndex"
  />
</template>
