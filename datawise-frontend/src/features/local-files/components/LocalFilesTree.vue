<!-- 本地文件树：懒加载目录 + 文本/SQL 文件 -->
<script setup lang="ts">
import {computed, nextTick, onMounted, ref, watch} from 'vue'
import type {ComponentPublicInstance} from 'vue'
import {useI18n} from 'vue-i18n'
import {ConfirmDialog} from '@/core/components'
import {ContextMenuHost, useContextMenu} from '@/core/context-menu'
import {waitForContextMenuTeardown} from '@/core/ui/inline-rename'
import type {ContextMenuItem} from '@/core/types'
import {useLocalFilesStore, type LocalFileTreeNode} from '@/features/local-files/stores/local-files-store'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {openLocalWorkspaceFile, openAndRunLocalSqlFile} from '@/features/local-files/services/open-local-file.service'
import {
  copyTextToClipboard,
  openLocalInTerminal,
  revealLocalInExplorer,
} from '@/features/local-files/services/local-files.service'
import {
  isLocalSqlFileName,
  localFileBaseName,
  localFileParentPath,
  normalizeLocalPathKey,
} from '@/features/local-files/services/local-files-path'
import {collectLocalFilesSearchVisibility} from '@/features/local-files/services/local-files-search'
import {
  findLocalFileFlatNodeIndex,
  flattenLocalFileTree,
} from '@/features/local-files/services/local-files-flat'
import {
  closeWorkspaceTabsForLocalPath,
  localFileRelativePath,
  remapWorkspaceTabsForLocalRename,
  resolveTabLocalPath,
} from '@/features/local-files/services/local-files-workspace-tabs'
import {
  EXPLORER_TREE_ROW_HEIGHT,
  useTreeVirtualWindow,
} from '@/features/explorer/composables/useTreeVirtualWindow'
import LocalFileTreeRows from './LocalFileTreeRows.vue'

const {t} = useI18n()
const localFiles = useLocalFilesStore()
const layout = useLayoutStore()
const workspace = useWorkspaceStore()
const menu = useContextMenu<LocalFileTreeNode>()
const {
  items: menuItems,
  visible: menuVisible,
  pos: menuPos,
  target: menuTarget,
  open: openMenu,
  close: closeMenu,
} = menu

const showDeleteDialog = ref(false)
const pendingNode = ref<LocalFileTreeNode | null>(null)
const pendingBatchDelete = ref<LocalFileTreeNode[] | null>(null)
const deleting = ref(false)
const rowRefs = new Map<string, HTMLElement>()
let moving = false

async function onTreeDropMove(payload: {sourcePath: string; targetDirPath: string}) {
  if (moving) return
  moving = true
  localFiles.endTreeDrag()
  try {
    const next = await localFiles.moveInto(payload.sourcePath, payload.targetDirPath)
    if (!next) return
    if (normalizeLocalPathKey(payload.sourcePath) !== normalizeLocalPathKey(next)) {
      remapWorkspaceTabsForLocalRename(payload.sourcePath, next)
    }
    layout.showSuccessToast(
        t('explorer.localFiles.moved', {name: localFileBaseName(next)}),
    )
  } catch (err) {
    if (err instanceof Error && err.message === 'invalid_target') {
      layout.showErrorToast(t('explorer.localFiles.moveInvalid'))
    } else {
      layout.showErrorToast(t('explorer.localFiles.moveFailed'))
    }
  } finally {
    moving = false
  }
}

const searchVisibility = computed(() =>
  collectLocalFilesSearchVisibility(
      localFiles.tree,
      localFiles.searchQuery,
      localFiles.extFilter,
      localFiles.searchInContent ? localFiles.contentHitIds : null,
  ),
)

const displayExpandedIds = computed(() => {
  if (!searchVisibility.value) return localFiles.expandedIds
  const next = new Set(localFiles.expandedIds)
  for (const id of searchVisibility.value.forceExpandIds) next.add(id)
  return next
})

const multiSelectedCount = computed(() => localFiles.selectedIds.size)

const flatEntries = computed(() =>
  flattenLocalFileTree(
      localFiles.tree,
      displayExpandedIds.value,
      searchVisibility.value?.visibleIds ?? null,
      localFiles.inlineEdit,
  ),
)

