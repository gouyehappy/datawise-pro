<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {
    DwButton,
    EmptyState,
    ProgressBar,
    StatusPill,
} from '@/core/components'
import ResizableTable from '@/core/components/ResizableTable.vue'
import type {ResizableColumnDef} from '@/core/composables/useResizableColumns'
import {resolveLogLevelVariant, statusVariantClass} from '@/core/utils/status-variant'
import {useMigrationTaskStore} from '@/features/explorer/stores/migration-task-store'
import {
    buildMigrationRunRecord,
    canCancelMigrationRun,
    canPauseMigrationRun,
    canRestartMigrationFresh,
    canResumeMigrationRun,
    checkpointHasProgress,
    computeMigrationProgressPercent,
    createMigrationRunId,
    downloadMigrationRunReport,
    formatMigrationDuration,
    formatMigrationLogDisplay,
    filterMigrationLogsForDisplay,
    formatMigrationRunLogText,
    formatMigrationTableProgressLabel,
    formatMigrationTime,
    cancelMigrationJob,
    pauseMigrationJob,
    recordToMigrationForm,
    recordToSourceScope,
    resolveMigrationCheckpointBannerKey,
    restartTableMigrationFresh,
    resumeTableMigrationRun,
    summarizeMigrationJobCheckpoints,
    summarizeMigrationResults,
    watchExistingMigrationJob,
    type TableMigrationRunRecord,
    type TableMigrationRunStatus,
} from '@/features/explorer/services/table-migration.service'
import type {MigrationJobView} from '@/shared/api/types'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import type {DbType} from '@/core/types'

const {t} = useI18n()
const layout = useLayoutStore()
const migrationTasks = useMigrationTaskStore()
const resuming = ref(false)
const restartingFresh = ref(false)
const pausing = ref(false)
const cancelling = ref(false)
const reconnectingRunId = ref<string | null>(null)
const serverJob = ref<MigrationJobView | null>(null)
const serverJobLoaded = ref(false)
const serverJobLoading = ref(false)
type DetailTab = 'overview' | 'results' | 'checkpoint' | 'logs'
const detailTab = ref<DetailTab>('overview')

const selected = computed(() => migrationTasks.selectedRecord)

const progressPercent = computed(() => computeMigrationProgressPercent(migrationTasks.activeProgress))

const progressDetailLabel = computed(() =>
    formatMigrationTableProgressLabel(migrationTasks.activeProgress, t),
)

const checkpointSummary = computed(() =>
    serverJob.value ? summarizeMigrationJobCheckpoints(serverJob.value) : null,
)

const checkpointBannerKey = computed(() => {
    if (!selected.value) return ''
    return resolveMigrationCheckpointBannerKey(
        selected.value,
        checkpointSummary.value,
        serverJobLoaded.value,
    )
})

const checkpointTableRows = computed(() => {
    if (!serverJob.value) return []
    return serverJob.value.tablesPlanned.map((tableName) => {
        const checkpoint = serverJob.value!.tables[tableName]
        return {
            tableName,
            status: checkpoint?.status ?? 'pending',
            rowsMigrated: checkpoint?.rowsMigrated ?? 0,
            batchesCompleted: checkpoint?.batchesCompleted ?? 0,
            hasProgress: checkpointHasProgress(checkpoint),
        }
    })
})

const showCheckpointSection = computed(() =>
    Boolean(selected.value && ['failed', 'partial', 'paused'].includes(selected.value.status)),
)

const detailTabs = computed(() => {
    const tabs: Array<{id: DetailTab; label: string}> = [
        {id: 'overview', label: t('shortcut.migration.tabs.overview')},
        {id: 'results', label: t('shortcut.migration.tabs.results')},
    ]
    if (showCheckpointSection.value) {
        tabs.push({id: 'checkpoint', label: t('shortcut.migration.tabs.checkpoint')})
    }
    tabs.push({id: 'logs', label: t('shortcut.migration.tabs.logs')})
    return tabs
})

const displayLogs = computed(() =>
    selected.value ? filterMigrationLogsForDisplay(selected.value.logs) : [],
)

const logsCompacted = computed(() =>
    Boolean(selected.value && displayLogs.value.length < selected.value.logs.length),
)

