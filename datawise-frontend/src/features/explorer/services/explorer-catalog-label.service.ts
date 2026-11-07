import type {ComposerTranslation} from 'vue-i18n'
import type {TreeNode, TreeNodeType} from '@/core/types'

/** 后端 Schema 树预置目录/分区 label（稳定英文键，逻辑匹配仍用 node.label） */
export const EXPLORER_CATALOG_LABEL_KEYS = [
    'tables',
    'views',
    'functions',
    'procedures',
    'triggers',
    'models',
    'workspaces',
    'ai',
    'semantics',
    'columns',
    'keys',
    'indexes',
] as const

export type ExplorerCatalogLabelKey = (typeof EXPLORER_CATALOG_LABEL_KEYS)[number]

/** 固定对象目录（表/视图/例程） */
export const EXPLORER_CORE_CATALOG_FOLDERS = [
    'tables',
    'views',
    'functions',
    'procedures',
    'triggers',
] as const

/** 扩展目录（模型 / 工作区脚本 / AI） */
export const EXPLORER_EXTENSION_CATALOG_FOLDERS = [
    'models',
    'workspaces',
    'ai',
    'semantics',
] as const

const CATALOG_LABEL_KEY_SET = new Set<string>(EXPLORER_CATALOG_LABEL_KEYS)
const EXTENSION_CATALOG_FOLDER_SET = new Set<string>(EXPLORER_EXTENSION_CATALOG_FOLDERS)

const CATALOG_FOLDER_ORDER: readonly string[] = [
    ...EXPLORER_CORE_CATALOG_FOLDERS,
    ...EXPLORER_EXTENSION_CATALOG_FOLDERS,
]

const CATALOG_LABEL_BY_NODE_TYPE: Partial<Record<TreeNodeType, ExplorerCatalogLabelKey>> = {
    columns: 'columns',
    keys: 'keys',
    indexes: 'indexes',
}

export function normalizeExplorerCatalogLabelKey(label: string): ExplorerCatalogLabelKey | null {
    const key = label.trim().toLowerCase()
    return CATALOG_LABEL_KEY_SET.has(key) ? (key as ExplorerCatalogLabelKey) : null
}

export function resolveExplorerCatalogLabelKey(node: TreeNode): ExplorerCatalogLabelKey | null {
    const byType = CATALOG_LABEL_BY_NODE_TYPE[node.type]
    if (byType) return byType
    if (node.type !== 'folder') return null
    return normalizeExplorerCatalogLabelKey(node.label)
}

export function isExplorerExtensionCatalogFolder(node: Pick<TreeNode, 'type' | 'label'>): boolean {
    if (node.type !== 'folder') return false
    return EXTENSION_CATALOG_FOLDER_SET.has(node.label.trim().toLowerCase())
}

export function isExplorerCoreCatalogFolder(node: Pick<TreeNode, 'type' | 'label'>): boolean {
    if (node.type !== 'folder') return false
    const key = node.label.trim().toLowerCase()
    return (EXPLORER_CORE_CATALOG_FOLDERS as readonly string[]).includes(key)
}

/** 将 database/schema 下预置目录排成：固定对象 → 扩展 */
export function orderExplorerCatalogFolders(children: TreeNode[]): TreeNode[] {
    if (!children.length) return children
    const orderIndex = new Map(CATALOG_FOLDER_ORDER.map((key, index) => [key, index]))
    const catalogFolders: TreeNode[] = []
    const others: TreeNode[] = []
    for (const child of children) {
        if (child.type === 'folder' && orderIndex.has(child.label.trim().toLowerCase())) {
            catalogFolders.push(child)
        } else {
            others.push(child)
        }
    }
    catalogFolders.sort((a, b) => {
        const ai = orderIndex.get(a.label.trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER
        const bi = orderIndex.get(b.label.trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER
        return ai - bi
    })
    return [...catalogFolders, ...others]
}

/** 展示用 label；未知目录名原样返回 */
export function resolveExplorerCatalogLabel(node: TreeNode, t: ComposerTranslation): string {
    const key = resolveExplorerCatalogLabelKey(node)
    return key ? t(`explorer.treeCatalog.${key}`) : node.label
}

export function matchesExplorerTreeSearch(
    node: TreeNode,
    normalizedQuery: string,
    t: ComposerTranslation,
): boolean {
    if (node.label.toLowerCase().includes(normalizedQuery)) return true
    const localized = resolveExplorerCatalogLabel(node, t)
    return localized !== node.label && localized.toLowerCase().includes(normalizedQuery)
}
