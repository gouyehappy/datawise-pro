import type {SelectOption} from '@/core/components/select.types'
import type {
    TableMigrationTableBatchProgressEvent,
    TableMigrationTableResultEvent,
    TableMigrationTableStartEvent,
} from '@/shared/api/http/migration-stream'
import type {DbType, TreeNode} from '@/core/types'
import {findAncestorByType, findNodeById, walkTree} from '@/core/utils/tree'
import type {MigrationJobView, MigrationTableCheckpoint, TableMigrationBatchRequest, TableMigrationBatchTableRequest, TableMigrationPreflightRequest, TableMigrationPreflightResult, TableMigrationPreflightTableResult, TableMigrationRequest, TableMigrationResult} from '@/shared/api/types'
import type {SchemaScope} from '@/features/schema-compare/types/schema-compare.types'
import {resolveSchemaScopeFromDatabaseNode, scopesEqual} from '@/features/schema-compare/services/schema-scope.service'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {
    canPersistLocalResource,
    canReadResource,
    resolveResourceStorageKey,
} from '@/features/auth/services/user-resource-policy'

export type TableMigrationWizardStep = 'target' | 'tables' | 'options'

export interface TableMigrationWizardContext {
    source: SchemaScope
    preselectedTables?: string[]
}

export type TargetMissingPolicy = 'block' | 'skip' | 'create'
export type MigrationMode = 'FULL_APPEND' | 'FULL_REPLACE' | 'INCR_APPEND' | 'PK_UPSERT'
export type MigrationConflictStrategy = 'OVERWRITE' | 'SKIP' | 'FAIL'

export interface TableMigrationWizardForm {
    targetConnectionId: string
    targetDatabase: string
    selectedTables: string[]
    mode: MigrationMode
    watermarkColumn: string
    orderByColumns: string[]
    whereClause: string
    batchSize: number
    throttleMs: number
    truncateTarget: boolean
    targetMissingPolicy: TargetMissingPolicy
    conflictStrategy: MigrationConflictStrategy
    /** 视图模型迁移：源 SELECT */
    sourceSelectSql?: string
    /** 视图模型迁移：目标物理表名 */
    migrationTargetTableName?: string
}

export const MIGRATION_BATCH_SIZE_DEFAULT = 500
export const MIGRATION_BATCH_SIZE_MIN = 50
export const MIGRATION_BATCH_SIZE_MAX = 5000
export const MIGRATION_THROTTLE_MAX_MS = 5000

export const UNSAFE_WHERE =
    /;|--|\/\*|\*\/|\b(insert|update|delete|drop|truncate|alter|create|grant|revoke|exec|execute|merge|call|union|select|into|outfile|dumpfile|load_file|benchmark|pg_sleep|sleep|information_schema|pg_catalog|xp_|sp_|declare|waitfor)\b/i

export const MigrationWhereSupport = {
    validate(whereClause?: string | null): void {
        const trimmed = whereClause?.trim()
        if (!trimmed) return
        if (trimmed.length > 2000) {
            throw new Error('whereTooLong')
        }
        if (UNSAFE_WHERE.test(trimmed)) {
            throw new Error('unsafeWhere')
        }
    },

    appendWhere(baseSelectSql: string, whereClause?: string | null): string {
        const trimmed = whereClause?.trim()
        if (!trimmed) return baseSelectSql
        MigrationWhereSupport.validate(trimmed)
        return `${baseSelectSql} WHERE ${trimmed}`
    },
}

export function resolveTableMigrationContext(
    tree: TreeNode[],
    node: TreeNode,
): TableMigrationWizardContext | null {
    if (node.type === 'database') {
        const source = resolveSchemaScopeFromDatabaseNode(tree, node)
        if (!source) return null
        return {source}
    }
    if (node.type === 'table') {
        const databaseNode = findAncestorByType(tree, node.id, 'database')
        if (!databaseNode) return null
        const source = resolveSchemaScopeFromDatabaseNode(tree, databaseNode)
        if (!source) return null
        return {source, preselectedTables: [node.label]}
    }
    return null
}

export function listTablesUnderDatabaseNode(databaseNode: TreeNode): string[] {
    const tablesFolder = databaseNode.children?.find(
        (child) => child.type === 'folder' && child.label.toLowerCase() === 'tables',
    )
    const searchRoots = tablesFolder ? [tablesFolder] : [databaseNode]
    const tables: string[] = []
    walkTree(searchRoots, (node) => {
        if (node.type === 'table') tables.push(node.label)
    })
    return tables.sort((a, b) => a.localeCompare(b))
}

export function findDatabaseNode(connectionNode: TreeNode, database: string): TreeNode | undefined {
    const normalized = database.trim()
    if (!normalized) return undefined
    return connectionNode.children?.find(
        (child) =>
            child.type === 'database'
            && child.label.localeCompare(normalized, undefined, {sensitivity: 'accent'}) === 0,
    )
}

export type EnsureChildrenLoaded = (nodeId: string) => Promise<void>

/** 按 explorer 懒加载路径拉全 source 连接 → 库 → tables 目录。 */
export async function ensureMigrationSourceSchemaLoaded(
    tree: TreeNode[],
    source: SchemaScope,
    ensureChildrenLoaded: EnsureChildrenLoaded,
): Promise<void> {
    await ensureChildrenLoaded(source.connectionId)
    const connectionNode = findNodeById(tree, source.connectionId)
    if (!connectionNode) return

    const databaseNode = findDatabaseNode(connectionNode, source.database)
    if (!databaseNode) return

    await ensureChildrenLoaded(databaseNode.id)
    const tablesFolder = databaseNode.children?.find(
        (child) => child.type === 'folder' && child.label.toLowerCase() === 'tables',
    )
    if (tablesFolder) {
        await ensureChildrenLoaded(tablesFolder.id)
    }
}

export function listTablesUnderDatabase(tree: TreeNode[], databaseNodeId: string): string[] {
    const databaseNode = findNodeById(tree, databaseNodeId)
    if (!databaseNode) return []
    return listTablesUnderDatabaseNode(databaseNode)
}

