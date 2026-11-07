import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildMigrationRunRecord,
    canProceedMigration,
    clearActiveMigrationProgressSnapshot,
    clearActiveMigrationRunSnapshot,
    computeMigrationProgressPercent,
    computeMigrationRunLiveMetrics,
    formatMigrationThroughput,
    buildTableRowTotalsFromPreflight,
    createDefaultTableMigrationForm,
    formatMigrationRunLogText,
    loadActiveMigrationProgressSnapshot,
    loadActiveMigrationRunSnapshot,
    mergePreflightColumnOptions,
    mergeRecommendedWatermarkColumns,
    mergeSuggestedOrderByColumns,
    buildWatermarkColumnSelectOptions,
    pickDefaultWatermarkColumn,
    MigrationWhereSupport,
    resolveMigrationBlockedReason,
    resolveMigrationRunStatus,
    saveActiveMigrationProgressSnapshot,
    saveActiveMigrationRunSnapshot,
    resolveMigrationTables,
    validateTableMigrationForm,
    validateTableMigrationForPreflight,
    validateTableMigrationStep,
    validateTableMigrationTarget,
    summarizeMigrationResults,
    summarizeMigrationJobCheckpoints,
    canResumeMigrationRun,
    canRestartMigrationFresh,
    resolveMigrationCheckpointBannerKey,
    filterMigrationLogsForDisplay,
    shouldAppendBatchProgressLog,
    MIGRATION_BATCH_LOG_ROW_INTERVAL,
    summarizeMigrationPreflightScan,
} from '@/features/explorer/services/table-migration.service'
import type {TableMigrationPreflightResult} from '@/shared/api/types'
import type {SchemaScope} from '@/features/schema-compare/types/schema-compare.types'