/** Real file/folder rows only — used for shift-range multi-select. */
const visibleFlatNodes = computed(() =>
  flatEntries.value.flatMap((entry) => {
    const row = entry.node
    return row.kind === 'node' ? [row.file] : []
  }),
)

const {
  rootRef,
  useVirtual,
  totalHeight,
  visibleNodes,
  visibleRangePaddingTop,
  visibleRangePaddingBottom,
  scrollToFlatIndex,
} = useTreeVirtualWindow(flatEntries, {rowHeight: EXPLORER_TREE_ROW_HEIGHT})

let rangeAnchorId: string | null = null

function onRowClick(node: LocalFileTreeNode, event?: MouseEvent) {
  const meta = Boolean(event?.metaKey || event?.ctrlKey)
  const shift = Boolean(event?.shiftKey)

  if (shift && rangeAnchorId) {
    const flat = visibleFlatNodes.value
    const from = flat.findIndex((item) => item.id === rangeAnchorId)
    const to = flat.findIndex((item) => item.id === node.id)
    if (from >= 0 && to >= 0) {
      const [start, end] = from < to ? [from, to] : [to, from]
      localFiles.selectMany(
          flat.slice(start, end + 1).map((item) => item.id),
          node.id,
      )
      return
    }
  }

  if (meta) {
    localFiles.toggleSelect(node.id)
    rangeAnchorId = node.id
    return
  }

  localFiles.select(node.id)
  rangeAnchorId = node.id
}

function onRowDblClick(node: LocalFileTreeNode) {
  localFiles.select(node.id)
  rangeAnchorId = node.id
  if (node.isDirectory) {
    void localFiles.toggleExpand(node.id)
    return
  }
  void openLocalWorkspaceFile(node.path)
}

const dirtyKeys = computed(() => {
  const keys = new Set<string>()
  for (const tab of workspace.tabs) {
    if (!workspace.isTabDirty(tab.id)) continue
    const path = resolveTabLocalPath(tab)
    if (path) keys.add(normalizeLocalPathKey(path))
  }
  return keys
})

const searchHasVisible = computed(() => {
  if (!searchVisibility.value) return true
  return searchVisibility.value.visibleIds.size > 0
})

const deleteConfirmMessage = computed(() => {
  if (pendingBatchDelete.value) {
    return t('explorer.localFiles.batchDeleteConfirm', {count: pendingBatchDelete.value.length})
  }
  const node = pendingNode.value
  if (!node) return ''
  const key = node.isDirectory
      ? 'explorer.localFiles.deleteConfirmFolder'
      : 'explorer.localFiles.deleteConfirm'
  return t(key, {name: node.name})
})

const revealLabel = computed(() => {
  const ua = navigator.platform || ''
  if (/Mac/i.test(ua)) return t('explorer.localFiles.revealInFinder')
  if (/Win/i.test(ua)) return t('explorer.localFiles.revealInExplorer')
  return t('explorer.localFiles.revealInFileManager')
})

function bindRowRef(id: string) {
  return (el: Element | ComponentPublicInstance | null) => {
    const node = el && typeof el === 'object' && '$el' in el ? (el as ComponentPublicInstance).$el : el
    if (node instanceof HTMLElement) rowRefs.set(id, node)
    else rowRefs.delete(id)
  }
}

watch(
    () => localFiles.flashNodeId,
    async (id) => {
      if (!id) return
      const index = findLocalFileFlatNodeIndex(flatEntries.value, id)
      if (index >= 0) scrollToFlatIndex(index, 'smooth')
      await nextTick()
      rowRefs.get(id)?.scrollIntoView({block: 'nearest', behavior: 'smooth'})
    },
)

watch(
    () => {
      const draft = localFiles.inlineEdit
      if (!draft) return null
      return `${draft.mode}:${draft.parentPath}:${draft.targetId ?? ''}`
    },
    async (key) => {
      if (!key) return
      await nextTick()
      const draft = localFiles.inlineEdit
      if (!draft) return
      const index = flatEntries.value.findIndex((entry) => {
        if (draft.mode === 'rename' && draft.targetId) {
          return entry.node.kind === 'node' && entry.node.id === draft.targetId
        }
        return (
            entry.node.kind === 'draft'
            && normalizeLocalPathKey(entry.node.parent.path) === normalizeLocalPathKey(draft.parentPath)
        )
      })
      if (index >= 0) scrollToFlatIndex(index, 'auto')
    },
)

