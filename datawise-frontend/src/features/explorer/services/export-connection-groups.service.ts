import type {TreeNode} from '@/core/types'
import {collectConnectionIds} from '@/features/dashboard/services/dashboard-summary.service'

export interface ExportConnectionGroupOption {
    id: string
    label: string
    connectionIds: string[]
}

/** Top-level explorer groups that contain at least one connection (nested included). */
export function listExportConnectionGroups(tree: TreeNode[]): ExportConnectionGroupOption[] {
    const options: ExportConnectionGroupOption[] = []
    for (const node of tree) {
        if (node.type !== 'group') continue
        const connectionIds = collectConnectionIds([node])
        if (!connectionIds.length) continue
        options.push({
            id: node.id,
            label: node.label,
            connectionIds,
        })
    }
    return options
}

export function collectSelectedConnectionIds(
    groups: readonly ExportConnectionGroupOption[],
    selectedGroupIds: ReadonlySet<string>,
): string[] {
    const ids = new Set<string>()
    for (const group of groups) {
        if (!selectedGroupIds.has(group.id)) continue
        for (const id of group.connectionIds) ids.add(id)
    }
    return [...ids]
}
