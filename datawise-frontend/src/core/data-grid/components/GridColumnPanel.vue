<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import {usePopoverEscape} from '@/core/composables/usePopoverEscape'
import {columnRowKey} from '@/core/utils/query-result-column'
import type {TableColumn} from '@/core/types'

const props = defineProps<{
  open: boolean
  columns: TableColumn[]
  hiddenColumns: string[]
  columnOrder?: string[]
  anchorEl?: HTMLElement | null
}>()

const emit = defineEmits<{
  close: []
  toggleHidden: [columnKey: string, hidden: boolean]
  reorder: [fromKey: string, toKey: string]
  showAll: []
  invert: []
  resetOrder: []
  autoFitWidths: []
  clearWidths: []
  applySelected: []
}>()

const {t} = useI18n()
const query = ref('')
const panelRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})
const dragFromKey = ref<string | null>(null)
const dragOverKey = ref<string | null>(null)

usePopoverEscape(
    () => props.open,
    () => emit('close'),
    {containRefs: () => [panelRef.value, props.anchorEl ?? null]},
)

watch(
    () => [props.open, props.anchorEl] as const,
    async ([open]) => {
      if (!open) {
        query.value = ''
        dragFromKey.value = null
        dragOverKey.value = null
        return
      }
      await placePanel()
    },
)

async function placePanel() {
  await nextTick()
  const anchor = props.anchorEl
  const panel = panelRef.value
  if (!anchor || !panel) {
    panelStyle.value = {}
    return
  }
  const rect = anchor.getBoundingClientRect()
  const width = Math.max(300, panel.offsetWidth || 300)
  const height = panel.offsetHeight || 420
  let left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8)
  let top = rect.bottom + 6
  if (top + height > window.innerHeight - 8) {
    top = Math.max(8, rect.top - height - 6)
  }
  panelStyle.value = {
    position: 'fixed',
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    right: 'auto',
  }
}

const orderedColumns = computed(() => {
  const order = props.columnOrder ?? []
  if (!order.length) return props.columns
  const byKey = new Map(props.columns.map((col) => [columnRowKey(col), col]))
  const ordered: TableColumn[] = []
  const used = new Set<string>()
  for (const key of order) {
    const col = byKey.get(key)
    if (!col || used.has(key)) continue
    ordered.push(col)
    used.add(key)
  }
  for (const col of props.columns) {
    const key = columnRowKey(col)
    if (used.has(key)) continue
    ordered.push(col)
  }
  return ordered
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return orderedColumns.value
  return orderedColumns.value.filter((col) => col.name.toLowerCase().includes(q))
})

const visibleCount = computed(() =>
    props.columns.filter((col) => !props.hiddenColumns.includes(columnRowKey(col))).length,
)

function isHidden(column: TableColumn) {
  return props.hiddenColumns.includes(columnRowKey(column))
}

function onDragStart(column: TableColumn, event: DragEvent) {
  const key = columnRowKey(column)
  dragFromKey.value = key
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', key)
  }
}

function onDragOver(column: TableColumn, event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dragOverKey.value = columnRowKey(column)
}

function onDrop(column: TableColumn, event: DragEvent) {
  event.preventDefault()
  const fromKey = dragFromKey.value || event.dataTransfer?.getData('text/plain')
  const toKey = columnRowKey(column)
  if (fromKey && toKey && fromKey !== toKey) {
    emit('reorder', fromKey, toKey)
  }
  dragFromKey.value = null
  dragOverKey.value = null
}

function onDragEnd() {
  dragFromKey.value = null
  dragOverKey.value = null
}
</script>

