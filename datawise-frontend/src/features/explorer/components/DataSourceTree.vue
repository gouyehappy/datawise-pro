<!--
  统一数据源树：Explorer 单选（无复选框）与 AI 多选（带复选框）共用
-->
<script setup lang="ts">
import {computed, nextTick, onUnmounted, ref, toRef, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwCheckbox, StatusPill, EmptyState} from '@/core/components'
import ConnectionEnvBadge from './ConnectionEnvBadge.vue'
import {DwIcon} from '@/core/icons'
import TreeNodeIcon from '@/features/explorer/components/TreeNodeIcon.vue'
import type {TreeNode} from '@/core/types'
import {canExpandTreeNode} from '@/core/utils/tree'
import {isTreeTwistVisuallyExpanded} from '@/features/explorer/services/explorer-tree-expansion'
import {isConnectionFeatureNode} from '@/features/explorer/services/flat-connection-feature-tree.service'
import {
  isViewModelStatusMeta,
  viewModelStatusVariant,
} from '@/features/explorer/services/view-model-tree.service'
import {
  isExplorerFavoritesGroupId,
  isExplorerFavoritesViewAllId,
} from '@/features/explorer/services/explorer-favorites.constants'
import {isConfiguredDefaultDatabaseNode} from '@/features/explorer/services/explorer-pinned-sort.service'
import {resolveExplorerCatalogLabel, isExplorerExtensionCatalogFolder} from '@/features/explorer/services/explorer-catalog-label.service'
import {resolveExplorerUiFeatureLabel, isExplorerUiFeatureNodeType, resolveDbTypeForExplorerFeatureNodeType} from '@/features/explorer/services/explorer-ui-catalog.service'
import {resolveFolderItemCountLabel} from '@/features/explorer/services/explorer-folder-count.service'
import {resolvePlatformFeatureId} from '@/features/explorer/services/explorer-ai-tree.service'
import {platformFeatureTreeLabel} from '@/features/platform/services/platform-catalog.service'
import {
  resolveLastFlatNodeIndex,
  useTreeVirtualWindow,
} from '@/features/explorer/composables/useTreeVirtualWindow'
import {
  INLINE_OUTSIDE_COMMIT_ARM_MS,
  applyInlineRenameOnFocus,
  focusInlineRenameAfterMenu,
} from '@/core/ui/inline-rename'
import {
  isCatalogReorderDraggable,
  resolveCatalogReorderDrop,
  type CatalogReorderPosition,
} from '@/features/explorer/services/explorer-catalog-reorder.service'

const DRAG_THRESHOLD_PX = 6

const props = withDefaults(
    defineProps<{
      flatNodes: { node: TreeNode; depth: number }[]
      emptyText: string
      emptyHint?: string
      emptyActionLabel?: string
      selectedNodeId?: string | null
      flashNodeId?: string | null
      highlightNodeIds?: Set<string>
      loadingNodeIds?: Set<string>
      pinnedNodeIds?: Set<string>
      connectionHealth?: Record<string, 'ok' | 'error'>
      selectable?: boolean
      isCheckable?: (node: TreeNode) => boolean
      isChecked?: (node: TreeNode) => boolean
      showColumnComment?: boolean
      showTableComment?: boolean
      compact?: boolean
      connectionDragEnabled?: boolean
      canMoveConnectionToGroup?: (connectionId: string, groupId: string) => boolean
      /** 内联新建/重命名中的节点 id */
      inlineEditNodeId?: string | null
      inlineEditValue?: string
      /** 文件名编辑：聚焦时选中主名（不含扩展名） */
      inlineEditAsFileName?: boolean
    }>(),
    {
      selectable: false,
      showColumnComment: true,
      showTableComment: true,
      compact: false,
      loadingNodeIds: () => new Set(),
      pinnedNodeIds: () => new Set(),
      connectionDragEnabled: false,
      inlineEditNodeId: null,
      inlineEditValue: '',
      inlineEditAsFileName: false,
    },
)

const emit = defineEmits<{
  select: [node: TreeNode]
  open: [node: TreeNode]
  contextmenu: [event: MouseEvent, node: TreeNode]
  toggleExpand: [nodeId: string]
  toggleCheck: [node: TreeNode]
  moveConnection: [connectionId: string, groupId: string]
  reorderCatalog: [nodeId: string, targetId: string, position: CatalogReorderPosition]
  emptyAction: []
  draftInput: [value: string]
  draftCommit: []
  draftCancel: []
}>()

