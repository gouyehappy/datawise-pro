<script setup lang="ts">
import {nextTick, onUnmounted, ref, watch} from 'vue'
import type {ComponentPublicInstance} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import {useLocalFilesStore, type LocalFileTreeNode} from '@/features/local-files/stores/local-files-store'
import {
  LOCAL_FILE_ABS_PATH_MIME,
  LOCAL_FILE_PATH_MIME,
  LOCAL_FILE_TREE_MOVE_MIME,
  canMoveLocalPathInto,
  dataTransferHasType,
} from '@/features/local-files/services/local-files-dnd'
import {resolveLocalFileIcon} from '@/features/local-files/services/local-files-icon'
import {resolveLocalPathForInsert} from '@/features/local-files/services/local-files-path-insert'
import {formatLocalFileTooltip} from '@/features/local-files/services/local-files-format'
import {
  localGitStatusGlyph,
  localGitStatusLabelKey,
  lookupLocalGitStatus,
  type LocalGitFileStatus,
} from '@/features/local-files/services/local-files-git'
import {normalizeLocalPathKey} from '@/features/local-files/services/local-files-path'
import {
  INLINE_OUTSIDE_COMMIT_ARM_MS,
  applyInlineRenameOnFocus,
  focusInlineRenameAfterMenu,
} from '@/core/ui/inline-rename'
import type {LocalFileRowModel} from '@/features/local-files/services/local-files-flat'
import type {VisibleFlatTreeEntry} from '@/features/explorer/composables/useTreeVirtualWindow'

const props = defineProps<{
  entries: VisibleFlatTreeEntry<LocalFileRowModel>[]
  expandedIds: Set<string>
  selectedId: string | null
  selectedIds?: Set<string> | null
  flashId: string | null
  dirtyKeys?: Set<string>
  bindRowRef: (id: string) => (el: Element | ComponentPublicInstance | null) => void
}>()

const emit = defineEmits<{
  'click-row': [node: LocalFileTreeNode, event: MouseEvent]
  'dblclick-row': [node: LocalFileTreeNode]
  'toggle-expand': [node: LocalFileTreeNode]
  'contextmenu-row': [event: MouseEvent, node: LocalFileTreeNode]
  'inline-commit': []
  'inline-cancel': []
  'empty-create-file': [parentPath: string]
  'empty-create-folder': [parentPath: string]
  'tree-drop-move': [payload: {sourcePath: string; targetDirPath: string}]
}>()

const {t, locale} = useI18n()
const localFiles = useLocalFilesStore()
const inputRef = ref<HTMLInputElement | null>(null)
let suppressBlur = false
let draftCommitQueued = false
let outsidePointerCleanup: (() => void) | null = null

onUnmounted(() => {
  cleanupOutsideCommit()
})

function rowTooltip(node: LocalFileTreeNode) {
  return formatLocalFileTooltip(node, locale.value)
}

function gitStatusOf(node: LocalFileTreeNode): LocalGitFileStatus | null {
  return lookupLocalGitStatus(localFiles.gitStatusByKey, node.path, node.isDirectory)
}

function gitBadge(node: LocalFileTreeNode) {
  const status = gitStatusOf(node)
  if (!status) return null
  return {
    status,
    glyph: localGitStatusGlyph(status),
    title: t(localGitStatusLabelKey(status)),
  }
}

function bindInputRef(el: Element | ComponentPublicInstance | null) {
  const node = el && typeof el === 'object' && '$el' in el ? (el as ComponentPublicInstance).$el : el
  inputRef.value = node instanceof HTMLInputElement ? node : null
}

/** Align with DataSourceTree: space-3 + depth × 14 */
function depthPadding(depth: number) {
  return `calc(var(--dw-space-3) + ${depth} * 14px)`
}

function iconSpec(node: LocalFileTreeNode, expanded: boolean) {
  return resolveLocalFileIcon({
    name: node.name,
    isDirectory: node.isDirectory,
    expanded,
  })
}

function isRenameTarget(node: LocalFileTreeNode) {
  const draft = localFiles.inlineEdit
  return draft?.mode === 'rename' && draft.targetId === node.id
}

function isDirty(node: LocalFileTreeNode, dirtyKeys?: Set<string>) {
  if (node.isDirectory || !dirtyKeys?.size) return false
  return dirtyKeys.has(normalizeLocalPathKey(node.path))
}