export function listTablesForScope(tree: TreeNode[], source: SchemaScope): string[] {
    const connectionNode = findNodeById(tree, source.connectionId)
    if (!connectionNode) return []
    const databaseNode = findDatabaseNode(connectionNode, source.database)
    if (!databaseNode) return []
    return listTablesUnderDatabaseNode(databaseNode)
}

export interface FetchTablesForScopeOptions {
    ensureChildrenLoaded?: EnsureChildrenLoaded
}

export function validateTableMigrationTarget(
    source: SchemaScope,
    targetConnectionId: string,
    targetDatabase: string,
): string | null {
    if (!targetConnectionId.trim() || !targetDatabase.trim()) {
        return 'targetRequired'
    }
    if (scopesEqual(source, {
        connectionId: targetConnectionId,
        database: targetDatabase,
        connectionLabel: '',
        dbType: source.dbType,
    })) {
        return 'sameScope'
    }
    return null
}

export function validateTableMigrationTables(selectedTables: string[]): string | null {
    if (!selectedTables.length) return 'noTables'
    return null
}

export interface ValidateTableMigrationOptionsParams {
    requireWatermark?: boolean
}

export function validateTableMigrationOptions(
    form: TableMigrationWizardForm,
    params: ValidateTableMigrationOptionsParams = {},
): string | null {
    const requireWatermark = params.requireWatermark ?? true
    if (form.batchSize < MIGRATION_BATCH_SIZE_MIN || form.batchSize > MIGRATION_BATCH_SIZE_MAX) {
        return 'invalidBatchSize'
    }
    if (form.throttleMs < 0 || form.throttleMs > MIGRATION_THROTTLE_MAX_MS) {
        return 'invalidThrottle'
    }
    if (requireWatermark && form.mode === 'INCR_APPEND' && !form.watermarkColumn.trim()) {
        return 'watermarkRequired'
    }
    try {
        MigrationWhereSupport.validate(form.whereClause)
    } catch (error) {
        if (error instanceof Error && error.message === 'unsafeWhere') return 'unsafeWhere'
        if (error instanceof Error && error.message === 'whereTooLong') return 'whereTooLong'
    }
    return null
}

export function validateTableMigrationStep(
    step: TableMigrationWizardStep,
    source: SchemaScope,
    targetConnectionId: string,
    targetDatabase: string,
    form: TableMigrationWizardForm,
): string | null {
    switch (step) {
        case 'target':
            return validateTableMigrationTarget(source, targetConnectionId, targetDatabase)
        case 'tables':
            return validateTableMigrationTables(form.selectedTables)
        case 'options':
            return validateTableMigrationOptions(form)
        default:
            return null
    }
}

export function createDefaultTableMigrationForm(
    preselectedTables: string[] = [],
): TableMigrationWizardForm {
    return {
        targetConnectionId: '',
        targetDatabase: '',
        selectedTables: [...preselectedTables],
        mode: 'FULL_APPEND',
        watermarkColumn: '',
        orderByColumns: [],
        whereClause: '',
        batchSize: MIGRATION_BATCH_SIZE_DEFAULT,
        throttleMs: 0,
        truncateTarget: false,
        targetMissingPolicy: 'block',
        conflictStrategy: 'OVERWRITE',
    }
}

export type WatermarkColumnKind = 'pk' | 'time' | 'numeric' | 'other'

export const TEMPORAL_COLUMN_NAME = /(?:updated?_?at|update_?time|modify_?time|gmt_?modified|last_?modified|changed_?at|created?_?at|create_?time|insert_?time|gmt_?create|event_?time|record_?time|ts)/i

export function isTemporalColumnName(name: string): boolean {
    return TEMPORAL_COLUMN_NAME.test(name.trim())
}

export function isTemporalSourceType(sourceType: string): boolean {
    const lower = sourceType.toLowerCase()
    return /date|time|timestamp/.test(lower)
}

export function forEachPreflightTable(
    preflight: TableMigrationPreflightResult | null,
    selectedTables: string[],
    visit: (table: TableMigrationPreflightTableResult) => void,
): void {
    if (!preflight) return
    for (const tableName of selectedTables) {
        const item = preflight.tables.find((row) => row.tableName === tableName)
        if (item) visit(item)
    }
}

export function mergeColumnNames(
    addColumn: (column: string | null | undefined) => void,
    preflight: TableMigrationPreflightResult | null,
    selectedTables: string[],
    source: 'recommended' | 'all' | 'watermark-options',
): string[] {
    const merged: string[] = []
    const seen = new Set<string>()
    const push = (column: string | null | undefined) => {
        if (!column?.trim()) return
        const key = column.trim().toLowerCase()
        if (seen.has(key)) return
        seen.add(key)
        merged.push(column.trim())
        addColumn(column)
    }
    forEachPreflightTable(preflight, selectedTables, (item) => {
        if (source === 'recommended' || source === 'watermark-options') {
            for (const column of item.suggestedWatermarkColumns ?? []) {
                push(column)
            }
        }
        if (source === 'all' || source === 'watermark-options') {
            for (const mapping of item.columnMappings ?? []) {
                push(mapping.columnName)
            }
        }
    })
    return merged
}

/** 预检推荐列：主键、时间字段等（来自后端 suggestedWatermarkColumns）。 */
export function mergeRecommendedWatermarkColumns(
    preflight: TableMigrationPreflightResult | null,
    selectedTables: string[],
): string[] {
    return mergeColumnNames(() => {}, preflight, selectedTables, 'recommended')
}

/** 源表全部列名（来自 columnMappings）。 */
export function mergeAllTableColumns(
    preflight: TableMigrationPreflightResult | null,
    selectedTables: string[],
): string[] {
    return mergeColumnNames(() => {}, preflight, selectedTables, 'all')
}

export function mergePreflightColumnOptions(
    preflight: TableMigrationPreflightResult | null,
    selectedTables: string[],
): string[] {
    return mergeColumnNames(() => {}, preflight, selectedTables, 'watermark-options')
}

