import type {TreeNode, TreeNodeType} from '@/core/types'

/** 深度优先遍历树；visitor 返回 true 时提前结束 */
export function walkTree(
    nodes: readonly TreeNode[],
    visitor: (node: TreeNode, parents: TreeNode[]) => boolean | void,
): boolean {
    const stack: { node: TreeNode; parents: TreeNode[] }[] = nodes.map((node) => ({node, parents: []}))
    while (stack.length) {
        const {node, parents} = stack.pop()!
        if (visitor(node, parents)) return true
        if (node.children?.length) {
            for (let i = node.children.length - 1; i >= 0; i--) {
                stack.push({node: node.children[i], parents: [...parents, node]})
            }
        }
    }
    return false
}

export function findNodeById(nodes: readonly TreeNode[], nodeId: string): TreeNode | null {
    for (const node of nodes) {
        if (node.id === nodeId) return node
        if (node.children?.length) {
            const found = findNodeById(node.children, nodeId)
            if (found) return found
        }
    }
    return null
}

/** 解析节点所属的库 / Schema 名称 */
export function findDatabaseLabel(tree: TreeNode[], nodeId: string): string | null {
    const node = findNodeById(tree, nodeId)
    if (node?.type === 'database') return node.label
    return findAncestorByType(tree, nodeId, 'database')?.label ?? null
}

/** 向上查找节点所属的 connection 节点 id */
export function findParentConnectionId(tree: TreeNode[], nodeId: string): string | null {
    return findAncestorByType(tree, nodeId, 'connection')?.id ?? null
}

/** 解析懒加载/API 调用所需的 connectionId（节点自身为 connection 时返回其 id） */
export function resolveConnectionId(tree: TreeNode[], nodeId: string): string | null {
    const node = findNodeById(tree, nodeId)
    if (!node) return null
    if (node.type === 'connection') return node.id
    return findParentConnectionId(tree, nodeId)
}

/** 资源树中可展开的预置 folder（label 为小写英文键） */
const EXPLORER_EXPANDABLE_FOLDERS = new Set([
    'tables',
    'models',
    'views',
    'workspaces',
    'ai',
    'semantics',
    'functions',
    'procedures',
    'triggers',
])

function isExplorerExpandableFolder(node: TreeNode): boolean {
    return node.type === 'folder' && EXPLORER_EXPANDABLE_FOLDERS.has(node.label.toLowerCase())
}

/** 节点是否可展开（含尚未加载子节点的情况） */
export function canExpandTreeNode(node: TreeNode): boolean {
    if (node.children?.length) return true
    if (node.type === 'group' || node.type === 'connection' || node.type === 'database' || node.type === 'schema') return true
    if (node.type === 'ssh-script-records') return true
    if (node.type === 'project-docs' || node.type === 'project-scripts') return true
    if (
        node.type === 'project-files-draft'
        || node.type === 'project-files-hint'
        || node.type === 'group-draft'
    ) return false
    if (isExplorerExpandableFolder(node)) return true
    if (node.type === 'table' || node.type === 'columns' || node.type === 'keys' || node.type === 'indexes') {
        return true
    }
    return false
}

/** 向上查找节点所属的 database 节点名称（库 / Schema） */
export function findParentDatabaseName(tree: TreeNode[], nodeId: string): string | null {
    return findDatabaseLabel(tree, nodeId)
}

export type SearchTreeVisibility = {
    visibleIds: Set<string>
    forceExpandIds: Set<string>
}

/** 搜索可见性：匹配节点及其祖先 id，避免 filterTree 克隆整棵树 */
export function collectSearchTreeVisibility(
    nodes: TreeNode[],
    query: string,
    matches?: (node: TreeNode, normalizedQuery: string) => boolean,
): SearchTreeVisibility | null {
    const q = query.trim().toLowerCase()
    if (!q) return null
    const nodeMatches = matches ?? ((node, normalized) => node.label.toLowerCase().includes(normalized))
    const visibleIds = new Set<string>()
    const forceExpandIds = new Set<string>()

    function walk(node: TreeNode, ancestors: TreeNode[]): boolean {
        const selfMatch = nodeMatches(node, q)
        let childMatch = false
        const nextAncestors = [...ancestors, node]
        for (const child of node.children ?? []) {
            if (walk(child, nextAncestors)) {
                childMatch = true
            }
        }
        const subtreeMatch = selfMatch || childMatch
        if (subtreeMatch) {
            visibleIds.add(node.id)
            for (const ancestor of ancestors) {
                visibleIds.add(ancestor.id)
                forceExpandIds.add(ancestor.id)
            }
        }
        return subtreeMatch
    }

    for (const node of nodes) {
        walk(node, [])
    }
    return {visibleIds, forceExpandIds}
}