watch(
    () => selected.value?.id,
    async (jobId) => {
        serverJob.value = null
        serverJobLoaded.value = false
        if (!jobId || !selected.value) return
        if (selected.value.status === 'running') return
        serverJobLoading.value = true
        try {
            const {migrationApi} = await import('@/api/modules/migration')
            serverJob.value = await migrationApi.getJob(jobId)
        } catch {
            serverJob.value = null
        } finally {
            serverJobLoaded.value = true
            serverJobLoading.value = false
        }
    },
    {immediate: true},
)

watch(
    () => migrationTasks.taskList.length,
    () => {
        if (!migrationTasks.selectedId && migrationTasks.taskList[0]) {
            migrationTasks.selectRecord(migrationTasks.taskList[0].id)
            pickDefaultDetailTab(migrationTasks.taskList[0])
        }
    },
    {immediate: true},
)

watch(
    () => migrationTasks.activeRun,
    async (activeRun) => {
        if (!activeRun || activeRun.status !== 'running') return
        if (!migrationTasks.activeRunRestored) return
        if (reconnectingRunId.value === activeRun.id) return

        reconnectingRunId.value = activeRun.id
        try {
            const outcome = await watchExistingMigrationJob(
                activeRun.id,
                (nextProgress) => migrationTasks.setProgress(nextProgress),
                (line) => migrationTasks.appendLog(line),
                {
                    logs: activeRun.logs,
                    tables: activeRun.tablesPlanned,
                },
            )
            const current = migrationTasks.activeRun
            if (!current || current.id !== activeRun.id) return

            const finishedAt = new Date().toISOString()
            const nextRecord = buildMigrationRunRecord({
                id: current.id,
                startedAt: current.startedAt,
                finishedAt,
                source: {
                    connectionId: current.source.connectionId,
                    connectionLabel: current.source.connectionLabel,
                    database: current.source.database,
                    dbType: current.source.dbType as DbType,
                },
                targetConnectionId: current.target.connectionId,
                targetConnectionLabel: current.target.connectionLabel,
                targetDatabase: current.target.database,
                form: {
                    targetConnectionId: current.target.connectionId,
                    targetDatabase: current.target.database,
                    selectedTables: [...current.tablesPlanned],
                    mode: current.options.mode,
                    watermarkColumn: current.options.watermarkColumn,
                    orderByColumns: [...(current.options.orderByColumns ?? [])],
                    whereClause: current.options.whereClause,
                    batchSize: current.options.batchSize,
                    throttleMs: current.options.throttleMs,
                    truncateTarget: current.options.truncateTarget,
                    targetMissingPolicy: current.options.targetMissingPolicy,
                    conflictStrategy: current.options.conflictStrategy ?? 'OVERWRITE',
                },
                tablesPlanned: current.tablesPlanned,
                results: outcome.paused || outcome.cancelled ? current.results : outcome.results,
                logs: current.logs,
                jobStatus: outcome.cancelled ? 'cancelled' : outcome.paused ? 'paused' : undefined,
            })
            migrationTasks.completeRun(nextRecord)
            if (outcome.cancelled) {
                notifyMigrationOutcome(current.results, false, true)
            }
        } catch (error) {
            migrationTasks.abortRun()
            const message = resolveCaughtApiErrorMessage(
                error,
                t,
                'explorer.tableMigrationWizard.errors.migrationJobFailed',
            )
            layout.showErrorToast(t('explorer.tableMigrationWizard.errors.runFailed', {detail: message}))
        } finally {
            reconnectingRunId.value = null
        }
    },
    {immediate: true},
)

function selectTask(record: TableMigrationRunRecord) {
    migrationTasks.selectRecord(record.id)
    pickDefaultDetailTab(record)
}

function canResume(record: TableMigrationRunRecord): boolean {
    return canResumeMigrationRun(record, {
        serverJob: serverJob.value,
        serverLoaded: serverJobLoaded.value,
    }) && !migrationTasks.isRunning && !resuming.value && !restartingFresh.value
}

function canRestartFresh(record: TableMigrationRunRecord): boolean {
    return canRestartMigrationFresh(record) && !migrationTasks.isRunning && !resuming.value && !restartingFresh.value
}

function taskDisplayStatus(record: TableMigrationRunRecord): TableMigrationRunStatus {
    if (record.status === 'success' && record.results.some((row) => row.rowCountValidation === 'mismatch')) {
        return 'partial'
    }
    return record.status
}

