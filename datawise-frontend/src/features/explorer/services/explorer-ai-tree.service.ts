import type {TreeNode} from '@/core/types'
import {resolveConnectionId, walkTree} from '@/core/utils/tree'
import {orderExplorerCatalogFolders} from '@/features/explorer/services/explorer-catalog-label.service'

export const AI_FOLDER_LABEL = 'ai'
const LEGACY_SEMANTICS_FOLDER_LABEL = 'semantics'

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

function hasSchemaChildren(node: TreeNode): boolean {
    return (node.children ?? []).some((child) => child.type === 'schema')
}

/** 对象目录作用域：子级是表/模型/工作区等文件夹（MySQL 库 或 SQL Server schema） */
function isObjectCatalogScope(node: TreeNode): boolean {
    return (node.children ?? []).some(
        (child) => child.type === 'folder' && CATALOG_FOLDER_LABELS.has(child.label.toLowerCase()),
    )
}

/**
 * 遍历连接树：AI 与模型/工作区同级注入。
 * - schema：保证有 AI
 * - database：扁平库（有表/模型等文件夹）保证有 AI；含 schema 子节点的库（SQL Server/Trino）剔除库级 AI
 */
export function migrateExplorerTreeAiStructure(roots: TreeNode[]): void {
    walkTree(roots, (node) => {
        if (node.type !== 'database' && node.type !== 'schema') return
        const connectionId = resolveConnectionId(roots, node.id)
        if (!connectionId) {
            if (node.type === 'database' && hasSchemaChildren(node) && node.children?.length) {
                node.children = orderExplorerCatalogFolders(stripAiFolders(node.children))
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
        : `folder-ai-${connectionId}-${scopeNode.label}`

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
