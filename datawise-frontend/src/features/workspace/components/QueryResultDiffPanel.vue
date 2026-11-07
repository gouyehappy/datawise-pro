<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, StatusPill} from '@/core/components'
import type {QueryResultDiffView} from '@/features/workspace/services/query-result-diff.service'

const props = defineProps<{
    diff: QueryResultDiffView
}>()

const emit = defineEmits<{
    exit: []
}>()

const {t} = useI18n()

const hasChanges = computed(() =>
    props.diff.summary.modifiedRows > 0
    || props.diff.summary.addedRows > 0
    || props.diff.summary.removedRows > 0,
)

function rowStatusLabel(status: string) {
    const key = `queryResult.diff.rowStatus.${status}`
    const label = t(key)
    return label === key ? status : label
}

function cellClass(status: string) {
    return `diff-cell diff-cell--${status}`
}
</script>

<template>
  <div class="result-diff">
    <header class="result-diff__head">
      <div>
        <h3>{{ t('queryResult.diffTitle') }}</h3>
        <p class="result-diff__meta">
          {{ t('queryResult.diffMeta', { baseline: diff.baselineLabel, current: diff.currentLabel }) }}
        </p>
        <p v-if="!hasChanges" class="result-diff__same">{{ t('queryResult.diffIdentical') }}</p>
        <div v-else class="result-diff__summary">
          <StatusPill v-if="diff.summary.modifiedRows" chip status="changed" domain="schema">
            {{ t('queryResult.diffSummary.modified', {count: diff.summary.modifiedRows}) }}
          </StatusPill>
          <StatusPill v-if="diff.summary.addedRows" chip status="added" domain="schema">
            {{ t('queryResult.diffSummary.added', {count: diff.summary.addedRows}) }}
          </StatusPill>
          <StatusPill v-if="diff.summary.removedRows" chip status="removed" domain="schema">
            {{ t('queryResult.diffSummary.removed', {count: diff.summary.removedRows}) }}
          </StatusPill>
          <span class="result-diff__cells">
            {{ t('queryResult.diffSummary.cells', {count: diff.summary.changedCells}) }}
          </span>
        </div>
      </div>
      <DwButton variant="secondary" size="sm" @click="emit('exit')">
        {{ t('queryResult.diffExit') }}
      </DwButton>
    </header>

    <div class="result-diff__legend">
      <span class="legend-item legend-item--modified">{{ t('queryResult.diffLegend.modified') }}</span>
      <span class="legend-item legend-item--added">{{ t('queryResult.diffLegend.added') }}</span>
      <span class="legend-item legend-item--removed">{{ t('queryResult.diffLegend.removed') }}</span>
    </div>

    <div class="result-diff__table-wrap">
      <table class="result-diff__table">
        <thead>
        <tr>
          <th>#</th>
          <th>{{ t('queryResult.diffRowStatus') }}</th>
          <th v-for="column in diff.columns" :key="column.name">{{ column.name }}</th>
        </tr>
        </thead>
        <tbody>
        <tr v-for="(row, index) in diff.rows" :key="row.id" :class="`diff-row diff-row--${row.rowStatus}`">
          <td class="index-col">{{ index + 1 }}</td>
          <td class="status-col">
            <StatusPill inline :status="row.rowStatus" domain="schema">{{ rowStatusLabel(row.rowStatus) }}</StatusPill>
          </td>
          <td
              v-for="column in diff.columns"
              :key="column.name"
              :class="cellClass(row.cells[column.name]?.status ?? 'unchanged')"
              :title="row.cells[column.name]?.previous
                  ? t('queryResult.diffPreviousValue', { value: row.cells[column.name]?.previous })
                  : undefined"
          >
            <span class="diff-cell__value">{{ row.cells[column.name]?.display ?? '—' }}</span>
            <span
                v-if="row.cells[column.name]?.status === 'modified' && row.cells[column.name]?.previous"
                class="diff-cell__previous"
            >
              {{ row.cells[column.name]?.previous }}
            </span>
          </td>
        </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.result-diff {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--dw-bg-editor);
}

.result-diff__head {
  display: flex;
  justify-content: space-between;
  gap: var(--dw-space-6);
  padding: var(--dw-space-6) var(--dw-space-8) var(--dw-space-4);
  border-bottom: 1px solid var(--dw-border-light);
}

.result-diff__head h3 {
  margin: 0 0 var(--dw-space-2);
  font-size: var(--dw-text-xl);
}

.result-diff__meta {
  margin: 0 0 var(--dw-space-4);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
}

.result-diff__same {
  margin: 0;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
}

.result-diff__summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-gap);
}

.result-diff__cells {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.result-diff__legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-space-6);
  padding: var(--dw-space-4) var(--dw-space-8);
  border-bottom: 1px solid var(--dw-border-light);
  font-size: var(--dw-text-xs);
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-sm);
}

.legend-item::before {
  content: '';
  width: var(--dw-icon-size-xs);
  height: var(--dw-icon-size-xs);
  border-radius: var(--dw-control-radius-sm);
  border: 1px solid var(--dw-border-light);
}

.legend-item--modified::before {
  background: color-mix(in srgb, var(--dw-warning) 18%, var(--dw-bg-panel));
}

.legend-item--added::before {
  background: color-mix(in srgb, var(--dw-success) 16%, var(--dw-bg-panel));
}

.legend-item--removed::before {
  background: color-mix(in srgb, var(--dw-danger) 14%, var(--dw-bg-panel));
}

.result-diff__table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.result-diff__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--dw-text-sm);
}

.result-diff__table th,
.result-diff__table td {
  padding: var(--dw-pad-control);
  border-bottom: 1px solid var(--dw-border-light);
  text-align: left;
  vertical-align: top;
}

.result-diff__table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--dw-bg-panel);
  font-weight: 600;
}

.index-col {
  width: 48px;
  color: var(--dw-text-muted);
}

.status-col {
  width: 88px;
}

.diff-cell__value {
  display: block;
  word-break: break-word;
  font-family: var(--dw-mono);
}

.diff-cell__previous {
  display: block;
  margin-top: var(--dw-space-2);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  text-decoration: line-through;
  font-family: var(--dw-mono);
}

.diff-cell--modified {
  background: color-mix(in srgb, var(--dw-warning) 12%, transparent);
}

.diff-cell--added {
  background: color-mix(in srgb, var(--dw-success) 10%, transparent);
}

.diff-cell--removed,
.diff-row--removed .diff-cell--removed {
  background: color-mix(in srgb, var(--dw-danger) 10%, transparent);
}

.diff-row--added td:not(.index-col):not(.status-col) {
  background: color-mix(in srgb, var(--dw-success) 6%, transparent);
}

.diff-row--removed td:not(.index-col):not(.status-col) {
  background: color-mix(in srgb, var(--dw-danger) 6%, transparent);
}
</style>
