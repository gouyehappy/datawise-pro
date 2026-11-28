import type {TreeNode, TreeNodeType} from '@/core/types'
import {isViewModelDraftNode} from '@/features/explorer/services/view-model-tree.service'
import {resolvePlatformFeatureNodeOpen} from '@/features/explorer/services/explorer-platform-menu-actions.service'

/**
 * Explorer click contract (select ≠ open):
 * - Single-click / keyboard activate → select (+ delayed Info for info nodes)
 * - Twistie / Space / ←→ → expand only
 * - Double-click / Enter / open shortcut / context「打开」→ activate below
 *
 * Activate means: open a tab, connect, or toggle expand for pure folders.
 * Leaf meta (column / index / …) has no activate action — keep select + Info.
 *
 * Platform feature children (redis-feature, kafka-feature, …) stay on
 * {@link resolvePlatformFeatureNodeOpen}.
 */
export type ExplorerNodeOpenKind =
    | 'table-or-view'
    | 'sql-file'
    | 'project-file'
    | 'view-model-draft'
    | 'view-model-data'
    | 'platform-feature'
    | 'redis-key'
    | 'redis-browser'
    | 'kafka-topic'
    | 'ssh-terminal'
    | 'ssh-script-record'
    | 'ssh-script-records'
    | 'connection'
    | 'database'
    /** Directory / folder row: toggle expand (not open an editor). */
    | 'expand'

/**
 * Node types whose primary double-click action is expand/collapse.
 * Namespace rows are listed as fallback when platform open cannot parse the id;
 * a successful {@link resolvePlatformFeatureNodeOpen} wins and opens the console.
 */
const EXPAND_ON_OPEN_TYPES = new Set<TreeNodeType>([
    'group',
    'folder',
    'project-docs',
    'project-scripts',
    'schema',
    'columns',
    'keys',
    'indexes',
    'nacos-namespace',
    'polaris-namespace',
    'k8s-namespace',
])

export function isExpandOnOpenTreeType(type: TreeNodeType): boolean {
    return EXPAND_ON_OPEN_TYPES.has(type)
}

export function resolveExplorerNodeOpenKind(
    node: Pick<TreeNode, 'type' | 'label' | 'meta'>,
): ExplorerNodeOpenKind | null {
    if (node.type === 'table' || node.type === 'view') return 'table-or-view'
    if (node.type === 'sql_file') return 'sql-file'
    if (node.type === 'project-file') return 'project-file'
    if (node.type === 'view_model') {
        return isViewModelDraftNode(node) ? 'view-model-draft' : 'view-model-data'
    }
    if (node.type === 'platform_feature') return 'platform-feature'
    if (node.type === 'redis-key') return 'redis-key'
    if (node.type === 'redis-browser') return 'redis-browser'
    if (node.type === 'kafka-topic') return 'kafka-topic'
    if (node.type === 'ssh-terminal') return 'ssh-terminal'
    if (node.type === 'ssh-script-record') return 'ssh-script-record'
    if (node.type === 'ssh-script-records') return 'ssh-script-records'
    if (node.type === 'connection') return 'connection'
    if (node.type === 'database') return 'database'
    if (isExpandOnOpenTreeType(node.type)) return 'expand'
    return null
}

/** True when double-click / Enter should activate (not merely keep selection + Info). */
export function hasExplorerNodeActivateAction(
    node: Pick<TreeNode, 'type' | 'label' | 'meta'>,
): boolean {
    return resolveExplorerNodeOpenKind(node) != null
        || resolvePlatformFeatureNodeOpen(node) != null
}

/** Trimmed rename value, or null when unchanged / blank (no-op). */
export function normalizeRenameInput(nextTitle: string, currentLabel: string): string | null {
    const trimmed = nextTitle.trim()
    if (!trimmed || trimmed === currentLabel) return null
    return trimmed
}