export function cloneTree(nodes: TreeNode[]): TreeNode[] {
    return structuredClone(nodes)
}

/** 从树中移除指定 id 的节点（任意层级） */
export function removeNodeById(nodes: TreeNode[], nodeId: string): boolean {
    const index = nodes.findIndex((node) => node.id === nodeId)
    if (index >= 0) {
        nodes.splice(index, 1)
        return true
    }
    for (const node of nodes) {
        if (node.children && removeNodeById(node.children, nodeId)) {
            return true
        }
    }
    return false
}

/** 向上查找指定节点的直接父节点 */
export function findParentNode(tree: TreeNode[], nodeId: string): TreeNode | null {
    function walk(nodes: TreeNode[], parent: TreeNode | null): TreeNode | null {
        for (const node of nodes) {
            if (node.id === nodeId) return parent
            if (node.children?.length) {
                const found = walk(node.children, node)
                if (found) return found
            }
        }
        return null
    }

    return walk(tree, null)
}

/** 向上查找指定类型的祖先节点 */
export function findAncestorByType(
    tree: TreeNode[],
    nodeId: string,
    type: TreeNodeType,
): TreeNode | null {
    function search(nodes: TreeNode[], parents: TreeNode[]): TreeNode | null {
        for (const node of nodes) {
            if (node.id === nodeId) {
                if (node.type === type) return node
                for (let i = parents.length - 1; i >= 0; i--) {
                    if (parents[i].type === type) return parents[i]
                }
                return null
            }
            if (node.children?.length) {
                const found = search(node.children, [...parents, node])
                if (found) return found
            }
        }
        return null
    }

    return search(tree, [])
}

/** 从根到目标节点的祖先链（含目标节点） */
export function findNodeAncestorChain(tree: TreeNode[], nodeId: string): TreeNode[] {
    let chain: TreeNode[] | null = null
    walkTree(tree, (node, parents) => {
        if (node.id === nodeId) {
            chain = [...parents, node]
            return true
        }
    })
    return chain ?? []
}

/** 将展开状态的树扁平化为渲染列表（迭代实现，避免大树递归 spread 开销） */
export function flattenVisibleTree(
    nodes: TreeNode[],
    depth = 0,
    searchVisibility: SearchTreeVisibility | null = null,
): { node: TreeNode; depth: number }[] {
    const result: { node: TreeNode; depth: number }[] = []
    const stack: { node: TreeNode; depth: number }[] = []

    for (let index = nodes.length - 1; index >= 0; index -= 1) {
        stack.push({node: nodes[index], depth})
    }

    while (stack.length > 0) {
        const current = stack.pop()!
        const {node, depth: nodeDepth} = current
        if (searchVisibility && !searchVisibility.visibleIds.has(node.id)) {
            continue
        }
        result.push({node, depth: nodeDepth})
        const expanded = searchVisibility?.forceExpandIds.has(node.id) || node.expanded
        const children = expanded ? node.children : undefined
        if (!children?.length) continue
        for (let index = children.length - 1; index >= 0; index -= 1) {
            stack.push({node: children[index], depth: nodeDepth + 1})
        }
    }

    return result
}

/** 构建 nodeId → TreeNode 索引，供高频 findNode 使用 */
export function buildTreeNodeIndex(nodes: TreeNode[]): Map<string, TreeNode> {
    const index = new Map<string, TreeNode>()
    mergeTreeNodeIndex(index, nodes)
    return index
}

/** 将子树节点写入索引（同 id 覆盖） */
export function mergeTreeNodeIndex(index: Map<string, TreeNode>, nodes: TreeNode[]): void {
    walkTree(nodes, (node) => {
        index.set(node.id, node)
    })
}

/** 从索引中移除子树全部节点 id */
export function pruneTreeNodeIndexSubtree(index: Map<string, TreeNode>, roots: TreeNode[]): void {
    walkTree(roots, (node) => {
        index.delete(node.id)
    })
}