const {t} = useI18n()
const flatNodesRef = toRef(props, 'flatNodes')
const draftInputRef = ref<HTMLInputElement | null>(null)
let suppressDraftBlur = false
let outsidePointerCleanup: (() => void) | null = null
let draftCommitQueued = false

function isInlineEditing(node: TreeNode) {
  return Boolean(props.inlineEditNodeId && node.id === props.inlineEditNodeId)
}

function isEventInsideInlineInput(event: Event): boolean {
  const target = event.target
  if (!(target instanceof Element)) return false
  if (target.closest('[data-tree-inline-input]')) return true
  const el = draftInputRef.value
  return Boolean(el && el.contains(target))
}

function cleanupOutsideCommit() {
  outsidePointerCleanup?.()
  outsidePointerCleanup = null
}

function bindOutsideCommit() {
  cleanupOutsideCommit()
  const armedAt = performance.now()
  const onPointerDown = (event: PointerEvent) => {
    if (!props.inlineEditNodeId) return
    if (performance.now() - armedAt < INLINE_OUTSIDE_COMMIT_ARM_MS) return
    if (isEventInsideInlineInput(event)) return
    void commitDraft()
  }
  // capture：树节点本身不可聚焦，不会触发 input blur，必须靠外侧 pointerdown 提交
  window.addEventListener('pointerdown', onPointerDown, true)
  outsidePointerCleanup = () => {
    window.removeEventListener('pointerdown', onPointerDown, true)
  }
}

function inlineRenameFocusOptions() {
  return {
    resolveEl: (): HTMLInputElement | null => {
      if (draftInputRef.value?.isConnected) return draftInputRef.value
      return document.querySelector<HTMLInputElement>('[data-tree-inline-input]')
    },
    getName: () => props.inlineEditValue || '',
    isDirectory: () => !props.inlineEditAsFileName,
    assignRef: (el: HTMLInputElement) => {
      draftInputRef.value = el
    },
  }
}

function onInlineFocus(event: FocusEvent) {
  applyInlineRenameOnFocus(event, inlineRenameFocusOptions())
}

watch(
    () => props.inlineEditNodeId,
    (nodeId) => {
      cleanupOutsideCommit()
      if (!nodeId) return
      // 不依赖 input 是否已挂载：虚拟列表可能晚一帧才渲染草稿行
      bindOutsideCommit()
      void focusInlineRenameAfterMenu(inlineRenameFocusOptions())
    },
)

function onDraftInput(event: Event) {
  const target = event.target
  if (target instanceof HTMLInputElement) emit('draftInput', target.value)
}

async function commitDraft() {
  if (suppressDraftBlur || draftCommitQueued || !props.inlineEditNodeId) return
  draftCommitQueued = true
  suppressDraftBlur = true
  cleanupOutsideCommit()
  emit('draftCommit')
  await nextTick()
  draftCommitQueued = false
  suppressDraftBlur = false
}

function cancelDraft() {
  if (suppressDraftBlur) return
  suppressDraftBlur = true
  cleanupOutsideCommit()
  emit('draftCancel')
  suppressDraftBlur = false
}

/** 点到其它树节点时立刻提交（单击即失焦） */
function commitInlineIfLeaving(node: TreeNode) {
  if (props.inlineEditNodeId && node.id !== props.inlineEditNodeId) {
    void commitDraft()
  }
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
  if (suppressDraftBlur) return
  void commitDraft()
}

const {
  rootRef,
  useVirtual,
  totalHeight,
  visibleNodes,
  visibleRangePaddingTop,
  visibleRangePaddingBottom,
  scrollToFlatIndex,
} = useTreeVirtualWindow(flatNodesRef)

const selectedFlatIndex = computed(() =>
    props.selectable
        ? -1
        : resolveLastFlatNodeIndex(props.flatNodes, props.selectedNodeId),
)

defineExpose({scrollToFlatIndex})
const draggingNodeId = ref<string | null>(null)
const dropTarget = ref<{targetId: string; position: CatalogReorderPosition} | null>(null)
const suppressNextClick = ref(false)