function taskStatusDotClass(status: TableMigrationRunStatus): string {
    if (status === 'success') return 'migration-task-pill__dot--success'
    if (status === 'partial' || status === 'paused') return 'migration-task-pill__dot--partial'
    if (status === 'failed' || status === 'cancelled') return 'migration-task-pill__dot--failed'
    if (status === 'running') return 'migration-task-pill__dot--running'
    return ''
}

function formatValidation(validation: string | null | undefined): string {
    const keyByValidation: Record<string, string> = {
        match: 'explorer.tableMigrationWizard.validationMatch',
        mismatch: 'explorer.tableMigrationWizard.validationMismatch',
        skipped: 'explorer.tableMigrationWizard.validationSkipped',
    }
    const key = validation ? keyByValidation[validation] : undefined
    return key ? t(key) : (validation ?? '—')
}

function pickDefaultDetailTab(record: TableMigrationRunRecord) {
    if (record.status === 'running') {
        detailTab.value = 'overview'
        return
    }
    if (['failed', 'partial', 'paused'].includes(record.status)) {
        detailTab.value = 'checkpoint'
        return
    }
    detailTab.value = record.logs.length ? 'logs' : 'overview'
}

function buildRunRecordFromActive(
    record: TableMigrationRunRecord,
    jobId: string,
    startedAt: string,
    finishedAt: string,
    results: TableMigrationRunRecord['results'],
    logs: TableMigrationRunRecord['logs'],
    jobStatus?: string,
): TableMigrationRunRecord {
    return buildMigrationRunRecord({
        id: jobId,
        startedAt,
        finishedAt,
        source: {
            connectionId: record.source.connectionId,
            connectionLabel: record.source.connectionLabel,
            database: record.source.database,
            dbType: record.source.dbType as DbType,
        },
        targetConnectionId: record.target.connectionId,
        targetConnectionLabel: record.target.connectionLabel,
        targetDatabase: record.target.database,
        form: recordToMigrationForm(record),
        tablesPlanned: [...record.tablesPlanned],
        results,
        logs,
        jobStatus,
    })
}

function notifyMigrationOutcome(
    results: TableMigrationRunRecord['results'],
    paused: boolean,
    cancelled?: boolean,
) {
    if (cancelled) {
        layout.showWarningToast(t('explorer.tableMigrationWizard.migrationCancelled'))
        return
    }
    if (paused) {
        return
    }
    const summary = summarizeMigrationResults(results)
    if (summary.failed > 0) {
        layout.showWarningToast(t('explorer.tableMigrationPartial', summary))
    } else {
        layout.notifyQuiet({
            category: 'workspace',
            titleKey: 'migrationDone',
            bodyKey: 'migrationDone',
            params: {summary: t('explorer.tableMigrationSuccess', summary)},
        })
    }
}

function canPause(record: TableMigrationRunRecord): boolean {
    return canPauseMigrationRun(migrationTasks.isRunning, migrationTasks.activeRun?.id, record.id) && !pausing.value && !cancelling.value
}

function canCancel(record: TableMigrationRunRecord): boolean {
    return canCancelMigrationRun(
        migrationTasks.isRunning,
        migrationTasks.activeRun?.id,
        record.id,
        record.status,
    ) && !cancelling.value
}

async function pauseTask(record: TableMigrationRunRecord) {
    if (!canPause(record)) return
    pausing.value = true
    try {
        await pauseMigrationJob(record.id)
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(
            error,
            t,
            'explorer.tableMigrationWizard.errors.migrationJobFailed',
        )
        layout.showErrorToast(t('explorer.tableMigrationWizard.errors.runFailed', {detail: message}))
    } finally {
        pausing.value = false
    }
}

async function cancelTask(record: TableMigrationRunRecord) {
    if (!canCancel(record)) return
    cancelling.value = true
    try {
        await cancelMigrationJob(record.id)
        if (record.status === 'paused') {
            const nextRecord = buildRunRecordFromActive(
                record,
                record.id,
                record.startedAt,
                new Date().toISOString(),
                record.results,
                record.logs,
                'cancelled',
            )
            migrationTasks.completeRun(nextRecord)
            notifyMigrationOutcome(record.results, false, true)
        }
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(
            error,
            t,
            'explorer.tableMigrationWizard.errors.migrationJobFailed',
        )
        layout.showErrorToast(t('explorer.tableMigrationWizard.errors.runFailed', {detail: message}))
    } finally {
        cancelling.value = false
    }
}

