import type {ExecuteSqlResult, MigrationBatchReport} from './types.js'

export function formatMigrationReport(report: MigrationBatchReport, json: boolean): string {
    if (json) {
        return `${JSON.stringify(report, null, 2)}\n`
    }
    const lines = [
        `Migration ${report.overallStatus}: ${report.successCount}/${report.totalTables} tables, ${report.totalRowsMigrated} rows in ${report.durationMs}ms`,
    ]
    for (const table of report.tables) {
        const detail = table.message ? ` — ${table.message}` : ''
        lines.push(`  ${table.status.padEnd(7)} ${table.tableName}: ${table.rowsMigrated} rows (${table.durationMs}ms)${detail}`)
    }
    return `${lines.join('\n')}\n`
}

export function formatSqlResult(result: ExecuteSqlResult, json: boolean): string {
    if (json) {
        return `${JSON.stringify(result, null, 2)}\n`
    }
    return `OK: ${result.rowCount} rows in ${result.durationMs}ms\n`
}

export function migrationExitCode(overallStatus: string): number {
    return overallStatus === 'success' ? 0 : 1
}