type PointerDragSession = { cleanup: () => void }
let activePointerDrag: PointerDragSession | null = null

onUnmounted(() => {
  cleanupOutsideCommit()
  cancelPointerDrag()
})

const INDENT_STEP = 14

function rowStyle(depth: number) {
  return {'--tree-depth': String(depth)}
}

function isTreeNodeSelected(_node: TreeNode, index: number): boolean {
  return !props.selectable && selectedFlatIndex.value >= 0 && selectedFlatIndex.value === index
}

function rowClass(node: TreeNode, index: number) {
  const checked = props.selectable && props.isChecked?.(node)
  const selected = isTreeNodeSelected(node, index)
  const flash = !props.selectable && props.flashNodeId === node.id
  const teamShared = !props.selectable && props.highlightNodeIds?.has(node.id)
  const loading = props.loadingNodeIds?.has(node.id)
  const expandable = canExpandTreeNode(node)
  const twistExpanded = isTreeTwistVisuallyExpanded(node, {loading})
  const dragging = props.connectionDragEnabled && draggingNodeId.value === node.id
  const activeDrop = props.connectionDragEnabled && dropTarget.value?.targetId === node.id
  const dropBefore = activeDrop && dropTarget.value?.position === 'before'
  const dropAfter = activeDrop && dropTarget.value?.position === 'after'
  const dropInside = activeDrop && dropTarget.value?.position === 'inside'
  const extensionFolder = isExplorerExtensionCatalogFolder(node)
  const prevEntry = index > 0 ? props.flatNodes[index - 1] : undefined
  const currDepth = props.flatNodes[index]?.depth
  const extensionStart = extensionFolder
      && (!prevEntry
          || prevEntry.depth !== currDepth
          || !isExplorerExtensionCatalogFolder(prevEntry.node))

  return [
    `tree-node--${node.type}`,
    {
      'tree-node--favorites-group': isExplorerFavoritesGroupId(node.id),
      'tree-node--favorites-view-all': isExplorerFavoritesViewAllId(node.id),
      'tree-node--catalog-extension': extensionFolder,
      'tree-node--catalog-extension-start': extensionStart,
      'is-selected': selected,
      'is-locate-flash': flash,
      'is-team-shared': teamShared,
      'is-checked': checked,
      'is-expanded': twistExpanded,
      'is-loading': loading,
      'is-selectable': props.selectable && props.isCheckable?.(node),
      'is-leaf': !expandable,
      'has-twistie': expandable,
      'is-dragging': dragging,
      'is-drop-before': dropBefore,
      'is-drop-after': dropAfter,
      'is-drop-target': dropInside,
      'is-pinned': props.pinnedNodeIds?.has(node.id),
      'is-load-more': node.type === 'load_more',
      'is-hint': node.type === 'project-files-hint',
    },
  ]
}

function canDropConnectionOnGroup(connectionId: string, groupId: string): boolean {
  if (props.canMoveConnectionToGroup) {
    return props.canMoveConnectionToGroup(connectionId, groupId)
  }
  return true
}

function cancelPointerDrag() {
  activePointerDrag?.cleanup()
  activePointerDrag = null
}

function resolveDropAtPoint(
    dragged: TreeNode,
    clientX: number,
    clientY: number,
): {targetId: string; position: CatalogReorderPosition} | null {
  const hit = document.elementFromPoint(clientX, clientY)?.closest('[data-tree-node-id]') as HTMLElement | null
  if (!hit) return null
  const nodeId = hit.getAttribute('data-tree-node-id')
  if (!nodeId) return null
  const entry = props.flatNodes.find(({node: n}) => n.id === nodeId)
  if (!entry) return null
  const rect = hit.getBoundingClientRect()
  const resolved = resolveCatalogReorderDrop(
      dragged,
      entry.node,
      clientY,
      rect.top,
      rect.height,
  )
  if (!resolved) return null
  if (
      dragged.type === 'connection'
      && resolved.position === 'inside'
      && !canDropConnectionOnGroup(dragged.id, resolved.targetId)
  ) {
    return null
  }
  return resolved
}

