<!-- 本地文件工作区工具栏：打开文件夹（含最近）、新建、刷新、定位、折叠、搜索（含类型下拉） -->
<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import IconButton from '@/core/components/IconButton.vue'
import {ConfirmDialog} from '@/core/components'
import {ContextMenuHost, useContextMenu} from '@/core/context-menu'
import {useConfirmDialog} from '@/core/composables/useConfirmDialog'
import type {ContextMenuItem} from '@/core/types'
import {
  useLocalFilesStore,
  LOCAL_FILES_MAX_RECENT,
  LOCAL_FILES_MAX_FAVORITES,
} from '@/features/local-files/stores/local-files-store'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {
  localFileBaseName,
  normalizeLocalPathKey,
} from '@/features/local-files/services/local-files-path'
import {pickLocalFilesRoot} from '@/features/local-files/services/local-files.service'
import {listDirtyLocalWorkspaceTabs} from '@/features/local-files/services/local-files-workspace-tabs'
import type {LocalFilesExtFilter} from '@/features/local-files/services/local-files-search'

const {t} = useI18n()
const localFiles = useLocalFilesStore()
const layout = useLayoutStore()
const openFolderMenu = useContextMenu()
const filterMenu = useContextMenu()
const openFolderBtnRef = ref<HTMLElement | null>(null)
const filterBtnRef = ref<HTMLElement | null>(null)
const switchConfirm = useConfirmDialog('primary')

const TOOLBAR_ICON_SIZE = 16
const RECENT_PREFIX = 'recent:'
const FAVORITE_PREFIX = 'favorite:'
const FILTER_PREFIX = 'filter:'

const extFilterItems = computed(() => ([
  {id: 'all' as LocalFilesExtFilter, label: t('explorer.localFiles.filterAll')},
  {id: 'sql' as LocalFilesExtFilter, label: t('explorer.localFiles.filterSql')},
  {id: 'markdown' as LocalFilesExtFilter, label: t('explorer.localFiles.filterMarkdown')},
  {id: 'config' as LocalFilesExtFilter, label: t('explorer.localFiles.filterConfig')},
]))

const activeFilterLabel = computed(() =>
  extFilterItems.value.find((item) => item.id === localFiles.extFilter)?.label
  ?? t('explorer.localFiles.filterAll'),
)

const filterMenuItems = computed((): ContextMenuItem[] =>
  extFilterItems.value.map((item) => ({
    id: `${FILTER_PREFIX}${item.id}`,
    label: item.label,
    selected: localFiles.extFilter === item.id,
  })),
)

const openFolderMenuItems = computed((): ContextMenuItem[] => {
  const items: ContextMenuItem[] = [
    {
      id: 'pick',
      label: t('explorer.localFiles.openFolderNew'),
      icon: 'open',
    },
  ]
  const currentKey = localFiles.rootPath
      ? normalizeLocalPathKey(localFiles.rootPath)
      : null

  const favorites = localFiles.favoriteRoots
  if (favorites.length) {
    items.push(
        {id: 'sep-fav', label: '', divider: true},
        {
          id: 'fav-header',
          label: t('explorer.localFiles.favoriteFolders', {
            count: favorites.length,
            max: LOCAL_FILES_MAX_FAVORITES,
          }),
          header: true,
        },
    )
    for (const path of favorites) {
      items.push({
        id: `${FAVORITE_PREFIX}${path}`,
        label: localFileBaseName(path),
        icon: 'star',
        selected: currentKey !== null && normalizeLocalPathKey(path) === currentKey,
      })
    }
  }

  const recent = localFiles.recentRoots
  if (!recent.length) return items

  items.push(
      {id: 'sep-recent', label: '', divider: true},
      {
        id: 'recent-header',
        label: t('explorer.localFiles.recentFolders', {
          count: recent.length,
          max: LOCAL_FILES_MAX_RECENT,
        }),
        header: true,
      },
  )

  for (const path of recent) {
    items.push({
      id: `${RECENT_PREFIX}${path}`,
      label: localFileBaseName(path),
      icon: 'folder',
      selected: currentKey !== null && normalizeLocalPathKey(path) === currentKey,
    })
  }
  return items
})

