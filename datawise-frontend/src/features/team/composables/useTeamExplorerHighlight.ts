import {computed} from 'vue'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useTeamStore} from '@/features/team/stores/team-store'
import {
    resolveActiveTeamSharedConnectionIds,
    resolveSharedConnectionRefs,
} from '@/features/team/services/team-shared-explorer.service'

/** 连接树：高亮当前团队的共享连接 */
export function useTeamExplorerHighlight() {
    const teamStore = useTeamStore()
    const explorer = useExplorerStore()

    const sharedConnectionIds = computed(() =>
        resolveActiveTeamSharedConnectionIds(teamStore.teams, teamStore.activeTeamId),
    )

    const highlightNodeIds = computed(() => new Set(sharedConnectionIds.value))

    const sharedConnections = computed(() =>
        resolveSharedConnectionRefs(explorer.tree, sharedConnectionIds.value),
    )

    const hasSharedConnections = computed(() => sharedConnectionIds.value.length > 0)

    const activeTeamName = computed(() => {
        if (!teamStore.activeTeamId) return ''
        return teamStore.teams.find((team) => team.id === teamStore.activeTeamId)?.name ?? ''
    })

    async function locateSharedConnection(connectionId: string) {
        return (await explorer.locateNode(connectionId)) != null
    }

    return {
        sharedConnectionIds,
        highlightNodeIds,
        sharedConnections,
        hasSharedConnections,
        activeTeamName,
        locateSharedConnection,
    }
}
