<!-- 连接树上方的工具栏：新建连接、刷新、定位、设置、搜索 -->
<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import IconButton from '@/core/components/IconButton.vue'
import {DwTreeToolbar} from '@/core/components'
import {ContextMenuHost, useContextMenu} from '@/core/context-menu'
import type {ShortcutActionId} from '@/core/shortcuts/types'
import {
  clearExplorerSearchFocus,
  registerExplorerSearchFocus,
} from '@/core/shortcuts/action-registry'
import {shortcutTooltip, formatShortcutLabel} from '@/features/layout/composables/useAppShortcutListener'
import {getExplorerSettingsMenuItems} from '@/features/explorer/constants/explorer-settings-menu'
import {EXPLORER_ICONS} from '@/features/explorer/constants/icons'
import ExplorerAddMenu from './ExplorerAddMenu.vue'
import ExportConnectionDialog from '@/features/explorer/components/ExportConnectionDialog.vue'
import ImportConnectionDialog from '@/features/explorer/components/ImportConnectionDialog.vue'
import {
  runExplorerLocate,
  runExplorerRefresh,
  runToggleAllComments,
  runToggleColumnComment,
  runToggleSemanticLayer,
  runToggleTableComment,
} from '@/features/explorer/services/explorer-toolbar.actions'
import {profileImportConnectionCount, isConnectionProfilePackage} from '@/features/explorer/services/import-connection-file.service'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useFeaturePermission} from '@/features/auth/composables/useFeaturePermission'
import {canAccessExplorerCatalogAi, canUseExplorerAddMenu} from '@/features/auth/services/feature-permission.service'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {FeaturePermission} from '@/features/auth/types/feature-permission.types'
import {isProjectScopeAll, toggleProjectScopeAll} from '@/features/project/services/project-scope'
import {useProjectStore} from '@/features/project/stores/project'
import {resolveConnectionCatalogErrorMessage} from '@/features/connection/services/connection-catalog.service'
import {parseConfigSnapshotPayload} from '@/features/settings/services/config-snapshot.service'
import {
  commitExportSaveDestination,
  exportProfilePackage,
  importProfilePackage,
  preflightProfilePackage,
  promptExportSaveDestination,
} from '@/features/settings/services/config-portability.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const {t} = useI18n()
const explorer = useExplorerStore()
const layout = useLayoutStore()
const auth = useAuthStore()
const projectStore = useProjectStore()
const {can} = useFeaturePermission()
const showExplorerAdd = computed(() => canUseExplorerAddMenu(auth.isGuest))
const icons = EXPLORER_ICONS
/** 与连接树节点图标同级（TreeNodeIcon 18–20 / stroke 1.55） */
const TOOLBAR_ICON_SIZE = 18
const TOOLBAR_ICON_STROKE = 1.55

const menuRef = ref<HTMLElement>()
const settingsRef = ref<HTMLElement>()
const searchInputRef = ref<HTMLInputElement>()
const showMenu = ref(false)
const addMenuPos = ref({x: 0, y: 0})
const settingsMenu = useContextMenu()
const showAllProjects = ref(isProjectScopeAll())
const showExportDialog = ref(false)
const exportBusy = ref(false)
const exportProjectName = computed(
    () => projectStore.displayName || t('explorer.exportConnectionNoProject'),
)
const showImportDialog = ref(false)
const importBusy = ref(false)
const importFile = ref<File | null>(null)
const importFileName = computed(() => importFile.value?.name || '')

const emit = defineEmits<{
  'create-folder': []
}>()

const settingsMenuItems = computed(() =>
    getExplorerSettingsMenuItems(
        t,
        {
          showColumnComment: explorer.showColumnComment,
          showTableComment: explorer.showTableComment,
          showSemanticLayer: explorer.showSemanticLayer,
          allCommentsVisible: explorer.allCommentsVisible,
          canToggleSemanticLayer: canAccessExplorerCatalogAi(),
          showAllProjects: showAllProjects.value,
        },
        shortcutLabel,
    ),
)

