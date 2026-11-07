import type {TreeNode} from '@/core/types'
import type {TeamSummary} from '@/core/types'
import type {ConnectionEnvironment} from '@/features/connection/services/connection-environment.service'
import {normalizeConnectionEnvironment} from '@/features/connection/services/connection-environment.service'
import {walkConnectionNodes} from '@/features/team/services/team-shared-explorer.service'

export interface OnCallConnectionRef {
    id: string
    label: string
    found: boolean
    env: ConnectionEnvironment
    envCustom?: string
}

export function resolveActiveTeamOnCallConnectionIds(
    teams: TeamSummary[],
    activeTeamId: string | null,
): string[] {
    if (!activeTeamId) return []
    const team = teams.find((item) => item.id === activeTeamId)
    return [...(team?.onCallConnectionIds ?? [])]
}

export function pruneOnCallConnectionIds(
    onCallIds: readonly string[],
    sharedIds: readonly string[],
): string[] {
    const shared = new Set(sharedIds)
    return onCallIds.filter((id) => shared.has(id))
}

export function toggleOnCallConnectionId(
    onCallIds: readonly string[],
    connectionId: string,
): string[] {
    const next = [...onCallIds]
    const index = next.indexOf(connectionId)
    if (index >= 0) {
        next.splice(index, 1)
        return next
    }
    return [...next, connectionId]
}

export function resolveOnCallConnectionRefs(
    tree: TreeNode[],
    connectionIds: string[],
): OnCallConnectionRef[] {
    if (!connectionIds.length) return []
    const idSet = new Set(connectionIds)
    const metaById = new Map<string, {label: string; env?: string; envCustom?: string}>()

    walkConnectionNodes(tree, (node) => {
        if (idSet.has(node.id)) {
            metaById.set(node.id, {
                label: node.label,
                env: node.env,
                envCustom: node.envCustom,
            })
        }
    })

    return connectionIds.map((id) => {
        const meta = metaById.get(id)
        const normalized = normalizeConnectionEnvironment(meta?.env, meta?.envCustom)
        return {
            id,
            label: meta?.label ?? id,
            found: meta != null,
            env: normalized.env,
            envCustom: normalized.envCustom,
        }
    })
}
