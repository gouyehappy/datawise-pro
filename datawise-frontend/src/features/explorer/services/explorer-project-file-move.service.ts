import type {ContextMenuItem, TreeNode} from '@/core/types'
import {findParentNode, walkTree} from '@/core/utils/tree'
import type {CatalogReorderDrop, CatalogReorderPosition} from '@/features/explorer/services/explorer-catalog-reorder.service'
import {resolveCatalogReorderPosition} from '@/features/explorer/services/explorer-catalog-reorder.service'
import type {ProjectFileRoot} from '@/features/project/services/project-files-api'
import {
    isProjectFilesFolderNode,
    parseProjectFileNodeId,
    PROJECT_DOCS_ROOT_ID,
    PROJECT_SCRIPTS_ROOT_ID,
    projectFilesRootNodeId,
} from '@/features/project/services/project-explorer-files'

export const PROJECT_FILE_MOVE_TARGET_MENU_PREFIX = 'project-move-to:'

export type ProjectFileMoveTarget = {
    folderNodeId: string
    label: string
    depth: number
}

/** True when the node is a real project sandbox file or nested folder (not virtual root/hint). */
export function isProjectSandboxMovableNode(node: Pick<TreeNode, 'id' | 'type'>): boolean {
    if (!node.id.startsWith('project-file:')) return false
    return (
        node.type === 'project-file'
        || node.type === 'sql_file'
        || node.type === 'project-docs'
        || node.type === 'project-scripts'
    )
}

export function isProjectSandboxDropFolder(node: Pick<TreeNode, 'id' | 'type'>): boolean {
    return node.type === 'project-docs' || node.type === 'project-scripts'
}

export function toProjectFileMoveTargetMenuId(folderNodeId: string): string {
    return `${PROJECT_FILE_MOVE_TARGET_MENU_PREFIX}${folderNodeId}`
}

export function parseProjectFileMoveTargetMenuId(menuId: string): string | null {
    if (!menuId.startsWith(PROJECT_FILE_MOVE_TARGET_MENU_PREFIX)) return null
    const id = menuId.slice(PROJECT_FILE_MOVE_TARGET_MENU_PREFIX.length)
    return id || null
}

function resolveNodeRootAndPath(
    node: Pick<TreeNode, 'id' | 'type'>,
): {projectId: string; root: ProjectFileRoot; path: string} | null {
    if (node.id === PROJECT_DOCS_ROOT_ID) {
        return {projectId: '', root: 'docs', path: ''}
    }
    if (node.id === PROJECT_SCRIPTS_ROOT_ID) {
        return {projectId: '', root: 'scripts', path: ''}
    }
    return parseProjectFileNodeId(node.id)
}

function isUnderPath(ancestorPath: string, candidatePath: string): boolean {
    const a = ancestorPath.replace(/\/+$/, '')
    const c = candidatePath.replace(/\/+$/, '')
    if (!a) return true
    return c === a || c.startsWith(`${a}/`)
}

/** Current parent folder node id for a project sandbox leaf/folder. */
export function findProjectFileParentFolderId(
    tree: TreeNode[],
    nodeId: string,
): string | null {
    const parent = findParentNode(tree, nodeId)
    if (!parent) return null
    if (parent.id === PROJECT_DOCS_ROOT_ID || parent.id === PROJECT_SCRIPTS_ROOT_ID) {
        return parent.id
    }
    if (parent.id.startsWith('project-file:') && isProjectFilesFolderNode(parent)) {
        return parent.id
    }
    return null
}

/**
 * Whether `source` can move into `targetFolder` (same docs|scripts root, not self/descendant,
 * not already there).
 */
