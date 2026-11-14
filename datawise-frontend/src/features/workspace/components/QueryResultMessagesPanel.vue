<script setup lang="ts">
/**
 * Messages tab body for QueryResultPane (C7 extract).
 */
import {DwIcon} from '@/core/icons'
import {EmptyState} from '@/core/components'
import {useI18n} from 'vue-i18n'
import {formatDurationMs} from '@/features/workspace/services/sql-stats.service'

export interface QueryResultMessageEntry {
  key: string
  resultIndex: number
  statementNo: number
  sql: string
  status: 'success' | 'error'
  durationMs: number
  total: number
  executedAtMs?: number
  errorMessage?: string
}

const props = defineProps<{
  entries: QueryResultMessageEntry[]
  running?: boolean
  runningElapsedMs?: number
  activeResultIndex?: number
  isSlowDuration: (durationMs: number) => boolean
  formatTimestamp: (ms?: number) => string
  formatMeta: (entry: QueryResultMessageEntry) => string
}>()

const emit = defineEmits<{
  select: [resultIndex: number]
}>()

const {t} = useI18n()
</script>

<template>
  <div class="messages-tab">
    <div class="messages-tab__sub">
      {{ t('queryResult.messagesAll', {count: entries.length}) }}
    </div>
    <div class="messages-log">
      <p v-if="running && !entries.length" class="messages-running">
        <span class="messages-running__spinner" aria-hidden="true"/>
        {{
          runningElapsedMs != null && runningElapsedMs > 0
            ? t('queryResult.messagesRunningElapsed', {duration: formatDurationMs(runningElapsedMs)})
            : t('queryResult.messagesRunning')
        }}
      </p>
      <EmptyState
          v-else-if="!entries.length"
          embedded
          compact
          :title="t('queryResult.messagesEmpty')"
      >
        <template #icon>
          <DwIcon name="info" size="md" :stroke-width="1.5"/>
        </template>
      </EmptyState>
      <button
          v-for="entry in entries"
          :key="entry.key"
          type="button"
          class="messages-entry"
          :class="{
            'is-active': activeResultIndex === entry.resultIndex,
            'is-error': entry.status === 'error',
          }"
          @click="emit('select', entry.resultIndex)"
      >
        <div class="messages-entry__head">
          <span v-if="formatTimestamp(entry.executedAtMs)" class="messages-entry__time">
            [{{ formatTimestamp(entry.executedAtMs) }}]
          </span>
          <span class="messages-entry__stmt">
            {{ t('queryResult.messageStatement', {n: entry.statementNo}) }}
          </span>
          <span
              class="messages-entry__badge"
              :class="entry.status === 'error' ? 'is-error' : 'is-ok'"
          >
            {{
              entry.status === 'error'
                ? t('queryResult.outputStatusFailed')
                : t('queryResult.outputStatusOk')
            }}
          </span>
        </div>
        <pre class="messages-entry__sql">{{ entry.sql || '—' }}</pre>
        <pre
            v-if="entry.status === 'error' && entry.errorMessage"
            class="messages-entry__error"
        >{{ entry.errorMessage }}</pre>
        <p
            class="messages-entry__meta"
            :class="{ 'query-duration--slow': isSlowDuration(entry.durationMs) }"
        >
          {{ formatMeta(entry) }}
        </p>
      </button>
    </div>
  </div>
</template>