<template>
  <Teleport to="body">
    <div
        v-if="open"
        ref="panelRef"
        class="grid-col-panel"
        role="dialog"
        :aria-label="t('dataGrid.columnPanel.title')"
        :style="panelStyle"
    >
      <header class="grid-col-panel__head">
        <strong>{{ t('dataGrid.columnPanel.title') }}</strong>
        <span class="grid-col-panel__count">{{ visibleCount }}/{{ columns.length }}</span>
      </header>

      <div class="grid-col-panel__search-wrap">
        <DwIcon class="grid-col-panel__search-icon" name="search" size="sm" :stroke-width="2"/>
        <input
            v-model="query"
            class="grid-col-panel__search"
            type="search"
            :placeholder="t('dataGrid.columnPanel.search')"
        />
      </div>

      <ul class="grid-col-panel__list">
        <li
            v-for="col in filtered"
            :key="columnRowKey(col)"
            class="grid-col-panel__item"
            :class="{
              'is-hidden': isHidden(col),
              'is-drag-over': dragOverKey === columnRowKey(col),
            }"
            @dragover="onDragOver(col, $event)"
            @drop="onDrop(col, $event)"
        >
          <button
              type="button"
              class="grid-col-panel__drag"
              draggable="true"
              :title="t('dataGrid.columnPanel.drag')"
              :aria-label="t('dataGrid.columnPanel.drag')"
              @dragstart="onDragStart(col, $event)"
              @dragend="onDragEnd"
          >
            <DwIcon name="grip-vertical" size="sm" :stroke-width="2"/>
          </button>
          <button
              type="button"
              class="grid-col-panel__toggle"
              :class="{ 'is-on': !isHidden(col) }"
              :aria-pressed="!isHidden(col)"
              :title="isHidden(col) ? t('dataGrid.columnPanel.showColumn') : t('dataGrid.columnPanel.hideColumn')"
              @click="emit('toggleHidden', columnRowKey(col), !isHidden(col))"
          >
            <DwIcon
                :name="isHidden(col) ? 'visibility-off' : 'check-circle'"
                size="sm"
                :stroke-width="2"
            />
          </button>
          <button
              type="button"
              class="grid-col-panel__name"
              :title="col.name"
              @click="emit('toggleHidden', columnRowKey(col), !isHidden(col))"
          >
            {{ col.name }}
          </button>
        </li>
        <li v-if="!filtered.length" class="grid-col-panel__empty">
          {{ t('dataGrid.columnPanel.noMatches') }}
        </li>
      </ul>

      <div class="grid-col-panel__width-row" role="group" :aria-label="t('dataGrid.columnPanel.widthGroup')">
        <span class="grid-col-panel__width-label">{{ t('dataGrid.columnPanel.widthGroup') }}</span>
        <button type="button" class="grid-col-panel__link" @click="emit('autoFitWidths')">
          {{ t('dataGrid.columnPanel.autoFitWidths') }}
        </button>
        <button type="button" class="grid-col-panel__link" @click="emit('clearWidths')">
          {{ t('dataGrid.columnPanel.clearWidths') }}
        </button>
      </div>

      <p class="grid-col-panel__hint">{{ t('dataGrid.columnPanel.hint') }}</p>

      <footer class="grid-col-panel__footer">
        <button type="button" class="grid-col-panel__action" @click="emit('invert')">
          {{ t('dataGrid.columnPanel.invert') }}
        </button>
        <button type="button" class="grid-col-panel__action" @click="emit('resetOrder')">
          {{ t('dataGrid.columnPanel.resetOrder') }}
        </button>
        <button type="button" class="grid-col-panel__action" @click="emit('showAll')">
          {{ t('dataGrid.columnPanel.showAll') }}
        </button>
        <button type="button" class="grid-col-panel__action grid-col-panel__action--accent" @click="emit('applySelected')">
          {{ t('dataGrid.columnPanel.showSelected') }}
        </button>
      </footer>
    </div>
  </Teleport>
</template>

<style scoped>
.grid-col-panel {
  position: absolute;
  top: 40px;
  right: 12px;
  z-index: var(--dw-z-popover, 40);
  display: flex;
  flex-direction: column;
  width: 300px;
  max-height: min(480px, 75vh);
  overflow: hidden;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-panel);
  box-shadow: var(--dw-shadow-float);
  color: var(--dw-text);
}

