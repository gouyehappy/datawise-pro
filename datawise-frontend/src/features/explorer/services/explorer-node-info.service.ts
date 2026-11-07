import type {ExplorerInfoField, ExplorerInfoListItem, ExplorerNodeInfo, TreeNode} from '@/core/types'
import {findAncestorByType, findParentNode} from '@/core/utils/tree'
import {
    resolveSemanticHintForNode,
    resolveSemanticItemsForNode,
    type SemanticExplorerIndex,
} from '@/features/explorer/services/semantic-layer-explorer.service'
import {resolvePlatformFeatureId} from '@/features/explorer/services/explorer-ai-tree.service'

const EMPTY_INFO: ExplorerNodeInfo = {
    kind: 'empty',
    title: '',
    fields: [],
    listItems: [],
}

function breadcrumb(tree: TreeNode[], nodeId: string, includeTable = true): string {
    const connection = findAncestorByType(tree, nodeId, 'connection')
    const database = findAncestorByType(tree, nodeId, 'database')
    const table = includeTable ? findAncestorByType(tree, nodeId, 'table') : null
    return [connection?.label, database?.label, table?.label].filter(Boolean).join(' / ')
}

function mapColumnItems(columns: TreeNode[]): ExplorerInfoListItem[] {
    return columns.map((col) => ({
        name: col.label,
        meta: col.meta,
        comment: col.comment,
    }))
}

function countTables(database: TreeNode): string {
    const tablesFolder = database.children?.find((c) => c.type === 'folder' && c.label === 'tables')
    const count = tablesFolder?.children?.length ?? 0
    return count > 0 ? String(count) : '—'
}

function tableColumns(table: TreeNode): TreeNode[] {
    return table.children?.find((c) => c.type === 'columns')?.children ?? []
}

function sectionChildren(table: TreeNode, sectionType: 'columns' | 'keys' | 'indexes'): TreeNode[] {
    return table.children?.find((c) => c.type === sectionType)?.children ?? []
}

function buildConnectionInfo(node: TreeNode, tree: TreeNode[]): ExplorerNodeInfo {
    const fields: ExplorerInfoField[] = [
        {key: 'dbType', value: node.dbType ?? '—'},
    ]
    const databases = node.children?.filter((c) => c.type === 'database') ?? []
    if (databases.length) {
        fields.push({key: 'instanceCount', value: String(databases.length)})
    }
    return {
        kind: 'connection',
        title: node.label,
        fields,
        listTitleKey: 'instances',
        listItems: databases.map((db) => ({name: db.label})),
    }
}

function buildDatabaseInfo(node: TreeNode, tree: TreeNode[]): ExplorerNodeInfo {
    const connection = findAncestorByType(tree, node.id, 'connection')
    return {
        kind: 'database',
        title: node.label,
        breadcrumb: connection?.label,
        fields: [
            {key: 'connection', value: connection?.label ?? '—'},
            {key: 'tableCount', value: countTables(node)},
        ],
        listTitleKey: 'folders',
        listItems: (node.children ?? [])
            .filter((c) => c.type === 'folder')
            .map((folder) => ({
                name: folder.label,
                meta:
                    folder.label === 'tables' && folder.children?.length
                        ? String(folder.children.length)
                        : undefined,
            })),
    }
}

function buildTableInfo(node: TreeNode, tree: TreeNode[]): ExplorerNodeInfo {
    const columns = tableColumns(node)
    return {
        kind: 'table',
        title: node.label,
        breadcrumb: breadcrumb(tree, node.id, false),
        comment: node.comment,
        fields: [
            {key: 'columnCount', value: columns.length ? String(columns.length) : '—'},
            {key: 'keyCount', value: String(sectionChildren(node, 'keys').length || '—')},
            {key: 'indexCount', value: String(sectionChildren(node, 'indexes').length || '—')},
        ],
        listTitleKey: 'columns',
        listItems: mapColumnItems(columns),
    }
}

function buildColumnInfo(node: TreeNode, tree: TreeNode[]): ExplorerNodeInfo {
    const table = findAncestorByType(tree, node.id, 'table')
    const isPk = node.type === 'primary_key' || node.meta?.includes('pk')
    return {
        kind: isPk ? 'primary_key' : 'column',
        title: node.label,
        breadcrumb: breadcrumb(tree, node.id),
        comment: node.comment,
        fields: [
            {key: 'table', value: table?.label ?? '—', wide: true},
            {key: 'dataType', value: node.meta?.replace(/\s*·\s*pk$/i, '') ?? '—'},
            ...(isPk ? [{key: 'constraint', value: 'PRIMARY'}] : []),
        ],
        listItems: [],
    }
}