export function buildColumnSourceTypeMap(
    preflight: TableMigrationPreflightResult | null,
    selectedTables: string[],
): Map<string, string> {
    const types = new Map<string, string>()
    forEachPreflightTable(preflight, selectedTables, (item) => {
        for (const mapping of item.columnMappings ?? []) {
            const key = mapping.columnName.trim().toLowerCase()
            if (!types.has(key)) {
                types.set(key, mapping.sourceType)
            }
        }
    })
    return types
}

export function inferWatermarkColumnKind(
    column: string,
    recommended: readonly string[],
    sourceType = '',
): WatermarkColumnKind {
    const key = column.trim().toLowerCase()
    const inRecommended = recommended.some((item) => item.toLowerCase() === key)
    if (isTemporalColumnName(column) || isTemporalSourceType(sourceType)) {
        return 'time'
    }
    if (inRecommended) {
        return 'pk'
    }
    const lowerType = sourceType.toLowerCase()
    if (/int|serial|bigint/.test(lowerType)) {
        return 'numeric'
    }
    return 'other'
}

export interface WatermarkColumnLabelKeys {
    pk: string
    time: string
    numeric: string
}

export function buildWatermarkColumnSelectOptions(
    preflight: TableMigrationPreflightResult | null,
    selectedTables: string[],
    labels: WatermarkColumnLabelKeys,
): SelectOption[] {
    const recommended = mergeRecommendedWatermarkColumns(preflight, selectedTables)
    const allColumns = mergeAllTableColumns(preflight, selectedTables)
    const sourceTypes = buildColumnSourceTypeMap(preflight, selectedTables)
    const options: SelectOption[] = []
    const seen = new Set<string>()

    for (const column of recommended) {
        const key = column.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        const kind = inferWatermarkColumnKind(column, recommended, sourceTypes.get(key) ?? '')
        const tag = kind === 'time' ? labels.time : kind === 'numeric' ? labels.numeric : labels.pk
        options.push({value: column, label: `${column} (${tag})`})
    }

    for (const column of allColumns) {
        const key = column.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        options.push({value: column, label: column})
    }

    return options
}

export function pickDefaultWatermarkColumn(
    preflight: TableMigrationPreflightResult | null,
    selectedTables: string[],
): string {
    const recommended = mergeRecommendedWatermarkColumns(preflight, selectedTables)
    const sourceTypes = buildColumnSourceTypeMap(preflight, selectedTables)
    const timeColumn = recommended.find((column) => {
        const key = column.toLowerCase()
        return isTemporalColumnName(column) || isTemporalSourceType(sourceTypes.get(key) ?? '')
    })
    return timeColumn ?? recommended[0] ?? ''
}

export function mergeSuggestedOrderByColumns(
    preflight: TableMigrationPreflightResult | null,
    selectedTables: string[],
): string[] {
    return mergeRecommendedWatermarkColumns(preflight, selectedTables)
}

export function defaultOrderByColumnsFromPreflight(
    preflight: TableMigrationPreflightResult | null,
    selectedTables: string[],
): string[] {
    return mergeSuggestedOrderByColumns(preflight, selectedTables)
}

export function toggleOrderByColumn(form: TableMigrationWizardForm, column: string, checked: boolean): void {
    if (checked) {
        if (!form.orderByColumns.includes(column)) {
            form.orderByColumns = [...form.orderByColumns, column]
        }
        return
    }
    form.orderByColumns = form.orderByColumns.filter((item) => item !== column)
}

export function buildPreflightRequest(
    source: SchemaScope,
    form: TableMigrationWizardForm,
): TableMigrationPreflightRequest {
    return {
        sourceConnectionId: source.connectionId,
        sourceDatabase: source.database,
        targetConnectionId: form.targetConnectionId,
        targetDatabase: form.targetDatabase,
        tableNames: [...form.selectedTables],
        whereClause: form.whereClause.trim() || undefined,
    }
}

export function resolveMigrationTables(
    form: TableMigrationWizardForm,
    preflight: TableMigrationPreflightResult | null,
): string[] {
    if (!preflight) {
        return [...form.selectedTables]
    }
    const blocked = new Set(
        preflight.tables
            .filter((item) => item.status === 'blocked')
            .map((item) => item.tableName),
    )
    return form.selectedTables.filter((tableName) => {
        if (blocked.has(tableName)) return false
        const item = preflight.tables.find((row) => row.tableName === tableName)
        if (!item) return true
        if (
            form.targetMissingPolicy === 'skip'
            && item.issues.includes('targetTableMissing')
        ) {
            return false
        }
        return true
    })
}

export function shouldCreateTargetTable(
    form: TableMigrationWizardForm,
    preflightItem: TableMigrationPreflightTableResult,
): boolean {
    return form.targetMissingPolicy === 'create'
        && preflightItem.issues.includes('targetTableMissing')
}

export function canProceedMigration(
    form: TableMigrationWizardForm,
    preflight: TableMigrationPreflightResult | null,
): boolean {
    return resolveMigrationBlockedReason(form, preflight) === null
}

export function resolveMigrationBlockedReason(
    form: TableMigrationWizardForm,
    preflight: TableMigrationPreflightResult | null,
): string | null {
    if (!preflight) return 'preflightRequired'
    if (preflight.blockedCount > 0) return 'migrationBlockedByPreflight'
    if (form.targetMissingPolicy === 'block') {
        const hasMissingTarget = preflight.tables.some((item) =>
            item.issues.includes('targetTableMissing'),
        )
        if (hasMissingTarget) return 'migrationBlockedMissingTarget'
    }
    if (resolveMigrationTables(form, preflight).length === 0) {
        return form.targetMissingPolicy === 'skip'
            ? 'migrationBlockedAllSkipped'
            : 'migrationBlockedNoTables'
    }
    if (form.mode === 'INCR_APPEND' && !form.watermarkColumn.trim()) {
        return 'watermarkRequired'
    }
    return null
}

export function validateTableMigrationForm(
    source: SchemaScope,
    targetConnectionId: string,
    targetDatabase: string,
    form: TableMigrationWizardForm,
): string | null {
    return validateTableMigrationTarget(source, targetConnectionId, targetDatabase)
        ?? validateTableMigrationTables(form.selectedTables)
        ?? validateTableMigrationOptions(form)
}