export function canMoveProjectFileToFolder(
    tree: TreeNode[],
    source: Pick<TreeNode, 'id' | 'type'>,
    targetFolder: Pick<TreeNode, 'id' | 'type'>,
): boolean {
    if (!isProjectSandboxMovableNode(source)) return false
    if (!isProjectSandboxDropFolder(targetFolder)) return false
    if (source.id === targetFolder.id) return false

    const sourceParsed = parseProjectFileNodeId(source.id)
    if (!sourceParsed) return false
    const targetParsed = resolveNodeRootAndPath(targetFolder)
    if (!targetParsed) return false

    // Virtual roots have empty projectId in resolve — fill from source.
    const targetRoot = targetParsed.root
    const targetPath =
        targetFolder.id === PROJECT_DOCS_ROOT_ID || targetFolder.id === PROJECT_SCRIPTS_ROOT_ID
            ? ''
            : (parseProjectFileNodeId(targetFolder.id)?.path ?? '')

    if (sourceParsed.root !== targetRoot) return false
    if (targetFolder.id.startsWith('project-file:')) {
        const tp = parseProjectFileNodeId(targetFolder.id)
        if (!tp || tp.projectId !== sourceParsed.projectId) return false
    }

    // Cannot move a folder into itself or a descendant.
    if (isProjectFilesFolderNode(source as TreeNode) || source.type === 'project-docs' || source.type === 'project-scripts') {
        if (isUnderPath(sourceParsed.path, targetPath)) return false
    }

    const currentParent = findProjectFileParentFolderId(tree, source.id)
    if (currentParent && currentParent === targetFolder.id) return false

    return true
}

/** List folders under the same docs|scripts root (including the root). */
export function listProjectFileMoveTargets(
    tree: TreeNode[],
    source: Pick<TreeNode, 'id' | 'type' | 'label'>,
): ProjectFileMoveTarget[] {
    const parsed = parseProjectFileNodeId(source.id)
    if (!parsed) return []
    const rootId = projectFilesRootNodeId(parsed.root)
    const rootNode = tree.find((n) => n.id === rootId)
    if (!rootNode) return []

    const targets: ProjectFileMoveTarget[] = []
    const pushIfAllowed = (folder: TreeNode, depth: number) => {
        if (!canMoveProjectFileToFolder(tree, source, folder)) return
        targets.push({
            folderNodeId: folder.id,
            label: folder.label,
            depth,
        })
    }

    pushIfAllowed(rootNode, 0)
    walkTree(rootNode.children ?? [], (node, parents) => {
        if (!isProjectSandboxDropFolder(node)) return
        if (!node.id.startsWith('project-file:')) return
        pushIfAllowed(node, parents.length + 1)
    })
    return targets
}

export function formatProjectFileMoveTargetLabel(target: ProjectFileMoveTarget): string {
    if (target.depth <= 0) return target.label
    return `${'\u2003'.repeat(target.depth)}${target.label}`
}

export function buildProjectFileMoveTargetMenuChildren(
    targets: ProjectFileMoveTarget[],
): ContextMenuItem[] {
    return targets.map((target) => ({
        id: toProjectFileMoveTargetMenuId(target.folderNodeId),
        label: formatProjectFileMoveTargetLabel(target),
        icon: 'folder' as const,
    }))
}

/**
 * Resolve project-docs/scripts drag drop:
 * - folder middle → inside
 * - folder top/bottom or file → before/after (caller maps to parent folder)
 */