describe('table-migration.service (FB-092)', () => {
    const source: SchemaScope = {
        connectionId: 'src',
        connectionLabel: 'Source',
        database: 'db_a',
        dbType: 'mysql',
    }

    const localStorageState = new Map<string, string>()
    const localStorageMock = {
        getItem: (key: string) => localStorageState.get(key) ?? null,
        setItem: (key: string, value: string) => {
            localStorageState.set(key, value)
        },
        removeItem: (key: string) => {
            localStorageState.delete(key)
        },
    }

    Object.defineProperty(globalThis, 'localStorage', {
        value: localStorageMock,
        configurable: true,
    })

    it('rejects unsafe WHERE clauses', () => {
        assert.throws(() => MigrationWhereSupport.validate("1=1; DROP TABLE users"), /unsafeWhere/)
        assert.throws(() => MigrationWhereSupport.validate('id IN (SELECT 1 UNION SELECT 2)'), /unsafeWhere/)
    })

    it('accepts simple filter expressions', () => {
        assert.doesNotThrow(() => MigrationWhereSupport.validate("created_at >= '2024-01-01'"))
        const sql = MigrationWhereSupport.appendWhere('SELECT * FROM orders', 'status = 1')
        assert.equal(sql, 'SELECT * FROM orders WHERE status = 1')
    })

    it('validateTableMigrationTarget rejects same scope', () => {
        assert.equal(validateTableMigrationTarget(source, 'src', 'db_a'), 'sameScope')
    })

    it('validateTableMigrationStep validates per wizard step', () => {
        const form = {
            ...createDefaultTableMigrationForm(['orders']),
            targetConnectionId: 'tgt',
            targetDatabase: 'db_b',
        }
        assert.equal(
            validateTableMigrationStep('target', source, form.targetConnectionId, form.targetDatabase, form),
            null,
        )
        assert.equal(
            validateTableMigrationStep('tables', source, form.targetConnectionId, form.targetDatabase, form),
            null,
        )
        assert.equal(validateTableMigrationForm(source, form.targetConnectionId, form.targetDatabase, form), null)
    })

    it('validateTableMigrationForPreflight allows INCR_APPEND without watermark', () => {
        const form = {
            ...createDefaultTableMigrationForm(['orders']),
            targetConnectionId: 'tgt',
            targetDatabase: 'db_b',
            mode: 'INCR_APPEND' as const,
            watermarkColumn: '',
        }
        assert.equal(
            validateTableMigrationForPreflight(source, form.targetConnectionId, form.targetDatabase, form),
            null,
        )
        assert.equal(
            validateTableMigrationForm(source, form.targetConnectionId, form.targetDatabase, form),
            'watermarkRequired',
        )
    })

    it('mergePreflightColumnOptions merges watermark suggestions and column mappings', () => {
        const preflight: TableMigrationPreflightResult = {
            readyCount: 1,
            warnCount: 0,
            blockedCount: 0,
            canProceed: true,
            tables: [
                {
                    tableName: 'orders',
                    sourceExists: true,
                    targetExists: true,
                    sourceRowCount: 10,
                    targetRowCount: 0,
                    sourceColumnCount: 3,
                    targetColumnCount: 3,
                    missingOnTarget: [],
                    extraOnTarget: [],
                    status: 'ready',
                    issues: [],
                    suggestedWatermarkColumns: ['id', 'updated_at'],
                    columnMappings: [
                        {columnName: 'id', sourceType: 'bigint', targetType: 'bigint'},
                        {columnName: 'updated_at', sourceType: 'datetime', targetType: 'datetime'},
                    ],
                    mappingWarnings: [],
                },
            ],
        }
        assert.deepEqual(
            mergeRecommendedWatermarkColumns(preflight, ['orders']),
            ['id', 'updated_at'],
        )
        assert.deepEqual(
            mergePreflightColumnOptions(preflight, ['orders']),
            ['id', 'updated_at'],
        )
        assert.deepEqual(
            mergeSuggestedOrderByColumns(preflight, ['orders']),
            ['id', 'updated_at'],
        )
        assert.equal(
            pickDefaultWatermarkColumn(preflight, ['orders']),
            'updated_at',
        )
        const options = buildWatermarkColumnSelectOptions(preflight, ['orders'], {
            pk: 'PK',
            time: 'Time',
            numeric: 'Numeric',
        })
        assert.equal(options[0]?.value, 'id')
        assert.match(options[0]?.label ?? '', /PK/)
        assert.equal(options[1]?.value, 'updated_at')
        assert.match(options[1]?.label ?? '', /Time/)
    })

    it('resolveMigrationBlockedReason requires watermark for INCR_APPEND', () => {
        const form = {
            ...createDefaultTableMigrationForm(['orders']),
            targetConnectionId: 'tgt',
            targetDatabase: 'db_b',
            mode: 'INCR_APPEND' as const,
            watermarkColumn: '',
        }
        const preflight: TableMigrationPreflightResult = {
            readyCount: 1,
            warnCount: 0,
            blockedCount: 0,
            canProceed: true,
            tables: [
                {
                    tableName: 'orders',
                    sourceExists: true,
                    targetExists: true,
                    sourceRowCount: 10,
                    targetRowCount: 0,
                    sourceColumnCount: 3,
                    targetColumnCount: 3,
                    missingOnTarget: [],
                    extraOnTarget: [],
                    status: 'ready',
                    issues: [],
                    suggestedWatermarkColumns: [],
                    columnMappings: [],
                    mappingWarnings: [],
                },
            ],
        }
        assert.equal(resolveMigrationBlockedReason(form, preflight), 'watermarkRequired')
        assert.equal(canProceedMigration({...form, watermarkColumn: 'updated_at'}, preflight), true)
    })

    it('resolveMigrationTables skips blocked and missing-target when policy is skip', () => {
        const form = {
            ...createDefaultTableMigrationForm(['orders', 'users', 'logs']),
            targetConnectionId: 'tgt',
            targetDatabase: 'db_b',
            targetMissingPolicy: 'skip' as const,
        }
        const preflight: TableMigrationPreflightResult = {
            readyCount: 1,
            warnCount: 1,
            blockedCount: 1,
            canProceed: false,
            tables: [
                {
                    tableName: 'orders',
                    sourceExists: true,
                    targetExists: true,
                    sourceRowCount: 10,
                    targetRowCount: 0,
                    sourceColumnCount: 3,
                    targetColumnCount: 3,
                    missingOnTarget: [],
                    extraOnTarget: [],
                    suggestedWatermarkColumns: ['id'],
                    status: 'ready',
                    issues: [],
                    columnMappings: [],
                    mappingWarnings: [],
                },
                {
                    tableName: 'users',
                    sourceExists: true,
                    targetExists: false,
                    sourceRowCount: 5,
                    targetRowCount: null,
                    sourceColumnCount: 2,
                    targetColumnCount: 0,
                    missingOnTarget: [],
                    extraOnTarget: [],
                    suggestedWatermarkColumns: [],
                    status: 'warn',
                    issues: ['targetTableMissing'],
                    columnMappings: [],
                    suggestedCreateDdl: 'CREATE TABLE users (...)',
                    mappingWarnings: [],
                },
                {
                    tableName: 'logs',
                    sourceExists: true,
                    targetExists: true,
                    sourceRowCount: 1,
                    targetRowCount: 1,
                    sourceColumnCount: 2,
                    targetColumnCount: 1,
                    missingOnTarget: ['payload'],
                    extraOnTarget: [],
                    suggestedWatermarkColumns: [],
                    status: 'blocked',
                    issues: ['columnsMissingOnTarget'],
                    columnMappings: [],
                    mappingWarnings: [],
                },
            ],
        }
        assert.deepEqual(resolveMigrationTables(form, preflight), ['orders'])
        assert.equal(canProceedMigration(form, preflight), false)
        assert.equal(
            resolveMigrationBlockedReason(form, preflight),
            'migrationBlockedByPreflight',
        )

        const warnOnlyPreflight: TableMigrationPreflightResult = {
            readyCount: 1,
            warnCount: 1,
            blockedCount: 0,
            canProceed: true,
            tables: [
                preflight.tables[0]!,
                preflight.tables[1]!,
            ],
        }
        const warnForm = {
            ...form,
            selectedTables: ['orders', 'users'],
        }
        assert.equal(canProceedMigration(warnForm, warnOnlyPreflight), true)

        const blockForm = {...warnForm, targetMissingPolicy: 'block' as const}
        assert.equal(canProceedMigration(blockForm, warnOnlyPreflight), false)
        assert.equal(
            resolveMigrationBlockedReason(blockForm, warnOnlyPreflight),
            'migrationBlockedMissingTarget',
        )

        const createForm = {...warnForm, targetMissingPolicy: 'create' as const}
        assert.equal(canProceedMigration(createForm, warnOnlyPreflight), true)
        assert.deepEqual(resolveMigrationTables(createForm, warnOnlyPreflight), ['orders', 'users'])

        const blockedOnly: TableMigrationPreflightResult = {
            ...preflight,
            blockedCount: 1,
            canProceed: false,
        }
        assert.equal(
            resolveMigrationBlockedReason(form, blockedOnly),
            'migrationBlockedByPreflight',
        )
    })

    it('summarizeMigrationResults counts validation mismatches', () => {
        const summary = summarizeMigrationResults([
            {
                tableName: 'orders',
                rowsMigrated: 10,
                batches: 1,
                durationMs: 100,
                status: 'success',
                rowCountValidation: 'match',
            },
            {
                tableName: 'users',
                rowsMigrated: 5,
                batches: 1,
                durationMs: 50,
                status: 'success',
                rowCountValidation: 'mismatch',
            },
        ])
        assert.equal(summary.validationMismatch, 1)
    })

    it('buildMigrationRunRecord captures forensic metadata', () => {
        const record = buildMigrationRunRecord({
            id: 'run-1',
            startedAt: '2026-06-23T02:00:00.000Z',
            finishedAt: '2026-06-23T02:00:05.000Z',
            source,
            targetConnectionId: 'tgt',
            targetConnectionLabel: 'StarRocks',
            targetDatabase: 'db_b',
            form: {
                ...createDefaultTableMigrationForm(['orders']),
                targetConnectionId: 'tgt',
                targetDatabase: 'db_b',
                batchSize: 500,
            },
            tablesPlanned: ['orders'],
            results: [{
                tableName: 'orders',
                rowsMigrated: 10,
                batches: 1,
                durationMs: 100,
                status: 'success',
                rowCountValidation: 'match',
            }],
            logs: [{
                at: '2026-06-23T02:00:01.000Z',
                level: 'success',
                event: 'table_done',
                message: 'Completed orders',
                tableName: 'orders',
            }],
        })
        assert.equal(record.status, 'success')
        assert.equal(record.durationMs, 5000)
        assert.equal(record.target.connectionLabel, 'StarRocks')
        const text = formatMigrationRunLogText(record)
        assert.match(text, /Migration Run ID: run-1/)
        assert.match(text, /Completed orders/)
    })

    it('resolveMigrationRunStatus reflects failures and paused job', () => {
        assert.equal(resolveMigrationRunStatus([{tableName: 'a', rowsMigrated: 0, batches: 0, durationMs: 0, status: 'success'}]), 'success')
        assert.equal(resolveMigrationRunStatus([
            {tableName: 'a', rowsMigrated: 0, batches: 0, durationMs: 0, status: 'success'},
            {tableName: 'b', rowsMigrated: 0, batches: 0, durationMs: 0, status: 'failed'},
        ]), 'partial')
        assert.equal(resolveMigrationRunStatus([], 'paused'), 'paused')
        assert.equal(resolveMigrationRunStatus([
            {tableName: 'a', rowsMigrated: 100, batches: 2, durationMs: 50, status: 'success'},
        ], 'paused'), 'paused')
    })

    it('canResumeMigrationRun allows failed, partial, and paused records', async () => {
        const {canResumeMigrationRun, canPauseMigrationRun} = await import('@/features/explorer/services/table-migration.service')
        const base = {
            id: 'run-1',
            startedAt: '2026-06-23T02:00:00.000Z',
            finishedAt: '2026-06-23T02:00:05.000Z',
            durationMs: 5000,
            source: {connectionId: 'src', connectionLabel: 'Source', database: 'db_a', dbType: 'mysql' as const},
            target: {connectionId: 'tgt', connectionLabel: 'Target', database: 'db_b'},
            options: {
                whereClause: '',
                batchSize: 500,
                throttleMs: 0,
                truncateTarget: true,
                targetMissingPolicy: 'block' as const,
            },
            tablesPlanned: ['orders'],
            summary: {tables: 1, rows: 0, failed: 0, validationMismatch: 0},
            results: [],
            logs: [],
        }
        assert.equal(canResumeMigrationRun({...base, status: 'success'}), false)
        assert.equal(canResumeMigrationRun({...base, status: 'failed'}), true)
        assert.equal(canResumeMigrationRun({...base, status: 'partial'}), true)
        assert.equal(canResumeMigrationRun({...base, status: 'paused'}), true)
        assert.equal(canPauseMigrationRun(true, 'run-1', 'run-1'), true)
        assert.equal(canPauseMigrationRun(false, 'run-1', 'run-1'), false)
        assert.equal(canPauseMigrationRun(true, 'run-2', 'run-1'), false)
    })

    it('buildMigrationRunRecord honors paused job status', () => {
        const record = buildMigrationRunRecord({
            id: 'run-paused',
            startedAt: '2026-06-23T02:00:00.000Z',
            finishedAt: '2026-06-23T02:00:05.000Z',
            source,
            targetConnectionId: 'tgt',
            targetConnectionLabel: 'Target',
            targetDatabase: 'db_b',
            form: {
                ...createDefaultTableMigrationForm(['orders', 'users']),
                targetConnectionId: 'tgt',
                targetDatabase: 'db_b',
            },
            tablesPlanned: ['orders', 'users'],
            results: [{
                tableName: 'orders',
                rowsMigrated: 1000,
                batches: 2,
                durationMs: 200,
                status: 'success',
            }],
            logs: [],
            jobStatus: 'paused',
        })
        assert.equal(record.status, 'paused')
    })

    it('persists and clears active run snapshots', () => {
        clearActiveMigrationRunSnapshot()
        clearActiveMigrationProgressSnapshot()

        const record = {
            id: 'run-live',
            startedAt: '2026-06-23T02:00:00.000Z',
            finishedAt: '',
            durationMs: 0,
            status: 'running' as const,
            source,
            target: {
                connectionId: 'tgt',
                connectionLabel: 'Target',
                database: 'db_b',
            },
            options: {
                whereClause: '',
                batchSize: 500,
                throttleMs: 0,
                truncateTarget: true,
                targetMissingPolicy: 'block' as const,
            },
            tablesPlanned: ['orders'],
            summary: {tables: 0, rows: 0, failed: 0, validationMismatch: 0},
            results: [],
            logs: [],
        }
        const progress = {
            total: 2,
            completed: 1,
            currentTable: 'orders',
            results: [],
            batchRowsMigrated: 500,
            batchOffset: 500,
            batchCount: 1,
        }

        saveActiveMigrationRunSnapshot(record)
        saveActiveMigrationProgressSnapshot(progress)

        assert.deepEqual(loadActiveMigrationRunSnapshot(), record)
        assert.deepEqual(loadActiveMigrationProgressSnapshot(), progress)

        clearActiveMigrationRunSnapshot()
        clearActiveMigrationProgressSnapshot()

        assert.equal(loadActiveMigrationRunSnapshot(), null)
        assert.equal(loadActiveMigrationProgressSnapshot(), null)
    })

    it('computeMigrationProgressPercent weights table and row progress', () => {
        assert.equal(computeMigrationProgressPercent({
            total: 2,
            completed: 1,
            currentTable: 'orders',
            results: [],
            tableRowTotals: {orders: 1000},
            batchRowsMigrated: 500,
        }), 75)

        assert.equal(computeMigrationProgressPercent({
            total: 1,
            completed: 1,
            results: [],
        }), 100)
    })

    it('computeMigrationRunLiveMetrics reports throughput and ETA', () => {
        const metrics = computeMigrationRunLiveMetrics(
            {
                total: 1,
                completed: 0,
                currentTable: 'orders',
                results: [],
                tableRowTotals: {orders: 1000},
                batchRowsMigrated: 250,
            },
            new Date(Date.now() - 10_000).toISOString(),
            Date.now(),
        )
        assert.equal(metrics.rowsMigrated, 250)
        assert.ok(metrics.rowsPerSecond != null && metrics.rowsPerSecond > 0)
        assert.equal(metrics.remainingRows, 750)
        assert.ok(metrics.etaMs != null && metrics.etaMs > 0)
        assert.match(formatMigrationThroughput(metrics.rowsPerSecond), /\d/)
    })

    it('buildTableRowTotalsFromPreflight maps source row counts', () => {
        const preflight = {
            readyCount: 1,
            warnCount: 0,
            blockedCount: 0,
            canProceed: true,
            tables: [{
                tableName: 'users',
                sourceExists: true,
                targetExists: true,
                sourceRowCount: 1200,
                targetRowCount: 0,
                sourceColumnCount: 3,
                targetColumnCount: 3,
                missingOnTarget: [],
                extraOnTarget: [],
                suggestedWatermarkColumns: ['id'],
                status: 'ready',
                issues: [],
                columnMappings: [],
                suggestedCreateDdl: null,
                mappingWarnings: [],
            }],
        } satisfies TableMigrationPreflightResult

        assert.deepEqual(
            buildTableRowTotalsFromPreflight(preflight, ['users']),
            {users: 1200},
        )
    })

    it('summarizeMigrationJobCheckpoints counts progress and completed tables', () => {
        const view = {
            id: 'job-1',
            status: 'failed',
            tablesPlanned: ['users', 'orders'],
            tables: {
                users: {
                    tableName: 'users',
                    status: 'completed',
                    lastOffset: 100,
                    rowsMigrated: 100,
                    batchesCompleted: 2,
                },
                orders: {
                    tableName: 'orders',
                    status: 'failed',
                    lastOffset: 50,
                    rowsMigrated: 50,
                    batchesCompleted: 1,
                },
            },
            results: [],
        }
        const summary = summarizeMigrationJobCheckpoints(view)
        assert.equal(summary.tableCount, 2)
        assert.equal(summary.tablesCompleted, 1)
        assert.equal(summary.tablesFailed, 1)
        assert.equal(summary.tablesWithProgress, 2)
        assert.equal(summary.hasPersistedCheckpoints, true)

        const record = buildMigrationRunRecord({
            id: 'job-1',
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            source,
            targetConnectionId: 'tgt',
            targetConnectionLabel: 'Target',
            targetDatabase: 'db_b',
            form: createDefaultTableMigrationForm(['users', 'orders']),
            tablesPlanned: ['users', 'orders'],
            results: [],
            logs: [],
            jobStatus: 'failed',
        })
        assert.equal(canResumeMigrationRun(record, {serverJob: view, serverLoaded: true}), true)
        assert.equal(canRestartMigrationFresh(record), true)
        assert.equal(
            resolveMigrationCheckpointBannerKey(record, summary, true),
            'explorer.tableMigrationWizard.checkpointFailedWithProgress',
        )
    })

    it('shouldAppendBatchProgressLog samples by row interval', () => {
        assert.equal(shouldAppendBatchProgressLog(1, 500, 500), true)
        assert.equal(shouldAppendBatchProgressLog(2, 1000, 500), false)
        assert.equal(
            shouldAppendBatchProgressLog(
                Math.ceil(MIGRATION_BATCH_LOG_ROW_INTERVAL / 500),
                MIGRATION_BATCH_LOG_ROW_INTERVAL,
                500,
            ),
            true,
        )
    })

    it('filterMigrationLogsForDisplay keeps milestones and latest batch line', () => {
        const logs = [
            {at: 't1', level: 'info' as const, event: 'run_start' as const, message: 'start'},
            ...Array.from({length: 200}, (_, index) => ({
                at: `t-batch-${index}`,
                level: 'info' as const,
                event: 'batch_progress' as const,
                message: 'batch',
                tableName: 'orders',
                batches: index + 1,
                rowsMigrated: (index + 1) * 500,
                batchRows: 500,
            })),
        ]
        const filtered = filterMigrationLogsForDisplay(logs)
        assert.ok(filtered.length < logs.length)
        assert.equal(filtered[0].event, 'run_start')
        assert.equal(filtered[filtered.length - 1].rowsMigrated, 200 * 500)
    })

    it('summarizeMigrationPreflightScan warns on full-copy modes with row totals', () => {
        const preflight: TableMigrationPreflightResult = {
            readyCount: 1,
            warnCount: 0,
            blockedCount: 0,
            canProceed: true,
            tables: [{
                tableName: 'orders',
                sourceExists: true,
                targetExists: true,
                sourceRowCount: 250_000,
                targetRowCount: 0,
                sourceColumnCount: 3,
                targetColumnCount: 3,
                missingOnTarget: [],
                extraOnTarget: [],
                suggestedWatermarkColumns: ['id'],
                primaryKeyColumns: ['id'],
                status: 'ready',
                issues: [],
                columnMappings: [],
                mappingWarnings: [],
            }],
        }
        const form = createDefaultTableMigrationForm(['orders'])
        form.mode = 'FULL_APPEND'

        const summary = summarizeMigrationPreflightScan(form.mode, preflight, form.selectedTables)

        assert.ok(summary)
        assert.equal(summary?.variant, 'warning')
        assert.equal(summary?.messageKey, 'explorer.tableMigrationWizard.scanBannerFullScan')
        assert.equal(summary?.totalSourceRows, 250_000)
    })

    it('summarizeMigrationPreflightScan flags PK_UPSERT without primary key', () => {
        const preflight: TableMigrationPreflightResult = {
            readyCount: 1,
            warnCount: 0,
            blockedCount: 0,
            canProceed: true,
            tables: [{
                tableName: 'events',
                sourceExists: true,
                targetExists: true,
                sourceRowCount: 42,
                targetRowCount: 0,
                sourceColumnCount: 2,
                targetColumnCount: 2,
                missingOnTarget: [],
                extraOnTarget: [],
                suggestedWatermarkColumns: ['created_at'],
                primaryKeyColumns: [],
                status: 'ready',
                issues: [],
                columnMappings: [],
                mappingWarnings: [],
            }],
        }
        const form = createDefaultTableMigrationForm(['events'])
        form.mode = 'PK_UPSERT'

        const summary = summarizeMigrationPreflightScan(form.mode, preflight, form.selectedTables)

        assert.ok(summary)
        assert.equal(summary?.variant, 'warning')
        assert.equal(summary?.messageKey, 'explorer.tableMigrationWizard.scanBannerNoPk')
        assert.deepEqual(summary?.tablesWithoutPrimaryKey, ['events'])
    })
})
