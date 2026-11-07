<script setup lang="ts">
import {computed, nextTick, reactive, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {EmptyState} from '@/core/components'
import {DwIcon} from '@/core/icons'
import type {MarkdownOutlineNode} from '@/features/local-files/services/local-files-markdown'

type FlatRow = {
  node: MarkdownOutlineNode
  depth: number
  hasChildren: boolean
}

const props = defineProps<{
  nodes: MarkdownOutlineNode[]
  activeId?: string | null
}>()

const emit = defineEmits<{
  select: [payload: {id: string; line: number}]
}>()

const {t} = useI18n()

/** Collapsed parent heading ids (children hidden). */
const collapsed = reactive(new Set<string>())
const focusedId = ref<string | null>(null)
const listRef = ref<HTMLElement | null>(null)

watch(
    () => props.nodes,
    () => {
      collapsed.clear()
      focusedId.value = null
    },
)

watch(
    () => props.activeId,
    (id) => {
      if (id) focusedId.value = id
    },
)

function collectBranchIds(nodes: MarkdownOutlineNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    if (node.children.length) {
      out.push(node.id)
      collectBranchIds(node.children, out)
    }
  }
  return out
}

function countNodes(nodes: MarkdownOutlineNode[]): number {
  let n = 0
  for (const node of nodes) {
    n += 1 + countNodes(node.children)
  }
  return n
}

const branchIds = computed(() => collectBranchIds(props.nodes))
const headingCount = computed(() => countNodes(props.nodes))
const allCollapsed = computed(() =>
  branchIds.value.length > 0 && branchIds.value.every((id) => collapsed.has(id)),
)

function flattenVisible(nodes: MarkdownOutlineNode[], depth = 0): FlatRow[] {
  const rows: FlatRow[] = []
  for (const node of nodes) {
    const hasChildren = node.children.length > 0
    rows.push({node, depth, hasChildren})
    if (hasChildren && !collapsed.has(node.id)) {
      rows.push(...flattenVisible(node.children, depth + 1))
    }
  }
  return rows
}

const rows = computed(() => flattenVisible(props.nodes))
const isEmpty = computed(() => props.nodes.length === 0)

function toggleNode(id: string, event?: Event) {
  event?.stopPropagation()
  if (collapsed.has(id)) collapsed.delete(id)
  else collapsed.add(id)
}

function collapseAll() {
  if (!branchIds.value.length) return
  if (allCollapsed.value) {
    collapsed.clear()
    return
  }
  collapsed.clear()
  for (const id of branchIds.value) collapsed.add(id)
}

function onSelect(row: FlatRow) {
  focusedId.value = row.node.id
  emit('select', {id: row.node.id, line: row.node.line})
}

/** Parent heading: click label jumps; chevron alone folds. Double-click folds. */
function onRowDblClick(row: FlatRow) {
  if (row.hasChildren) toggleNode(row.node.id)
}

function focusRowButton(id: string) {
  void nextTick(() => {
    const btn = listRef.value?.querySelector<HTMLButtonElement>(`[data-toc-id="${CSS.escape(id)}"]`)
    btn?.focus()
  })
}

function moveFocus(delta: number) {
  const list = rows.value
  if (!list.length) return
  const currentId = focusedId.value ?? props.activeId ?? list[0]?.node.id
  const idx = Math.max(0, list.findIndex((row) => row.node.id === currentId))
  const next = list[Math.min(list.length - 1, Math.max(0, idx + delta))]
  if (!next) return
  focusedId.value = next.node.id
  focusRowButton(next.node.id)
}

function onTreeKeydown(event: KeyboardEvent) {
  const list = rows.value
  if (!list.length) return
  const currentId = focusedId.value ?? props.activeId ?? list[0]?.node.id
  const row = list.find((item) => item.node.id === currentId) ?? list[0]
  if (!row) return

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      moveFocus(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      moveFocus(-1)
      break
    case 'Home':
      event.preventDefault()
      focusedId.value = list[0]!.node.id
      focusRowButton(list[0]!.node.id)
      break
    case 'End':
      event.preventDefault()
      focusedId.value = list[list.length - 1]!.node.id
      focusRowButton(list[list.length - 1]!.node.id)
      break
    case 'ArrowRight':
      event.preventDefault()
      if (row.hasChildren && collapsed.has(row.node.id)) {
        collapsed.delete(row.node.id)
      } else if (row.hasChildren) {
        moveFocus(1)
      }
      break
    case 'ArrowLeft':
      event.preventDefault()
      if (row.hasChildren && !collapsed.has(row.node.id)) {
        collapsed.add(row.node.id)
      } else if (row.depth > 0) {
        // Jump to nearest visible ancestor
        for (let i = list.findIndex((item) => item.node.id === row.node.id) - 1; i >= 0; i -= 1) {
          if (list[i]!.depth < row.depth) {
            focusedId.value = list[i]!.node.id
            focusRowButton(list[i]!.node.id)
            break
          }
        }
      }
      break
    case 'Enter':
    case ' ':
      event.preventDefault()
      onSelect(row)
      break
    default:
      break
  }
}
</script>

