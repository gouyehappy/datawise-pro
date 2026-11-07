<script setup lang="ts">
import {useI18n} from 'vue-i18n'

defineProps<{
  columns: string[]
  rows: Array<Record<string, string | number>>
}>()

const {t, te} = useI18n()

function columnLabel(key: string): string {
  const i18nKey = `queryResult.explainColumn.${key}`
  return te(i18nKey) ? t(i18nKey) : key
}

function cellValue(value: string | number | undefined): string {
  if (value == null || value === '') return '—'
  return String(value)
}
</script>

<template>
  <div class="explain-plan-table-wrap">
    <table class="explain-plan-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column" scope="col">
            {{ columnLabel(column) }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, rowIndex) in rows" :key="rowIndex">
          <td v-for="column in columns" :key="column">
            {{ cellValue(row[column]) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.explain-plan-table-wrap {
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-panel);
}

.explain-plan-table {
  width: 100%;
  min-width: 640px;
  border-collapse: collapse;
  font-size: var(--dw-text-sm);
}

.explain-plan-table th,
.explain-plan-table td {
  padding: var(--dw-pad-control);
  border-bottom: 1px solid var(--dw-border-light);
  text-align: left;
  vertical-align: top;
}

.explain-plan-table thead th {
  background: color-mix(in srgb, var(--dw-bg-muted) 88%, var(--dw-bg-panel));
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.explain-plan-table tbody tr:last-child td {
  border-bottom: none;
}

.explain-plan-table tbody tr:hover {
  background: color-mix(in srgb, var(--dw-text) 4%, transparent);
}

.explain-plan-table td {
  font-family: var(--dw-font-mono);
  color: var(--dw-text-secondary);
  line-height: var(--dw-leading);
  word-break: break-word;
}

.explain-plan-table td:first-child,
.explain-plan-table th:first-child {
  padding-left: var(--dw-space-6);
}

.explain-plan-table td:last-child,
.explain-plan-table th:last-child {
  padding-right: var(--dw-space-6);
}
</style>