function toggleMenu() {
  settingsMenu.close()
  if (!showMenu.value && menuRef.value) {
    const rect = menuRef.value.getBoundingClientRect()
    addMenuPos.value = {x: rect.left, y: rect.bottom + 4}
  }
  showMenu.value = !showMenu.value
}

function openFolderDialog() {
  showMenu.value = false
  emit('create-folder')
}

function openExportProjectConnections() {
  showMenu.value = false
  if (!projectStore.activeProjectId) {
    layout.showErrorToast(t('explorer.exportConnectionNoProject'))
    return
  }
  showExportDialog.value = true
}

function openImportConnections() {
  showMenu.value = false
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.dwprofile,.json,application/json,application/octet-stream'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    void handleImportFile(file)
  }
  input.click()
}

async function handleImportFile(file: File) {
  if (isConnectionProfilePackage(file)) {
    importFile.value = file
    showImportDialog.value = true
    return
  }
  try {
    const parsed = parseConfigSnapshotPayload(await file.text())
    const count = await explorer.importConnections(parsed.connections)
    await explorer.refreshTree()
    layout.showSuccessToast(t('explorer.importSuccess', {count}))
  } catch (error) {
    layout.showErrorToast(
        resolveConnectionCatalogErrorMessage(error, t, 'save')
        || t('explorer.importFailed'),
    )
  }
}

function onImportDialogOpenChange(open: boolean) {
  showImportDialog.value = open
  if (!open && !importBusy.value) {
    importFile.value = null
  }
}

async function confirmImportProfilePackage(payload: {passphrase: string}) {
  const file = importFile.value
  if (!file) {
    layout.showErrorToast(t('explorer.importFailed'))
    return
  }
  importBusy.value = true
  try {
    const preflight = await preflightProfilePackage(file, payload.passphrase)
    if (!preflight.passphraseOk) {
      layout.showErrorToast(t('settings.configPortability.passphraseIncorrect'))
      return
    }
    if (!preflight.schemaCompatible) {
      layout.showErrorToast(t('settings.configPortability.schemaUnsupported'))
      return
    }
    const result = await importProfilePackage(file, payload.passphrase, {
      connections: true,
      app: false,
      snippets: false,
      aiWorkspace: false,
      projects: false,
      savedConsoles: false,
      sqlHistory: false,
      projectFileConflict: 'preferImported',
    })
    await explorer.refreshTree()
    const count = profileImportConnectionCount(result.counts)
    showImportDialog.value = false
    importFile.value = null
    if (count <= 0) {
      layout.showWarningToast(t('explorer.importConnectionEmpty'))
      return
    }
    layout.showSuccessToast(t('explorer.importSuccess', {count}))
  } catch (error) {
    layout.showErrorToast(
        resolveCaughtApiErrorMessage(error, t, 'explorer.importFailed'),
    )
  } finally {
    importBusy.value = false
  }
}

async function confirmExportProjectConnections(payload: {
  passphrase: string
  confirmPassphrase: string
  connectionIds: string[]
}) {
  if (!projectStore.activeProjectId) {
    layout.showErrorToast(t('explorer.exportConnectionNoProject'))
    return
  }
  if (!payload.connectionIds.length) {
    layout.showErrorToast(t('explorer.exportConnectionNoGroups'))
    return
  }
  const destination = await promptExportSaveDestination('datawise-connections.dwprofile')
  if (!destination) return
  exportBusy.value = true
  try {
    const {blob, fileName} = await exportProfilePackage({
      passphrase: payload.passphrase,
      confirmPassphrase: payload.confirmPassphrase,
      connectionIds: payload.connectionIds,
      domains: {
        connections: true,
        app: false,
        snippets: false,
        aiWorkspace: false,
        projects: false,
        savedConsoles: false,
        sqlHistory: false,
      },
    })
    const savedPath = await commitExportSaveDestination(destination, blob, fileName)
    layout.showSuccessToast(
        savedPath
            ? t('explorer.exportConnectionSaved', {path: savedPath})
            : t('explorer.exportConnectionSuccess'),
    )
    showExportDialog.value = false
  } catch (error) {
    layout.showErrorToast(
        resolveCaughtApiErrorMessage(error, t, 'explorer.exportConnectionFailed'),
    )
  } finally {
    exportBusy.value = false
  }
}

