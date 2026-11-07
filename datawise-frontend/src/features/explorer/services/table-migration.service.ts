export * from './table-migration.pure'

import type {TreeNode} from '@/core/types'
import type {SchemaScope} from '@/features/schema-compare/types/schema-compare.types'
import type {
    MigrationJobView,
    TableMigrationBatchRequest,
    TableMigrationBatchTableRequest,
    TableMigrationPreflightResult,
    TableMigrationResult,
} from '@/shared/api/types'
import type {
    TableMigrationTableBatchProgressEvent,
    TableMigrationTablePhaseEvent,
    TableMigrationTableResultEvent,
    TableMigrationTableStartEvent,
} from '@/shared/api/http/migration-stream'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {t} from '@/i18n'
import {
    canPersistLocalResource,
    canReadResource,
    resolveResourceStorageKey,
} from '@/features/auth/services/user-resource-policy'
import {
    ensureMigrationSourceSchemaLoaded,
    listTablesForScope,
    resolveRunningTableFromJob,
    appendMigrationLog,
    buildMigrationRunRecord,
    buildPreflightRequest,
    buildTableRowTotalsFromPreflight,
    createMigrationRunId,
    progressFromMigrationJobView,
    recordToMigrationForm,
    recordToSourceScope,
    resolveMigrationTables,
    shouldCreateTargetTable,
    validateTableMigrationForPreflight,
    validateTableMigrationForm,
    shouldAppendBatchProgressLog,
    summarizeMigrationResults,
    canResumeMigrationRun,
    MIGRATION_JOB_TERMINAL_STATUSES,
    MIGRATION_JOB_POLL_MS,
    MIGRATION_HISTORY_MAX,
    MIGRATION_ACTIVE_RUN_STORAGE_KEY,
    MIGRATION_ACTIVE_PROGRESS_STORAGE_KEY,
    resolveMigrationHistoryStorageKey,
    sleep,
    type EnsureChildrenLoaded,
    type FetchTablesForScopeOptions,
    type MigrationJobWatchCallbacks,
    type MigrationLogLine,
    type MigrationRunOptions,
    type TableMigrationRunOutcome,
    type TableMigrationRunProgress,
    type TableMigrationRunRecord,
    type TableMigrationWizardForm,
} from './table-migration.pure'

export async function fetchTablesForScope(
    tree: TreeNode[],
    source: SchemaScope,
    options?: FetchTablesForScopeOptions,
): Promise<string[]> {
    if (options?.ensureChildrenLoaded) {
        await ensureMigrationSourceSchemaLoaded(tree, source, options.ensureChildrenLoaded)
    }

    const fromTree = listTablesForScope(tree, source)
    if (fromTree.length) {
        return fromTree
    }

    const remote = await (async () => {
        const {fetchAiSchemaTables} = await import('@/features/ai/datasource/services/ai-schema.service')
        return fetchAiSchemaTables(source.connectionId, source.database, {silent: true})
    })()
    if (remote.length) {
        return [...remote].sort((a, b) => a.localeCompare(b))
    }
    return fromTree
}

export async function runTableMigrationPreflight(
    source: SchemaScope,
    form: TableMigrationWizardForm,
): Promise<TableMigrationPreflightResult> {
    const errorCode = validateTableMigrationForPreflight(
        source,
        form.targetConnectionId,
        form.targetDatabase,
        form,
    )
    if (errorCode) {
        throw new Error(errorCode)
    }
    const {migrationApi} = await import('@/api/modules/migration')
    return migrationApi.preflight(buildPreflightRequest(source, form))
}

export async function runTableMigrationRowDiff(
    source: SchemaScope,
    form: TableMigrationWizardForm,
    tableName: string,
): Promise<import('@/shared/api/types').TableMigrationRowDiffResult> {
    const {migrationApi} = await import('@/api/modules/migration')
    return migrationApi.rowDiff({
        sourceConnectionId: source.connectionId,
        sourceDatabase: source.database,
        targetConnectionId: form.targetConnectionId,
        targetDatabase: form.targetDatabase,
        tableName,
        whereClause: form.whereClause?.trim() || undefined,
        sampleLimit: 50,
    })
}

