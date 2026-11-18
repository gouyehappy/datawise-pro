import type {TreeNode} from '@/core/types'
import {resolveConnectionId, walkTree} from '@/core/utils/tree'
import {orderExplorerCatalogFolders} from '@/features/explorer/services/explorer-catalog-label.service'
import {isCatalogSchemaDbType} from '@/shared/db-type-families'

export const AI_FOLDER_LABEL = 'ai'
const LEGACY_SEMANTICS_FOLDER_LABEL = 'semantics'

/** Connection-level AI instance key (matches CatalogSchemaScope.CONNECTION_PLATFORM). */
export const CONNECTION_PLATFORM_INSTANCE = '_connection'

/** Disk instance key for connection-level scripts (CatalogSchemaScope.CONNECTION_SCRIPTS). */
export const CONNECTION_SCRIPTS_INSTANCE = '_scripts'

/**
 * Match Java `SchemaNodeIds.slug` for tree node id segments.
 * Connection-level ids use slug(`_scripts`) → `scripts`, slug(`_connection`) → `connection`.
 */
export function schemaNodeIdSlug(value: string): string {
    const trimmed = value?.trim() ?? ''
    if (!trimmed) return 'unknown'
    const hasNonAscii = [...trimmed].some((ch) => ch.charCodeAt(0) >= 128)
    const ascii = trimmed
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
    if (!hasNonAscii && ascii.length >= 2) {
        return ascii.length > 48 ? ascii.slice(0, 48) : ascii
    }
    // Java uses Integer.toUnsignedString(hashCode, 36); FE inject only needs ASCII paths.
    return ascii.length >= 2 ? ascii : 'unknown'
}

export function connectionScriptsFolderNodeId(connectionId: string): string {
    return `folder-scripts-${connectionId}-${schemaNodeIdSlug(CONNECTION_SCRIPTS_INSTANCE)}`
}

export function connectionAiFolderNodeId(connectionId: string): string {
    return `folder-ai-${connectionId}-${schemaNodeIdSlug(CONNECTION_PLATFORM_INSTANCE)}`
}

const CATALOG_FOLDER_LABELS = new Set([
    'tables',
    'views',
    'functions',
    'procedures',
    'triggers',
    'models',
    'workspaces',
    AI_FOLDER_LABEL,
])

function isLegacySemanticsFolder(node: Pick<TreeNode, 'type' | 'label'>): boolean {
    return node.type === 'folder' && node.label.toLowerCase() === LEGACY_SEMANTICS_FOLDER_LABEL
}

function stripAiFolders(children: TreeNode[]): TreeNode[] {
    return children.filter((child) => !isAiFolder(child) && !isLegacySemanticsFolder(child))
}

function stripSchemaWorkspaces(children: TreeNode[]): TreeNode[] {
    return children.filter(
        (child) =>
            !(
                child.type === 'folder'
                && child.label.localeCompare('workspaces', undefined, {sensitivity: 'accent'}) === 0
            ),
    )
}

function hasSchemaChildren(node: TreeNode): boolean {
    return (node.children ?? []).some((child) => child.type === 'schema')
}

/** 对象目录作用域：子级是表/模型/工作区等文件夹（MySQL 库 或 SQL Server schema） */
function isObjectCatalogScope(node: TreeNode): boolean {
    return (node.children ?? []).some(
        (child) => child.type === 'folder' && CATALOG_FOLDER_LABELS.has(child.label.toLowerCase()),
    )
}

function findConnectionNode(roots: TreeNode[], connectionId: string): TreeNode | null {
    for (const root of roots) {
        if (root.id === connectionId && root.type === 'connection') return root
        const stack = [...(root.children ?? [])]
        while (stack.length) {
            const node = stack.pop()!
            if (node.id === connectionId && node.type === 'connection') return node
            if (node.children?.length) stack.push(...node.children)
        }
    }
    return null
}

function isConnectionScriptsFolder(node: Pick<TreeNode, 'type' | 'label'>): boolean {
    return (
        node.type === 'folder'
        && node.label.localeCompare('scripts', undefined, {sensitivity: 'accent'}) === 0
    )
}

/**
 * Ensure connection-level scripts + ai after catalogs are present.
 * Never inject into an empty connection — that would block lazy-load of catalogs.
 */
function ensureConnectionScriptsAndAiFolders(connection: TreeNode): void {
    let children = [...(connection.children ?? [])].filter((child) => !isLegacySemanticsFolder(child))
    const hasCatalog = children.some((child) => child.type === 'database')
    if (!hasCatalog && !children.some(isConnectionScriptsFolder)) {
        // Still unloaded — leave empty so needsLazyLoad keeps requesting roots.
        connection.children = children.length ? children : connection.children
        return
    }

    if (!children.some(isConnectionScriptsFolder)) {
        children.unshift({
            id: connectionScriptsFolderNodeId(connection.id),
            label: 'scripts',
            type: 'folder',
            expanded: false,
            children: [],
        })
    }
    if (!children.some((child) => isAiFolder(child))) {
        const scriptsIndex = children.findIndex(isConnectionScriptsFolder)
        const insertAt = scriptsIndex >= 0 ? scriptsIndex + 1 : 0
        children.splice(insertAt, 0, {
            id: connectionAiFolderNodeId(connection.id),
            label: AI_FOLDER_LABEL,
            type: 'folder',
            expanded: false,
            children: [],
        })
    }
    connection.children = children
}

