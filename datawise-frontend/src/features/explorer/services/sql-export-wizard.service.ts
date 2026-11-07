import type {TreeNode} from '@/core/types'
import type {TableDetailApi, TableSqlExportOptions, TableSqlExportResult} from '@/shared/api/types'
import {findNodeById, walkTree} from '@/core/utils/tree'
import {
    copySqlToClipboard,
    downloadSqlFile,
    type ExplorerSqlExportContext,
} from '@/features/explorer/services/table-sql-export.service'

export type SqlExportWizardScope = 'table' | 'database'

export type SqlExportContentMode = 'structure' | 'structureAndData'

export type SqlExportWizardOutput = 'download' | 'clipboard'

export interface SqlExportWizardContext extends ExplorerSqlExportContext {
    scope: SqlExportWizardScope
    connectionLabel?: string
    tableCount?: number
}

export interface SqlExportWizardForm {
    contentMode: SqlExportContentMode
    maxRows: number
    output: SqlExportWizardOutput
}

export function createDefaultSqlExportWizardForm(maxRowsDefault: number): SqlExportWizardForm {
    return {
        contentMode: 'structure',
        maxRows: maxRowsDefault,
        output: 'download',
    }
}

/** 备份向导默认：结构+数据、下载文件（运维场景） */
export function createDefaultBackupWizardForm(maxRowsDefault: number): SqlExportWizardForm {
    return {
        contentMode: 'structureAndData',
        maxRows: maxRowsDefault,
        output: 'download',
    }
}

export function validateSqlExportWizardForm(form: SqlExportWizardForm): string | null {
    if (form.contentMode === 'structureAndData' && form.maxRows < 0) {
        return 'invalidMaxRows'
    }
    return null
}

export function buildSqlExportOptions(form: SqlExportWizardForm): Pick<TableSqlExportOptions, 'includeData' | 'maxRows'> {
    const includeData = form.contentMode === 'structureAndData'
    return {
        includeData,
        maxRows: includeData && form.maxRows > 0 ? form.maxRows : undefined,
    }
}

export async function runSqlExportWizard(
    context: SqlExportWizardContext,
    form: SqlExportWizardForm,
    api: Pick<TableDetailApi, 'exportTableSql' | 'exportDatabaseSql'>,
): Promise<TableSqlExportResult> {
    const options: TableSqlExportOptions = {
        connectionId: context.connectionId,
        database: context.database,
        ...buildSqlExportOptions(form),
    }
    if (context.scope === 'table') {
        if (!context.tableName?.trim()) {
            throw new Error('tableName is required')
        }
        return api.exportTableSql(context.tableName, options)
    }
    return api.exportDatabaseSql(options)
}

export async function applySqlExportWizardOutput(
    result: TableSqlExportResult,
    output: SqlExportWizardOutput,
): Promise<'downloaded' | 'copied' | 'empty'> {
    if (!result.sql.trim()) return 'empty'
    if (output === 'download') {
        downloadSqlFile(result.sql, result.fileName)
        return 'downloaded'
    }
    const copied = await copySqlToClipboard(result.sql)
    return copied ? 'copied' : 'empty'
}

/** i18n key for wizard success / clipboard / failure toasts (export vs backup). */
export function resolveSqlExportWizardMessageKey(
    variant: 'export' | 'backup',
    kind: 'success' | 'copied' | 'failed',
): string {
    if (variant === 'backup') {
        if (kind === 'success') return 'explorer.backupWizard.success'
        if (kind === 'copied') return 'explorer.backupWizard.copied'
        return 'explorer.backupWizard.failed'
    }
    if (kind === 'success') return 'explorer.exportSqlSuccess'
    if (kind === 'copied') return 'explorer.exportSqlCopied'
    return 'explorer.exportSqlFailed'
}

export function countTablesUnderDatabase(tree: TreeNode[], databaseNodeId: string): number {
    const databaseNode = findNodeById(tree, databaseNodeId)
    if (!databaseNode) return 0
    let count = 0
    walkTree(databaseNode.children ?? [], (node) => {
        if (node.type === 'table') count += 1
    })
    return count
}