function buildForeignKeyInfo(node: TreeNode, tree: TreeNode[]): ExplorerNodeInfo {
    const table = findAncestorByType(tree, node.id, 'table')
    return {
        kind: 'foreign_key',
        title: node.label,
        breadcrumb: breadcrumb(tree, node.id),
        fields: [
            {key: 'table', value: table?.label ?? '—', wide: true},
            {key: 'reference', value: node.meta ?? '—', wide: true},
        ],
        listItems: [],
    }
}

function buildIndexInfo(node: TreeNode, tree: TreeNode[]): ExplorerNodeInfo {
    const table = findAncestorByType(tree, node.id, 'table')
    const [kind, cols] = (node.meta ?? '').split(' · ')
    return {
        kind: 'index',
        title: node.label,
        breadcrumb: breadcrumb(tree, node.id),
        fields: [
            {key: 'table', value: table?.label ?? '—', wide: true},
            {key: 'indexType', value: kind || '—'},
            {key: 'columns', value: cols || '—', wide: true},
        ],
        listItems: [],
    }
}

function buildSectionInfo(
    node: TreeNode,
    tree: TreeNode[],
    kind: 'columns' | 'keys' | 'indexes',
): ExplorerNodeInfo {
    const table = findParentNode(tree, node.id)
    const items = (node.children ?? []).map((child) => ({
        name: child.label,
        meta: child.meta,
        comment: child.comment,
    }))
    const listTitleKey = kind === 'columns' ? 'columns' : kind
    return {
        kind,
        title: table?.label ?? node.label,
        breadcrumb: table ? breadcrumb(tree, table.id) : breadcrumb(tree, node.id),
        comment: kind === 'columns' ? table?.comment : undefined,
        fields: [
            {key: 'section', value: node.label},
            {key: 'itemCount', value: items.length ? String(items.length) : '—'},
        ],
        listTitleKey,
        listItems: items,
    }
}

function buildPrimaryKeyConstraintInfo(node: TreeNode, tree: TreeNode[]): ExplorerNodeInfo {
    const table = findAncestorByType(tree, node.id, 'table')
    return {
        kind: 'primary_key',
        title: node.label,
        breadcrumb: breadcrumb(tree, node.id),
        fields: [
            {key: 'table', value: table?.label ?? '—', wide: true},
            {key: 'columns', value: node.meta ?? '—', wide: true},
        ],
        listItems: [],
    }
}

function buildPlatformFeatureInfo(node: TreeNode, tree: TreeNode[]): ExplorerNodeInfo {
    return {
        kind: 'platform_feature',
        title: node.label,
        breadcrumb: breadcrumb(tree, node.id, false),
        comment: node.comment,
        fields: [
            {key: 'nodeType', value: resolvePlatformFeatureId(node)},
        ],
        listItems: [],
    }
}

function withSemantic(
    node: TreeNode,
    tree: TreeNode[],
    info: ExplorerNodeInfo,
    semanticIndex?: SemanticExplorerIndex | null,
): ExplorerNodeInfo {
    const semanticItems = resolveSemanticItemsForNode(node, tree, semanticIndex)
    if (!semanticItems.length) return info
    const semanticHint = resolveSemanticHintForNode(node, tree, semanticIndex) ?? undefined
    return {
        ...info,
        semanticHint,
        semanticListTitleKey: 'semanticMetrics',
        semanticItems,
    }
}

function withSource(
    node: TreeNode,
    info: ExplorerNodeInfo,
    tree?: TreeNode[],
    semanticIndex?: SemanticExplorerIndex | null,
): ExplorerNodeInfo {
    const sourced = {...info, sourceNodeId: node.id}
    return tree ? withSemantic(node, tree, sourced, semanticIndex) : sourced
}

