import type {DbType, TreeNode} from '@/core/types'
import {listExplorerDatabaseInstances} from '@/features/explorer/services/explorer-database-scope'

/** 从连接树提取的连接节点（含所属分组与库列表） */
export interface ExtractedConnection {
    id: string
    label: string
    dbType: DbType
    groupLabel: string
    databases: { id: string; label: string }[]
}

/** 深度遍历连接树，收集所有 connection 节点及其 database 子节点 */
export function extractConnectionsFromTree(tree: TreeNode[]): ExtractedConnection[] {
    const results: ExtractedConnection[] = []
    for (const root of tree) {
        walkConnections(root, root.type === 'group' ? root.label : '', results)
    }
    return results
}

function walkConnections(node: TreeNode, groupLabel: string, results: ExtractedConnection[]) {
    if (node.type === 'connection') {
        results.push({
            id: node.id,
            label: node.label,
            dbType: node.dbType ?? 'mysql',
            groupLabel,
            databases: listExplorerDatabaseInstances(node, node.dbType),
        })
        return
    }

    const nextGroup = node.type === 'group' ? node.label : groupLabel
    node.children?.forEach((child) => walkConnections(child, nextGroup, results))
}