.grid-col-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--dw-border);
}

.grid-col-panel__head strong {
  font-size: var(--dw-text-sm);
  font-weight: 600;
}

.grid-col-panel__count {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  font-variant-numeric: tabular-nums;
}

.grid-col-panel__search-wrap {
  position: relative;
  margin: 8px 10px 0;
}

.grid-col-panel__search-icon {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--dw-text-muted);
  pointer-events: none;
}

.grid-col-panel__search {
  width: 100%;
  height: var(--dw-control-h-sm);
  padding: 0 8px 0 28px;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-editor);
  color: var(--dw-text);
  font: inherit;
  font-size: var(--dw-text-sm);
}

.grid-col-panel__list {
  margin: 6px 0 0;
  padding: 0 0 4px;
  list-style: none;
  overflow: auto;
  flex: 1 1 auto;
  min-height: 120px;
}

.grid-col-panel__item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  min-height: 28px;
}

.grid-col-panel__item.is-drag-over {
  background: color-mix(in srgb, var(--dw-primary) 14%, transparent);
}

.grid-col-panel__item.is-hidden .grid-col-panel__name {
  color: var(--dw-text-muted);
}

.grid-col-panel__drag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--dw-text-muted);
  cursor: grab;
  flex-shrink: 0;
  padding: 0;
}

.grid-col-panel__drag:active {
  cursor: grabbing;
}

.grid-col-panel__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--dw-text-muted);
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
}

.grid-col-panel__toggle.is-on {
  color: var(--dw-link, #60a5fa);
}

.grid-col-panel__name {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-size: var(--dw-text-sm);
  padding: 2px 4px;
  border-radius: var(--dw-control-radius-sm);
}

.grid-col-panel__name:hover {
  background: color-mix(in srgb, var(--dw-text) 6%, transparent);
}

.grid-col-panel__empty {
  padding: 16px 12px;
  text-align: center;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
}

.grid-col-panel__width-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 4px;
  border-top: 1px solid var(--dw-border);
  flex-wrap: wrap;
}

.grid-col-panel__width-label {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  margin-right: auto;
}

.grid-col-panel__link {
  border: none;
  background: transparent;
  color: var(--dw-text);
  cursor: pointer;
  font: inherit;
  font-size: var(--dw-text-xs);
  opacity: 0.78;
  padding: 0;
}

.grid-col-panel__link:hover {
  opacity: 1;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.grid-col-panel__hint {
  margin: 0;
  padding: 4px 12px 8px;
  font-size: var(--dw-text-2xs, 11px);
  color: var(--dw-text-muted);
  line-height: 1.4;
}

.grid-col-panel__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px 10px 10px;
  border-top: 1px solid var(--dw-border);
}

.grid-col-panel__action {
  flex: 1 1 auto;
  min-width: 0;
  height: var(--dw-control-h-sm);
  padding: 0 8px;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius-sm);
  background: color-mix(in srgb, var(--dw-text) 4%, var(--dw-bg-panel));
  color: var(--dw-text);
  cursor: pointer;
  font: inherit;
  font-size: var(--dw-text-xs);
  white-space: nowrap;
}

.grid-col-panel__action:hover {
  background: color-mix(in srgb, var(--dw-text) 9%, var(--dw-bg-panel));
  border-color: color-mix(in srgb, var(--dw-text) 18%, var(--dw-border));
}

.grid-col-panel__action--accent {
  border-color: color-mix(in srgb, var(--dw-text) 28%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-text) 14%, var(--dw-bg-panel));
  color: var(--dw-text);
  font-weight: 600;
}

.grid-col-panel__action--accent:hover {
  background: color-mix(in srgb, var(--dw-text) 20%, var(--dw-bg-panel));
  border-color: color-mix(in srgb, var(--dw-text) 36%, var(--dw-border));
}
</style>