/** 从连接树节点构建 Info 面板数据 */
export function buildExplorerNodeInfo(
    node: TreeNode,
    tree: TreeNode[],
    semanticIndex?: SemanticExplorerIndex | null,
): ExplorerNodeInfo {
    switch (node.type) {
        case 'connection':
            return withSource(node, buildConnectionInfo(node, tree), tree, semanticIndex)
        case 'database':
            return withSource(node, buildDatabaseInfo(node, tree), tree, semanticIndex)
        case 'table':
            return withSource(node, buildTableInfo(node, tree), tree, semanticIndex)
        case 'column':
            return withSource(node, buildColumnInfo(node, tree), tree, semanticIndex)
        case 'primary_key': {
            const parent = findParentNode(tree, node.id)
            if (parent?.type === 'keys') {
                return withSource(node, buildPrimaryKeyConstraintInfo(node, tree), tree, semanticIndex)
            }
            return withSource(node, buildColumnInfo(node, tree), tree, semanticIndex)
        }
        case 'foreign_key':
            return withSource(node, buildForeignKeyInfo(node, tree), tree, semanticIndex)
        case 'index':
            return withSource(node, buildIndexInfo(node, tree), tree, semanticIndex)
        case 'columns':
            return withSource(node, buildSectionInfo(node, tree, 'columns'), tree, semanticIndex)
        case 'keys':
            return withSource(node, buildSectionInfo(node, tree, 'keys'), tree, semanticIndex)
        case 'indexes':
            return withSource(node, buildSectionInfo(node, tree, 'indexes'), tree, semanticIndex)
        case 'platform_feature':
            return withSource(node, buildPlatformFeatureInfo(node, tree))
        default:
            return withSource(node, {
                ...EMPTY_INFO,
                kind: 'empty',
                title: node.label,
                breadcrumb: breadcrumb(tree, node.id),
                fields: [{key: 'nodeType', value: node.type}],
            }, tree, semanticIndex)
    }
}

/** View-model Info panel payload (SQL optional when load failed). */
export function buildViewModelExplorerInfo(options: {
    title: string
    sourceNodeId: string
    connectionLabel?: string
    instanceLabel: string
    sql?: string
}): ExplorerNodeInfo {
    const info: ExplorerNodeInfo = {
        kind: 'empty',
        title: options.title,
        sourceNodeId: options.sourceNodeId,
        breadcrumb: [options.connectionLabel, options.instanceLabel].filter(Boolean).join(' / '),
        fields: [{key: 'nodeType', value: 'view_model'}],
        listItems: [],
    }
    if (options.sql !== undefined) {
        info.comment = options.sql
    }
    return info
}

const INFO_NODE_TYPES = new Set([
    'connection',
    'database',
    'table',
    'column',
    'primary_key',
    'foreign_key',
    'index',
    'columns',
    'keys',
    'indexes',
    'platform_feature',
])

export function isExplorerInfoNode(node: TreeNode): boolean {
    return INFO_NODE_TYPES.has(node.type)
}

/** 加载展示 Info 所需的子节点 */
export async function prepareExplorerInfoNode(
    node: TreeNode,
    tree: TreeNode[],
    ensureLoaded: (nodeId: string) => Promise<void>,
    findNode: (nodeId: string) => TreeNode | null,
): Promise<TreeNode> {
    if (node.type === 'connection') {
        return findNode(node.id) ?? node
    }

    if (node.type === 'database' || node.type === 'table') {
        await ensureLoaded(node.id)
        return findNode(node.id) ?? node
    }

    if (node.type === 'folder' && node.label.toLowerCase() === 'ai') {
        await ensureLoaded(node.id)
        return findNode(node.id) ?? node
    }

    if (node.type === 'platform_feature') {
        return findNode(node.id) ?? node
    }

    if (node.type === 'columns' || node.type === 'keys' || node.type === 'indexes') {
        await ensureLoaded(node.id)
        return findNode(node.id) ?? node
    }

    if (
        node.type === 'column'
        || node.type === 'primary_key'
        || node.type === 'foreign_key'
        || node.type === 'index'
    ) {
        const parent = findParentNode(tree, node.id)
        if (parent && (parent.type === 'columns' || parent.type === 'keys' || parent.type === 'indexes')) {
            await ensureLoaded(parent.id)
            return findNode(node.id) ?? node
        }
        const table = findAncestorByType(tree, node.id, 'table')
        if (table) {
            const sectionType =
                node.type === 'foreign_key'
                    ? 'keys'
                    : node.type === 'index'
                        ? 'indexes'
                        : 'columns'
            const refreshedTable = findNode(table.id) ?? table
            const section = refreshedTable.children?.find((c) => c.type === sectionType)
            if (section) {
                await ensureLoaded(section.id)
            }
        }
        return findNode(node.id) ?? node
    }

    return node
}