function createParentPath(node: LocalFileTreeNode) {
  if (node.isDirectory) return node.path
  return localFileParentPath(node.path) || localFiles.rootPath || node.path
}

function buildMenuItems(node: LocalFileTreeNode): ContextMenuItem[] {
  const batchTargets = resolveBatchTargets(node)
  if (batchTargets.length > 1) {
    return [
      {
        id: 'batch-copy-path',
        label: t('explorer.localFiles.batchCopyPaths', {count: batchTargets.length}),
        icon: 'copy',
      },
      {
        id: 'batch-delete',
        label: t('explorer.localFiles.batchDelete', {count: batchTargets.length}),
        danger: true,
        icon: 'delete',
      },
    ]
  }

  const isRoot = Boolean(
      localFiles.rootPath
      && normalizeLocalPathKey(node.path) === normalizeLocalPathKey(localFiles.rootPath),
  )
  const items: ContextMenuItem[] = [
    {id: 'new-file', label: t('explorer.localFiles.newFile'), icon: 'file'},
    {id: 'new-folder', label: t('explorer.localFiles.newFolder'), icon: 'folder'},
    {id: 'sep-create', label: '', divider: true},
  ]
  if (!node.isDirectory) {
    if (isLocalSqlFileName(node.path)) {
      items.push(
          {id: 'open-console', label: t('explorer.localFiles.openInConsole'), icon: 'console'},
          {id: 'open-run', label: t('explorer.localFiles.openAndRun'), icon: 'run'},
      )
    } else {
      items.push({id: 'open', label: t('explorer.localFiles.open')})
    }
  } else {
    const favorited = localFiles.isFavorite(node.path)
    items.push({
      id: favorited ? 'unfavorite' : 'favorite',
      label: favorited
          ? t('explorer.localFiles.removeFavorite')
          : t('explorer.localFiles.addFavorite'),
      icon: 'star',
    })
  }
  if (!isRoot) {
    items.push(
        {id: 'rename', label: t('explorer.localFiles.rename')},
        {id: 'delete', label: t('explorer.localFiles.delete'), danger: true},
        {id: 'sep1', label: '', divider: true},
    )
  } else {
    items.push({id: 'sep1', label: '', divider: true})
  }
  items.push(
      {id: 'copy-path', label: t('explorer.localFiles.copyPath')},
      {id: 'copy-relative', label: t('explorer.localFiles.copyRelativePath')},
      {id: 'reveal', label: revealLabel.value},
      {id: 'terminal', label: t('explorer.localFiles.openInTerminal')},
  )
  return items
}

function resolveBatchTargets(node: LocalFileTreeNode): LocalFileTreeNode[] {
  if (localFiles.selectedIds.size <= 1 || !localFiles.selectedIds.has(node.id)) {
    return [node]
  }
  const rootKey = localFiles.rootPath ? normalizeLocalPathKey(localFiles.rootPath) : null
  const out: LocalFileTreeNode[] = []
  for (const item of visibleFlatNodes.value) {
    if (!localFiles.selectedIds.has(item.id)) continue
    if (rootKey && normalizeLocalPathKey(item.path) === rootKey) continue
    out.push(item)
  }
  return out.length ? out : [node]
}

function onContextMenu(event: MouseEvent, node: LocalFileTreeNode) {
  event.preventDefault()
  if (!localFiles.selectedIds.has(node.id) || localFiles.selectedIds.size <= 1) {
    localFiles.select(node.id)
    rangeAnchorId = node.id
  }
  openMenu(event, buildMenuItems(node), node)
}