async function resumeTask(record: TableMigrationRunRecord) {
    if (!canResume(record)) return
    resuming.value = true
    const startedAt = record.startedAt
    migrationTasks.startRun({
        id: record.id,
        startedAt,
        source: record.source,
        target: record.target,
        options: record.options,
        tablesPlanned: [...record.tablesPlanned],
    })
    try {
        const outcome = await resumeTableMigrationRun(
            record,
            (nextProgress) => migrationTasks.setProgress(nextProgress),
            (line) => migrationTasks.appendLog(line),
        )
        const finishedAt = new Date().toISOString()
        const nextRecord = buildRunRecordFromActive(
            record,
            record.id,
            startedAt,
            finishedAt,
            outcome.results,
            migrationTasks.activeRun?.logs ?? record.logs,
            outcome.cancelled ? 'cancelled' : outcome.paused ? 'paused' : undefined,
        )
        migrationTasks.completeRun(nextRecord)
        notifyMigrationOutcome(outcome.results, outcome.paused, outcome.cancelled)
    } catch (error) {
        migrationTasks.abortRun()
        const message = resolveCaughtApiErrorMessage(
            error,
            t,
            'explorer.tableMigrationWizard.errors.migrationJobFailed',
        )
        layout.showErrorToast(t('explorer.tableMigrationWizard.errors.runFailed', {detail: message}))
    } finally {
        resuming.value = false
    }
}

async function restartFreshTask(record: TableMigrationRunRecord) {
    if (!canRestartFresh(record)) return
    restartingFresh.value = true
    const jobId = createMigrationRunId()
    const startedAt = new Date().toISOString()
    migrationTasks.startRun({
        id: jobId,
        startedAt,
        source: record.source,
        target: record.target,
        options: record.options,
        tablesPlanned: [...record.tablesPlanned],
    })
    try {
        const outcome = await restartTableMigrationFresh(
            record,
            (nextProgress) => migrationTasks.setProgress(nextProgress),
            (line) => migrationTasks.appendLog(line),
        )
        const finishedAt = new Date().toISOString()
        const nextRecord = buildRunRecordFromActive(
            record,
            outcome.jobId,
            startedAt,
            finishedAt,
            outcome.results,
            migrationTasks.activeRun?.logs ?? [],
            outcome.cancelled ? 'cancelled' : outcome.paused ? 'paused' : undefined,
        )
        migrationTasks.completeRun(nextRecord)
        notifyMigrationOutcome(outcome.results, outcome.paused, outcome.cancelled)
    } catch (error) {
        migrationTasks.abortRun()
        const message = resolveCaughtApiErrorMessage(
            error,
            t,
            'explorer.tableMigrationWizard.errors.migrationJobFailed',
        )
        layout.showErrorToast(t('explorer.tableMigrationWizard.errors.runFailed', {detail: message}))
    } finally {
        restartingFresh.value = false
    }
}

function formatCheckpointStatus(status: string): string {
    const key = `explorer.tableMigrationWizard.checkpointStatus.${status}`
    const translated = t(key)
    return translated === key ? status : translated
}

async function copyLog(record: TableMigrationRunRecord) {
    try {
        await navigator.clipboard.writeText(formatMigrationRunLogText(record))
    } catch {
        layout.showErrorToast(t('explorer.tableMigrationWizard.ddlCopyFailed'))
    }
}

function downloadReport(record: TableMigrationRunRecord) {
    downloadMigrationRunReport(record)
    layout.notifyQuiet({
      category: 'export',
      titleKey: 'exportDone',
      bodyKey: 'exportDone',
      params: {name: t('explorer.tableMigrationWizard.reportDownloaded')},
    })
}

function formatRowCount(value: number | null | undefined): string {
    if (value == null) return '—'
    return value.toLocaleString()
}

