<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwCheckbox} from '@/core/components'
import {columnRowKey} from '@/core/utils/query-result-column'
import type {TableColumn} from '@/core/types'

const props = defineProps<{
  open: boolean
  columns: TableColumn[]
  hiddenColumns: string[]
  pinnedColumns: string[]
  pinnedRightColumns: string[]
}>()

const emit = defineEmits<{
  close: []
  toggleHidden: [columnKey: string, hidden: boolean]
  togglePinLeft: [columnKey: string]
  togglePinRight: [columnKey: string]
  showAll: []
}>()

const {t} = useI18n()
const query = ref('')

watch(
    () => props.open,
    (open) => {
      if (open) query.value = ''
    },
)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.columns
  return props.columns.filter((col) => col.name.toLowerCase().includes(q))
})

function isHidden(column: TableColumn) {
  return props.hiddenColumns.includes(columnRowKey(column))
}

function isPinnedLeft(column: TableColumn) {
  return props.pinnedColumns.includes(columnRowKey(column))
}

function isPinnedRight(column: TableColumn) {
  return props.pinnedRightColumns.includes(columnRowKey(column))
}
</script>

<template>
  <div v-if="open" class="grid-col-panel" role="dialog" :aria-label="t('dataGrid.columnPanel.title')">
    <header class="grid-col-panel__head">
      <strong>{{ t('dataGrid.columnPanel.title') }}</strong>
      <button type="button" class="grid-col-panel__close" @click="emit('close')">×</button>
    </header>
    <input
        v-model="query"
        class="grid-col-panel__search"
        type="search"
        :placeholder="t('dataGrid.columnPanel.search')"
    />
    <div class="grid-col-panel__actions">
      <button type="button" @click="emit('showAll')">{{ t('dataGrid.columnPanel.showAll') }}</button>
    </div>
    <ul class="grid-col-panel__list">
      <li v-for="col in filtered" :key="columnRowKey(col)" class="grid-col-panel__item">
        <DwCheckbox
            class="grid-col-panel__check"
            :model-value="!isHidden(col)"
            @update:model-value="emit('toggleHidden', columnRowKey(col), !$event)"
        >
          {{ col.name }}
        </DwCheckbox>
        <div class="grid-col-panel__pins">
          <button
              type="button"
              :class="{ 'is-active': isPinnedLeft(col) }"
              :title="t('dataGrid.contextMenu.pinColumn')"
              @click="emit('togglePinLeft', columnRowKey(col))"
          >L</button>
          <button
              type="button"
              :class="{ 'is-active': isPinnedRight(col) }"
              :title="t('dataGrid.contextMenu.pinColumnRight')"
              @click="emit('togglePinRight', columnRowKey(col))"
          >R</button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.grid-col-panel {
  position: absolute;
  top: 40px;
  right: 12px;
  z-index: var(--dw-z-popover, 40);
  display: flex;
  flex-direction: column;
  width: 280px;
  max-height: min(420px, 70vh);
  overflow: hidden;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-panel);
  box-shadow: var(--dw-shadow-float);
}
.grid-col-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--dw-border);
}
.grid-col-panel__close {
  border: none;
  background: transparent;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xl);
  cursor: pointer;
}
.grid-col-panel__search {
  margin: 8px 10px 0;
  height: var(--dw-control-h-sm);
  padding: 0 8px;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-editor);
  color: var(--dw-text);
}
.grid-col-panel__actions {
  padding: 6px 10px;
}
.grid-col-panel__actions button {
  border: none;
  background: transparent;
  color: var(--dw-info-fg);
  cursor: pointer;
  font: inherit;
  font-size: var(--dw-text-sm);
}
.grid-col-panel__list {
  margin: 0;
  padding: 0 0 8px;
  list-style: none;
  overflow: auto;
}
.grid-col-panel__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 10px;
}
.grid-col-panel__check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: var(--dw-text-sm);
}
.grid-col-panel__check span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.grid-col-panel__pins {
  display: inline-flex;
  gap: 4px;
}
.grid-col-panel__pins button {
  width: var(--dw-control-h-xs);
  height: var(--dw-control-h-xs);
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-muted);
  color: var(--dw-text-muted);
  cursor: pointer;
  font-size: var(--dw-text-2xs);
}
.grid-col-panel__pins button.is-active {
  border-color: color-mix(in srgb, var(--dw-grid-accent) 45%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-grid-accent) 14%, var(--dw-bg-panel));
  color: var(--dw-grid-accent);
}
</style>