async function onMenuSelect(id: string) {
  const node = menuTarget.value
  closeMenu()
  if (!node) return
  // Let context-menu portal / focus-scope finish tearing down before inline edit focuses.
  await waitForContextMenuTeardown()
  switch (id) {
    case 'new-file':
      await localFiles.beginCreate('create-file', createParentPath(node), {
        fileName: t('explorer.localFiles.fileNameDefault'),
      })
      break
    case 'new-folder':
      await localFiles.beginCreate('create-folder', createParentPath(node), {
        folderName: t('explorer.localFiles.folderNameDefault'),
      })
      break
    case 'open':
    case 'open-console':
      await openLocalWorkspaceFile(node.path)
      break
    case 'open-run':
      await openAndRunLocalSqlFile(node.path)
      break
    case 'favorite':
      localFiles.addFavorite(node.path)
      layout.showSuccessToast(t('explorer.localFiles.favoriteAdded', {name: node.name}))
      break
    case 'unfavorite':
      localFiles.removeFavorite(node.path)
      layout.showSuccessToast(t('explorer.localFiles.favoriteRemoved', {name: node.name}))
      break
    case 'rename':
      localFiles.beginRename(node)
      break
    case 'delete':
      pendingBatchDelete.value = null
      pendingNode.value = node
      showDeleteDialog.value = true
      break
    case 'batch-copy-path': {
      const targets = resolveBatchTargets(node)
      try {
        await copyTextToClipboard(targets.map((item) => item.path).join('\n'))
        layout.showSuccessToast(t('explorer.localFiles.batchCopyDone', {count: targets.length}))
      } catch {
        layout.showErrorToast(t('explorer.localFiles.copyPathFailed'))
      }
      break
    }
    case 'batch-delete':
      pendingNode.value = null
      pendingBatchDelete.value = resolveBatchTargets(node)
      showDeleteDialog.value = true
      break
    case 'copy-path':
      try {
        await copyTextToClipboard(node.path)
        layout.showSuccessToast(t('explorer.localFiles.copyPathDone'))
      } catch {
        layout.showErrorToast(t('explorer.localFiles.copyPathFailed'))
      }
      break
    case 'copy-relative': {
      const root = localFiles.rootPath
      if (!root) {
        layout.showErrorToast(t('explorer.localFiles.noRoot'))
        break
      }
      const relative = localFileRelativePath(root, node.path)
      if (!relative) {
        layout.showErrorToast(t('explorer.localFiles.copyRelativePathFailed'))
        break
      }
      try {
        await copyTextToClipboard(relative)
        layout.showSuccessToast(t('explorer.localFiles.copyRelativePathDone'))
      } catch {
        layout.showErrorToast(t('explorer.localFiles.copyPathFailed'))
      }
      break
    }
    case 'reveal':
      try {
        await revealLocalInExplorer(node.path)
      } catch {
        layout.showErrorToast(t('explorer.localFiles.revealFailed'))
      }
      break
    case 'terminal':
      try {
        await openLocalInTerminal(node.path)
      } catch {
        layout.showErrorToast(t('explorer.localFiles.terminalFailed'))
      }
      break
  }
}

async function onInlineCommit() {
  const draft = localFiles.inlineEdit
  const mode = draft?.mode
  const renameFrom = mode === 'rename' ? draft?.targetPath : null
  try {
    const path = await localFiles.commitInlineEdit()
    if (!path || !mode) return
    if (mode === 'create-file') {
      layout.showSuccessToast(t('explorer.localFiles.created', {name: localFileBaseName(path)}))
      await openLocalWorkspaceFile(path)
    } else if (mode === 'create-folder') {
      layout.showSuccessToast(t('explorer.localFiles.folderCreated', {name: localFileBaseName(path)}))
    } else if (mode === 'rename') {
      if (renameFrom && normalizeLocalPathKey(renameFrom) !== normalizeLocalPathKey(path)) {
        remapWorkspaceTabsForLocalRename(renameFrom, path)
      }
      layout.showSuccessToast(t('explorer.localFiles.renamed', {name: localFileBaseName(path)}))
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'unsupported_file') {
      layout.showErrorToast(t('explorer.localFiles.unsupportedFile'))
    } else if (mode === 'rename') {
      layout.showErrorToast(t('explorer.localFiles.renameFailed'))
    } else {
      layout.showErrorToast(t('explorer.localFiles.createFailed'))
    }
  }
}

