import type {TreeNode} from '@/core/types'
import type {TeamSummary} from '@/core/types'

export interface SharedConnectionRef {
    id: string
    label: string
    found: boolean
}

export function resolveActiveTeamId(
    teams: TeamSummary[],
    currentTeamId: string | null,
): string | null {
    if (currentTeamId && teams.some((team) => team.id === currentTeamId)) {
        return currentTeamId
    }
    return teams.length ? teams[0].id : null
}

export function resolveActiveTeamSharedConnectionIds(
    teams: TeamSummary[],
    activeTeamId: string | null,
): string[] {
    if (!activeTeamId) return []
    const team = teams.find((item) => item.id === activeTeamId)
    return [...(team?.sharedConnectionIds ?? [])]
}

export function walkConnectionNodes(
    tree: TreeNode[],
    visitor: (node: TreeNode) => void,
): void {
    for (const node of tree) {
        if (node.type === 'connection') {
            visitor(node)
        }
        if (node.children?.length) {
            walkConnectionNodes(node.children, visitor)
        }
    }
}

export function resolveSharedConnectionRefs(
    tree: TreeNode[],
    connectionIds: string[],
): SharedConnectionRef[] {
    if (!connectionIds.length) return []
    const idSet = new Set(connectionIds)
    const labelById = new Map<string, string>()

    walkConnectionNodes(tree, (node) => {
        if (idSet.has(node.id)) {
            labelById.set(node.id, node.label)
        }
    })

    return connectionIds.map((id) => ({
        id,
        label: labelById.get(id) ?? id,
        found: labelById.has(id),
    }))
}