function onCatalogPointerDown(event: MouseEvent, node: TreeNode) {
  commitInlineIfLeaving(node)
  if (!props.connectionDragEnabled || !isCatalogReorderDraggable(node)) return
  if (event.button !== 0) return

  cancelPointerDrag()

  const startX = event.clientX
  const startY = event.clientY
  let dragging = false

  function onMove(e: PointerEvent) {
    if (!dragging) {
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      dragging = true
      draggingNodeId.value = node.id
      suppressNextClick.value = true
      e.preventDefault()
    }
    dropTarget.value = resolveDropAtPoint(node, e.clientX, e.clientY)
  }

  function onUp() {
    cleanupListeners()
    if (dragging) {
      const drop = dropTarget.value
      if (drop) {
        emit('reorderCatalog', node.id, drop.targetId, drop.position)
      }
      draggingNodeId.value = null
      dropTarget.value = null
    }
    activePointerDrag = null
  }

  function cleanupListeners() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
  activePointerDrag = {
    cleanup() {
      cleanupListeners()
      if (dragging) {
        draggingNodeId.value = null
        dropTarget.value = null
      }
      activePointerDrag = null
    },
  }
}

function onRowClick(node: TreeNode) {
  if (suppressNextClick.value) {
    suppressNextClick.value = false
    return
  }
  commitInlineIfLeaving(node)
  if (isInlineEditing(node) || node.type === 'project-files-draft' || node.type === 'group-draft') return
  if (props.selectable) {
    if (props.isCheckable?.(node)) {
      emit('toggleCheck', node)
    }
    return
  }
  if (node.type === 'load_more') {
    if (props.loadingNodeIds?.has(node.id)) return
    emit('toggleExpand', node.id)
    return
  }
  emit('select', node)
}

function onRowDblClick(node: TreeNode) {
  if (props.selectable) return
  commitInlineIfLeaving(node)
  if (
    isInlineEditing(node)
    || node.type === 'project-files-draft'
    || node.type === 'group-draft'
    || node.type === 'project-files-hint'
  ) return
  emit('open', node)
}

function onTwistieClick(node: TreeNode) {
  commitInlineIfLeaving(node)
  emit('toggleExpand', node.id)
}

function displayNodeLabel(node: TreeNode) {
  if (node.type === 'redis-browser') return t('explorer.redisBrowser.treeLabel')
  if (node.type === 'ssh-script-records') return t('explorer.sshFeatures.scriptRecords')
  if (node.type === 'ssh-terminal') return t('explorer.sshFeatures.terminal')
  if (isExplorerUiFeatureNodeType(node.type)) {
    const fromCatalog = resolveExplorerUiFeatureLabel(
      node.dbType ?? resolveDbTypeForExplorerFeatureNodeType(node.type),
      node.meta,
      t,
      node.type,
    )
    if (fromCatalog) return fromCatalog
  }
  if (node.type === 'load_more') return 'Load more'
  if (node.type === 'platform_feature') {
    return platformFeatureTreeLabel(resolvePlatformFeatureId(node) as import('@/features/platform/types/platform.types').PlatformFeatureId, t)
  }
  return resolveExplorerCatalogLabel(node, t)
}

function shouldShowComment(node: TreeNode) {
  if (!node.comment?.trim()) return false
  if (node.type === 'column') return props.showColumnComment
  if (node.type === 'table' || node.type === 'view') return props.showTableComment
  return props.showColumnComment || props.showTableComment
}

/** lazy-load 内部标记，勿当用户可见徽章 */
function isInternalTreeMeta(meta: string | undefined): boolean {
  if (!meta) return false
  return meta === 'lazy' || meta === 'loaded' || meta.endsWith(':loaded')
}

function viewModelStatusLabel(node: TreeNode) {
  if (node.meta === 'draft') return t('viewModel.treeBadgeDraft')
  return t('viewModel.treeBadgePublished')
}

function folderItemCountLabel(node: TreeNode): string | null {
  return resolveFolderItemCountLabel(node)
}

/** Walk flat list upward to the owning connection's form default database. */
function isConnectionDefaultDatabase(node: TreeNode, index: number): boolean {
  if (node.type !== 'database' && node.type !== 'schema') return false
  const depth = props.flatNodes[index]?.depth
  if (depth == null) return false
  for (let i = index - 1; i >= 0; i -= 1) {
    const entry = props.flatNodes[i]
    if (entry.depth >= depth) continue
    if (entry.node.type === 'connection') {
      return isConfiguredDefaultDatabaseNode(node, entry.node.database)
    }
  }
  return false
}
</script>