function onInlineCancel() {
  localFiles.cancelInlineEdit()
}

async function onEmptyCreateFile(parentPath: string) {
  await localFiles.beginCreate('create-file', parentPath, {
    fileName: t('explorer.localFiles.fileNameDefault'),
  })
}

async function onEmptyCreateFolder(parentPath: string) {
  await localFiles.beginCreate('create-folder', parentPath, {
    folderName: t('explorer.localFiles.folderNameDefault'),
  })
}

function closeDeleteDialog() {
  showDeleteDialog.value = false
  pendingNode.value = null
  pendingBatchDelete.value = null
  deleting.value = false
}

async function confirmDelete() {
  if (deleting.value) return
  const batch = pendingBatchDelete.value
  if (batch?.length) {
    deleting.value = true
    try {
      const ordered = [...batch].sort(
          (a, b) => normalizeLocalPathKey(b.path).length - normalizeLocalPathKey(a.path).length,
      )
      // Skip nested paths when a selected ancestor folder is also deleted.
      const deletedKeys: string[] = []
      let count = 0
      for (const item of ordered) {
        const key = normalizeLocalPathKey(item.path)
        if (deletedKeys.some((parent) => key === parent || key.startsWith(`${parent}/`))) continue
        await localFiles.remove(item.path, item.isDirectory)
        closeWorkspaceTabsForLocalPath(item.path, item.isDirectory)
        deletedKeys.push(key)
        count += 1
      }
      layout.showSuccessToast(t('explorer.localFiles.batchDeleted', {count}))
      localFiles.clearSelection()
      closeDeleteDialog()
    } catch {
      layout.showErrorToast(t('explorer.localFiles.deleteFailed'))
      deleting.value = false
    }
    return
  }

  const node = pendingNode.value
  if (!node) return
  deleting.value = true
  try {
    await localFiles.remove(node.path, node.isDirectory)
    closeWorkspaceTabsForLocalPath(node.path, node.isDirectory)
    layout.showSuccessToast(t('explorer.localFiles.deleted', {name: node.name}))
    closeDeleteDialog()
  } catch {
    layout.showErrorToast(t('explorer.localFiles.deleteFailed'))
    deleting.value = false
  }
}

async function openRecent(path: string) {
  try {
    await localFiles.openRoot(path)
  } catch {
    layout.showErrorToast(t('explorer.localFiles.openFolderFailed'))
  }
}

async function pickRoot() {
  try {
    await localFiles.pickAndOpenRoot()
  } catch {
    layout.showErrorToast(t('explorer.localFiles.openFolderFailed'))
  }
}

const restoring = ref(false)

async function restoreLastRoot() {
  if (localFiles.rootPath && localFiles.tree.length) return
  restoring.value = true
  try {
    localFiles.hydratePreferences()
    await localFiles.ensureLastRoot()
  } catch {
    /* empty state remains; user can pick / choose recent */
  } finally {
    restoring.value = false
  }
}

onMounted(() => {
  void restoreLastRoot()
})
</script>

