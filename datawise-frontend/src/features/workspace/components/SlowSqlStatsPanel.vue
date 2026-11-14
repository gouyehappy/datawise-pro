<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {EmptyState, StatusPill} from '@/core/components'
import {workspacePanelApi} from '@/api'
import {
    formatDurationMs,
    truncateSql,
    type SqlExecutionStats,
} from '@/features/workspace/services/sql-stats.service'
import {DEFAULT_SLOW_QUERY_THRESHOLD_MS} from '@/features/workspace/services/slow-query.utils'

const props = withDefaults(defineProps<{
  connectionId?: string
  days?: number
  limit?: number
  slowThresholdMs?: number
  embedded?: boolean
}>(), {
  days: 7,
  limit: 8,
  slowThresholdMs: DEFAULT_SLOW_QUERY_THRESHOLD_MS,
  embedded: false,
})

const emit = defineEmits<{
  openSql: [sql: string]
}>()

const {t} = useI18n()
const loading = ref(false)
const stats = ref<SqlExecutionStats | null>(null)

const i18nPrefix = computed(() => props.embedded ? 'shortcut.slowSql' : 'dashboard.slowSql')

const trendMax = computed(() =>
    Math.max(...(stats.value?.trend.map((point) => point.maxDurationMs) ?? [0]), 1),
)

async function loadStats() {
  loading.value = true
  try {
    stats.value = await workspacePanelApi.fetchSqlStats({
      connectionId: props.connectionId,
      days: props.days,
      limit: props.limit,
      slowThresholdMs: props.slowThresholdMs,
    })
  } catch {
    stats.value = null
  } finally {
    loading.value = false
  }
}

function openEntry(sql: string) {
  emit('openSql', sql)
}

onMounted(() => {
  void loadStats()
})
</script>

<template>
  <section class="slow-sql-panel" :class="{ 'slow-sql-panel--embedded': embedded }">
    <header class="slow-sql-panel__head">
      <div>
        <h2 class="slow-sql-panel__title">{{ t(`${i18nPrefix}.title`) }}</h2>
        <p class="slow-sql-panel__hint">
          {{ t(`${i18nPrefix}.subtitle`, {days: props.days, threshold: props.slowThresholdMs}) }}
        </p>
      </div>
      <button class="dw-text-btn" type="button" :disabled="loading" @click="loadStats">
        {{ loading ? t(`${i18nPrefix}.loading`) : t(`${i18nPrefix}.refresh`) }}
      </button>
    </header>

    <EmptyState v-if="loading && !stats" embedded bordered :title="t(`${i18nPrefix}.loading`)"/>
    <EmptyState v-else-if="!stats" embedded bordered :title="t(`${i18nPrefix}.loadFailed`)"/>
    <template v-else>
      <div class="slow-sql-panel__summary">
        <div class="summary-item">
          <span class="summary-item__value">{{ stats.totalRuns }}</span>
          <span class="summary-item__label">{{ t(`${i18nPrefix}.totalRuns`) }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-item__value">{{ formatDurationMs(stats.avgDurationMs) }}</span>
          <span class="summary-item__label">{{ t(`${i18nPrefix}.avgDuration`) }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-item__value">{{ stats.slowQueries.length }}</span>
          <span class="summary-item__label">{{ t(`${i18nPrefix}.slowCount`) }}</span>
        </div>
      </div>

      <div
          v-if="stats.trend.length"
          class="slow-sql-panel__trend"
          :aria-label="t(`${i18nPrefix}.trendTitle`)"
      >
        <div
            v-for="point in stats.trend"
            :key="point.date"
            class="trend-bar"
            :title="`${point.date}: ${point.runCount} runs, max ${formatDurationMs(point.maxDurationMs)}`"
        >
          <span
              class="trend-bar__fill"
              :style="{ height: `${Math.max(8, (point.maxDurationMs / trendMax) * 100)}%` }"
          />
          <span class="trend-bar__label">{{ point.date.slice(5) }}</span>
        </div>
      </div>

      <EmptyState v-if="!stats.slowQueries.length" embedded bordered :title="t(`${i18nPrefix}.noSlowQueries`)"/>
      <ol v-else class="slow-sql-panel__list">
        <li v-for="entry in stats.slowQueries" :key="entry.id">
          <button
              v-if="embedded"
              class="slow-sql-row slow-sql-row--clickable"
              type="button"
              @click="openEntry(entry.sql)"
          >
            <div class="slow-sql-row__meta">
              <span class="slow-sql-row__duration">{{ formatDurationMs(entry.durationMs) }}</span>
              <span v-if="entry.connectionId" class="slow-sql-row__conn">{{ entry.connectionId }}</span>
              <StatusPill v-if="entry.teamShared" variant="team" inline>{{ t(`${i18nPrefix}.teamShared`) }}</StatusPill>
              <span class="slow-sql-row__hint">{{ t('shortcut.openSql') }}</span>
            </div>
            <code class="slow-sql-row__sql">{{ truncateSql(entry.sql, embedded ? 96 : 120) }}</code>
          </button>
          <div v-else class="slow-sql-row">
            <div class="slow-sql-row__meta">
              <span class="slow-sql-row__duration">{{ formatDurationMs(entry.durationMs) }}</span>
              <span v-if="entry.connectionId" class="slow-sql-row__conn">{{ entry.connectionId }}</span>
              <StatusPill v-if="entry.teamShared" variant="team" inline>{{ t(`${i18nPrefix}.teamShared`) }}</StatusPill>
            </div>
            <code class="slow-sql-row__sql">{{ truncateSql(entry.sql) }}</code>
          </div>
        </li>
      </ol>
    </template>
  </section>
</template>

<style scoped>
.slow-sql-panel {
  display: grid;
  gap: var(--dw-space-7);
}

.slow-sql-panel--embedded {
  gap: var(--dw-gap-md);
  padding-bottom: var(--dw-space-6);
  border-bottom: 1px solid var(--dw-border-light);
  margin-bottom: var(--dw-space-2);
}

.slow-sql-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--dw-space-6);
}

