<script setup lang="ts">
/**
 * Batch overview block for QueryResultPane (C7 extract).
 */
import type {QueryResultBatchEntry} from '@/features/workspace/types'
import {useI18n} from 'vue-i18n'

defineProps<{
  entries: QueryResultBatchEntry[]
  batchRunning?: boolean
  status?: 'success' | 'error'
  errorMessage?: string
  errorLine?: number
  stats: {
    count: number
    totalRows: number
    totalDuration: number
    total: number
  }
  isSlowDuration: (durationMs: number) => boolean
}>()

const emit = defineEmits<{
  'jump-error-line': [line: number]
}>()

const {t} = useI18n()
</script>

<template>
  <div class="overview batch-summary">
    <p v-if="batchRunning" class="batch-running">
      <span class="batch-running__spinner" aria-hidden="true"/>
      {{
        t('queryResult.batchSummaryRunning', {
          current: stats.count,
          total: stats.total,
        })
      }}
    </p>
    <p v-if="status === 'error' && !batchRunning" class="error-title">
      {{ t('queryResult.errorTitle') }}
    </p>
    <p
        v-if="status === 'error' && !batchRunning && errorMessage"
        class="error-message"
    >
      {{ errorMessage }}
    </p>
    <div
        v-if="status === 'error' && !batchRunning && errorLine"
        class="error-actions"
    >
      <button
          type="button"
          class="error-jump"
          @click="emit('jump-error-line', errorLine)"
      >
        {{ t('queryResult.jumpToLine', {line: errorLine}) }}
      </button>
    </div>
    <p v-if="stats.count > 0" class="overview-head">
      {{
        t('queryResult.overviewSummaryPrefix', {
          count: stats.count,
          rows: stats.totalRows,
        })
      }}
      <span
          class="query-duration"
          :class="{ 'query-duration--slow': isSlowDuration(stats.totalDuration) }"
      >{{ stats.totalDuration }}ms</span>{{ t('queryResult.overviewDurationSuffix') }}
    </p>
    <p v-else-if="batchRunning" class="overview-empty">
      {{ t('queryResult.batchSummaryWaiting') }}
    </p>
    <ul v-if="stats.count > 0" class="overview-list">
      <li v-for="(entry, index) in entries" :key="index">
        <div class="overview-item overview-item--static">
          <span
              class="overview-ok"
              :class="{ 'overview-err': entry.status === 'error' }"
              aria-hidden="true"
          >{{ entry.status === 'error' ? '✕' : '✓' }}</span>
          <span class="overview-meta">
            {{
              t('queryResult.overviewItemPrefix', {
                label: entry.label,
                rows: entry.total,
              })
            }}
            <span
                class="query-duration"
                :class="{ 'query-duration--slow': isSlowDuration(entry.durationMs) }"
            >{{ entry.durationMs }}ms</span>
          </span>
          <span class="overview-sql">{{ entry.sql }}</span>
        </div>
        <pre v-if="entry.status === 'error' && entry.errorMessage" class="batch-entry-error">{{
            entry.errorMessage
          }}</pre>
      </li>
    </ul>
  </div>
</template>
