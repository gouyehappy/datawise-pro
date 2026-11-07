import type {SqlTablePeekPayload} from '@datawise/sql-editor'
import {findNodeById} from '@/core/utils/tree'
import {t} from '@/i18n'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {resolveOpenTableWorkspaceArgs} from '@/features/explorer/services/table-context-actions.service'

/** 打开表只需标识信息；offsets 仅用于编辑器内高亮。 */
export type SqlTablePeekOpenTarget = Pick<SqlTablePeekPayload, 'tableName' | 'tableId' | 'catalog'>

export async function openSqlTableFromPeek(
    payload: SqlTablePeekOpenTarget,
    context: {
        connectionId?: string | null
        database?: string | null
    },
): Promise<void> {
    const layout = useLayoutStore()
    const explorer = useExplorerStore()
    const workspace = useWorkspaceStore()
    const connectionId = context.connectionId?.trim()
    if (!connectionId) {
        layout.showErrorToast(t('console.tablePeekNeedConnection'))
        return
    }

    layout.setModule('database')

    let node = payload.tableId
        ? (await explorer.locateNode(payload.tableId)) ?? findNodeById(explorer.tree, payload.tableId)
        : null

    if (node && (node.type === 'table' || node.type === 'view')) {
        const args = resolveOpenTableWorkspaceArgs(explorer.tree, node, 'properties')
        if (args) {
            workspace.openTable(
                args.tableName,
                args.connectionId,
                args.catalogNodeId,
                args.database,
                args.nodeId,
                args.tableView,
                args.objectType,
            )
            return
        }
    }

    workspace.openTable(
        payload.tableName,
        connectionId,
        undefined,
        payload.catalog || context.database || undefined,
        payload.tableId,
        'properties',
        'table',
    )
}