.slow-sql-panel--embedded .slow-sql-panel__head {
  gap: var(--dw-gap);
}

.slow-sql-panel__title {
  margin: 0;
  font-size: var(--dw-text-lg);
  font-weight: 600;
}

.slow-sql-panel--embedded .slow-sql-panel__title {
  font-size: var(--dw-text-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dw-text-muted);
}

.slow-sql-panel__hint {
  margin: var(--dw-space-2) 0 0;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
}

.slow-sql-panel--embedded .slow-sql-panel__hint {
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
}



.slow-sql-panel__summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--dw-gap-md);
}

.slow-sql-panel--embedded .slow-sql-panel__summary {
  gap: var(--dw-gap-sm);
}

.summary-item {
  padding: var(--dw-pad-control-lg);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-panel);
}

.slow-sql-panel--embedded .summary-item {
  padding: var(--dw-space-4) var(--dw-space-5);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg);
}

.summary-item__value {
  display: block;
  font-size: var(--dw-text-2xl);
  font-weight: 600;
}

.slow-sql-panel--embedded .summary-item__value {
  font-size: var(--dw-text-xl);
}

.summary-item__label {
  display: block;
  margin-top: var(--dw-space-1);
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.slow-sql-panel--embedded .summary-item__label {
  font-size: var(--dw-text-xs);
}

.slow-sql-panel__trend {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(28px, 1fr));
  gap: var(--dw-gap-sm);
  align-items: end;
  min-height: 72px;
  padding: var(--dw-space-4) 0 0;
}

.slow-sql-panel--embedded .slow-sql-panel__trend {
  min-height: var(--dw-density-xl);
}

.trend-bar {
  display: grid;
  gap: var(--dw-gap-xs);
  justify-items: center;
  height: 72px;
}

.slow-sql-panel--embedded .trend-bar {
  height: var(--dw-density-xl);
}

.trend-bar__fill {
  width: 100%;
  max-width: var(--dw-icon-size-lg);
  border-radius: var(--dw-control-radius-sm) var(--dw-control-radius-sm) 0 0;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--mp-tone-indigo) 95%, transparent),
    color-mix(in srgb, var(--mp-tone-indigo) 35%, transparent)
  );
  align-self: end;
}

.trend-bar__label {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.slow-sql-panel__list {
  display: grid;
  gap: var(--dw-gap);
  margin: 0;
  padding: 0;
  list-style: none;
}

.slow-sql-row {
  padding: var(--dw-pad-control-lg);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-panel);
}

.slow-sql-panel--embedded .slow-sql-row {
  padding: var(--dw-space-5) var(--dw-space-5);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg);
}

.slow-sql-row--clickable {
  width: 100%;
  text-align: left;
  cursor: pointer;
  transition: var(--dw-transition-colors);
}

.slow-sql-row--clickable:hover {
  border-color: color-mix(in srgb, var(--dw-primary) 22%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-primary) 4%, var(--dw-bg));
}

.slow-sql-row__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap);
  align-items: center;
  margin-bottom: var(--dw-space-3);
}

.slow-sql-row__duration {
  font-size: var(--dw-text-sm);
  font-weight: 600;
  color: var(--dw-primary);
}

.slow-sql-row__conn,
.slow-sql-row__hint {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.slow-sql-row__hint {
  opacity: 0;
  transition: opacity var(--dw-duration-fast) var(--dw-ease), color 0.12s ease;
}

.slow-sql-row--clickable:hover .slow-sql-row__hint {
  opacity: 1;
  color: var(--dw-primary);
}

.slow-sql-row__sql {
  display: block;
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--dw-mono);
}

.slow-sql-panel--embedded .slow-sql-row__sql {
  font-size: var(--dw-text-xs);
  max-height: 3.6em;
  overflow: hidden;
}
</style>