function toggleOpenFolderMenu() {
  if (openFolderMenu.visible.value) {
    openFolderMenu.close()
    return
  }
  filterMenu.close()
  if (!openFolderBtnRef.value) return
  openFolderMenu.openBelow(openFolderBtnRef.value, openFolderMenuItems.value)
}

function toggleFilterMenu() {
  if (filterMenu.visible.value) {
    filterMenu.close()
    return
  }
  openFolderMenu.close()
  if (!filterBtnRef.value) return
  filterMenu.openBelow(filterBtnRef.value, filterMenuItems.value)
}

function onFilterMenuSelect(id: string) {
  filterMenu.close()
  if (!id.startsWith(FILTER_PREFIX)) return
  localFiles.setExtFilter(id.slice(FILTER_PREFIX.length) as LocalFilesExtFilter)
}

async function ensureCanSwitchRoot(nextPath: string): Promise<boolean> {
  if (
      localFiles.rootPath
      && normalizeLocalPathKey(nextPath) === normalizeLocalPathKey(localFiles.rootPath)
  ) {
    return true
  }
  const dirty = listDirtyLocalWorkspaceTabs()
  if (!dirty.length) return true
  return switchConfirm.ask({
    title: t('explorer.localFiles.unsavedSwitchTitle'),
    message: t('explorer.localFiles.unsavedSwitchMessage', {count: dirty.length}),
    confirmLabel: t('explorer.localFiles.unsavedSwitchConfirm'),
    confirmVariant: 'primary',
  })
}

async function pickNewFolder() {
  try {
    const path = await pickLocalFilesRoot()
    if (!path) return
    if (!(await ensureCanSwitchRoot(path))) return
    await localFiles.openRoot(path)
  } catch {
    layout.showErrorToast(t('explorer.localFiles.openFolderFailed'))
  }
}

async function openRecentFolder(path: string) {
  if (!(await ensureCanSwitchRoot(path))) return
  try {
    await localFiles.openRoot(path)
  } catch {
    layout.showErrorToast(t('explorer.localFiles.openFolderFailed'))
  }
}

async function onOpenFolderMenuSelect(id: string) {
  openFolderMenu.close()
  if (id === 'pick') {
    await pickNewFolder()
    return
  }
  if (id.startsWith(FAVORITE_PREFIX)) {
    await openRecentFolder(id.slice(FAVORITE_PREFIX.length))
    return
  }
  if (id.startsWith(RECENT_PREFIX)) {
    await openRecentFolder(id.slice(RECENT_PREFIX.length))
  }
}

async function refresh() {
  try {
    await localFiles.refresh()
    layout.showSuccessToast(t('explorer.localFiles.refreshDone'))
  } catch {
    layout.showErrorToast(t('explorer.localFiles.refreshFailed'))
  }
}

async function locate() {
  const {runExplorerLocate} = await import('@/features/explorer/services/explorer-toolbar.actions')
  await runExplorerLocate()
}

async function startNewFile() {
  if (!localFiles.rootPath) {
    layout.showErrorToast(t('explorer.localFiles.noRoot'))
    return
  }
  await localFiles.beginCreate('create-file', null, {
    fileName: t('explorer.localFiles.fileNameDefault'),
  })
}

async function startNewFolder() {
  if (!localFiles.rootPath) {
    layout.showErrorToast(t('explorer.localFiles.noRoot'))
    return
  }
  await localFiles.beginCreate('create-folder', null, {
    folderName: t('explorer.localFiles.folderNameDefault'),
  })
}
</script>