<template>
  <div
      ref="rootRef"
      class="datasource-tree"
      :class="{
        'datasource-tree--compact': compact,
        'is-connection-dragging': !!draggingNodeId,
        'is-virtualized': useVirtual,
      }"
      :style="{ '--tree-indent': `${INDENT_STEP}px` }"
  >
    <EmptyState
        v-if="!flatNodes.length"
        class="tree-empty"
        embedded
        compact
        :title="emptyText"
        :hint="emptyHint"
    >
      <template #icon>
        <DwIcon name="open" size="lg" :stroke-width="1.4"/>
      </template>
      <template v-if="emptyActionLabel" #actions>
        <button type="button" class="tree-empty-action" @click="emit('emptyAction')">
          {{ emptyActionLabel }}
        </button>
      </template>
    </EmptyState>

    <div
        v-else
        class="tree-virtual-track"
        :style="useVirtual ? { minHeight: `${totalHeight}px` } : undefined"
    >
      <div
          class="tree-virtual-window"
          :style="useVirtual ? {
            paddingTop: `${visibleRangePaddingTop}px`,
            paddingBottom: `${visibleRangePaddingBottom}px`,
          } : undefined"
      >
    <div
        v-for="({ node, depth, index }) in visibleNodes"
        :key="`${index}:${node.id}`"
        class="tree-node"
        :class="rowClass(node, index)"
        :data-tree-node-id="node.id"
        :style="rowStyle(depth)"
        :title="connectionDragEnabled && isCatalogReorderDraggable(node) ? t('explorer.reorderCatalogDragHint') : undefined"
        @mousedown="onCatalogPointerDown($event, node)"
        @click="onRowClick(node)"
        @dblclick="onRowDblClick(node)"
        @contextmenu="!selectable && emit('contextmenu', $event, node)"
    >
      <span class="tree-node__guides" aria-hidden="true">
        <span
            v-for="level in depth"
            :key="level"
            class="tree-node__guide"
        />
      </span>

      <span class="tree-node__body">
        <button
            v-if="canExpandTreeNode(node)"
            class="tree-twistie"
            :class="{
              'is-expanded': isTreeTwistVisuallyExpanded(node, {loading: loadingNodeIds?.has(node.id)}),
              'is-loading': loadingNodeIds?.has(node.id),
            }"
            type="button"
            :aria-label="t('explorer.expandToggle')"
            :aria-expanded="isTreeTwistVisuallyExpanded(node, {loading: loadingNodeIds?.has(node.id)})"
            @mousedown.stop
            @click.stop="onTwistieClick(node)"
        >
          <span v-if="loadingNodeIds?.has(node.id)" class="tree-twistie__spinner"/>
          <DwIcon v-else class="tree-twistie__icon" name="chevron-right" size="xs" :stroke-width="1.5"/>
        </button>
        <span v-else class="tree-twistie tree-twistie--spacer" aria-hidden="true"/>

        <DwCheckbox
            v-if="selectable && isCheckable?.(node)"
            class="tree-check"
            :model-value="!!isChecked?.(node)"
            :aria-label="displayNodeLabel(node)"
            @click.stop
            @update:model-value="emit('toggleCheck', node)"
        />

        <TreeNodeIcon
            :type="node.type"
            :db-type="node.dbType"
            :plugin-id="node.pluginId"
            :expanded="isTreeTwistVisuallyExpanded(node, {loading: loadingNodeIds?.has(node.id)})"
            :feature="node.meta"
            :special-folder="node.type === 'group' || node.type === 'project-docs' || node.type === 'project-scripts' || node.type === 'group-draft'"
            :extension-folder="isExplorerExtensionCatalogFolder(node)"
            :health="node.type === 'connection' ? connectionHealth?.[node.id] : undefined"
            :pinned="pinnedNodeIds?.has(node.id)"
            :loading="node.type === 'load_more' && loadingNodeIds?.has(node.id)"
        />

        <input
            v-if="isInlineEditing(node)"
            ref="draftInputRef"
            class="tree-draft-input"
            data-tree-inline-input
            :value="inlineEditValue"
            @click.stop
            @dblclick.stop
            @mousedown.stop
            @pointerdown.stop
            @focus="onInlineFocus"
            @input="onDraftInput"
            @keydown="onDraftKeydown"
            @blur="onDraftBlur"
        >
        <span v-else class="tree-label" :title="displayNodeLabel(node)">
          <span class="tree-label__text">{{ displayNodeLabel(node) }}</span>
          <span
              v-if="folderItemCountLabel(node) != null"
              class="tree-folder-count"
          >
            {{ folderItemCountLabel(node) }}
          </span>
        </span>

        <StatusPill
            v-if="isConnectionDefaultDatabase(node, index)"
            inline
            class="tree-env-pill tree-default-db-pill"
            variant="neutral"
            :title="t('explorer.defaultDatabaseBadge')"
        >
          {{ t('explorer.defaultDatabaseBadge') }}
        </StatusPill>

        <StatusPill
            v-else-if="node.type === 'view_model' && isViewModelStatusMeta(node.meta)"
            inline
            class="tree-env-pill tree-vm-pill"
            :variant="viewModelStatusVariant(node.meta)"
        >
          {{ viewModelStatusLabel(node) }}
        </StatusPill>

        <span
            v-if="shouldShowComment(node)"
            class="tree-comment"
            :title="node.comment"
        >
          {{ node.comment }}
        </span>

        <span
            v-if="node.meta && node.type !== 'load_more' && node.type !== 'project-files-draft' && node.type !== 'group-draft' && !isInlineEditing(node) && !isConnectionFeatureNode(node) && !isViewModelStatusMeta(node.meta) && !isInternalTreeMeta(node.meta)"
            class="tree-meta"
            :title="node.meta"
        >
          {{ node.meta }}
        </span>

        <!-- Keep env badge last so it stays pinned while the name ellipsizes. -->
        <ConnectionEnvBadge
            v-if="node.type === 'connection'"
            class="tree-conn-env"
            :env="node.env"
            :env-custom="node.envCustom"
        />
      </span>
    </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.datasource-tree {
  --tree-row-height: var(--dw-btn-height);
  --tree-indent: 14px;
  --tree-twistie-size: 18px;
  --tree-guide-color: color-mix(in srgb, var(--dw-border) 55%, transparent);

  flex: 1;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: min-content;
  padding: var(--dw-space-2) 0 var(--dw-space-4);
  box-sizing: border-box;
}