function isRowSelected(node: LocalFileTreeNode) {
  if (props.selectedIds?.size) return props.selectedIds.has(node.id)
  return props.selectedId === node.id
}

function draftIconName() {
  const draft = localFiles.inlineEdit
  if (!draft) return 'file'
  if (draft.mode === 'create-folder') return 'folder'
  return resolveLocalFileIcon({name: draft.value || 'untitled.txt', isDirectory: false}).icon
}

function draftTone() {
  const draft = localFiles.inlineEdit
  if (!draft) return 'file'
  if (draft.mode === 'create-folder') return 'folder'
  return resolveLocalFileIcon({name: draft.value || 'untitled.txt', isDirectory: false}).tone
}

function isDirVisuallyExpanded(node: LocalFileTreeNode): boolean {
  if (!node.isDirectory || !props.expandedIds.has(node.id)) return false
  // Match explorer twistie: don't show "open" when nothing is under the row yet.
  if (node.loaded === false && !(node.children?.length)) return false
  return true
}

function isWorkspaceRoot(node: LocalFileTreeNode) {
  const root = localFiles.rootPath
  return Boolean(root && normalizeLocalPathKey(node.path) === normalizeLocalPathKey(root))
}

function dragSourcePath() {
  return localFiles.treeDragSourcePath
}

function dropTargetId() {
  return localFiles.treeDropTargetId
}

function canDropOnDirectory(dirPath: string): boolean {
  const source = dragSourcePath()
  if (!source) return false
  return canMoveLocalPathInto(source, dirPath, localFiles.rootPath)
}

watch(
    () => {
      const draft = localFiles.inlineEdit
      if (!draft) return null
      return `${draft.mode}:${draft.parentPath}:${draft.targetId ?? ''}`
    },
    (key) => {
      cleanupOutsideCommit()
      if (!key) return
      bindOutsideCommit()
      void focusInlineRenameAfterMenu(inlineRenameFocusOptions())
    },
)

function cleanupOutsideCommit() {
  outsidePointerCleanup?.()
  outsidePointerCleanup = null
}

function isEventInsideInlineInput(event: Event): boolean {
  const target = event.target
  if (!(target instanceof Element)) return false
  if (target.closest('[data-local-inline-input]')) return true
  const el = inputRef.value
  return Boolean(el && el.contains(target))
}

function bindOutsideCommit() {
  cleanupOutsideCommit()
  const armedAt = performance.now()
  const onPointerDown = (event: PointerEvent) => {
    if (!localFiles.inlineEdit) return
    if (performance.now() - armedAt < INLINE_OUTSIDE_COMMIT_ARM_MS) return
    if (isEventInsideInlineInput(event)) return
    void commitDraft()
  }
  window.addEventListener('pointerdown', onPointerDown, true)
  outsidePointerCleanup = () => {
    window.removeEventListener('pointerdown', onPointerDown, true)
  }
}

function inlineRenameFocusOptions() {
  return {
    resolveEl: (): HTMLInputElement | null => {
      if (inputRef.value?.isConnected) return inputRef.value
      return document.querySelector<HTMLInputElement>('[data-local-inline-input]')
    },
    getName: () => localFiles.inlineEdit?.value ?? '',
    isDirectory: () => {
      const draft = localFiles.inlineEdit
      return draft?.mode === 'create-folder' || draft?.isDirectory === true
    },
    assignRef: (el: HTMLInputElement) => {
      inputRef.value = el
    },
  }
}

function onInlineFocus(event: FocusEvent) {
  applyInlineRenameOnFocus(event, inlineRenameFocusOptions())
}

function onDraftInput(event: Event) {
  const target = event.target
  if (target instanceof HTMLInputElement) {
    localFiles.setInlineEditValue(target.value)
  }
}

async function commitDraft() {
  if (suppressBlur || draftCommitQueued || !localFiles.inlineEdit) return
  draftCommitQueued = true
  suppressBlur = true
  cleanupOutsideCommit()
  emit('inline-commit')
  await nextTick()
  draftCommitQueued = false
  suppressBlur = false
}

function cancelDraft() {
  if (suppressBlur) return
  suppressBlur = true
  cleanupOutsideCommit()
  emit('inline-cancel')
  suppressBlur = false
}

function onDraftKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    void commitDraft()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    cancelDraft()
  }
}

function onDraftBlur() {
  if (suppressBlur) return
  void commitDraft()
}

function onRowDragStart(event: DragEvent, node: LocalFileTreeNode) {
  if (!event.dataTransfer || isRenameTarget(node)) {
    event.preventDefault()
    return
  }
  const insertPath = resolveLocalPathForInsert(node.path)
  // Custom MIMEs only — do not set text/plain (Monaco / contenteditable would insert it).
  event.dataTransfer.setData(LOCAL_FILE_PATH_MIME, insertPath)
  if (!node.isDirectory) {
    event.dataTransfer.setData(LOCAL_FILE_ABS_PATH_MIME, node.path)
  }
  if (!isWorkspaceRoot(node)) {
    event.dataTransfer.setData(LOCAL_FILE_TREE_MOVE_MIME, node.path)
    event.dataTransfer.effectAllowed = 'copyMove'
    localFiles.beginTreeDrag(node.path)
  } else {
    event.dataTransfer.effectAllowed = 'copy'
    localFiles.beginTreeDrag(null)
  }
}

function onRowDragEnd() {
  localFiles.endTreeDrag()
}

function onRowDragOver(event: DragEvent, node: LocalFileTreeNode) {
  if (!dataTransferHasType(event.dataTransfer, LOCAL_FILE_TREE_MOVE_MIME)) return
  if (!node.isDirectory || !canDropOnDirectory(node.path)) {
    localFiles.setTreeDropTarget(null)
    return
  }
  event.preventDefault()
  event.stopPropagation()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  localFiles.setTreeDropTarget(node.id)
  localFiles.scheduleDragExpand(node.id)
}

function onRowDrop(event: DragEvent, node: LocalFileTreeNode) {
  if (!dataTransferHasType(event.dataTransfer, LOCAL_FILE_TREE_MOVE_MIME)) return
  if (!node.isDirectory || !canDropOnDirectory(node.path)) return
  event.preventDefault()
  event.stopPropagation()
  const sourcePath = event.dataTransfer?.getData(LOCAL_FILE_TREE_MOVE_MIME)?.trim()
  localFiles.endTreeDrag()
  if (!sourcePath) return
  emit('tree-drop-move', {sourcePath, targetDirPath: node.path})
}

function onEmptyDragOver(event: DragEvent, parentPath: string, parentId: string) {
  if (!dataTransferHasType(event.dataTransfer, LOCAL_FILE_TREE_MOVE_MIME)) return
  if (!canDropOnDirectory(parentPath)) {
    localFiles.setTreeDropTarget(null)
    return
  }
  event.preventDefault()
  event.stopPropagation()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  localFiles.setTreeDropTarget(parentId)
}

function onEmptyDrop(event: DragEvent, parentPath: string) {
  if (!dataTransferHasType(event.dataTransfer, LOCAL_FILE_TREE_MOVE_MIME)) return
  if (!canDropOnDirectory(parentPath)) return
  event.preventDefault()
  event.stopPropagation()
  const sourcePath = event.dataTransfer?.getData(LOCAL_FILE_TREE_MOVE_MIME)?.trim()
  localFiles.endTreeDrag()
  if (!sourcePath) return
  emit('tree-drop-move', {sourcePath, targetDirPath: parentPath})
}
</script>