function toggleSettings() {
  showMenu.value = false
  if (settingsMenu.visible.value) {
    settingsMenu.close()
    return
  }
  if (settingsRef.value) {
    settingsMenu.openBelow(settingsRef.value, settingsMenuItems.value)
  }
}

function onSettingsMenuSelect(id: string) {
  if (id === 'toggle-column-comment') runToggleColumnComment()
  if (id === 'toggle-table-comment') runToggleTableComment()
  if (id === 'toggle-semantic-layer') runToggleSemanticLayer()
  if (id === 'toggle-all-comments') runToggleAllComments()
  if (id === 'toggle-all-projects') {
    showAllProjects.value = toggleProjectScopeAll()
    void runExplorerRefresh()
    layout.showSuccessToast(
      showAllProjects.value
        ? t('explorer.showAllProjectsOn')
        : t('explorer.showAllProjectsOff'),
    )
  }
  settingsMenu.close()
}

async function refreshTree() {
  await runExplorerRefresh()
}

function locateInTree() {
  void runExplorerLocate()
}

function focusSearchInput() {
  searchInputRef.value?.focus()
  searchInputRef.value?.select()
}

function shortcutLabel(actionId: ShortcutActionId): string {
  return formatShortcutLabel(actionId)
}

function onSearchKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    explorer.searchQuery = ''
    searchInputRef.value?.blur()
  }
}

onMounted(() => {
  registerExplorerSearchFocus(focusSearchInput)
})

onUnmounted(() => {
  clearExplorerSearchFocus()
})
</script>