.datasource-tree--compact {
  --tree-row-height: var(--dw-control-h-sm);
  --tree-indent: 12px;
  padding: var(--dw-space-1) 0 var(--dw-space-3);
}

.tree-empty {
  width: 100%;
}

.tree-empty-action {
  display: inline-flex;
  margin-top: var(--dw-space-4);
  padding: 0;
  border: none;
  background: none;
  color: var(--dw-primary);
  font-size: var(--dw-text-sm);
  font-weight: 400;
  cursor: pointer;
}

.tree-empty-action:hover {
  text-decoration: underline;
}

.tree-node {
  position: relative;
  display: flex;
  align-items: stretch;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
  min-height: var(--tree-row-height);
  padding-left: calc(var(--dw-space-3) + var(--tree-depth, 0) * var(--tree-indent));
  padding-right: var(--dw-space-3);
  cursor: default;
  user-select: none;
}

.tree-node.is-selectable {
  cursor: pointer;
}

.tree-node.is-load-more {
  cursor: pointer;
}

.tree-node.is-load-more .tree-label {
  color: var(--dw-text-muted);
  font-weight: 400;
}

.tree-node.is-load-more.is-loading {
  pointer-events: none;
}

.tree-node.is-load-more.is-loading .tree-label {
  color: var(--dw-text-muted);
  opacity: 0.75;
}

.tree-node.is-hint {
  cursor: default;
}

.tree-node.is-hint .tree-label {
  color: var(--dw-text-muted);
  font-weight: 400;
  font-style: italic;
}

.tree-node__guides {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 6px;
  display: flex;
  pointer-events: none;
}

