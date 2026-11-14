<script setup lang="ts">
import {computed} from 'vue'
import {useDwI18n} from '@datawise/ui'
import {
  useResizableColumns,
  type ResizableColumnDef,
} from '../composables/useResizableColumns'

export type {ResizableColumnDef}

const props = withDefaults(
  defineProps<{
    columns: ResizableColumnDef[]
    storageKey?: string
    tableClass?: string
  }>(),
  {tableClass: ''},
)

const t = useDwI18n()
const {widths, startResize} = useResizableColumns(props.columns, props.storageKey)

const tableMinWidth = computed(() =>
  props.columns.reduce(
    (sum, column, index) => sum + (widths.value[index] ?? column.defaultWidth),
    0,
  ),
)
</script>

<template>
  <div class="resizable-table-wrap">
    <table
        class="resizable-table"
        :class="tableClass"
        :style="{ minWidth: `${tableMinWidth}px` }"
    >
      <colgroup>
        <col
            v-for="(column, index) in columns"
            :key="column.key"
            :style="{ width: `${widths[index]}px` }"
        />
      </colgroup>
      <thead>
        <tr>
          <th
              v-for="(column, index) in columns"
              :key="column.key"
              :data-col="column.key"
          >
            <span class="resizable-table__label">{{ column.label }}</span>
            <span
                class="resizable-table__resize"
                :title="t('common.resizeColumn')"
                @pointerdown="startResize(index, $event)"
            />
          </th>
        </tr>
      </thead>
      <tbody>
        <slot/>
      </tbody>
    </table>
  </div>
</template>

<style>
/* Keep class names stable for host CSS overrides (e.g. migration-panel). */
.resizable-table-wrap {
  overflow: auto;
  min-width: 0;
  border: 1px solid var(--dw-panel-outline, var(--dw-border-light));
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg);
}

.resizable-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: var(--dw-text-xs);
}

.resizable-table th,
.resizable-table td {
  padding: var(--dw-space-3) var(--dw-space-5);
  border-bottom: 1px solid var(--dw-panel-outline, var(--dw-border-light));
  text-align: left;
  vertical-align: top;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resizable-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  font-weight: 600;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-secondary);
  background: color-mix(in srgb, var(--dw-bg-panel) 88%, var(--dw-bg));
  user-select: none;
}

.resizable-table tbody tr:last-child td {
  border-bottom: none;
}

.resizable-table__label {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: var(--dw-space-3);
}

.resizable-table__resize {
  position: absolute;
  top: 0;
  right: 0;
  width: 8px;
  height: 100%;
  cursor: col-resize;
  touch-action: none;
}

.resizable-table__resize::after {
  content: '';
  position: absolute;
  top: 20%;
  bottom: 20%;
  right: 3px;
  width: 1px;
  border-radius: var(--dw-radius-xs);
  background: transparent;
  transition: background var(--dw-duration) var(--dw-ease) ease;
}

.resizable-table th:hover .resizable-table__resize::after,
.resizable-table__resize:active::after {
  background: color-mix(in srgb, var(--dw-primary) 55%, var(--dw-border));
}

.resizable-table th {
  position: relative;
}

.resizable-table td.is-wrap {
  white-space: normal;
  word-break: break-word;
}
</style>