<template>
  <div class="local-files-chrome">
    <div class="local-files-toolbar">
      <div class="local-files-toolbar__actions dw-btn-group">
        <div ref="openFolderBtnRef" class="menu-wrap">
          <IconButton
              :title="t('explorer.localFiles.openFolder')"
              :aria-label="t('explorer.localFiles.openFolder')"
              :aria-expanded="openFolderMenu.visible.value"
              :aria-haspopup="true"
              :active="openFolderMenu.visible.value"
              @click="toggleOpenFolderMenu"
          >
            <span class="toolbar-glyph">
              <DwIcon name="open" :size="TOOLBAR_ICON_SIZE" :stroke-width="1.35"/>
            </span>
          </IconButton>
        </div>
        <IconButton
            :title="t('explorer.localFiles.newFile')"
            :aria-label="t('explorer.localFiles.newFile')"
            :disabled="!localFiles.rootPath"
            @click="startNewFile"
        >
          <span class="toolbar-glyph">
            <DwIcon name="file" :size="TOOLBAR_ICON_SIZE" :stroke-width="1.35"/>
          </span>
        </IconButton>
        <IconButton
            :title="t('explorer.localFiles.newFolder')"
            :aria-label="t('explorer.localFiles.newFolder')"
            :disabled="!localFiles.rootPath"
            @click="startNewFolder"
        >
          <span class="toolbar-glyph">
            <DwIcon name="folder" :size="TOOLBAR_ICON_SIZE" :stroke-width="1.35"/>
          </span>
        </IconButton>
        <IconButton
            :title="t('explorer.localFiles.refresh')"
            :aria-label="t('explorer.localFiles.refresh')"
            :disabled="!localFiles.rootPath || localFiles.loading"
            @click="refresh"
        >
          <span class="toolbar-glyph" :class="{ 'is-spinning': localFiles.loading }">
            <DwIcon name="refresh" :size="TOOLBAR_ICON_SIZE" :stroke-width="1.35"/>
          </span>
        </IconButton>
        <IconButton
            :title="t('explorer.locate')"
            :aria-label="t('explorer.locate')"
            :disabled="!localFiles.rootPath"
            @click="locate"
        >
          <span class="toolbar-glyph">
            <DwIcon name="locate" :size="TOOLBAR_ICON_SIZE" :stroke-width="1.35"/>
          </span>
        </IconButton>
        <IconButton
            :title="t('explorer.localFiles.collapseAll')"
            :aria-label="t('explorer.localFiles.collapseAll')"
            :disabled="!localFiles.rootPath"
            @click="localFiles.collapseAll()"
        >
          <span class="toolbar-glyph">
            <DwIcon name="chevrons-up" :size="TOOLBAR_ICON_SIZE" :stroke-width="1.35"/>
          </span>
        </IconButton>
      </div>

      <div v-if="localFiles.rootPath" class="local-files-toolbar__search-wrap">
        <label
            class="local-files-toolbar__search"
            :class="{
              'is-active': localFiles.searchQuery.trim().length > 0
                  || localFiles.extFilter !== 'all'
                  || localFiles.searchInContent,
            }"
        >
          <DwIcon class="local-files-toolbar__search-icon" name="search" size="sm"/>
          <input
              :value="localFiles.searchQuery"
              :placeholder="localFiles.searchInContent
                ? t('explorer.localFiles.searchContentPlaceholder')
                : t('explorer.localFiles.searchPlaceholder')"
              @input="localFiles.setSearchQuery(($event.target as HTMLInputElement).value)"
              @keydown.escape.prevent="localFiles.clearSearchQuery()"
          >
          <button
              type="button"
              class="local-files-toolbar__content"
              :class="{ 'is-active': localFiles.searchInContent }"
              :title="t('explorer.localFiles.searchInContent')"
              :aria-label="t('explorer.localFiles.searchInContent')"
              :aria-pressed="localFiles.searchInContent"
              @click.stop="localFiles.toggleSearchInContent()"
          >
            <DwIcon name="editor" size="xs"/>
          </button>
          <button
              ref="filterBtnRef"
              type="button"
              class="local-files-toolbar__type"
              :class="{ 'is-active': localFiles.extFilter !== 'all' || filterMenu.visible.value }"
              :title="t('explorer.localFiles.filterGroup')"
              :aria-label="t('explorer.localFiles.filterGroup')"
              :aria-expanded="filterMenu.visible.value"
              :aria-haspopup="true"
              @click.stop="toggleFilterMenu"
          >
            <span class="local-files-toolbar__type-label">{{ activeFilterLabel }}</span>
            <DwIcon
                class="local-files-toolbar__type-caret"
                :class="{ 'is-spinning': localFiles.searchLoading }"
                name="chevron-down"
                size="xs"
            />
          </button>
        </label>
      </div>
    </div>

    <ContextMenuHost
        :visible="openFolderMenu.visible.value"
        :items="openFolderMenu.items.value"
        :x="openFolderMenu.pos.value.x"
        :y="openFolderMenu.pos.value.y"
        @select="onOpenFolderMenuSelect"
        @close="openFolderMenu.close"
    />

    <ContextMenuHost
        :visible="filterMenu.visible.value"
        :items="filterMenu.items.value"
        :x="filterMenu.pos.value.x"
        :y="filterMenu.pos.value.y"
        @select="onFilterMenuSelect"
        @close="filterMenu.close"
    />

    <ConfirmDialog
        :open="switchConfirm.open.value"
        :title="switchConfirm.title.value"
        :message="switchConfirm.message.value"
        :confirm-label="switchConfirm.confirmLabel.value"
        :confirm-variant="switchConfirm.confirmVariant.value"
        @update:open="switchConfirm.onOpenUpdate"
        @confirm="switchConfirm.onConfirm"
    />
  </div>