<script lang="ts">
export default {
  name: 'LocalMarkdownToc',
}
</script>

<template>
  <nav class="lf-md-toc" :aria-label="t('explorer.localFiles.markdownToc')">
    <header class="lf-md-toc__head">
      <div class="lf-md-toc__brand">
        <DwIcon class="lf-md-toc__brand-icon" name="tree" size="sm" :stroke-width="1.7"/>
        <span class="lf-md-toc__title">{{ t('explorer.localFiles.markdownToc') }}</span>
        <span v-if="headingCount" class="lf-md-toc__count">{{ headingCount }}</span>
      </div>
      <button
          type="button"
          class="lf-md-toc__action"
          :class="{ 'is-on': allCollapsed }"
          :disabled="!branchIds.length"
          :title="allCollapsed
            ? t('explorer.localFiles.markdownTocExpandAll')
            : t('explorer.localFiles.markdownTocCollapseAll')"
          :aria-label="allCollapsed
            ? t('explorer.localFiles.markdownTocExpandAll')
            : t('explorer.localFiles.markdownTocCollapseAll')"
          @click="collapseAll"
      >
        <DwIcon
            :name="allCollapsed ? 'list-plus' : 'list-minus'"
            size="sm"
            :stroke-width="1.8"
        />
      </button>
    </header>

    <EmptyState
        v-if="isEmpty"
        embedded
        compact
        :title="t('explorer.localFiles.markdownTocEmpty')"
    />

    <ul
        v-else
        ref="listRef"
        class="lf-md-toc__list"
        role="tree"
        tabindex="0"
        :aria-activedescendant="focusedId || activeId || undefined"
        @keydown="onTreeKeydown"
    >
      <li
          v-for="row in rows"
          :key="row.node.id"
          :id="row.node.id"
          class="lf-md-toc__item"
          :class="{
            'is-section': row.depth === 0,
            'is-branch': row.hasChildren,
            'is-leaf': !row.hasChildren,
            'is-folded': row.hasChildren && collapsed.has(row.node.id),
          }"
          role="treeitem"
          :aria-expanded="row.hasChildren ? !collapsed.has(row.node.id) : undefined"
          :aria-level="Math.min(6, row.depth + 1)"
          :aria-selected="(focusedId || activeId) === row.node.id"
      >
        <button
            type="button"
            class="lf-md-toc__row"
            :class="[
              `is-depth-${Math.min(row.depth, 4)}`,
              {
                'is-active': activeId === row.node.id,
                'is-focused': focusedId === row.node.id,
                'is-branch': row.hasChildren,
                'is-leaf': !row.hasChildren,
              },
            ]"
            :data-toc-id="row.node.id"
            :style="{
              '--lf-toc-depth': row.depth,
              '--lf-toc-indent': `calc(${row.depth} * var(--lf-toc-step))`,
            }"
            :title="row.node.text"
            tabindex="-1"
            @click="onSelect(row)"
            @dblclick="onRowDblClick(row)"
            @focus="focusedId = row.node.id"
        >
          <!-- Nesting guide rails (one per ancestor level) -->
          <span
              v-for="g in row.depth"
              :key="g"
              class="lf-md-toc__guide"
              :style="{ '--lf-guide-i': g - 1 }"
              aria-hidden="true"
          />

          <span
              v-if="row.hasChildren"
              class="lf-md-toc__twist"
              :class="{ 'is-open': !collapsed.has(row.node.id) }"
              @click="toggleNode(row.node.id, $event)"
          >
            <DwIcon
                :name="collapsed.has(row.node.id) ? 'chevron-right' : 'chevron-down'"
                size="console"
                :stroke-width="2"
            />
          </span>
          <span v-else class="lf-md-toc__twist is-leaf" aria-hidden="true"/>

          <span class="lf-md-toc__label">{{ row.node.text }}</span>
        </button>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.lf-md-toc {
  --lf-toc-step: var(--dw-space-6);
  --lf-toc-gutter: var(--dw-icon-size-sm);
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: color-mix(in srgb, var(--dw-bg-panel) 78%, var(--dw-bg-editor));
}

.lf-md-toc__head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-space-2);
  min-height: var(--dw-density-md);
  padding: 0 var(--dw-space-4) 0 var(--dw-space-5);
  border-bottom: 1px solid color-mix(in srgb, var(--dw-border-light) 60%, transparent);
}

.lf-md-toc__brand {
  display: flex;
  align-items: center;
  gap: var(--dw-space-3);
  min-width: 0;
}

.lf-md-toc__brand-icon {
  flex-shrink: 0;
  color: var(--dw-primary);
  opacity: 0.85;
}

.lf-md-toc__title {
  font-size: var(--dw-text-sm);
  font-weight: 400;
  color: var(--dw-text);
  letter-spacing: 0.01em;
}

.lf-md-toc__count {
  flex-shrink: 0;
  min-width: var(--dw-space-8);
  padding: 0 var(--dw-space-2);
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-text) 8%, transparent);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
  font-weight: 400;
  line-height: var(--dw-space-8);
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.lf-md-toc__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dw-density-xs);
  height: var(--dw-density-xs);
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-text-muted);
  cursor: pointer;
  transition: var(--dw-transition-colors);
}