.tree-node__guide {
  width: var(--tree-indent);
  flex-shrink: 0;
  border-right: 1px solid var(--tree-guide-color);
  opacity: 0.65;
}

.tree-node__guide:last-child {
  opacity: 0.9;
}

.tree-node__body {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--dw-space-2);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  min-height: var(--tree-row-height);
  padding: 0 var(--dw-space-3) 0 var(--dw-space-1);
  border-radius: var(--dw-control-radius-sm);
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-snug);
  transition: var(--dw-transition-bg);
}

.datasource-tree--compact .tree-node__body {
  font-size: var(--dw-text-sm);
  gap: var(--dw-gap-xs);
}

.tree-node__body::before {
  content: '';
  position: absolute;
  left: 0;
  top: 3px;
  bottom: 3px;
  width: 2px;
  border-radius: var(--dw-radius-xs);
  background: transparent;
  transition: var(--dw-transition-bg);
}

.tree-node:hover .tree-node__body {
  background: var(--dw-bg-hover);
}

.tree-node.is-selected .tree-node__body {
  background: color-mix(in srgb, var(--dw-primary) 8%, var(--dw-bg-hover));
}

.tree-node.is-selected .tree-node__body::before {
  background: var(--dw-primary);
}

.tree-node--connection.is-selected .tree-node__body,
.tree-node--database.is-selected .tree-node__body {
  background: color-mix(in srgb, var(--dw-info-fg) 10%, var(--dw-bg-hover));
}

.tree-node--connection.is-selected .tree-node__body::before,
.tree-node--database.is-selected .tree-node__body::before {
  background: var(--dw-info-fg);
}

.tree-node--group.is-selected .tree-node__body {
  background: color-mix(in srgb, var(--mp-tone-amber) 10%, var(--dw-bg-hover));
}

.tree-node--group.is-selected .tree-node__body::before {
  background: var(--mp-tone-amber);
}

.tree-node.is-checked .tree-node__body {
  background: var(--dw-primary-soft);
}

.tree-node.is-locate-flash .tree-node__body {
  animation: tree-locate-flash 0.85s ease-in-out;
}

.tree-node.is-team-shared .tree-node__body {
  box-shadow: inset 3px 0 0 var(--dw-primary);
}

@keyframes tree-locate-flash {
  0%,
  100% {
    background: transparent;
  }

  45% {
    background: color-mix(in srgb, var(--dw-primary-mild) 55%, transparent);
  }
}

.datasource-tree.is-connection-dragging {
  cursor: grabbing;
  user-select: none;
}

.tree-node--group .tree-label {
  font-weight: 400;
}

.tree-node.is-dragging {
  opacity: 0.45;
}

.tree-node.is-drop-target > .tree-node__body {
  background: color-mix(in srgb, var(--dw-primary) 14%, transparent);
  outline: 1px dashed color-mix(in srgb, var(--dw-primary) 45%, transparent);
  outline-offset: -1px;
}

.tree-node.is-drop-before > .tree-node__body {
  box-shadow:
    inset 0 2px 0 0 var(--dw-primary),
    inset 3px 0 0 transparent;
}

.tree-node.is-drop-after > .tree-node__body {
  box-shadow:
    inset 0 -2px 0 0 var(--dw-primary),
    inset 3px 0 0 transparent;
}

.tree-node.is-team-shared.is-drop-before > .tree-node__body {
  box-shadow:
    inset 0 2px 0 0 var(--dw-primary),
    inset 3px 0 0 var(--dw-primary);
}

.tree-node.is-team-shared.is-drop-after > .tree-node__body {
  box-shadow:
    inset 0 -2px 0 0 var(--dw-primary),
    inset 3px 0 0 var(--dw-primary);
}

.tree-node--connection .tree-label,
.tree-node--database .tree-label {
  font-weight: 400;
}

.tree-conn-env,
.tree-vm-pill,
.tree-default-db-pill {
  flex: 0 0 auto;
  margin-left: auto;
}

.tree-node__body :deep(.conn-env-badge) {
  flex: 0 0 auto;
}

.tree-node--table.is-selected .tree-label {
  color: var(--dw-primary-hover);
  font-weight: 400;
}

.tree-node--folder,
.tree-node--columns,
.tree-node--keys,
.tree-node--indexes {
  color: var(--dw-text);
}

