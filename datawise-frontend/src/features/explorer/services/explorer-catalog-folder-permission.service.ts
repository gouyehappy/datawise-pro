import type {TreeNode} from '@/core/types'
import {
    canAccessExplorerCatalogAi,
    canAccessExplorerCatalogModels,
    canAccessExplorerCatalogSchema,
    canAccessExplorerCatalogWorkspaces,
} from '@/features/auth/services/feature-permission.service'

export const SCHEMA_CATALOG_FOLDER_LABELS = new Set([
    'tables',
    'views',
    'functions',
    'procedures',
    'triggers',
])

const LEGACY_SEMANTICS_FOLDER_LABEL = 'semantics'
const AI_FOLDER_LABEL = 'ai'

export interface ExplorerCatalogFolderFilterOptions {
    showSemanticLayer: boolean
}

function normalizeFolderLabel(label: string): string {
    return label.trim().toLowerCase()
}

function isLegacySemanticsFolder(node: Pick<TreeNode, 'type' | 'label'>): boolean {
    return node.type === 'folder' && normalizeFolderLabel(node.label) === LEGACY_SEMANTICS_FOLDER_LABEL
}

export function isExplorerCatalogFolderVisible(
    label: string,
    options: ExplorerCatalogFolderFilterOptions,
): boolean {
    const normalized = normalizeFolderLabel(label)
    if (SCHEMA_CATALOG_FOLDER_LABELS.has(normalized)) {
        return canAccessExplorerCatalogSchema()
    }
    if (normalized === 'models') {
        return canAccessExplorerCatalogModels()
    }
    if (normalized === 'workspaces') {
        return canAccessExplorerCatalogWorkspaces()
    }
    if (normalized === AI_FOLDER_LABEL || normalized === LEGACY_SEMANTICS_FOLDER_LABEL) {
        return canAccessExplorerCatalogAi() && options.showSemanticLayer
    }
    return true
}

/** 按账号权限与个人 AI 显示偏好过滤 database/schema 下的目录节点。 */
export function filterExplorerTreeCatalogFolders(
    nodes: TreeNode[],
    options: ExplorerCatalogFolderFilterOptions,
): TreeNode[] {
    return nodes.map((node) => {
        if (!node.children?.length) return node
        let children = node.children.filter((child) => !isLegacySemanticsFolder(child))
        if (node.type === 'database' || node.type === 'schema') {
            children = children.filter((child) => {
                if (child.type !== 'folder') return true
                return isExplorerCatalogFolderVisible(child.label, options)
            })
        }
        const nextChildren = filterExplorerTreeCatalogFolders(children, options)
        if (nextChildren === node.children) return node
        return {...node, children: nextChildren}
    })
}