.lf-md-toc__action:hover:not(:disabled) {
  color: var(--dw-text);
  background: color-mix(in srgb, var(--dw-text) 7%, transparent);
  border-color: color-mix(in srgb, var(--dw-border-light) 80%, transparent);
}

.lf-md-toc__action.is-on {
  color: var(--dw-primary);
  background: color-mix(in srgb, var(--dw-primary) 12%, transparent);
}

.lf-md-toc__action:disabled {
  opacity: 0.4;
  cursor: default;
}

.lf-md-toc__list {
  list-style: none;
  margin: 0;
  padding: var(--dw-space-2) var(--dw-space-2) var(--dw-space-6);
  overflow: auto;
  flex: 1;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: var(--dw-scrollbar-thumb) transparent;
  outline: none;
}

.lf-md-toc__list:focus-visible {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dw-primary) 45%, transparent);
}

.lf-md-toc__item {
  margin: 0;
}

/* Top-level sections breathe a little — groups read clearer */
.lf-md-toc__item.is-section + .lf-md-toc__item.is-section,
.lf-md-toc__item.is-section:not(:first-child) {
  margin-top: var(--dw-space-2);
}

.lf-md-toc__item.is-section > .lf-md-toc__row {
  margin-top: var(--dw-space-1);
}

.lf-md-toc__row {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--dw-space-1);
  width: 100%;
  min-height: var(--dw-density-sm);
  padding: 0 var(--dw-space-4) 0 calc(var(--dw-space-2) + var(--lf-toc-indent, 0px));
  border: 0;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-snug);
  text-align: left;
  cursor: pointer;
  transition: var(--dw-transition-colors);
}

/* Active accent tracks the row indent */
.lf-md-toc__row::before {
  content: '';
  position: absolute;
  left: calc(var(--lf-toc-indent, 0px) + 1px);
  top: var(--dw-space-2);
  bottom: var(--dw-space-2);
  width: 2px;
  border-radius: 1px;
  background: transparent;
}

.lf-md-toc__row:hover {
  background: color-mix(in srgb, var(--dw-text) 5%, transparent);
  color: var(--dw-text);
}

.lf-md-toc__row.is-active {
  background: color-mix(in srgb, var(--dw-primary) 13%, transparent);
  color: var(--dw-primary);
  font-weight: 400;
}

.lf-md-toc__row.is-active::before {
  background: var(--dw-primary);
}

.lf-md-toc__row.is-focused:not(.is-active) {
  background: color-mix(in srgb, var(--dw-text) 6%, transparent);
}

.lf-md-toc__row.is-depth-0 {
  min-height: var(--dw-density-md);
  font-weight: 400;
  font-size: var(--dw-text-md);
  color: var(--dw-text);
}

.lf-md-toc__row.is-depth-0.is-active {
  color: var(--dw-primary);
}

.lf-md-toc__row.is-depth-0.is-branch:not(.is-active) {
  color: var(--dw-text);
}

.lf-md-toc__row.is-depth-2,
.lf-md-toc__row.is-depth-3,
.lf-md-toc__row.is-depth-4 {
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
}

.lf-md-toc__row.is-depth-2.is-active,
.lf-md-toc__row.is-depth-3.is-active,
.lf-md-toc__row.is-depth-4.is-active {
  color: var(--dw-primary);
}

/* Vertical nest guides — aligned under ancestor twist columns */
.lf-md-toc__guide {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--dw-space-2) + (var(--lf-guide-i) * var(--lf-toc-step)) + var(--dw-space-4));
  width: 1px;
  background: color-mix(in srgb, var(--dw-border) 45%, transparent);
  pointer-events: none;
  opacity: 0.7;
}

.lf-md-toc__twist {
  position: relative;
  z-index: 1;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: var(--lf-toc-gutter);
  height: var(--lf-toc-gutter);
  margin-left: -1px;
  border-radius: var(--dw-control-radius-sm);
  color: color-mix(in srgb, var(--dw-text-muted) 55%, transparent);
  opacity: 0.85;
}

.lf-md-toc__twist:not(.is-leaf):hover {
  background: color-mix(in srgb, var(--dw-text) 8%, transparent);
  color: var(--dw-text-secondary);
  opacity: 1;
}

.lf-md-toc__twist.is-open {
  color: color-mix(in srgb, var(--dw-text-muted) 70%, transparent);
}

.lf-md-toc__row:hover .lf-md-toc__twist:not(.is-leaf) {
  opacity: 1;
}

.lf-md-toc__twist.is-leaf {
  pointer-events: none;
  opacity: 1;
}

/* Leaf: quiet tick, not a competing bullet */
.lf-md-toc__twist.is-leaf::after {
  content: '';
  width: var(--dw-space-2);
  height: 1px;
  border-radius: 1px;
  background: color-mix(in srgb, var(--dw-text-muted) 28%, transparent);
}

.lf-md-toc__label {
  position: relative;
  z-index: 1;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: var(--dw-space-1);
}

</style>