</template>

<style scoped>
.local-files-chrome {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.local-files-toolbar {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
  height: var(--dw-toolbar-height);
  padding: 0 var(--dw-space-5) 0 var(--dw-space-3);
  border-bottom: 1px solid var(--dw-border-light);
  min-width: 0;
}

.local-files-toolbar__actions {
  flex-shrink: 0;
}

.menu-wrap {
  position: relative;
  display: inline-flex;
}

.local-files-toolbar__search-wrap {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
}

.local-files-toolbar__search {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  width: 100%;
  min-width: 0;
  height: var(--dw-btn-height-sm);
  padding: 0 4px 0 var(--dw-space-5);
  border: 1px solid transparent;
  border-radius: var(--dw-radius-pill);
  background: var(--dw-bg-muted);
  color: var(--dw-text-secondary);
}

.local-files-toolbar__search.is-active,
.local-files-toolbar__search:focus-within {
  border-color: var(--dw-focus-border);
  background: var(--dw-bg);
  color: var(--dw-text);
  box-shadow: var(--dw-focus-ring);
}

.local-files-toolbar__search-icon {
  flex-shrink: 0;
  opacity: 0.7;
}

.local-files-toolbar__search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: var(--dw-text-sm);
}

.local-files-toolbar__content {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: calc(var(--dw-btn-height-sm) - 6px);
  height: calc(var(--dw-btn-height-sm) - 6px);
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: var(--dw-radius-pill);
  background: transparent;
  color: var(--dw-text-muted);
  cursor: pointer;
}

.local-files-toolbar__content:hover {
  color: var(--dw-text);
  background: color-mix(in srgb, var(--dw-bg) 70%, transparent);
}

.local-files-toolbar__content.is-active {
  color: var(--dw-primary);
  background: color-mix(in srgb, var(--dw-primary) 12%, transparent);
}

.local-files-toolbar__type {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  max-width: 7.5rem;
  height: calc(var(--dw-btn-height-sm) - 6px);
  margin: 0;
  padding: 0 8px 0 10px;
  border: 0;
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-bg) 70%, transparent);
  color: var(--dw-text-secondary);
  font: inherit;
  font-size: var(--dw-text-xs);
  cursor: pointer;
}

.local-files-toolbar__type:hover,
.local-files-toolbar__type.is-active {
  color: var(--dw-text);
  background: var(--dw-bg);
}

.local-files-toolbar__type-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-files-toolbar__type-caret {
  flex-shrink: 0;
  opacity: 0.7;
}

.local-files-toolbar__type-caret.is-spinning {
  animation: local-files-refresh-spin 0.8s linear infinite;
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
  animation: local-files-refresh-spin 0.8s linear infinite;
}

@keyframes local-files-refresh-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