<template>
  <template v-for="{ node: row, depth, index } in entries" :key="`${index}:${row.id}`">
    <div
        v-if="row.kind === 'node'"
        :ref="bindRowRef(row.file.id)"
        class="local-files-row"
        :class="{
          'is-selected': isRowSelected(row.file) && !isRenameTarget(row.file),
          'is-flash': flashId === row.file.id,
          'is-dir': row.file.isDirectory,
          'is-expanded': isDirVisuallyExpanded(row.file),
          'is-root': depth === 0 && row.file.isDirectory,
          'is-editing': isRenameTarget(row.file),
          'is-dirty': isDirty(row.file, dirtyKeys),
          'is-drop-target': dropTargetId() === row.file.id,
          'is-dragging': dragSourcePath()
              && normalizeLocalPathKey(dragSourcePath()!) === normalizeLocalPathKey(row.file.path),
        }"
        :style="{ paddingLeft: depthPadding(depth) }"
        :draggable="!isRenameTarget(row.file)"
        @click="!isRenameTarget(row.file) && emit('click-row', row.file, $event)"
        @dblclick="!isRenameTarget(row.file) && emit('dblclick-row', row.file)"
        @contextmenu="emit('contextmenu-row', $event, row.file)"
        @dragstart="onRowDragStart($event, row.file)"
        @dragend="onRowDragEnd"
        @dragover="onRowDragOver($event, row.file)"
        @drop="onRowDrop($event, row.file)"
    >
      <!-- Match DataSourceTree: outer depth pad + inner rounded body for selection -->
      <span class="local-files-row__body">
        <span
            class="local-files-row__twist"
            :class="{
              'is-expanded': isDirVisuallyExpanded(row.file),
              'is-leaf': !row.file.isDirectory,
            }"
            aria-hidden="true"
            @click.stop="row.file.isDirectory && emit('toggle-expand', row.file)"
            @dblclick.stop
        >
          <DwIcon
              v-if="row.file.isDirectory"
              name="chevron-right"
              size="xs"
              :stroke-width="1.5"
              class="local-files-row__twist-icon"
          />
        </span>
        <span
            class="local-files-row__icon"
            :class="[
              `tone-${iconSpec(row.file, isDirVisuallyExpanded(row.file)).tone}`,
              { 'is-folder': row.file.isDirectory },
            ]"
            aria-hidden="true"
        >
          <DwIcon
              :name="iconSpec(row.file, isDirVisuallyExpanded(row.file)).icon"
              :size="row.file.isDirectory ? 20 : 18"
              :stroke-width="1.55"
          />
        </span>
        <input
            v-if="isRenameTarget(row.file)"
            :ref="bindInputRef"
            class="local-files-row__input"
            data-local-inline-input
            :value="localFiles.inlineEdit?.value ?? ''"
            @click.stop
            @dblclick.stop
            @mousedown.stop
            @pointerdown.stop
            @focus="onInlineFocus"
            @input="onDraftInput"
            @keydown="onDraftKeydown"
            @blur="onDraftBlur"
        >
        <span v-else class="local-files-row__label" :title="rowTooltip(row.file)">
          {{ row.file.name }}
          <span
              v-if="isDirty(row.file, dirtyKeys)"
              class="local-files-row__dirty"
              aria-hidden="true"
          >●</span>
        </span>
        <template v-for="badge in [gitBadge(row.file)]" :key="`git-${row.file.id}`">
          <span
              v-if="badge"
              class="local-files-row__git"
              :class="`is-${badge.status}`"
              :title="badge.title"
              aria-hidden="true"
          >{{ badge.glyph }}</span>
        </template>
      </span>
    </div>

    <div
        v-else-if="row.kind === 'draft' && localFiles.inlineEdit"
        class="local-files-row is-draft"
        :style="{ paddingLeft: depthPadding(depth) }"
    >
      <span class="local-files-row__body">
        <span class="local-files-row__twist is-leaf" aria-hidden="true"/>
        <span
            class="local-files-row__icon"
            :class="[
              `tone-${draftTone()}`,
              {
                'is-folder': localFiles.inlineEdit?.mode === 'create-folder'
                    || localFiles.inlineEdit?.isDirectory,
              },
            ]"
            aria-hidden="true"
        >
          <DwIcon
              :name="draftIconName()"
              :size="localFiles.inlineEdit?.mode === 'create-folder' || localFiles.inlineEdit?.isDirectory ? 20 : 18"
              :stroke-width="1.55"
          />
        </span>
        <input
            :ref="bindInputRef"
            class="local-files-row__input"
            data-local-inline-input
            :value="localFiles.inlineEdit.value"
            @click.stop
            @dblclick.stop
            @mousedown.stop
            @pointerdown.stop
            @focus="onInlineFocus"
            @input="onDraftInput"
            @keydown="onDraftKeydown"
            @blur="onDraftBlur"
        >
      </span>
    </div>

    <div
        v-else-if="row.kind === 'empty'"
        class="local-files-row is-empty-hint"
        :class="{ 'is-drop-target': dropTargetId() === row.parent.id }"
        :style="{ paddingLeft: depthPadding(depth) }"
        @dragover="onEmptyDragOver($event, row.parent.path, row.parent.id)"
        @drop="onEmptyDrop($event, row.parent.path)"
    >
      <span class="local-files-row__body">
        <span class="local-files-row__twist is-leaf" aria-hidden="true"/>
        <span class="local-files-empty-hint">
          <span class="local-files-empty-hint__label">{{ t('explorer.localFiles.emptyFolder') }}</span>
          <button
              type="button"
              class="local-files-empty-hint__action"
              @click.stop="emit('empty-create-file', row.parent.path)"
          >
            {{ t('explorer.localFiles.emptyFolderNewFile') }}
          </button>
          <button
              type="button"
              class="local-files-empty-hint__action"
              @click.stop="emit('empty-create-folder', row.parent.path)"
          >
            {{ t('explorer.localFiles.emptyFolderNewFolder') }}
          </button>
        </span>
      </span>
    </div>
  </template>
