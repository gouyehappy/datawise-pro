import {computed, ref} from 'vue'
import {defineStore} from 'pinia'
import {
    clearActiveMigrationProgressSnapshot,
    clearActiveMigrationRunSnapshot,
    loadActiveMigrationProgressSnapshot,
    loadActiveMigrationRunSnapshot,
    loadMigrationRunHistory,
    MIGRATION_HISTORY_MAX,
    saveActiveMigrationProgressSnapshot,
    saveActiveMigrationRunSnapshot,
    saveMigrationRunToHistory,
    type MigrationLogLine,
    type TableMigrationRunProgress,
    type TableMigrationRunRecord,
    type TableMigrationRunStatus,
    type TargetMissingPolicy,
} from '@/features/explorer/services/table-migration.service'
import type {TableMigrationResult} from '@/shared/api/types'

export interface MigrationRunStartPayload {
    id: string
    startedAt: string
    source: TableMigrationRunRecord['source']
    target: TableMigrationRunRecord['target']
    options: TableMigrationRunRecord['options']
    tablesPlanned: string[]
}

/** 迁移任务：进行中快照 + 历史记录 + 右侧面板选中项 */
export const useMigrationTaskStore = defineStore('migration-tasks', () => {
    const PERSIST_DEBOUNCE_MS = 500
    let persistRunTimer: ReturnType<typeof setTimeout> | null = null
    let persistProgressTimer: ReturnType<typeof setTimeout> | null = null

    const history = ref<TableMigrationRunRecord[]>(loadMigrationRunHistory())
    const activeRun = ref<TableMigrationRunRecord | null>(loadActiveMigrationRunSnapshot())
    const activeProgress = ref<TableMigrationRunProgress | null>(loadActiveMigrationProgressSnapshot())
    const activeRunRestored = ref(Boolean(activeRun.value))
    const selectedId = ref<string | null>(null)

    const isRunning = computed(() => activeRun.value?.status === 'running')

    const taskList = computed(() => {
        const items = [...history.value]
        if (activeRun.value && !items.some((item) => item.id === activeRun.value!.id)) {
            items.unshift(activeRun.value)
        }
        return items.slice(0, MIGRATION_HISTORY_MAX)
    })

    const selectedRecord = computed(() => {
        if (selectedId.value && activeRun.value?.id === selectedId.value) {
            return activeRun.value
        }
        const fromHistory = history.value.find((item) => item.id === selectedId.value)
        if (fromHistory) return fromHistory
        if (activeRun.value) return activeRun.value
        return history.value[0] ?? null
    })

    function flushPersistTimers() {
        if (persistRunTimer) {
            clearTimeout(persistRunTimer)
            persistRunTimer = null
        }
        if (persistProgressTimer) {
            clearTimeout(persistProgressTimer)
            persistProgressTimer = null
        }
    }

    function schedulePersistRunSnapshot() {
        if (!activeRun.value) return
        if (persistRunTimer) clearTimeout(persistRunTimer)
        persistRunTimer = setTimeout(() => {
            persistRunTimer = null
            if (activeRun.value) {
                saveActiveMigrationRunSnapshot(activeRun.value)
            }
        }, PERSIST_DEBOUNCE_MS)
    }

    function schedulePersistProgressSnapshot(progress: TableMigrationRunProgress) {
        if (persistProgressTimer) clearTimeout(persistProgressTimer)
        persistProgressTimer = setTimeout(() => {
            persistProgressTimer = null
            saveActiveMigrationProgressSnapshot(progress)
        }, PERSIST_DEBOUNCE_MS)
    }

    function reloadHistory() {
        history.value = loadMigrationRunHistory()
    }

    function selectRecord(id: string | null) {
        selectedId.value = id
    }

    function startRun(payload: MigrationRunStartPayload) {
        flushPersistTimers()
        activeProgress.value = null
        activeRun.value = {
            id: payload.id,
            startedAt: payload.startedAt,
            finishedAt: '',
            durationMs: 0,
            status: 'running',
            source: payload.source,
            target: payload.target,
            options: payload.options,
            tablesPlanned: [...payload.tablesPlanned],
            summary: {
                tables: payload.tablesPlanned.length,
                rows: 0,
                failed: 0,
                validationMismatch: 0,
            },
            results: [],
            logs: [],
        }
        activeRunRestored.value = false
        saveActiveMigrationRunSnapshot(activeRun.value)
        saveActiveMigrationProgressSnapshot(null)
        selectedId.value = payload.id
    }

    function setProgress(progress: TableMigrationRunProgress | null) {
        activeProgress.value = progress
        if (!activeRun.value || !progress) return
        activeRun.value = {
            ...activeRun.value,
            results: [...progress.results],
            summary: {
                ...activeRun.value.summary,
                tables: progress.results.length,
                rows: progress.results.reduce((sum, item) => sum + item.rowsMigrated, 0),
                failed: progress.results.filter((item) => item.status !== 'success').length,
                validationMismatch: progress.results.filter((item) => item.rowCountValidation === 'mismatch').length,
            },
        }
        schedulePersistRunSnapshot()
        schedulePersistProgressSnapshot(progress)
    }

    function appendLog(line: MigrationLogLine) {
        if (!activeRun.value) return
        activeRun.value = {
            ...activeRun.value,
            logs: [...activeRun.value.logs, line],
        }
        schedulePersistRunSnapshot()
    }

    function completeRun(record: TableMigrationRunRecord) {
        flushPersistTimers()
        saveMigrationRunToHistory(record)
        reloadHistory()
        activeRun.value = null
        activeProgress.value = null
        activeRunRestored.value = false
        clearActiveMigrationRunSnapshot()
        clearActiveMigrationProgressSnapshot()
        selectedId.value = record.id
    }

    function abortRun() {
        flushPersistTimers()
        activeRun.value = null
        activeProgress.value = null
        activeRunRestored.value = false
        clearActiveMigrationRunSnapshot()
        clearActiveMigrationProgressSnapshot()
    }

    function statusLabelKey(status: TableMigrationRunStatus): string {
        return `explorer.tableMigrationWizard.runStatus${status.charAt(0).toUpperCase()}${status.slice(1)}`
    }

    function policyLabelKey(policy: TargetMissingPolicy): string {
        const map: Record<TargetMissingPolicy, string> = {
            block: 'explorer.tableMigrationWizard.targetMissingPolicyBlock',
            skip: 'explorer.tableMigrationWizard.targetMissingPolicySkip',
            create: 'explorer.tableMigrationWizard.targetMissingPolicyCreate',
        }
        return map[policy]
    }

    return {
        history,
        activeRun,
        activeProgress,
        activeRunRestored,
        selectedId,
        isRunning,
        taskList,
        selectedRecord,
        reloadHistory,
        selectRecord,
        startRun,
        setProgress,
        appendLog,
        completeRun,
        abortRun,
        statusLabelKey,
        policyLabelKey,
    }
})

export type {TableMigrationResult}