const resultsTableColumns = computed<ResizableColumnDef[]>(() => [
    {key: 'table', label: t('explorer.tableMigrationWizard.preflightTable'), defaultWidth: 120, minWidth: 72},
    {key: 'migrated', label: t('explorer.tableMigrationWizard.validationMigratedRows'), defaultWidth: 88, minWidth: 64},
    {key: 'source', label: t('explorer.tableMigrationWizard.preflightSourceRows'), defaultWidth: 88, minWidth: 64},
    {key: 'status', label: t('explorer.tableMigrationWizard.preflightStatus'), defaultWidth: 140, minWidth: 96},
])

const checkpointTableColumns = computed<ResizableColumnDef[]>(() => [
    {key: 'table', label: t('explorer.tableMigrationWizard.preflightTable'), defaultWidth: 120, minWidth: 72},
    {key: 'status', label: t('explorer.tableMigrationWizard.checkpointColumnStatus'), defaultWidth: 88, minWidth: 64},
    {key: 'rows', label: t('explorer.tableMigrationWizard.validationMigratedRows'), defaultWidth: 88, minWidth: 64},
    {key: 'batches', label: t('explorer.tableMigrationWizard.checkpointColumnBatches'), defaultWidth: 72, minWidth: 56},
])
</script>

<template>
  <div class="migration-panel">
    <EmptyState
        v-if="!migrationTasks.taskList.length"
        class="migration-panel__empty"
        :title="t('shortcut.migration.empty')"
        :hint="t('shortcut.migration.emptyHint')"
        compact
    />

    <template v-else>
      <div class="migration-panel__task-rail-wrap">
        <div class="migration-panel__task-rail-head">
          <h4>{{ t('shortcut.migration.recentTasks') }}</h4>
          <span>{{ migrationTasks.taskList.length }}</span>
        </div>
        <div class="migration-panel__task-rail">
          <button
              v-for="item in migrationTasks.taskList"
              :key="item.id"
              type="button"
              class="migration-task-pill"
              :class="{
                'is-active': selected?.id === item.id,
                'is-running': item.status === 'running',
              }"
              @click="selectTask(item)"
          >
            <span class="migration-task-pill__row">
              <span
                  class="migration-task-pill__dot"
                  :class="taskStatusDotClass(taskDisplayStatus(item))"
              />
              <span class="migration-task-pill__time">{{ formatMigrationTime(item.startedAt) }}</span>
            </span>
            <span class="migration-task-pill__summary">
              {{
                t('explorer.tableMigrationWizard.completionSummary', {
                  tables: item.summary.tables || item.tablesPlanned.length,
                  rows: item.summary.rows,
                  failed: item.summary.failed,
                })
              }}
            </span>
          </button>
        </div>
      </div>

      <section v-if="selected" class="migration-panel__detail">
        <div class="migration-hero">
          <div class="migration-hero__status">
            <StatusPill :status="taskDisplayStatus(selected)" domain="migration">
              {{ t(migrationTasks.statusLabelKey(taskDisplayStatus(selected))) }}
            </StatusPill>
          </div>

          <div class="migration-route">
            <div class="migration-route__end migration-route__end--source">
              <span class="migration-route__label">{{ t('shortcut.migration.routeSource') }}</span>
              <span class="migration-route__value">{{ selected.source.connectionLabel }}</span>
              <span class="migration-route__db">{{ selected.source.database }}</span>
            </div>
            <span class="migration-route__arrow" aria-hidden="true">→</span>
            <div class="migration-route__end">
              <span class="migration-route__label">{{ t('shortcut.migration.routeTarget') }}</span>
              <span class="migration-route__value">{{ selected.target.connectionLabel }}</span>
              <span class="migration-route__db">{{ selected.target.database }}</span>
            </div>
          </div>

          <div class="migration-hero__stats">
            <span>
              {{ t('shortcut.migration.statTables') }}:
              <strong>{{ selected.summary.tables || selected.tablesPlanned.length }}</strong>
            </span>
            <span>
              {{ t('shortcut.migration.statRows') }}:
              <strong>{{ selected.summary.rows.toLocaleString() }}</strong>
            </span>
            <span v-if="selected.status !== 'running'">
              {{ t('explorer.tableMigrationWizard.runDuration') }}:
              <strong>{{ formatMigrationDuration(selected.durationMs) }}</strong>
            </span>
          </div>
        </div>

        <div v-if="selected.status === 'running' && migrationTasks.activeProgress" class="migration-panel__progress">
          <div class="migration-progress-card__head">
            <strong>{{ t('explorer.tableMigrationWizard.migrating') }}</strong>
            <span>{{ progressPercent }}%</span>
          </div>
          <div class="migration-progress-card__bar">
            <ProgressBar :value="progressPercent"/>
          </div>
          <p class="migration-progress-card__caption">
            {{
              t('explorer.tableMigrationWizard.progress', {
                current: migrationTasks.activeProgress.currentTable ?? '—',
                completed: migrationTasks.activeProgress.completed,
                total: migrationTasks.activeProgress.total,
              })
            }}
          </p>
          <p v-if="progressDetailLabel" class="migration-progress-card__detail">{{ progressDetailLabel }}</p>
        </div>

        <div
            v-if="canPause(selected) || canCancel(selected) || canResume(selected) || canRestartFresh(selected)"
            class="migration-actions"
        >
          <div class="migration-actions__primary">
            <DwButton
                v-if="canPause(selected)"
                variant="secondary"
                size="sm"
                :disabled="pausing || cancelling"
                @click="pauseTask(selected)"
            >
              {{ t('explorer.tableMigrationWizard.pauseMigration') }}
            </DwButton>
            <DwButton
                v-if="canCancel(selected)"
                variant="secondary"
                size="sm"
                :disabled="cancelling"
                :loading="cancelling"
                @click="cancelTask(selected)"
            >
              {{ t('explorer.tableMigrationWizard.cancelMigration') }}
            </DwButton>
            <DwButton
                v-if="canResume(selected)"
                variant="primary"
                size="sm"
                :disabled="resuming"
                :loading="resuming"
                @click="resumeTask(selected)"
            >
              {{ t('explorer.tableMigrationWizard.resumeFromCheckpoint') }}
            </DwButton>
            <DwButton
                v-if="canRestartFresh(selected)"
                variant="secondary"
                size="sm"
                :disabled="restartingFresh"
                :loading="restartingFresh"
                @click="restartFreshTask(selected)"
            >
              {{ t('explorer.tableMigrationWizard.restartFreshMigration') }}
            </DwButton>
          </div>
          <div class="migration-actions__secondary">
            <DwButton variant="ghost" size="sm" @click="copyLog(selected)">
              {{ t('explorer.tableMigrationWizard.copyLog') }}
            </DwButton>
            <DwButton
                v-if="selected.status !== 'running'"
                variant="ghost"
                size="sm"
                @click="downloadReport(selected)"
            >
              {{ t('explorer.tableMigrationWizard.downloadReport') }}
            </DwButton>
          </div>
        </div>

        <div class="migration-panel__tabs" role="tablist">
          <button
              v-for="tab in detailTabs"
              :key="tab.id"
              type="button"
              class="migration-panel__tab"
              :class="{ 'is-active': detailTab === tab.id }"
              role="tab"
              :aria-selected="detailTab === tab.id"
              @click="detailTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>

        <div class="migration-panel__tab-body">
          <template v-if="detailTab === 'overview'">
            <dl class="migration-panel__meta-grid">
              <div>
                <dt>{{ t('explorer.tableMigrationWizard.runId') }}</dt>
                <dd>{{ selected.id.slice(0, 8) }}…</dd>
              </div>
              <div>
                <dt>{{ t('explorer.tableMigrationWizard.runStartedAt') }}</dt>
                <dd>{{ new Date(selected.startedAt).toLocaleString() }}</dd>
              </div>
              <div>
                <dt>{{ t('explorer.tableMigrationWizard.migrationMode') }}</dt>
                <dd>{{ selected.options.mode }}</dd>
              </div>
              <div>
                <dt>{{ t('explorer.tableMigrationWizard.targetMissingPolicy') }}</dt>
                <dd>{{ t(migrationTasks.policyLabelKey(selected.options.targetMissingPolicy)) }}</dd>
              </div>
              <div v-if="selected.options.batchSize">
                <dt>{{ t('explorer.tableMigrationWizard.batchSize') }}</dt>
                <dd>{{ selected.options.batchSize }}</dd>
              </div>
              <div v-if="selected.tablesPlanned.length">
                <dt>{{ t('explorer.tableMigrationWizard.tables') }}</dt>
                <dd>{{ selected.tablesPlanned.join(', ') }}</dd>
              </div>
            </dl>
          </template>

          <template v-else-if="detailTab === 'results'">
            <ResizableTable
                v-if="selected.results.length"
                :columns="resultsTableColumns"
                storage-key="migration-panel.results-columns"
                table-class="migration-results-table"
            >
              <tr
                  v-for="row in selected.results"
                  :key="row.tableName"
                  :class="{ 'is-mismatch': row.rowCountValidation === 'mismatch' }"
              >
                <td :title="row.tableName">{{ row.tableName }}</td>
                <td>{{ formatRowCount(row.rowsMigrated) }}</td>
                <td>{{ formatRowCount(row.sourceRowCount ?? null) }}</td>
                <td class="is-wrap">
                  <StatusPill :status="row.rowCountValidation ?? row.status" domain="validation">
                    {{ formatValidation(row.rowCountValidation) }}
                  </StatusPill>
                  <p v-if="row.message" class="migration-results-table__message">{{ row.message }}</p>
                </td>
              </tr>
            </ResizableTable>
            <EmptyState
                v-else
                :title="t('shortcut.migration.noResults')"
                compact
            />
          </template>

          <template v-else-if="detailTab === 'checkpoint' && showCheckpointSection">
            <section
                class="migration-panel__checkpoint"
                :class="{
                  'is-loading': serverJobLoading,
                  'is-missing': serverJobLoaded && !serverJob,
                  'is-ready': checkpointSummary?.hasPersistedCheckpoints,
                }"
            >
              <h6>{{ t('explorer.tableMigrationWizard.checkpointTitle') }}</h6>
              <p v-if="serverJobLoading" class="migration-panel__checkpoint-text">
                {{ t('explorer.tableMigrationWizard.checkpointLoading') }}
              </p>
              <template v-else>
                <p class="migration-panel__checkpoint-text">
                  {{
                    t(checkpointBannerKey, {
                      count: checkpointSummary?.tablesWithProgress ?? 0,
                      completed: checkpointSummary?.tablesCompleted ?? 0,
                      total: checkpointSummary?.tableCount ?? selected.tablesPlanned.length,
                      rows: (checkpointSummary?.totalRowsCheckpointed ?? 0).toLocaleString(),
                      jobId: selected.id.slice(0, 8),
                    })
                  }}
                </p>
                <p v-if="canResume(selected)" class="migration-panel__checkpoint-hint">
                  {{ t('explorer.tableMigrationWizard.resumeFromCheckpointHint', {jobId: selected.id.slice(0, 8)}) }}
                </p>
                <p v-if="canRestartFresh(selected)" class="migration-panel__checkpoint-hint">
                  {{ t('explorer.tableMigrationWizard.restartFreshHint') }}
                </p>
                <ResizableTable
                    v-if="checkpointTableRows.length"
                    :columns="checkpointTableColumns"
                    storage-key="migration-panel.checkpoint-columns"
                    table-class="checkpoint-table"
                >
                  <tr
                      v-for="row in checkpointTableRows"
                      :key="row.tableName"
                      :class="{ 'has-progress': row.hasProgress }"
                  >
                    <td :title="row.tableName">{{ row.tableName }}</td>
                    <td>{{ formatCheckpointStatus(row.status) }}</td>
                    <td>{{ formatRowCount(row.rowsMigrated) }}</td>
                    <td>{{ row.batchesCompleted > 0 ? row.batchesCompleted : '—' }}</td>
                  </tr>
                </ResizableTable>
              </template>
            </section>
          </template>

          <template v-else-if="detailTab === 'logs'">
            <p v-if="logsCompacted" class="migration-panel__log-hint">
              {{
                t('shortcut.migration.logCompactHint', {
                  shown: displayLogs.length,
                  total: selected.logs.length,
                })
              }}
            </p>
            <ul v-if="displayLogs.length" class="migration-panel__log-box">
              <li
                  v-for="(line, index) in displayLogs"
                  :key="`${line.at}-${index}`"
                  class="dw-log-line"
                  :class="statusVariantClass(resolveLogLevelVariant(line.level))"
              >
                {{ formatMigrationLogDisplay(line, t) }}
              </li>
            </ul>
            <EmptyState
                v-else
                :title="t('shortcut.migration.noLogs')"
                compact
            />
          </template>
        </div>
      </section>
    </template>
  </div>
</template>
