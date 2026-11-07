import type {TreeNode, WorkspaceTab} from '@/core/types'
import {walkTree} from '@/core/utils/tree'
import {findTableNodeUnderDatabase} from '@/features/explorer/services/explorer-locate.service'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {resolveRelatedTableName} from '@/features/workspace/services/table-relations.service'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import type {TableRelationEdge} from '@/shared/api/types'

function findTableNodeId(tree: readonly TreeNode[], tableName: string): string | null {
    let found: string | null = null
    walkTree([...tree], (node) => {
        if (node.type === 'table' && node.label === tableName) {
            found = node.id
            return true
        }
    })
    return found
}

export async function openRelatedTableByName(
    tab: WorkspaceTab,
    tableName: string,
    databaseName?: string,
    tableView: NonNullable<WorkspaceTab['tableView']> = 'relations',
): Promise<void> {
    if (!tab.connectionId || !tableName.trim()) return

    const workspace = useWorkspaceStore()
    const explorer = useExplorerStore()
    const layout = useLayoutStore()

    layout.setModule('database')

    const databaseNode = tab.instanceId ? explorer.findNode(tab.instanceId) : null
    const nodeId = databaseNode
        ? findTableNodeUnderDatabase(databaseNode, tableName)?.id
        : findTableNodeId(explorer.tree, tableName)

    workspace.openTable(
        tableName,
        tab.connectionId,
        tab.instanceId ?? undefined,
        databaseName ?? tab.database,
        nodeId ?? undefined,
        tableView,
    )

    if (nodeId) {
        await explorer.locateNode(nodeId)
    }
}

export async function openRelatedTableFromRelation(
    tab: WorkspaceTab,
    edge: TableRelationEdge,
    direction: 'references' | 'referencedBy',
    databaseName?: string,
    tableView: NonNullable<WorkspaceTab['tableView']> = 'relations',
): Promise<void> {
    const tableName = resolveRelatedTableName(edge, direction)
    if (!tableName) return
    await openRelatedTableByName(tab, tableName, databaseName, tableView)
}