export function downloadMigrationRunReport(record: TableMigrationRunRecord): void {
    const stamp = record.startedAt.replace(/[:.]/g, '-').slice(0, 19)
    const blob = new Blob([JSON.stringify(record, null, 2)], {type: 'application/json;charset=utf-8'})
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `migration-${stamp}-${record.id.slice(0, 8)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
}

export function saveMigrationRunToHistory(record: TableMigrationRunRecord): void {
    if (typeof localStorage === 'undefined' || !canPersistLocalResource(UserResource.MigrationHistory)) return
    try {
        const existing = loadMigrationRunHistory()
        const next = [record, ...existing.filter((item) => item.id !== record.id)]
            .slice(0, MIGRATION_HISTORY_MAX)
        localStorage.setItem(resolveMigrationHistoryStorageKey(), JSON.stringify(next))
    } catch {
        // ignore quota / private mode
    }
}

export function loadMigrationRunHistory(): TableMigrationRunRecord[] {
    if (typeof localStorage === 'undefined') return []
    if (!canReadResource(UserResource.MigrationHistory)) return []
    if (!canPersistLocalResource(UserResource.MigrationHistory)) return []
    try {
        const raw = localStorage.getItem(resolveMigrationHistoryStorageKey())
        if (!raw) return []
        const parsed = JSON.parse(raw) as TableMigrationRunRecord[]
        if (!Array.isArray(parsed)) return []
        const trimmed = parsed.slice(0, MIGRATION_HISTORY_MAX)
        if (trimmed.length < parsed.length) {
            localStorage.setItem(resolveMigrationHistoryStorageKey(), JSON.stringify(trimmed))
        }
        return trimmed
    } catch {
        return []
    }
}

export function saveActiveMigrationRunSnapshot(record: TableMigrationRunRecord): void {
    if (typeof localStorage === 'undefined' || !canPersistLocalResource(UserResource.MigrationHistory)) return
    try {
        localStorage.setItem(MIGRATION_ACTIVE_RUN_STORAGE_KEY, JSON.stringify(record))
    } catch {
        // ignore quota / private mode
    }
}

export function loadActiveMigrationRunSnapshot(): TableMigrationRunRecord | null {
    if (typeof localStorage === 'undefined') return null
    if (!canReadResource(UserResource.MigrationHistory)) return null
    if (!canPersistLocalResource(UserResource.MigrationHistory)) return null
    try {
        const raw = localStorage.getItem(MIGRATION_ACTIVE_RUN_STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as TableMigrationRunRecord | null
        return parsed && parsed.status === 'running' ? parsed : null
    } catch {
        return null
    }
}

export function clearActiveMigrationRunSnapshot(): void {
    if (typeof localStorage === 'undefined') return
    try {
        localStorage.removeItem(MIGRATION_ACTIVE_RUN_STORAGE_KEY)
    } catch {
        // ignore quota / private mode
    }
}

export function saveActiveMigrationProgressSnapshot(progress: TableMigrationRunProgress | null): void {
    if (typeof localStorage === 'undefined' || !canPersistLocalResource(UserResource.MigrationHistory)) return
    try {
        if (!progress) {
            localStorage.removeItem(MIGRATION_ACTIVE_PROGRESS_STORAGE_KEY)
            return
        }
        localStorage.setItem(MIGRATION_ACTIVE_PROGRESS_STORAGE_KEY, JSON.stringify(progress))
    } catch {
        // ignore quota / private mode
    }
}

export function loadActiveMigrationProgressSnapshot(): TableMigrationRunProgress | null {
    if (typeof localStorage === 'undefined') return null
    if (!canReadResource(UserResource.MigrationHistory)) return null
    if (!canPersistLocalResource(UserResource.MigrationHistory)) return null
    try {
        const raw = localStorage.getItem(MIGRATION_ACTIVE_PROGRESS_STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as TableMigrationRunProgress | null
        return parsed ?? null
    } catch {
        return null
    }
}

export function clearActiveMigrationProgressSnapshot(): void {
    if (typeof localStorage === 'undefined') return
    try {
        localStorage.removeItem(MIGRATION_ACTIVE_PROGRESS_STORAGE_KEY)
    } catch {
        // ignore quota / private mode
    }
}

function buildMigrationBatchRequest(
    source: SchemaScope,
    form: TableMigrationWizardForm,
    tableNames: string[],
    preflight: TableMigrationPreflightResult | null,
    jobOptions?: MigrationRunOptions,
): TableMigrationBatchRequest {
    const tables: TableMigrationBatchTableRequest[] = tableNames.map((tableName) => {
        const preflightItem = preflight?.tables.find((item) => item.tableName === tableName)
        return {
            tableName,
            createTargetIfMissing: preflightItem
                ? shouldCreateTargetTable(form, preflightItem)
                : form.targetMissingPolicy === 'create',
        }
    })
    return {
        sourceConnectionId: source.connectionId,
        sourceDatabase: source.database,
        targetConnectionId: form.targetConnectionId,
        targetDatabase: form.targetDatabase,
        tables,
        mode: form.mode,
        watermarkColumn: form.watermarkColumn.trim() || undefined,
        orderByColumns: form.orderByColumns.length ? [...form.orderByColumns] : undefined,
        whereClause: form.whereClause.trim() || undefined,
        batchSize: form.batchSize,
        throttleMs: form.throttleMs,
        truncateTarget: form.truncateTarget,
        jobId: jobOptions?.jobId,
        resumeJobId: jobOptions?.resumeJobId,
        conflictStrategy: form.mode === 'PK_UPSERT' ? form.conflictStrategy : undefined,
    }
}

export async function restartTableMigrationFresh(
    record: TableMigrationRunRecord,
    onProgress?: (progress: TableMigrationRunProgress) => void,
    onLog?: (line: MigrationLogLine) => void,
): Promise<TableMigrationRunOutcome & {jobId: string}> {
    const jobId = createMigrationRunId()
    const source = recordToSourceScope(record)
    const form = recordToMigrationForm(record)
    const outcome = await runTableMigration(
        source,
        form,
        onProgress,
        null,
        onLog,
        {jobId},
    )
    return {...outcome, jobId}
}

function createMigrationJobStreamCoordinator(callbacks: MigrationJobWatchCallbacks) {
    const tableRowTotals = callbacks.tableRowTotals ?? {}
    const loggedTableStarts = new Set<string>()
    const lastLoggedBatchByTable = new Map<string, number>()
    const lastRowsMigratedByTable = new Map<string, number>()
    let progress: TableMigrationRunProgress = {
        total: callbacks.tables?.length ?? 0,
        completed: 0,
        results: [],
        tableRowTotals,
    }

    function publishProgress(patch: Partial<TableMigrationRunProgress>) {
        progress = {
            ...progress,
            ...patch,
            tableRowTotals,
            results: patch.results ?? progress.results,
        }
        callbacks.onProgress?.(progress)
    }

    return {
        onJobSnapshot(view: MigrationJobView) {
            publishProgress(progressFromMigrationJobView(view, tableRowTotals))
            if (view.status === 'queued' && !loggedTableStarts.has('__queued__')) {
                loggedTableStarts.add('__queued__')
                appendMigrationLog(
                    callbacks.logs ?? [],
                    {
                        level: 'info',
                        event: 'table_phase',
                        message: 'Waiting for scheduler slot',
                        phase: 'queued',
                    },
                    callbacks.onLog,
                )
            }
        },
        onTableStart(event: TableMigrationTableStartEvent) {
            if (!loggedTableStarts.has(event.tableName)) {
                loggedTableStarts.add(event.tableName)
                appendTableStartLog(
                    callbacks.logs ?? [],
                    event.tableName,
                    event.tableIndex,
                    event.tableTotal,
                    callbacks.onLog,
                )
            }
            publishProgress({
                currentTable: event.tableName,
                currentTableIndex: event.tableIndex,
                currentPhase: 'preparing',
                batchRowsMigrated: undefined,
                batchOffset: undefined,
                batchCount: undefined,
            })
        },
        onTablePhase(event: TableMigrationTablePhaseEvent) {
            appendMigrationLog(
                callbacks.logs ?? [],
                {
                    level: 'info',
                    event: 'table_phase',
                    message: `Phase ${event.phase}`,
                    tableName: event.tableName,
                    tableIndex: event.tableIndex,
                    tableTotal: event.tableTotal,
                    phase: event.phase,
                },
                callbacks.onLog,
            )
            publishProgress({
                currentTable: event.tableName,
                currentTableIndex: event.tableIndex,
                currentPhase: event.phase,
            })
        },
        onBatchProgress(event: TableMigrationTableBatchProgressEvent) {
            const lastBatch = lastLoggedBatchByTable.get(event.tableName) ?? 0
            if (event.batches > lastBatch) {
                lastLoggedBatchByTable.set(event.tableName, event.batches)
                const priorRows = lastRowsMigratedByTable.get(event.tableName) ?? 0
                const batchRows = Math.max(0, event.rowsMigrated - priorRows)
                lastRowsMigratedByTable.set(event.tableName, event.rowsMigrated)
                if (shouldAppendBatchProgressLog(event.batches, event.rowsMigrated, batchRows)) {
                    appendMigrationLog(
                        callbacks.logs ?? [],
                        {
                            level: 'info',
                            event: 'batch_progress',
                            message: `Batch ${event.batches} committed`,
                            tableName: event.tableName,
                            tableIndex: event.tableIndex,
                            tableTotal: event.tableTotal,
                            rowsMigrated: event.rowsMigrated,
                            batches: event.batches,
                            batchOffset: event.offset,
                            batchRows,
                        },
                        callbacks.onLog,
                    )
                }
            }
            publishProgress({
                currentTable: event.tableName,
                currentTableIndex: event.tableIndex,
                currentPhase: 'copying',
                batchRowsMigrated: event.rowsMigrated,
                batchOffset: event.offset,
                batchCount: event.batches,
            })
        },
        onTableResult(event: TableMigrationTableResultEvent) {
            const results = [
                ...progress.results.filter((item) => item.tableName !== event.result.tableName),
                event.result,
            ]
            publishProgress({
                results,
                currentPhase: undefined,
                batchRowsMigrated: undefined,
                batchOffset: undefined,
                batchCount: undefined,
            })
            appendTableResultLog(
                callbacks.logs ?? [],
                event.result,
                event.tableIndex,
                event.tableTotal,
                callbacks.onLog,
            )
        },
    }
}

async function watchMigrationJobUntilDone(
    jobId: string,
    callbacks: MigrationJobWatchCallbacks = {},
): Promise<{view: MigrationJobView; results: TableMigrationResult[]}> {
    const coordinator = createMigrationJobStreamCoordinator(callbacks)
    try {
        const {streamMigrationJob} = await import('@/shared/api/http/migration-job-stream')
        const outcome = await streamMigrationJob(jobId, {
            onJobSnapshot: coordinator.onJobSnapshot,
            onTableStart: coordinator.onTableStart,
            onTableResult: coordinator.onTableResult,
            onBatchProgress: coordinator.onBatchProgress,
            onTablePhase: coordinator.onTablePhase,
        })
        if (outcome.view.status === 'paused') {
            throw new Error('migrationPaused')
        }
        if (outcome.view.status === 'cancelled') {
            throw new Error('migrationCancelled')
        }
        const failureMessage = resolveMigrationJobFailureMessage(outcome.view)
        if (failureMessage) {
            throw new Error(failureMessage)
        }
        return outcome
    } catch (error) {
        if (error instanceof Error && (error.message === 'migrationPaused' || error.message === 'migrationCancelled')) {
            throw error
        }
        return pollMigrationJobUntilDone(jobId, callbacks)
    }
}

function resolveMigrationJobFailureMessage(view: MigrationJobView): string | null {
    if (view.status !== 'failed') return null
    const failedResult = view.results?.find((item) => item.status !== 'success')
    if (failedResult?.message?.trim()) {
        return failedResult.message.trim()
    }
    return 'migrationJobFailed'
}

async function pollMigrationJobUntilDone(
    jobId: string,
    callbacks: MigrationJobWatchCallbacks = {},
): Promise<{view: MigrationJobView; results: TableMigrationResult[]}> {
    const {migrationApi} = await import('@/api/modules/migration')
    const tableRowTotals = callbacks.tableRowTotals
    const lastBatchByTable = new Map<string, number>()
    const lastRowsMigratedByTable = new Map<string, number>()
    while (true) {
        const view = await migrationApi.getJob(jobId)
        callbacks.onProgress?.(progressFromMigrationJobView(view, tableRowTotals))

        const runningTable = resolveRunningTableFromJob(view)
        if (runningTable) {
            const checkpoint = view.tables[runningTable]
            const batches = checkpoint?.batchesCompleted ?? 0
            const lastBatch = lastBatchByTable.get(runningTable) ?? 0
            if (batches > lastBatch) {
                lastBatchByTable.set(runningTable, batches)
                const tableIndex = view.tablesPlanned.indexOf(runningTable) + 1
                const rowsMigrated = checkpoint?.rowsMigrated ?? 0
                const priorRows = lastRowsMigratedByTable.get(runningTable) ?? 0
                lastRowsMigratedByTable.set(runningTable, rowsMigrated)
                const batchRows = Math.max(0, rowsMigrated - priorRows)
                if (shouldAppendBatchProgressLog(batches, rowsMigrated, batchRows)) {
                    appendMigrationLog(
                        callbacks.logs ?? [],
                        {
                            level: 'info',
                            event: 'batch_progress',
                            message: `Batch ${batches} committed`,
                            tableName: runningTable,
                            tableIndex,
                            tableTotal: view.tablesPlanned.length,
                            rowsMigrated,
                            batches,
                            batchOffset: checkpoint?.lastOffset,
                            batchRows,
                        },
                        callbacks.onLog,
                    )
                }
            }
        }

        if (MIGRATION_JOB_TERMINAL_STATUSES.has(view.status)) {
            if (view.status === 'paused') {
                throw new Error('migrationPaused')
            }
            if (view.status === 'cancelled') {
                throw new Error('migrationCancelled')
            }
            const failureMessage = resolveMigrationJobFailureMessage(view)
            if (failureMessage) {
                throw new Error(failureMessage)
            }
            return {view, results: [...(view.results ?? [])]}
        }
        await sleep(MIGRATION_JOB_POLL_MS)
    }
}

export async function pauseMigrationJob(jobId: string): Promise<MigrationJobView> {
    const {migrationApi} = await import('@/api/modules/migration')
    return migrationApi.pauseJob(jobId)
}

export async function cancelMigrationJob(jobId: string): Promise<MigrationJobView> {
    const {migrationApi} = await import('@/api/modules/migration')
    return migrationApi.cancelJob(jobId)
}

export async function watchExistingMigrationJob(
    jobId: string,
    onProgress?: (progress: TableMigrationRunProgress) => void,
    onLog?: (line: MigrationLogLine) => void,
    options?: Pick<MigrationJobWatchCallbacks, 'logs' | 'tables' | 'tableRowTotals'>,
): Promise<TableMigrationRunOutcome> {
    try {
        const outcome = await watchMigrationJobUntilDone(jobId, {
            onProgress,
            onLog,
            logs: options?.logs,
            tables: options?.tables,
            tableRowTotals: options?.tableRowTotals,
        })
        return {results: outcome.results, paused: false}
    } catch (error) {
        if (error instanceof Error && error.message === 'migrationPaused') {
            return {results: [], paused: true}
        }
        if (error instanceof Error && error.message === 'migrationCancelled') {
            return {results: [], paused: false, cancelled: true}
        }
        throw error
    }
}

async function runBatchJobMigration(
    source: SchemaScope,
    form: TableMigrationWizardForm,
    tables: string[],
    preflight: TableMigrationPreflightResult | null,
    results: TableMigrationResult[],
    logs: MigrationLogLine[],
    onProgress?: (progress: TableMigrationRunProgress) => void,
    onLog?: (line: MigrationLogLine) => void,
    jobOptions?: MigrationRunOptions,
): Promise<void> {
    const batchRequest = buildMigrationBatchRequest(source, form, tables, preflight, jobOptions)
    const tableRowTotals = buildTableRowTotalsFromPreflight(preflight, tables)
    const {migrationApi} = await import('@/api/modules/migration')
    const startedView = jobOptions?.resumeJobId
        ? await migrationApi.resumeJob(jobOptions.resumeJobId)
        : await migrationApi.startJob(batchRequest)
    onProgress?.(progressFromMigrationJobView(startedView, tableRowTotals))
    try {
        const polled = await watchMigrationJobUntilDone(startedView.id, {
            onProgress,
            onLog,
            logs,
            tables,
            tableRowTotals,
        })
        results.push(...polled.results)
        const loggedResults = new Set(
            logs
                .filter((line) => line.event === 'table_done' || line.event === 'table_fail')
                .map((line) => line.tableName)
                .filter((name): name is string => Boolean(name)),
        )
        for (const result of polled.results) {
            if (loggedResults.has(result.tableName)) continue
            const tableIndex = tables.indexOf(result.tableName) + 1
            if (tableIndex <= 0) continue
            appendTableStartLog(logs, result.tableName, tableIndex, tables.length, onLog)
            appendTableResultLog(logs, result, tableIndex, tables.length, onLog)
        }
    } catch (error) {
        if (error instanceof Error && error.message === 'migrationPaused') {
            appendMigrationLog(
                logs,
                {
                    level: 'warn',
                    event: 'run_done',
                    message: 'Migration paused',
                    detail: startedView.id,
                },
                onLog,
            )
        }
        if (error instanceof Error && error.message === 'migrationCancelled') {
            appendMigrationLog(
                logs,
                {
                    level: 'warn',
                    event: 'run_done',
                    message: 'Migration cancelled',
                    detail: startedView.id,
                },
                onLog,
            )
        }
        throw error
    }
}

export async function runTableMigration(
    source: SchemaScope,
    form: TableMigrationWizardForm,
    onProgress?: (progress: TableMigrationRunProgress) => void,
    preflight?: TableMigrationPreflightResult | null,
    onLog?: (line: MigrationLogLine) => void,
    jobOptions?: MigrationRunOptions,
): Promise<TableMigrationRunOutcome> {
    const errorCode = validateTableMigrationForm(
        source,
        form.targetConnectionId,
        form.targetDatabase,
        form,
    )
    if (errorCode) {
        throw new Error(errorCode)
    }

    const tables = resolveMigrationTables(form, preflight ?? null)
    if (!tables.length) {
        throw new Error('noTables')
    }

    const tableRowTotals = buildTableRowTotalsFromPreflight(preflight ?? null, tables)
    const results: TableMigrationResult[] = []
    const logs: MigrationLogLine[] = []
    appendMigrationLog(
        logs,
        {
            level: 'info',
            event: 'run_start',
            message: jobOptions?.resumeJobId
                ? `Migration resumed (${tables.length} tables)`
                : `Migration started (${tables.length} tables)`,
            tableTotal: tables.length,
            detail: tables.join(', '),
        },
        onLog,
    )

    try {
        await runBatchJobMigration(
            source,
            form,
            tables,
            preflight ?? null,
            results,
            logs,
            onProgress,
            onLog,
            jobOptions,
        )
    } catch (error) {
        if (error instanceof Error && error.message === 'migrationPaused') {
            return {results, paused: true}
        }
        if (error instanceof Error && error.message === 'migrationCancelled') {
            return {results, paused: false, cancelled: true}
        }
        const message = resolveCaughtApiErrorMessage(
            error,
            t,
            'explorer.tableMigrationWizard.errors.migrationJobFailed',
        )
        appendMigrationLog(
            logs,
            {
                level: 'error',
                event: 'run_fail',
                message: 'Migration failed',
                detail: message,
            },
            onLog,
        )
        throw error
    }

    const summary = summarizeMigrationResults(results)
    appendMigrationLog(
        logs,
        {
            level: summary.failed > 0 ? 'warn' : 'success',
            event: 'run_done',
            message: 'Migration finished',
            tableTotal: summary.tables,
            totalRows: summary.rows,
            failedTables: summary.failed,
        },
        onLog,
    )

    onProgress?.({
        total: tables.length,
        completed: tables.length,
        currentTable: undefined,
        currentTableIndex: undefined,
        results: [...results],
        tableRowTotals,
    })

    return {results, paused: false}
}

function appendTableStartLog(
    logs: MigrationLogLine[],
    tableName: string,
    tableIndex: number,
    tableTotal: number,
    onLog?: (line: MigrationLogLine) => void,
): void {
    appendMigrationLog(
        logs,
        {
            level: 'info',
            event: 'table_start',
            message: `Migrating ${tableName}`,
            tableName,
            tableIndex,
            tableTotal,
        },
        onLog,
    )
}

function appendTableResultLog(
    logs: MigrationLogLine[],
    result: TableMigrationResult,
    tableIndex: number,
    tableTotal: number,
    onLog?: (line: MigrationLogLine) => void,
): void {
    const tableName = result.tableName
    if (result.status === 'success') {
        appendMigrationLog(
            logs,
            {
                level: result.rowCountValidation === 'mismatch' ? 'warn' : 'success',
                event: 'table_done',
                message: `Completed ${tableName}`,
                tableName,
                tableIndex,
                tableTotal,
                rowsMigrated: result.rowsMigrated,
                batches: result.batches,
                durationMs: result.durationMs,
                validation: result.rowCountValidation ?? undefined,
                detail: result.message ?? undefined,
            },
            onLog,
        )
        return
    }
    appendMigrationLog(
        logs,
        {
            level: 'error',
            event: 'table_fail',
            message: `Failed ${tableName}`,
            tableName,
            tableIndex,
            tableTotal,
            detail: result.message ?? result.status,
        },
        onLog,
    )
}

function appendTableMigrationLog(
    logs: MigrationLogLine[],
    result: TableMigrationResult,
    tableIndex: number,
    tableTotal: number,
    onLog?: (line: MigrationLogLine) => void,
): void {
    appendTableStartLog(logs, result.tableName, tableIndex, tableTotal, onLog)
    appendTableResultLog(logs, result, tableIndex, tableTotal, onLog)
}

/** 从 checkpoint 续传失败的迁移任务。 */
export async function resumeTableMigrationRun(
    record: TableMigrationRunRecord,
    onProgress?: (progress: TableMigrationRunProgress) => void,
    onLog?: (line: MigrationLogLine) => void,
): Promise<TableMigrationRunOutcome> {
    if (!canResumeMigrationRun(record)) {
        throw new Error('runNotResumable')
    }
    const source = recordToSourceScope(record)
    const form = recordToMigrationForm(record)
    return runTableMigration(
        source,
        form,
        onProgress,
        null,
        onLog,
        {jobId: record.id, resumeJobId: record.id},
    )
}