export function resolveProjectFileReorderDrop(
    tree: TreeNode[],
    dragged: TreeNode,
    target: TreeNode,
    clientY: number,
    rowTop: number,
    rowHeight: number,
): CatalogReorderDrop | null {
    if (!isProjectSandboxMovableNode(dragged)) return null
    if (dragged.id === target.id) return null

    let position: CatalogReorderPosition
    if (isProjectSandboxDropFolder(target)) {
        position = resolveCatalogReorderPosition(clientY, rowTop, rowHeight, 'group')
    } else if (isProjectSandboxMovableNode(target)) {
        position = resolveCatalogReorderPosition(clientY, rowTop, rowHeight, 'connection')
    } else {
        return null
    }

    const folderId = resolveProjectFileDropFolderId(tree, target, position)
    if (!folderId) return null
    const folder = findNodeById(tree, folderId) ?? (
        folderId === PROJECT_DOCS_ROOT_ID || folderId === PROJECT_SCRIPTS_ROOT_ID
            ? ({id: folderId, type: folderId === PROJECT_DOCS_ROOT_ID ? 'project-docs' : 'project-scripts', label: ''} as TreeNode)
            : null
    )
    if (!folder) return null
    // inside → must be a real move; before/after may be same-parent (visual only / catalog no-op)
    if (position === 'inside') {
        if (!canMoveProjectFileToFolder(tree, dragged, folder)) return null
    } else if (!canShowProjectFileInsertLine(dragged, folder)) {
        return null
    }
    return {targetId: target.id, position}
}

/** Same-root insert line (allows same parent so sibling reorder feedback still shows). */
function canShowProjectFileInsertLine(
    source: Pick<TreeNode, 'id' | 'type'>,
    targetFolder: Pick<TreeNode, 'id' | 'type'>,
): boolean {
    if (!isProjectSandboxMovableNode(source)) return false
    if (!isProjectSandboxDropFolder(targetFolder)) return false
    if (source.id === targetFolder.id) return false
    const sourceParsed = parseProjectFileNodeId(source.id)
    if (!sourceParsed) return false
    const targetRoot =
        targetFolder.id === PROJECT_DOCS_ROOT_ID
            ? 'docs'
            : targetFolder.id === PROJECT_SCRIPTS_ROOT_ID
              ? 'scripts'
              : parseProjectFileNodeId(targetFolder.id)?.root
    if (!targetRoot || sourceParsed.root !== targetRoot) return false
    const targetPath =
        targetFolder.id === PROJECT_DOCS_ROOT_ID || targetFolder.id === PROJECT_SCRIPTS_ROOT_ID
            ? ''
            : (parseProjectFileNodeId(targetFolder.id)?.path ?? '')
    if (
        (source.type === 'project-docs' || source.type === 'project-scripts')
        && isUnderPath(sourceParsed.path, targetPath)
    ) {
        return false
    }
    return true
}

/** Map a drop on a row to the destination folder node id. */
export function resolveProjectFileDropFolderId(
    tree: TreeNode[],
    target: Pick<TreeNode, 'id' | 'type'>,
    position: CatalogReorderPosition,
): string | null {
    if (position === 'inside') {
        return isProjectSandboxDropFolder(target) ? target.id : null
    }
    return findProjectFileParentFolderId(tree, target.id)
}

function findNodeById(tree: TreeNode[], id: string): TreeNode | null {
    let found: TreeNode | null = null
    walkTree(tree, (node) => {
        if (node.id === id) {
            found = node
            return true
        }
    })
    return found
}

export function injectProjectFileMoveSubmenu(
    items: ContextMenuItem[],
    targets: ProjectFileMoveTarget[],
    moveLabel: string,
): ContextMenuItem[] {
    const moveItem: ContextMenuItem = targets.length
        ? {
            id: 'move-project-file',
            label: moveLabel,
            icon: 'file',
            children: buildProjectFileMoveTargetMenuChildren(targets),
        }
        : {
            id: 'move-project-file',
            label: moveLabel,
            icon: 'file',
            disabled: true,
        }
    const renameIdx = items.findIndex((item) => item.id === 'rename-project-file')
    if (renameIdx >= 0) {
        const next = [...items]
        next.splice(renameIdx + 1, 0, moveItem)
        return next
    }
    const deleteIdx = items.findIndex((item) => item.id === 'delete-project-file')
    if (deleteIdx >= 0) {
        const next = [...items]
        next.splice(deleteIdx, 0, moveItem)
        return next
    }
    return [...items, moveItem]
}
