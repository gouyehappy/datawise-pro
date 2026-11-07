<script setup lang="ts">
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwInlineAlert, ProgressBar, StatusPill} from '@/core/components'
import {resolveLogLevelVariant, statusVariantClass} from '@/core/utils/status-variant'
import {useMigrationWizard} from '@/features/workspace/composables/useMigrationWizardInject'
import {
  computeMigrationRunLiveMetrics,
  formatMigrationDuration,
  formatMigrationThroughput,
} from '@/features/explorer/services/table-migration.pure'
import MigrationRouteSummary from './MigrationRouteSummary.vue'

const {t} = useI18n()
const w = useMigrationWizard()
const logListRef = ref<HTMLElement | null>(null)
const nowMs = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | null = null

const progressCaption = computed(() => {
    if (!w.progress) return ''
    return t('explorer.tableMigrationWizard.progress', {
        current: w.progress.currentTable ?? '—',
        completed: w.progress.completed,
        total: w.progress.total,
    })
})

const liveMetrics = computed(() =>
    computeMigrationRunLiveMetrics(
        w.progress,
        w.runStartedAt,
        nowMs.value,
    ),
)

const pauseWaitMessage = computed(() => {
    const phase = w.progress?.currentPhase
    if (phase === 'truncating') {
        return t('explorer.tableMigrationWizard.pauseRequestedTruncating')
    }
    if (phase && phase !== 'copying') {
        return t('explorer.tableMigrationWizard.pauseRequestedPhase', {
            phase: t(`explorer.tableMigrationWizard.phases.${phase}`),
        })
    }
    return t('explorer.tableMigrationWizard.pauseRequested')
})

const stuckHint = computed(() => {
    if (!w.running || w.pausing || w.cancelling || !w.progress) return ''
    const elapsed = liveMetrics.value.elapsedMs
    if (elapsed < 20_000) return ''
    if (w.progress.currentPhase === 'queued') {
        return t('explorer.tableMigrationWizard.stuckHintQueued')
    }
    if (elapsed < 45_000) return ''
    const noBatchProgress = (w.progress.batchRowsMigrated ?? 0) === 0
        && (w.progress.batchCount ?? 0) === 0
    if (!noBatchProgress) return ''
    const phase = w.progress.currentPhase
    if (phase === 'truncating') {
        return t('explorer.tableMigrationWizard.stuckHintTruncating')
    }
    return t('explorer.tableMigrationWizard.stuckHintPreparing')
})

const metricsLine = computed(() => {
    const metrics = liveMetrics.value
    const parts = [
        t('explorer.tableMigrationWizard.metricsElapsed', {
            duration: formatMigrationDuration(metrics.elapsedMs),
        }),
        t('explorer.tableMigrationWizard.metricsThroughput', {
            rate: formatMigrationThroughput(metrics.rowsPerSecond),
        }),
        t('explorer.tableMigrationWizard.metricsRows', {
            rows: metrics.rowsMigrated,
        }),
    ]
    if (metrics.etaMs != null) {
        parts.push(t('explorer.tableMigrationWizard.metricsEta', {
            duration: formatMigrationDuration(metrics.etaMs),
        }))
    }
    return parts.join(' · ')
})

const tableProgressRows = computed(() => {
    const progress = w.progress
    if (!progress) return []
    const rows: Array<{name: string; status: string; rows: number; total: number | null}> = []
    for (const result of progress.results) {
        rows.push({
            name: result.tableName,
            status: result.status,
            rows: result.rowsMigrated ?? 0,
            total: progress.tableRowTotals?.[result.tableName] ?? null,
        })
    }
    if (progress.currentTable && !rows.some((row) => row.name === progress.currentTable)) {
        rows.push({
            name: progress.currentTable,
            status: 'running',
            rows: progress.batchRowsMigrated ?? 0,
            total: progress.tableRowTotals?.[progress.currentTable] ?? null,
        })
    }
    return rows
})

watch(
    () => w.migrationRunLogs.length,
    async () => {
        await nextTick()
        const list = logListRef.value
        if (!list) return
        list.scrollTop = list.scrollHeight
    },
)

onMounted(() => {
    tickTimer = setInterval(() => {
        nowMs.value = Date.now()
    }, 1000)
})

onUnmounted(() => {
    if (tickTimer) clearInterval(tickTimer)
})
</script>