.tree-node--catalog-extension > .tree-node__body {
  color: color-mix(in srgb, var(--dw-text-secondary) 88%, var(--dw-primary));
}

.tree-node--catalog-extension .tree-label {
  font-weight: 400;
}

.tree-node--catalog-extension .tree-folder-count {
  opacity: 0.88;
}

.tree-node--catalog-extension-start > .tree-node__body {
  margin-top: 3px;
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--dw-border-light) 90%, transparent);
}

.tree-node--folder .tree-label {
  font-size: var(--dw-text-sm);
  font-weight: 400;
  letter-spacing: 0.01em;
}

.tree-node--column {
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
}

.tree-node--column.is-selected .tree-node__body {
  background: var(--dw-bg-hover);
}

.tree-node--column.is-selected .tree-node__body::before {
  background: var(--dw-text-muted);
}

.tree-twistie {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--tree-twistie-size);
  height: var(--tree-twistie-size);
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: var(--dw-text-muted);
  cursor: pointer;
  opacity: 0.55;
  transition: opacity var(--dw-duration-fast) var(--dw-ease),
  color 0.12s ease,
  transform 0.14s ease;
}

.tree-node:hover .tree-twistie,
.tree-node.is-expanded .tree-twistie,
.tree-node.is-selected .tree-twistie {
  opacity: 1;
}

.tree-twistie:hover,
.tree-twistie:active,
.tree-twistie:focus,
.tree-twistie:focus-visible {
  color: var(--dw-text-secondary);
  background: transparent;
  /* Kill global :where(button) hover/active inset wash */
  box-shadow: none;
}

.tree-twistie__icon {
  width: var(--dw-icon-size-sm);
  height: var(--dw-icon-size-sm);
  display: block;
  transition: transform var(--dw-duration) var(--dw-ease);
}

.tree-twistie.is-expanded .tree-twistie__icon {
  transform: rotate(90deg);
}

.tree-twistie.is-loading {
  opacity: 1;
  pointer-events: none;
}

.tree-twistie__spinner {
  width: var(--dw-icon-size-xs);
  height: var(--dw-icon-size-xs);
  border: 1.5px solid color-mix(in srgb, var(--dw-text-muted) 35%, transparent);
  border-top-color: var(--dw-primary);
  border-radius: 50%;
  animation: tree-spin 0.65s linear infinite;
}

@keyframes tree-spin {
  to {
    transform: rotate(360deg);
  }
}

.tree-twistie--spacer {
  visibility: hidden;
  pointer-events: none;
}

.tree-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--dw-icon-size-sm);
  height: var(--dw-icon-size-sm);
  margin: 0;
  gap: 0;
  cursor: pointer;
}

.tree-check input,
.tree-check :deep(.dw-checkbox__control) {
  width: var(--dw-icon-size-xs);
  height: var(--dw-icon-size-xs);
  margin: 0;
  accent-color: var(--dw-primary);
  cursor: pointer;
}

.tree-label {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  /* width:0 + flex-grow: classic flex ellipsis so trailing env badge stays visible */
  flex: 1 1 0;
  width: 0;
  min-width: 0;
  overflow: hidden;
  font-weight: 400;
}

.tree-label__text {
  flex: 1 1 0;
  width: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-draft-input {
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

.tree-draft-input::selection {
  background: color-mix(in srgb, var(--dw-primary) 28%, transparent);
}

.tree-folder-count {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 400;
  flex-shrink: 0;
}

.tree-comment {
  flex-shrink: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.tree-meta {
  margin-left: auto;
  padding: 0 var(--dw-space-2);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-muted);
  color: var(--dw-text-muted);
  font-family: var(--dw-mono);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-relaxed);
  flex-shrink: 0;
}

.tree-node.is-selected .tree-meta {
  background: color-mix(in srgb, var(--dw-bg) 70%, transparent);
  color: var(--dw-text-secondary);
}

[data-theme='dark'] .tree-node__guide {
  opacity: 0.55;
}

.tree-node--favorites-group > .tree-row {
  font-weight: 400;
  color: var(--dw-primary);
}

.tree-node--favorites-view-all > .tree-row .tree-label {
  color: var(--dw-text-secondary);
  font-style: italic;
}
</style>