</template>

<style>
.local-files-row {
  /* Match DataSourceTree: outer depth shell, selection lives on __body */
  --lf-row-height: 28px;
  --lf-twistie-size: 18px;
  position: relative;
  display: flex;
  align-items: stretch;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: var(--lf-row-height);
  margin: 0;
  padding-right: var(--dw-space-3);
  cursor: default;
  user-select: none;
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-snug);
}

.local-files-row__body {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--dw-space-2);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  min-height: var(--lf-row-height);
  padding: 0 var(--dw-space-3) 0 var(--dw-space-1);
  border-radius: var(--dw-control-radius-sm);
  transition: var(--dw-transition-bg, background var(--dw-duration-fast, 0.12s) ease);
}

.local-files-row__body::before {
  content: '';
  position: absolute;
  left: 0;
  top: 3px;
  bottom: 3px;
  width: 2px;
  border-radius: var(--dw-radius-xs);
  background: transparent;
  transition: var(--dw-transition-bg, background var(--dw-duration-fast, 0.12s) ease);
}

.local-files-row:hover .local-files-row__body {
  background: var(--dw-bg-hover);
}

.local-files-row.is-selected .local-files-row__body {
  background: color-mix(in srgb, var(--dw-primary) 8%, var(--dw-bg-hover));
}

.local-files-row.is-selected .local-files-row__body::before {
  background: var(--dw-primary);
}

/* Folders: same amber select accent as DataSourceTree groups */
.local-files-row.is-dir.is-selected .local-files-row__body {
  background: color-mix(in srgb, var(--mp-tone-amber) 10%, var(--dw-bg-hover));
}

.local-files-row.is-dir.is-selected .local-files-row__body::before {
  background: var(--mp-tone-amber);
}

.local-files-row.is-draft .local-files-row__body,
.local-files-row.is-editing .local-files-row__body {
  background: color-mix(in srgb, var(--dw-primary) 10%, var(--dw-bg-hover));
}

.local-files-row.is-draft .local-files-row__body::before,
.local-files-row.is-editing .local-files-row__body::before {
  background: var(--dw-primary);
}

.local-files-row.is-drop-target .local-files-row__body {
  background: color-mix(in srgb, var(--dw-primary) 8%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dw-primary) 48%, transparent);
  outline: none;
}

.local-files-row.is-drop-target .local-files-row__body::before {
  background: var(--dw-primary);
}

.local-files-row.is-dragging {
  opacity: 0.42;
}

.local-files-row.is-dir .local-files-row__label {
  font-weight: 400;
  letter-spacing: 0.01em;
}

.local-files-row.is-root .local-files-row__label {
  font-weight: 400;
  color: var(--dw-text);
}

.local-files-row.is-flash .local-files-row__body {
  animation: local-files-flash 1.1s ease;
}

.local-files-row__twist {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--lf-twistie-size);
  height: var(--lf-twistie-size);
  flex-shrink: 0;
  color: var(--dw-text-muted);
  opacity: 0.55;
  cursor: pointer;
}

.local-files-row:hover .local-files-row__twist,
.local-files-row.is-expanded .local-files-row__twist,
.local-files-row.is-selected .local-files-row__twist {
  opacity: 1;
}

.local-files-row__twist.is-leaf {
  visibility: hidden;
  cursor: default;
}