export function validateTableMigrationForPreflight(
    source: SchemaScope,
    targetConnectionId: string,
    targetDatabase: string,
    form: TableMigrationWizardForm,
): string | null {
    return validateTableMigrationTarget(source, targetConnectionId, targetDatabase)
        ?? validateTableMigrationTables(form.selectedTables)
        ?? validateTableMigrationOptions(form, {requireWatermark: false})
}

export function buildMigrationRequest(
    source: SchemaScope,
    form: TableMigrationWizardForm,
    tableName: string,
    preflight: TableMigrationPreflightResult | null,
): TableMigrationRequest {
    const preflightItem = preflight?.tables.find((item) => item.tableName === tableName)
    return {
        sourceConnectionId: source.connectionId,
        sourceDatabase: source.database,
        targetConnectionId: form.targetConnectionId,
        targetDatabase: form.targetDatabase,
        tableName,
        whereClause: form.whereClause.trim() || undefined,
        batchSize: form.batchSize,
        throttleMs: form.throttleMs,
        truncateTarget: form.truncateTarget,
        createTargetIfMissing: preflightItem
            ? shouldCreateTargetTable(form, preflightItem)
            : form.targetMissingPolicy === 'create',
        sourceSelectSql: form.sourceSelectSql?.trim() || undefined,
        targetTableName: form.migrationTargetTableName?.trim() || undefined,
    }
}

export interface TableMigrationRunProgress {
    total: number
    completed: number
    currentTable?: string
    currentTableIndex?: number
    currentPhase?: string
    results: TableMigrationResult[]
    batchRowsMigrated?: number
    batchOffset?: number
    batchCount?: number
    tableRowTotals?: Record<string, number>
}

export interface MigrationRunOptions {
    jobId?: string
    resumeJobId?: string
}

export type MigrationLogLevel = 'info' | 'success' | 'warn' | 'error'

export type MigrationLogEvent =
    | 'run_start'
    | 'table_start'
    | 'table_phase'
    | 'batch_progress'
    | 'table_done'
    | 'table_fail'
    | 'run_done'
    | 'run_fail'

export interface MigrationLogLine {
    at: string
    level: MigrationLogLevel
    event: MigrationLogEvent
    message: string
    tableName?: string
    tableIndex?: number
    tableTotal?: number
    rowsMigrated?: number
    batches?: number
    batchOffset?: number
    batchRows?: number
    durationMs?: number
    validation?: string
    totalRows?: number
    failedTables?: number
    detail?: string
    phase?: string
}

export type TableMigrationRunStatus = 'running' | 'success' | 'partial' | 'failed' | 'paused' | 'cancelled'

export const MIGRATION_JOB_POLL_MS = 1500
export const MIGRATION_JOB_TERMINAL_STATUSES = new Set(['completed', 'partial', 'failed', 'paused', 'cancelled'])

export interface TableMigrationRunRecord {
    id: string
    startedAt: string
    finishedAt: string
    durationMs: number
    status: TableMigrationRunStatus
    source: {
        connectionId: string
        connectionLabel: string
        database: string
        dbType: string
    }
    target: {
        connectionId: string
        connectionLabel: string
        database: string
    }
    options: {
        mode: MigrationMode
        watermarkColumn: string
        orderByColumns?: string[]
        whereClause: string
        batchSize: number
        throttleMs: number
        truncateTarget: boolean
        targetMissingPolicy: TargetMissingPolicy
        conflictStrategy?: MigrationConflictStrategy
    }
    tablesPlanned: string[]
    summary: ReturnType<typeof summarizeMigrationResults>
    results: TableMigrationResult[]
    logs: MigrationLogLine[]
}

export const MIGRATION_HISTORY_STORAGE_KEY = 'datawise.table-migration.history'
export const MIGRATION_ACTIVE_RUN_STORAGE_KEY = 'datawise.table-migration.active-run'
export const MIGRATION_ACTIVE_PROGRESS_STORAGE_KEY = 'datawise.table-migration.active-progress'

export function resolveMigrationHistoryStorageKey(): string {
    return resolveResourceStorageKey(UserResource.MigrationHistory, MIGRATION_HISTORY_STORAGE_KEY)
        ?? MIGRATION_HISTORY_STORAGE_KEY
}
export const MIGRATION_HISTORY_MAX = 10
/** 批次进度日志：除第 1 批外，每迁移这么多行才写一条（约 3M 行 ≈ 60 条批次日志） */
export const MIGRATION_BATCH_LOG_ROW_INTERVAL = 50_000

export function shouldAppendBatchProgressLog(
    batches: number,
    rowsMigrated: number,
    batchRows: number,
): boolean {
    if (batches <= 1) return true
    const prevRows = Math.max(0, rowsMigrated - batchRows)
    const prevBucket = Math.floor(prevRows / MIGRATION_BATCH_LOG_ROW_INTERVAL)
    const nextBucket = Math.floor(rowsMigrated / MIGRATION_BATCH_LOG_ROW_INTERVAL)
    return nextBucket > prevBucket
}

/** 面板展示用：采样批次日志，并始终保留每张表最新一条进度。 */
export function filterMigrationLogsForDisplay(logs: MigrationLogLine[]): MigrationLogLine[] {
    if (!logs.length) return []

    const lastBatchByTable = new Map<string, MigrationLogLine>()
    const lastPhaseByTable = new Map<string, MigrationLogLine>()
    for (const line of logs) {
        if (line.event === 'batch_progress' && line.tableName) {
            lastBatchByTable.set(line.tableName, line)
        }
        if (line.event === 'table_phase' && line.tableName) {
            lastPhaseByTable.set(line.tableName, line)
        }
    }

    const result: MigrationLogLine[] = []
    const prevRowsByTable = new Map<string, number>()

    for (const line of logs) {
        if (line.event === 'table_phase') {
            const table = line.tableName ?? ''
            if (lastPhaseByTable.get(table) !== line) continue
            result.push(line)
            continue
        }
        if (line.event !== 'batch_progress') {
            result.push(line)
            continue
        }
        const table = line.tableName ?? ''
        const rows = line.rowsMigrated ?? 0
        const batches = line.batches ?? 1
        const prevRows = prevRowsByTable.get(table)
        const batchRows = line.batchRows ?? (prevRows != null ? Math.max(0, rows - prevRows) : rows)
        prevRowsByTable.set(table, rows)

        const isLatest = lastBatchByTable.get(table) === line
        const sampled = shouldAppendBatchProgressLog(batches, rows, batchRows)
        if (!sampled && !isLatest) continue

        const duplicate = result.length > 0 && result[result.length - 1] === line
        if (!duplicate) {
            result.push(line)
        }
    }
    return result
}

