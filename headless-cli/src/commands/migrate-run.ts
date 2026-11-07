import type {Command} from 'commander'
import {DatawiseClient} from '../client.js'
import {resolveConfig} from '../config.js'
import {formatMigrationReport, migrationExitCode} from '../format.js'
import type {TableMigrationBatchRequest, TableMigrationBatchTableRequest} from '../types.js'

export interface MigrateRunOptions {
    source: string
    sourceDb?: string
    target: string
    targetDb?: string
    tables: string
    where?: string
    batchSize?: string
    throttleMs?: string
    truncate?: boolean
    createMissing?: boolean
    json?: boolean
}

export function buildMigrationRequest(options: MigrateRunOptions): TableMigrationBatchRequest {
    const tableNames = options.tables
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
    if (tableNames.length === 0) {
        throw new Error('At least one table is required in --tables')
    }
    const tables: TableMigrationBatchTableRequest[] = tableNames.map((tableName) => ({
        tableName,
        createTargetIfMissing: options.createMissing ?? false,
    }))
    const request: TableMigrationBatchRequest = {
        sourceConnectionId: options.source,
        targetConnectionId: options.target,
        tables,
    }
    if (options.sourceDb) request.sourceDatabase = options.sourceDb
    if (options.targetDb) request.targetDatabase = options.targetDb
    if (options.where) request.whereClause = options.where
    if (options.batchSize) request.batchSize = parsePositiveInt(options.batchSize, 'batch-size')
    if (options.throttleMs) request.throttleMs = parsePositiveInt(options.throttleMs, 'throttle-ms')
    if (options.truncate) request.truncateTarget = true
    return request
}

export function registerMigrateRunCommand(migrate: Command): void {
    migrate
        .command('run')
        .description('Run a sync table migration batch via headless API')
        .requiredOption('--source <id>', 'Source connection id')
        .option('--source-db <name>', 'Source database / schema')
        .requiredOption('--target <id>', 'Target connection id')
        .option('--target-db <name>', 'Target database / schema')
        .requiredOption('--tables <names>', 'Comma-separated table names')
        .option('--where <sql>', 'Optional WHERE clause applied to source rows')
        .option('--batch-size <n>', 'Rows per batch')
        .option('--throttle-ms <n>', 'Delay between batches in milliseconds')
        .option('--truncate', 'Truncate target tables before copy')
        .option('--create-missing', 'Create target table if missing')
        .option('--json', 'Print raw JSON report')
        .action(async (options: MigrateRunOptions, command: Command) => {
            const config = resolveConfig(command)
            const request = buildMigrationRequest(options)
            const client = new DatawiseClient(config)
            const report = await client.migrateBatch(request)
            process.stdout.write(formatMigrationReport(report, !!options.json))
            process.exit(migrationExitCode(report.overallStatus))
        })
}

function parsePositiveInt(raw: string, label: string): number {
    const value = Number.parseInt(raw, 10)
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Invalid ${label}: ${raw}`)
    }
    return value
}