.local-files-row__twist-icon {
  display: block;
  width: var(--dw-icon-size-sm);
  height: var(--dw-icon-size-sm);
  transition: transform var(--dw-duration, 0.16s) var(--dw-ease, ease);
}

.local-files-row__twist.is-expanded .local-files-row__twist-icon {
  transform: rotate(90deg);
}

.local-files-row__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--dw-icon-size-lg);
  height: var(--dw-icon-size-lg);
  color: var(--dw-text-muted);
}

.local-files-row__icon.is-folder,
.local-files-row__icon.tone-folder {
  width: 24px;
  height: var(--dw-control-h-xs, 22px);
  /* Match TreeNodeIcon folder amber */
  color: #f59e0b;
}

.local-files-row__icon.tone-sql {
  color: var(--dw-primary);
}

.local-files-row__icon.tone-markdown {
  color: var(--mp-tone-indigo);
}

.local-files-row__icon.tone-json {
  color: var(--mp-tone-amber);
}

.local-files-row__icon.tone-data {
  color: color-mix(in srgb, var(--mp-tone-sky) 70%, var(--dw-text-secondary));
}

.local-files-row__icon.tone-sheet {
  color: var(--mp-tone-emerald);
}

.local-files-row__icon.tone-log {
  color: var(--dw-text-secondary);
}

.local-files-row__icon.tone-config {
  color: color-mix(in srgb, var(--dw-text-muted) 55%, var(--mp-tone-amber));
}

.local-files-row__icon.tone-script {
  color: var(--mp-tone-emerald);
}

.local-files-row__icon.tone-code {
  color: var(--mp-tone-sky);
}

.local-files-row__icon.tone-text,
.local-files-row__icon.tone-file {
  color: var(--dw-text-muted);
}

.local-files-row__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-snug, 1.35);
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-2);
}

.local-files-row__dirty {
  flex-shrink: 0;
  font-size: var(--dw-font-size-badge);
  line-height: 1;
  color: var(--dw-primary);
}

.local-files-row__git {
  flex-shrink: 0;
  margin-left: auto;
  min-width: 1em;
  padding: 0 2px;
  font-size: var(--dw-text-sm);
  font-weight: 400;
  line-height: 1;
  font-family: var(--dw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  letter-spacing: 0.02em;
}

.local-files-row__git.is-modified { color: var(--mp-tone-amber); }
.local-files-row__git.is-added { color: var(--mp-tone-emerald); }
.local-files-row__git.is-untracked { color: var(--mp-tone-emerald); }
.local-files-row__git.is-deleted { color: var(--dw-danger); }
.local-files-row__git.is-renamed { color: var(--mp-tone-sky); }
.local-files-row__git.is-conflict { color: var(--mp-tone-indigo); }

.local-files-row.is-empty-hint {
  cursor: default;
  color: var(--dw-text-muted);
}

.local-files-row.is-empty-hint:hover .local-files-row__body {
  background: transparent;
}

.local-files-row.is-empty-hint.is-drop-target .local-files-row__body {
  background: color-mix(in srgb, var(--dw-primary) 10%, transparent);
}

.local-files-empty-hint {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-2);
  min-width: 0;
  font-size: var(--dw-text-xs);
  line-height: 1.3;
}

.local-files-empty-hint__label {
  opacity: 0.85;
}

.local-files-empty-hint__action {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--dw-primary);
  cursor: pointer;
  font: inherit;
  font-size: inherit;
}

.local-files-empty-hint__action:hover {
  text-decoration: underline;
}

.local-files-row__input {
  flex: 1;
  min-width: 0;
  height: 22px;
  margin: 0;
  padding: 0 1px;
  border: none;
  border-radius: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--dw-primary) 72%, transparent);
  background: transparent;
  color: var(--dw-text);
  font: inherit;
  font-size: inherit;
  line-height: inherit;
  outline: none;
  box-shadow: none;
  caret-color: var(--dw-primary);
}

.local-files-row.is-dir .local-files-row__input {
  font-weight: 400;
  letter-spacing: 0.01em;
}

.local-files-row__input::selection {
  background: color-mix(in srgb, var(--dw-primary) 28%, transparent);
}

@keyframes local-files-flash {
  0%, 100% { background: transparent; }
  30%, 70% { background: color-mix(in srgb, var(--dw-primary) 22%, transparent); }
}
</style>