export function createMigrationRunId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    return `migration-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function buildTableRowTotalsFromPreflight(
    preflight: TableMigrationPreflightResult | null,
    tables: string[],
): Record<string, number> {
    const totals: Record<string, number> = {}
    if (!preflight) return totals
    for (const tableName of tables) {
        const item = preflight.tables.find((row) => row.tableName === tableName)
        if (item?.sourceRowCount != null && item.sourceRowCount > 0) {
            totals[tableName] = item.sourceRowCount
        }
    }
    return totals
}

/** 多表 + 表内行数加权，运行中最高 99%，全部完成 100%。 */
export function computeMigrationProgressPercent(
    progress: TableMigrationRunProgress | null | undefined,
): number {
    if (!progress?.total) return 0
    if (progress.completed >= progress.total && !progress.currentTable) {
        return 100
    }

    const tableWeight = 100 / progress.total
    let percent = progress.completed * tableWeight

    if (progress.currentTable) {
        const rowsTotal = progress.tableRowTotals?.[progress.currentTable]
        const rowsDone = progress.batchRowsMigrated ?? 0
        if (rowsTotal != null && rowsTotal > 0) {
            percent += tableWeight * Math.min(0.97, rowsDone / rowsTotal)
        } else {
            const batches = progress.batchCount ?? 0
            const sub = batches > 0 ? 1 - Math.exp(-batches * 0.2) : 0.08
            percent += tableWeight * Math.min(0.9, sub)
        }
    }

    return Math.round(Math.min(99, Math.max(0, percent)))
}

export interface MigrationRunLiveMetrics {
    elapsedMs: number
    rowsMigrated: number
    rowsPerSecond: number | null
    etaMs: number | null
    remainingRows: number | null
}

/** 运行中吞吐 / ETA：依赖 preflight 行总数时 ETA 更准。 */
export function computeMigrationRunLiveMetrics(
    progress: TableMigrationRunProgress | null | undefined,
    startedAt: string | null | undefined,
    nowMs = Date.now(),
): MigrationRunLiveMetrics {
    const startedMs = startedAt ? Date.parse(startedAt) : Number.NaN
    const elapsedMs = Number.isFinite(startedMs) ? Math.max(0, nowMs - startedMs) : 0

    const completedRows = (progress?.results ?? []).reduce(
        (sum, row) => sum + Math.max(0, row.rowsMigrated ?? 0),
        0,
    )
    const currentRows = progress?.currentTable ? Math.max(0, progress.batchRowsMigrated ?? 0) : 0
    const rowsMigrated = completedRows + currentRows

    const rowsPerSecond = elapsedMs > 0 && rowsMigrated > 0
        ? rowsMigrated / (elapsedMs / 1000)
        : null

    let remainingRows: number | null = null
    const totals = progress?.tableRowTotals
    if (totals) {
        const totalKnown = Object.values(totals).reduce((sum, value) => sum + Math.max(0, value), 0)
        if (totalKnown > 0) {
            remainingRows = Math.max(0, totalKnown - rowsMigrated)
        }
    }

    if (remainingRows == null && progress?.currentTable) {
        const currentTotal = progress.tableRowTotals?.[progress.currentTable]
        if (currentTotal != null && currentTotal > 0) {
            remainingRows = Math.max(0, currentTotal - (progress.batchRowsMigrated ?? 0))
        }
    }

    const etaMs = rowsPerSecond != null && rowsPerSecond > 0 && remainingRows != null
        ? Math.round((remainingRows / rowsPerSecond) * 1000)
        : null

    return {elapsedMs, rowsMigrated, rowsPerSecond, etaMs, remainingRows}
}

export function formatMigrationThroughput(
    rowsPerSecond: number | null | undefined,
): string {
    if (rowsPerSecond == null || !Number.isFinite(rowsPerSecond) || rowsPerSecond <= 0) {
        return '—'
    }
    if (rowsPerSecond >= 100) return String(Math.round(rowsPerSecond))
    if (rowsPerSecond >= 10) return rowsPerSecond.toFixed(1)
    return rowsPerSecond.toFixed(2)
}

export function formatMigrationTableProgressLabel(
    progress: TableMigrationRunProgress | null | undefined,
    translate: (key: string, params?: Record<string, unknown>) => string,
): string {
    if (progress?.currentPhase === 'queued') {
        return translate('explorer.tableMigrationWizard.progressQueued')
    }
    if (!progress?.currentTable) {
        return translate('explorer.tableMigrationWizard.progressOverall', {
            percent: computeMigrationProgressPercent(progress),
            completed: progress?.completed ?? 0,
            total: progress?.total ?? 0,
        })
    }
    if (progress.currentPhase && progress.currentPhase !== 'copying') {
        const phaseLabel = translate(`explorer.tableMigrationWizard.phases.${progress.currentPhase}`)
        return translate('explorer.tableMigrationWizard.progressTablePhase', {
            table: progress.currentTable,
            phase: phaseLabel !== `explorer.tableMigrationWizard.phases.${progress.currentPhase}`
                ? phaseLabel
                : progress.currentPhase,
        })
    }
    const rowsTotal = progress.tableRowTotals?.[progress.currentTable]
    if (rowsTotal != null && rowsTotal > 0) {
        return translate('explorer.tableMigrationWizard.progressTableRows', {
            table: progress.currentTable,
            done: progress.batchRowsMigrated ?? 0,
            total: rowsTotal,
        })
    }
    return translate('explorer.tableMigrationWizard.batchProgress', {
        table: progress.currentTable,
        rows: progress.batchRowsMigrated ?? 0,
        batches: progress.batchCount ?? 0,
    })
}

export function appendMigrationLog(
    logs: MigrationLogLine[],
    line: Omit<MigrationLogLine, 'at'>,
    onLog?: (entry: MigrationLogLine) => void,
): void {
    const entry: MigrationLogLine = {at: new Date().toISOString(), ...line}
    logs.push(entry)
    onLog?.(entry)
}

export function formatMigrationLogDisplay(
    line: MigrationLogLine,
    translate: (key: string, params?: Record<string, unknown>) => string,
): string {
    const prefix = `[${formatMigrationTime(line.at)}]`
    const event = line.event ?? inferMigrationLogEvent(line)
    const key = `explorer.tableMigrationWizard.logEvents.${event}`
    const params: Record<string, unknown> = {
        table: line.tableName ?? '',
        index: line.tableIndex ?? 0,
        total: line.tableTotal ?? 0,
        rows: line.rowsMigrated ?? line.totalRows ?? 0,
        batches: line.batches ?? 0,
        batchRows: line.batchRows ?? 0,
        duration: line.durationMs ?? 0,
        validation: line.validation ?? '',
        failed: line.failedTables ?? 0,
        detail: line.detail ?? '',
        phase: line.phase
            ? translate(`explorer.tableMigrationWizard.phases.${line.phase}`, {})
            : '',
    }
    if (event === 'table_phase' && line.phase) {
        const phaseKey = `explorer.tableMigrationWizard.logEvents.table_phase`
        const phaseTranslated = translate(phaseKey, {
            ...params,
            phase: translate(`explorer.tableMigrationWizard.phases.${line.phase}`, {}),
        })
        if (phaseTranslated !== phaseKey) {
            return `${prefix} ${phaseTranslated}`
        }
    }
    const translated = translate(key, params)
    if (translated !== key) {
        return `${prefix} ${translated}`
    }
    return `${prefix} ${line.message}`
}

export function inferMigrationLogEvent(line: Pick<MigrationLogLine, 'level' | 'message'>): MigrationLogEvent {
    const message = line.message.toLowerCase()
    if (message.includes('migration started')) return 'run_start'
    if (message.includes('batch') && message.includes('committed')) return 'batch_progress'
    if (message.includes('migrating')) return 'table_start'
    if (message.includes('migration finished')) return 'run_done'
    if (line.level === 'error') return 'table_fail'
    if (line.level === 'warn') return 'table_done'
    if (message.includes('completed')) return 'table_done'
    return 'run_start'
}

export function formatMigrationTime(value: string): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    })
}

export function formatMigrationDuration(ms: number): string {
    if (ms < 1000) return `${ms} ms`
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
    const minutes = Math.floor(ms / 60_000)
    const seconds = Math.round((ms % 60_000) / 1000)
    return `${minutes}m ${seconds}s`
}

export function formatMigrationRoute(record: Pick<TableMigrationRunRecord, 'source' | 'target'>): string {
    return `${record.source.connectionLabel} / ${record.source.database} → ${record.target.connectionLabel} / ${record.target.database}`
}

export function resolveMigrationRunStatus(
    results: TableMigrationResult[],
    jobStatus?: string,
): TableMigrationRunRecord['status'] {
    if (jobStatus === 'paused') return 'paused'
    if (jobStatus === 'cancelled') return 'cancelled'
    if (!results.length && jobStatus === 'failed') return 'failed'
    if (!results.length) return 'failed'
    const failed = results.filter((item) => item.status !== 'success').length
    if (failed === results.length) return 'failed'
    if (failed > 0) return 'partial'
    return 'success'
}

export function buildMigrationRunRecord(input: {
    id: string
    startedAt: string
    finishedAt: string
    source: SchemaScope
    targetConnectionId: string
    targetConnectionLabel: string
    targetDatabase: string
    form: TableMigrationWizardForm
    tablesPlanned: string[]
    results: TableMigrationResult[]
    logs: MigrationLogLine[]
    jobStatus?: string
}): TableMigrationRunRecord {
    const summary = summarizeMigrationResults(input.results)
    const startedMs = Date.parse(input.startedAt)
    const finishedMs = Date.parse(input.finishedAt)
    return {
        id: input.id,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        durationMs: Number.isFinite(startedMs) && Number.isFinite(finishedMs)
            ? Math.max(0, finishedMs - startedMs)
            : 0,
        status: resolveMigrationRunStatus(input.results, input.jobStatus),
        source: {
            connectionId: input.source.connectionId,
            connectionLabel: input.source.connectionLabel,
            database: input.source.database,
            dbType: input.source.dbType,
        },
        target: {
            connectionId: input.targetConnectionId,
            connectionLabel: input.targetConnectionLabel,
            database: input.targetDatabase,
        },
        options: {
            mode: input.form.mode,
            watermarkColumn: input.form.watermarkColumn.trim(),
            orderByColumns: [...input.form.orderByColumns],
            whereClause: input.form.whereClause.trim(),
            batchSize: input.form.batchSize,
            throttleMs: input.form.throttleMs,
            truncateTarget: input.form.truncateTarget,
            targetMissingPolicy: input.form.targetMissingPolicy,
            conflictStrategy: input.form.conflictStrategy,
        },
        tablesPlanned: [...input.tablesPlanned],
        summary,
        results: [...input.results],
        logs: [...input.logs],
    }
}

export function formatMigrationRunLogText(record: TableMigrationRunRecord): string {
    const header = [
        `Migration Run ID: ${record.id}`,
        `Status: ${record.status}`,
        `Started: ${record.startedAt}`,
        `Finished: ${record.finishedAt}`,
        `Duration: ${record.durationMs} ms`,
        `Source: ${record.source.connectionLabel} / ${record.source.database} (${record.source.dbType})`,
        `Target: ${record.target.connectionLabel} / ${record.target.database}`,
        `Tables: ${record.tablesPlanned.join(', ')}`,
        `Summary: ${record.summary.tables} tables, ${record.summary.rows} rows, ${record.summary.failed} failed`,
        '',
        '--- Execution Log ---',
    ]
    const body = record.logs.map((line) => {
        const event = line.event ?? inferMigrationLogEvent(line)
        return `[${line.at}] [${event}] ${line.message}`
    })
    return [...header, ...body].join('\n')
}

export function canResumeMigrationRun(
    record: TableMigrationRunRecord,
    options?: {serverJob?: MigrationJobView | null; serverLoaded?: boolean},
): boolean {
    if (record.status !== 'failed' && record.status !== 'partial' && record.status !== 'paused') {
        return false
    }
    if (options?.serverLoaded && options.serverJob == null) {
        return false
    }
    if (options?.serverJob) {
        if (options.serverJob.status === 'completed') {
            return false
        }
        if (record.status === 'paused' || options.serverJob.status === 'paused') {
            return true
        }
        const summary = summarizeMigrationJobCheckpoints(options.serverJob)
        return summary.tableCount > summary.tablesCompleted
    }
    return true
}

export interface MigrationCheckpointSummary {
    tableCount: number
    tablesCompleted: number
    tablesFailed: number
    tablesWithProgress: number
    tablesPending: number
    resumableTableCount: number
    totalRowsCheckpointed: number
    serverStatus: string
    lastUpdatedAt: string | null
    hasPersistedCheckpoints: boolean
}

export function checkpointHasProgress(checkpoint: MigrationTableCheckpoint | undefined): boolean {
    if (!checkpoint) return false
    if (checkpoint.batchesCompleted > 0) return true
    if (checkpoint.lastOffset > 0) return true
    return Boolean(checkpoint.lastSeekKey?.trim())
}

export function summarizeMigrationJobCheckpoints(view: MigrationJobView): MigrationCheckpointSummary {
    let tablesCompleted = 0
    let tablesFailed = 0
    let tablesWithProgress = 0
    let tablesPending = 0
    let resumableTableCount = 0
    let totalRowsCheckpointed = 0
    let lastUpdatedAt: string | null = null

    for (const tableName of view.tablesPlanned) {
        const checkpoint = view.tables[tableName]
        if (!checkpoint) {
            tablesPending += 1
            resumableTableCount += 1
            continue
        }
        if (checkpoint.updatedAt) {
            if (!lastUpdatedAt || checkpoint.updatedAt > lastUpdatedAt) {
                lastUpdatedAt = checkpoint.updatedAt
            }
        }
        const progress = checkpointHasProgress(checkpoint)
        if (progress) {
            tablesWithProgress += 1
            totalRowsCheckpointed += checkpoint.rowsMigrated ?? 0
        }
        switch (checkpoint.status) {
            case 'completed':
                tablesCompleted += 1
                totalRowsCheckpointed += checkpoint.rowsMigrated ?? 0
                break
            case 'failed':
                tablesFailed += 1
                resumableTableCount += 1
                break
            case 'running':
                resumableTableCount += 1
                break
            default:
                tablesPending += 1
                resumableTableCount += 1
                break
        }
    }

    const hasPersistedCheckpoints = view.tablesPlanned.some((name) => {
        const checkpoint = view.tables[name]
        return checkpoint != null && (checkpointHasProgress(checkpoint) || checkpoint.status === 'completed')
    })

    return {
        tableCount: view.tablesPlanned.length,
        tablesCompleted,
        tablesFailed,
        tablesWithProgress,
        tablesPending,
        resumableTableCount,
        totalRowsCheckpointed,
        serverStatus: view.status,
        lastUpdatedAt,
        hasPersistedCheckpoints,
    }
}

export function canRestartMigrationFresh(record: TableMigrationRunRecord): boolean {
    return record.status === 'failed'
        || record.status === 'partial'
        || record.status === 'paused'
        || record.status === 'cancelled'
}

export function resolveMigrationCheckpointBannerKey(
    record: TableMigrationRunRecord,
    summary: MigrationCheckpointSummary | null,
    serverLoaded: boolean,
): string {
    if (!serverLoaded) {
        return 'explorer.tableMigrationWizard.checkpointLoading'
    }
    if (summary == null) {
        return 'explorer.tableMigrationWizard.checkpointServerMissing'
    }
    if (record.status === 'paused' || summary.serverStatus === 'paused') {
        return summary.hasPersistedCheckpoints
            ? 'explorer.tableMigrationWizard.checkpointPausedWithProgress'
            : 'explorer.tableMigrationWizard.checkpointPausedNoProgress'
    }
    if (summary.hasPersistedCheckpoints) {
        return 'explorer.tableMigrationWizard.checkpointFailedWithProgress'
    }
    return 'explorer.tableMigrationWizard.checkpointFailedNoProgress'
}

/** 新建任务 ID 全量重迁，不沿用旧任务断点。 */
export interface TableMigrationRunOutcome {
    results: TableMigrationResult[]
    paused: boolean
    cancelled?: boolean
}

export function canPauseMigrationRun(
    isRunning: boolean,
    activeRunId: string | null | undefined,
    recordId: string,
): boolean {
    return isRunning && activeRunId === recordId
}

export function canCancelMigrationRun(
    isRunning: boolean,
    activeRunId: string | null | undefined,
    recordId: string,
    recordStatus: TableMigrationRunStatus,
): boolean {
    if (recordStatus === 'paused') return true
    return canPauseMigrationRun(isRunning, activeRunId, recordId)
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms)
    })
}

export function mapJobStatusToRunStatus(status: string): TableMigrationRunStatus {
    if (status === 'completed') return 'success'
    if (status === 'partial') return 'partial'
    if (status === 'paused') return 'paused'
    if (status === 'cancelled') return 'cancelled'
    if (status === 'failed') return 'failed'
    return 'running'
}

export function resolveRunningTableFromJob(view: MigrationJobView): string | undefined {
    for (const tableName of view.tablesPlanned) {
        const checkpoint = view.tables[tableName]
        if (!checkpoint) return tableName
        if (checkpoint.status === 'running' || checkpoint.status === 'pending' || checkpoint.status === 'failed') {
            return tableName
        }
    }
    return undefined
}

export function countCompletedTables(view: MigrationJobView): number {
    return view.tablesPlanned.filter((tableName) => view.tables[tableName]?.status === 'completed').length
}

export function resolveBatchProgressFromJob(view: MigrationJobView): Pick<TableMigrationRunProgress, 'batchRowsMigrated' | 'batchOffset' | 'batchCount'> {
    const runningTable = resolveRunningTableFromJob(view)
    if (!runningTable) return {}
    const checkpoint = view.tables[runningTable]
    if (!checkpoint) return {}
    return {
        batchRowsMigrated: checkpoint.rowsMigrated,
        batchOffset: checkpoint.lastOffset,
        batchCount: checkpoint.batchesCompleted,
    }
}

export function progressFromMigrationJobView(
    view: MigrationJobView,
    tableRowTotals?: Record<string, number>,
): TableMigrationRunProgress {
    const completed = countCompletedTables(view)
    const executing = view.status === 'running'
    const currentTable = executing ? resolveRunningTableFromJob(view) : undefined
    const runningIndex = currentTable ? view.tablesPlanned.indexOf(currentTable) + 1 : undefined
    return {
        total: view.tablesPlanned.length,
        completed,
        currentTable,
        currentTableIndex: runningIndex && runningIndex > 0 ? runningIndex : undefined,
        currentPhase: view.status === 'queued' ? 'queued' : undefined,
        results: [...(view.results ?? [])],
        tableRowTotals,
        ...(executing ? resolveBatchProgressFromJob(view) : {}),
    }
}

export interface MigrationJobWatchCallbacks {
    onProgress?: (progress: TableMigrationRunProgress) => void
    onLog?: (line: MigrationLogLine) => void
    logs?: MigrationLogLine[]
    tables?: string[]
    tableRowTotals?: Record<string, number>
}

export function recordToMigrationForm(record: TableMigrationRunRecord): TableMigrationWizardForm {
    return {
        targetConnectionId: record.target.connectionId,
        targetDatabase: record.target.database,
        selectedTables: [...record.tablesPlanned],
        mode: record.options.mode,
        watermarkColumn: record.options.watermarkColumn,
        orderByColumns: [...(record.options.orderByColumns ?? [])],
        whereClause: record.options.whereClause,
        batchSize: record.options.batchSize,
        throttleMs: record.options.throttleMs,
        truncateTarget: record.options.truncateTarget,
        targetMissingPolicy: record.options.targetMissingPolicy,
        conflictStrategy: record.options.conflictStrategy ?? 'OVERWRITE',
    }
}

export function recordToSourceScope(record: TableMigrationRunRecord): SchemaScope {
    return {
        connectionId: record.source.connectionId,
        connectionLabel: record.source.connectionLabel,
        database: record.source.database,
        dbType: record.source.dbType as DbType,
    }
}

export function summarizeMigrationResults(results: TableMigrationResult[]): {
    tables: number
    rows: number
    failed: number
    validationMismatch: number
} {
    return {
        tables: results.length,
        rows: results.reduce((sum, item) => sum + item.rowsMigrated, 0),
        failed: results.filter((item) => item.status !== 'success').length,
        validationMismatch: results.filter((item) => item.rowCountValidation === 'mismatch').length,
    }
}

/** Selecting a preflight row always opens detail; does not toggle closed on re-click. */
export function selectPreflightTableName(_current: string | null, tableName: string): string {
    return tableName
}

export type MigrationPreflightScanVariant = 'info' | 'warning'

export interface MigrationPreflightScanSummary {
    variant: MigrationPreflightScanVariant
    messageKey: string
    totalSourceRows: number | null
    countedTables: number
    uncountedTables: number
    tablesWithoutPrimaryKey: string[]
}

const LARGE_SCAN_ROW_THRESHOLD = 1_000_000

/** Preflight scan scope: row-count estimate + mode/PK scan warnings for the wizard banner. */
export function summarizeMigrationPreflightScan(
    mode: MigrationMode,
    preflight: TableMigrationPreflightResult | null,
    selectedTables: string[],
): MigrationPreflightScanSummary | null {
    if (!preflight || !selectedTables.length) return null

    let totalSourceRows = 0
    let countedTables = 0
    let uncountedTables = 0
    const tablesWithoutPrimaryKey: string[] = []

    forEachPreflightTable(preflight, selectedTables, (item) => {
        if (item.sourceExists && item.sourceRowCount != null) {
            totalSourceRows += Math.max(0, item.sourceRowCount)
            countedTables += 1
        } else if (item.sourceExists) {
            uncountedTables += 1
        }
        const pkColumns = item.primaryKeyColumns ?? []
        if (item.sourceExists && pkColumns.length === 0) {
            tablesWithoutPrimaryKey.push(item.tableName)
        }
    })

    const isFullCopyMode = mode === 'FULL_APPEND' || mode === 'FULL_REPLACE'
    const missingPk = mode === 'PK_UPSERT' && tablesWithoutPrimaryKey.length > 0

    let messageKey = 'explorer.tableMigrationWizard.scanBannerIncr'
    if (missingPk) {
        messageKey = 'explorer.tableMigrationWizard.scanBannerNoPk'
    } else if (isFullCopyMode) {
        messageKey = 'explorer.tableMigrationWizard.scanBannerFullScan'
    } else if (mode === 'PK_UPSERT') {
        messageKey = 'explorer.tableMigrationWizard.scanBannerPkUpsert'
    }

    let variant: MigrationPreflightScanVariant = 'info'
    if (missingPk || isFullCopyMode) {
        variant = 'warning'
    }
    if (totalSourceRows >= LARGE_SCAN_ROW_THRESHOLD) {
        variant = 'warning'
    }

    return {
        variant,
        messageKey,
        totalSourceRows: countedTables > 0 ? totalSourceRows : null,
        countedTables,
        uncountedTables,
        tablesWithoutPrimaryKey,
    }
}
