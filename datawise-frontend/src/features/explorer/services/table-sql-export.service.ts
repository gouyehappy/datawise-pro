import type {TreeNode} from '@/core/types'
import {findAncestorByType, findDatabaseLabel} from '@/core/utils/tree'

export type ExplorerSqlExportAction =
    | 'export-structure'
    | 'export-all'
    | 'copy-structure'
    | 'copy-data'

export interface ExplorerSqlExportContext {
    connectionId: string
    database: string
    tableName?: string
}

export function resolveExplorerSqlExportContext(
    tree: TreeNode[],
    node: TreeNode,
): ExplorerSqlExportContext | null {
    const connectionId = findAncestorByType(tree, node.id, 'connection')?.id
    if (!connectionId) return null

    if (node.type === 'table') {
        const database =
            findAncestorByType(tree, node.id, 'database')?.label ??
            findDatabaseLabel(tree, node.id)
        if (!database) return null
        return {connectionId, database, tableName: node.label}
    }

    if (node.type === 'database') {
        return {connectionId, database: node.label}
    }

    return null
}

export function includeDataForExportAction(action: ExplorerSqlExportAction): boolean {
    return action === 'export-all' || action === 'copy-data'
}

export function shouldDownloadExportAction(action: ExplorerSqlExportAction): boolean {
    return action === 'export-structure' || action === 'export-all'
}

export type SqlClipboardExportMessageKind =
    | 'contextMissing'
    | 'success'
    | 'copied'
    | 'failed'

/** i18n keys for one-shot structure/data export & clipboard actions. */
export function resolveSqlClipboardExportMessageKey(kind: SqlClipboardExportMessageKind): string {
    if (kind === 'contextMissing') return 'explorer.exportSqlContextMissing'
    if (kind === 'success') return 'explorer.exportSqlSuccess'
    if (kind === 'copied') return 'explorer.exportSqlCopied'
    return 'explorer.exportSqlFailed'
}

export function downloadSqlFile(content: string, fileName: string): void {
    const blob = new Blob([content], {type: 'text/plain;charset=utf-8'})
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName.endsWith('.sql') ? fileName : `${fileName}.sql`
    anchor.click()
    URL.revokeObjectURL(url)
}

export async function copySqlToClipboard(content: string): Promise<boolean> {
    if (!content.trim()) return false
    await navigator.clipboard.writeText(content)
    return true
}