<template>
  <DwTreeToolbar class="toolbar">
    <template #actions>
      <div class="actions dw-btn-group">
        <div v-if="showExplorerAdd" ref="menuRef" class="menu-wrap">
          <IconButton :title="t('explorer.newDataSource')" :active="showMenu" @click="toggleMenu">
            <span class="toolbar-glyph">
              <DwIcon :name="icons.add" :size="TOOLBAR_ICON_SIZE" :stroke-width="TOOLBAR_ICON_STROKE"/>
            </span>
          </IconButton>

          <ExplorerAddMenu
              v-if="showMenu"
              :x="addMenuPos.x"
              :y="addMenuPos.y"
              @close="showMenu = false"
              @create-folder="openFolderDialog"
              @export-project-connections="openExportProjectConnections"
              @import-connections="openImportConnections"
          />
        </div>

        <IconButton
            v-if="can(FeaturePermission.WorkbenchExplorerRefresh)"
            :title="shortcutTooltip(t('explorer.refresh'), 'explorer.refresh')"
            :disabled="explorer.isRefreshing"
            @click="refreshTree"
        >
          <span class="toolbar-glyph" :class="{ 'is-spinning': explorer.isRefreshing }">
            <DwIcon :name="icons.refresh" :size="TOOLBAR_ICON_SIZE" :stroke-width="TOOLBAR_ICON_STROKE"/>
          </span>
        </IconButton>

        <IconButton
            v-if="can(FeaturePermission.WorkbenchExplorerLocate)"
            :title="shortcutTooltip(t('explorer.locateActiveTab'), 'explorer.locate')"
            @click="locateInTree"
        >
          <span class="toolbar-glyph">
            <DwIcon :name="icons.locate" :size="TOOLBAR_ICON_SIZE" :stroke-width="TOOLBAR_ICON_STROKE"/>
          </span>
        </IconButton>

        <div v-if="can(FeaturePermission.WorkbenchExplorerSettings)" ref="settingsRef" class="menu-wrap">
          <IconButton
              :title="t('explorer.settings')"
              :active="settingsMenu.visible.value"
              @click="toggleSettings"
          >
            <span class="toolbar-glyph">
              <DwIcon :name="icons.settings" :size="TOOLBAR_ICON_SIZE" :stroke-width="TOOLBAR_ICON_STROKE"/>
            </span>
          </IconButton>
        </div>
      </div>
    </template>

    <ContextMenuHost
        :visible="settingsMenu.visible.value"
        :items="settingsMenu.items.value"
        :x="settingsMenu.pos.value.x"
        :y="settingsMenu.pos.value.y"
        @select="onSettingsMenuSelect"
        @close="settingsMenu.close"
    />

    <div v-if="can(FeaturePermission.WorkbenchExplorerSearch)" class="search-wrap">
      <label class="search" :class="{ 'search--active': explorer.searchQuery.trim().length > 0 }">
        <DwIcon class="search-icon" :name="icons.search" size="sm"/>
        <input
            ref="searchInputRef"
            v-model="explorer.searchQuery"
            :placeholder="t('explorer.searchPlaceholder')"
            @keydown="onSearchKeydown"
        />
        <kbd v-if="shortcutLabel('explorer.search')" class="hint">{{ shortcutLabel('explorer.search') }}</kbd>
      </label>
    </div>
  </DwTreeToolbar>

  <ExportConnectionDialog
      v-model:open="showExportDialog"
      :project-name="exportProjectName"
      :busy="exportBusy"
      @confirm="confirmExportProjectConnections"
  />

  <ImportConnectionDialog
      :open="showImportDialog"
      :file-name="importFileName"
      :busy="importBusy"
      @update:open="onImportDialogOpenChange"
      @confirm="confirmImportProfilePackage"
  />
</template>

<style scoped>
.toolbar {
  flex-wrap: nowrap;
  gap: var(--dw-gap);
  height: var(--dw-toolbar-height);
  padding: 0 var(--dw-space-5) 0 var(--dw-space-3);
  min-width: 0;
}

.actions {
  flex-shrink: 0;
}

.menu-wrap {
  position: relative;
  overflow: visible;
}

.toolbar-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  line-height: 0;
}

.toolbar-glyph .dw-icon-root {
  flex-shrink: 0;
}

.toolbar-glyph.is-spinning {
  animation: explorer-refresh-spin 0.8s linear infinite;
}

@keyframes explorer-refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

.search-wrap {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
}

.search {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  width: 100%;
  min-width: 0;
  height: var(--dw-btn-height-sm);
  padding: 0 var(--dw-space-5);
  border: 1px solid transparent;
  border-radius: var(--dw-radius-pill);
  background: var(--dw-bg-muted);
  color: var(--dw-text-muted);
  transition: background var(--dw-duration-fast) var(--dw-ease), border-color 0.12s ease;
}

.search--active {
  background: var(--dw-primary-softer);
  border-color: var(--dw-primary-ring);
}

.search-icon {
  flex-shrink: 0;
  opacity: 0.85;
}

.search input {
  flex: 1 1 0;
  width: 0;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
}

.search input::placeholder {
  color: var(--dw-text-muted);
}

.search:focus-within {
  background: var(--dw-bg);
  border-color: var(--dw-border);
}

.search--active:focus-within {
  border-color: var(--dw-primary-border);
}

.hint {
  flex-shrink: 0;
  padding: 1px var(--dw-space-2);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg);
  font-family: var(--dw-mono);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-snug);
  color: var(--dw-text-muted);
}

@container explorer (max-width: 300px) {
  .hint {
    display: none;
  }
}
</style>