<template>
  <div
      ref="rootRef"
      class="local-files-tree"
      :class="{ 'is-virtualized': useVirtual }"
  >
    <div v-if="restoring || (localFiles.loading && !localFiles.rootPath)" class="local-files-empty">
      <p class="local-files-empty__hint">{{ t('explorer.localFiles.restoring') }}</p>
    </div>

    <div v-else-if="!localFiles.rootPath" class="local-files-empty">
      <p class="local-files-empty__title">{{ t('explorer.localFiles.emptyTitle') }}</p>
      <p class="local-files-empty__hint">{{ t('explorer.localFiles.emptyHint') }}</p>
      <button type="button" class="dw-btn dw-btn--secondary dw-btn--sm" @click="pickRoot">
        {{ t('explorer.localFiles.openFolder') }}
      </button>
      <ul v-if="localFiles.favoriteRoots.length || localFiles.recentRoots.length" class="local-files-recent">
        <template v-if="localFiles.favoriteRoots.length">
          <li class="local-files-recent__header">{{ t('explorer.localFiles.favoriteFoldersShort') }}</li>
          <li v-for="path in localFiles.favoriteRoots" :key="`fav:${path}`">
            <button type="button" class="local-files-recent__btn" :title="path" @click="openRecent(path)">
              {{ localFileBaseName(path) }}
            </button>
          </li>
        </template>
        <template v-if="localFiles.recentRoots.length">
          <li class="local-files-recent__header">{{ t('explorer.localFiles.recentFoldersShort') }}</li>
          <li v-for="path in localFiles.recentRoots" :key="path">
            <button type="button" class="local-files-recent__btn" :title="path" @click="openRecent(path)">
              {{ localFileBaseName(path) }}
            </button>
          </li>
        </template>
      </ul>
    </div>

    <div
        v-else-if="searchHasVisible"
        class="local-files-virtual-track"
        :style="useVirtual ? { minHeight: `${totalHeight}px` } : undefined"
    >
      <div
          class="local-files-virtual-window"
          :style="useVirtual ? {
            paddingTop: `${visibleRangePaddingTop}px`,
            paddingBottom: `${visibleRangePaddingBottom}px`,
          } : undefined"
      >
        <LocalFileTreeRows
            :entries="visibleNodes"
            :expanded-ids="displayExpandedIds"
            :selected-id="localFiles.selectedId"
            :selected-ids="localFiles.selectedIds"
            :flash-id="localFiles.flashNodeId"
            :dirty-keys="dirtyKeys"
            :bind-row-ref="bindRowRef"
            @click-row="onRowClick"
            @dblclick-row="onRowDblClick"
            @toggle-expand="(node) => localFiles.toggleExpand(node.id)"
            @contextmenu-row="onContextMenu"
            @inline-commit="onInlineCommit"
            @inline-cancel="onInlineCancel"
            @empty-create-file="onEmptyCreateFile"
            @empty-create-folder="onEmptyCreateFolder"
            @tree-drop-move="onTreeDropMove"
        />
      </div>
    </div>

    <div v-else class="local-files-empty">
      <p class="local-files-empty__hint">
        {{ localFiles.searchLoading
            ? t('explorer.localFiles.searching')
            : t('explorer.localFiles.searchEmpty') }}
      </p>
    </div>
  </div>

  <ContextMenuHost
      :visible="menuVisible"
      :items="menuItems"
      :x="menuPos.x"
      :y="menuPos.y"
      @select="onMenuSelect"
      @close="closeMenu"
  />

  <ConfirmDialog
      :open="showDeleteDialog"
      :title="t('explorer.localFiles.delete')"
      :message="deleteConfirmMessage"
      :confirm-label="t('explorer.localFiles.delete')"
      :confirm-loading="deleting"
      confirm-variant="danger"
      @update:open="(open) => { if (!open) closeDeleteDialog() }"
      @confirm="confirmDelete"
  />
</template>

<style scoped>
.local-files-tree {
  min-height: 0;
  height: 100%;
  padding: var(--dw-space-2) 0;
}

.local-files-virtual-track {
  position: relative;
  min-width: 0;
}

.local-files-virtual-window {
  min-width: 0;
}

.local-files-empty {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--dw-space-3);
  padding: var(--dw-space-6) var(--dw-space-5);
}

.local-files-empty__title {
  margin: 0;
  font-weight: 600;
  font-size: var(--dw-text-md);
  color: var(--dw-text);
}

.local-files-empty__hint {
  margin: 0;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
  line-height: 1.45;
}

.local-files-recent {
  list-style: none;
  margin: var(--dw-space-2) 0 0;
  padding: 0;
  width: 100%;
  border-top: 1px solid var(--dw-border-light);
  padding-top: var(--dw-space-3);
}

.local-files-recent__btn {
  display: flex;
  align-items: center;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--dw-text-secondary);
  padding: var(--dw-space-2) var(--dw-space-3);
  border-radius: var(--dw-control-radius-sm);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--dw-text-sm);
}

.local-files-recent__header {
  margin: var(--dw-space-2) 0 var(--dw-space-1);
  padding: 0 var(--dw-space-3);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.local-files-recent__btn:hover {
  background: var(--dw-bg-hover);
  color: var(--dw-text);
}
</style>