<template>
  <div class="migration-flow-panel">
    <MigrationRouteSummary/>

    <div v-if="w.running && w.progress" class="table-migration__running-banner migration-progress-card">
      <div class="table-migration__running-head">
        <span class="table-migration__spinner" aria-hidden="true"/>
        <strong>{{ t('explorer.tableMigrationWizard.migrating') }}</strong>
        <DwButton
            v-if="w.canPauseMigration"
            class="migration-progress-card__pause"
            variant="secondary"
            size="sm"
            :disabled="w.pausing || w.cancelling"
            :loading="w.pausing"
            @click="w.pauseActiveMigration"
        >
          {{ t('explorer.tableMigrationWizard.pauseMigration') }}
        </DwButton>
        <DwButton
            v-if="w.canCancelMigration"
            class="migration-progress-card__cancel"
            variant="secondary"
            size="sm"
            :disabled="w.cancelling"
            :loading="w.cancelling"
            @click="w.cancelActiveMigration"
        >
          {{ t('explorer.tableMigrationWizard.cancelMigration') }}
        </DwButton>
        <span class="table-migration__running-meta">{{ w.progressPercent }}%</span>
      </div>

      <DwInlineAlert
          v-if="w.pausing"
          density="banner"
          variant="warning"
          class="migration-progress-card__pause-alert"
          :message="pauseWaitMessage"
      />
      <DwInlineAlert
          v-if="w.cancelling"
          density="banner"
          variant="warning"
          class="migration-progress-card__pause-alert"
          :message="t('explorer.tableMigrationWizard.cancelRequested')"
      />
      <DwInlineAlert
          v-else-if="stuckHint"
          density="banner"
          variant="warning"
          class="migration-progress-card__pause-alert"
          :message="stuckHint"
      />

      <div class="migration-progress-card__bar">
        <ProgressBar :value="w.progressPercent"/>
      </div>

      <div class="migration-progress-card__labels">
        <p class="table-migration__running-text migration-progress-card__overall">
          {{
            t('explorer.tableMigrationWizard.progressOverall', {
              percent: w.progressPercent,
              completed: w.progress.completed,
              total: w.progress.total,
            })
          }}
        </p>
        <p class="table-migration__running-text">{{ progressCaption }}</p>
        <p v-if="w.progressDetailLabel" class="table-migration__running-text migration-progress-card__detail">
          {{ w.progressDetailLabel }}
        </p>
        <p class="table-migration__running-text migration-progress-card__metrics">
          {{ metricsLine }}
        </p>
      </div>

      <table v-if="tableProgressRows.length" class="detail-table migration-progress-card__tables">
        <thead>
          <tr>
            <th>{{ t('explorer.tableMigrationWizard.preflightTable') }}</th>
            <th>{{ t('explorer.tableMigrationWizard.validationMigratedRows') }}</th>
            <th>{{ t('explorer.tableMigrationWizard.preflightStatus') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in tableProgressRows" :key="row.name">
            <td>{{ row.name }}</td>
            <td>
              {{
                row.total != null
                  ? `${w.formatRowCount(row.rows)} / ${w.formatRowCount(row.total)}`
                  : w.formatRowCount(row.rows)
              }}
            </td>
            <td>
              <StatusPill
                  :status="row.status === 'success' ? 'ready' : row.status === 'running' ? 'running' : 'blocked'"
                  domain="preflight"
              >
                {{
                  row.status === 'running'
                    ? t('explorer.tableMigrationWizard.checkpointStatus.running')
                    : row.status
                }}
              </StatusPill>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <section v-if="w.migrationRunLogs.length" class="migration-run">
      <header class="migration-run__head">
        <h3>{{ t('explorer.tableMigrationWizard.migrationLogTitle') }}</h3>
        <DwButton variant="secondary" size="sm" @click="w.openMigrationTasksPanel()">
          {{ t('explorer.tableMigrationWizard.viewTaskPanel') }}
        </DwButton>
      </header>
      <p v-if="w.migrationRunLogsCompacted" class="migration-log-list__hint">
        {{
          t('shortcut.migration.logCompactHint', {
            shown: w.migrationRunLogs.length,
            total: w.migrationRunLogsFull.length,
          })
        }}
      </p>
      <ul ref="logListRef" class="migration-log-list migration-log-list--live">
        <li
            v-for="(line, index) in w.migrationRunLogs"
            :key="`${line.at}-${index}`"
            class="dw-log-line"
            :class="statusVariantClass(resolveLogLevelVariant(line.level))"
        >
          {{ w.formatLogLine(line) }}
        </li>
      </ul>
    </section>

    <section v-if="w.migrationResults.length" class="migration-results">
      <header class="migration-results__head">
        <h3>{{ t('explorer.tableMigrationWizard.migrationResultTitle') }}</h3>
      </header>
      <table class="detail-table">
        <thead>
          <tr>
            <th>{{ t('explorer.tableMigrationWizard.preflightTable') }}</th>
            <th>{{ t('explorer.tableMigrationWizard.validationMigratedRows') }}</th>
            <th>{{ t('explorer.tableMigrationWizard.preflightStatus') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in w.migrationResults" :key="row.tableName">
            <td>{{ row.tableName }}</td>
            <td>{{ w.formatRowCount(row.rowsMigrated) }}</td>
            <td>
              <StatusPill
                  :status="row.status === 'success' ? 'ready' : 'blocked'"
                  domain="preflight"
              >
                {{ row.status }}
              </StatusPill>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