/**
 * 遍历连接树：AI 与模型/工作区同级注入。
 * - catalog.schema 引擎：AI + scripts 在连接根；schema 下剥离 ai/workspaces
 * - 扁平库：database 下保证有 AI
 * - 含 schema 的 catalog：剔除库级 AI
 */
export function migrateExplorerTreeAiStructure(roots: TreeNode[]): void {
    const catalogSchemaConnectionIds = new Set<string>()

    walkTree(roots, (node) => {
        if (node.type === 'connection' && isCatalogSchemaDbType(node.dbType)) {
            catalogSchemaConnectionIds.add(node.id)
            ensureConnectionScriptsAndAiFolders(node)
            return
        }

        if (node.type !== 'database' && node.type !== 'schema') return
        const connectionId = resolveConnectionId(roots, node.id)
        if (!connectionId) {
            if (node.type === 'database' && hasSchemaChildren(node) && node.children?.length) {
                node.children = orderExplorerCatalogFolders(stripAiFolders(node.children))
            }
            return
        }

        if (catalogSchemaConnectionIds.has(connectionId) || isCatalogSchemaDbType(
            findConnectionNode(roots, connectionId)?.dbType,
        )) {
            // Federated engines: strip schema/catalog ai + schema workspaces (scripts live at connection).
            if (node.children?.length) {
                let children = stripAiFolders(node.children)
                if (node.type === 'schema') {
                    children = stripSchemaWorkspaces(children)
                }
                node.children = orderExplorerCatalogFolders(children)
            }
            return
        }

        ensureAiFolderInScopeChildren(node, connectionId)
    })
}

/** 递归过滤 AI 文件夹（设置关闭时），并剔除遗留 semantics */
export function filterExplorerTreeAiFolders(nodes: TreeNode[], visible: boolean): TreeNode[] {
    return nodes.map((node) => {
        if (!node.children?.length) return node
        let children = node.children.filter((child) => !isLegacySemanticsFolder(child))
        if (!visible) {
            children = children.filter((child) => !isAiFolder(child))
        }
        const nextChildren = filterExplorerTreeAiFolders(children, visible)
        if (nextChildren === node.children) return node
        return {...node, children: nextChildren}
    })
}

export function isAiFolder(node: Pick<TreeNode, 'type' | 'label'>): boolean {
    return node.type === 'folder' && node.label.toLowerCase() === AI_FOLDER_LABEL
}

export function isPlatformFeatureNode(node: Pick<TreeNode, 'type'>): boolean {
    return node.type === 'platform_feature'
}

export function resolvePlatformFeatureId(node: Pick<TreeNode, 'label' | 'meta'>): string {
    return (node.meta ?? node.label).trim().toLowerCase()
}

/**
 * 为对象目录作用域补全 AI 文件夹（与模型/工作区同级）。
 * - schema：始终注入
 * - database：仅扁平对象树注入；若子级是 schema，则剔除库级 AI
 */
export function ensureAiFolderInScopeChildren(scopeNode: TreeNode, connectionId: string): void {
    if (scopeNode.type === 'database' && hasSchemaChildren(scopeNode)) {
        if (scopeNode.children?.length) {
            scopeNode.children = orderExplorerCatalogFolders(stripAiFolders(scopeNode.children))
        }
        return
    }

    if (scopeNode.type === 'database' && scopeNode.children?.length && !isObjectCatalogScope(scopeNode)) {
        // 尚未加载出对象目录时，不在库级强行注入
        scopeNode.children = orderExplorerCatalogFolders(stripAiFolders(scopeNode.children))
        return
    }

    if (scopeNode.type !== 'database' && scopeNode.type !== 'schema') {
        return
    }

    let children = (scopeNode.children ?? []).filter((child) => !isLegacySemanticsFolder(child))
    if (children.some((child) => isAiFolder(child))) {
        scopeNode.children = orderExplorerCatalogFolders(children)
        return
    }

    const referenceFolder = children.find(
        (child) =>
            child.type === 'folder'
            && ['workspaces', 'tables', 'models'].includes(child.label.toLowerCase()),
    )
    const aiId = referenceFolder
        ? referenceFolder.id
            .replace(/folder-ws/i, 'folder-ai')
            .replace(/folder-tables/i, 'folder-ai')
            .replace(/folder-models/i, 'folder-ai')
            .replace(/folder-semantics/i, 'folder-ai')
        : `folder-ai-${connectionId}-${schemaNodeIdSlug(scopeNode.label)}`

    scopeNode.children = orderExplorerCatalogFolders([
        ...children,
        {
            id: aiId,
            label: AI_FOLDER_LABEL,
            type: 'folder',
            expanded: false,
            children: [],
        },
    ])
}
