import {onMounted, onUnmounted, ref, watch} from 'vue'
import {storeToRefs} from 'pinia'
import {bootstrapProgress} from '@/app/services/bootstrap-app.service'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useTeamStore} from '@/features/team/stores/team-store'
import {countPendingProductionApprovals} from '@/features/team/services/pending-production-approvals.service'
import {readUserId} from '@/shared/auth/session'

const REFRESH_MS = 60_000

/** Cross-team “awaiting my review” count for workbench-focus badge. */
export function usePendingProductionApprovalsBadge() {
    const teamStore = useTeamStore()
    const auth = useAuthStore()
    const {teams} = storeToRefs(teamStore)
    const pendingCount = ref(0)
    let timer: ReturnType<typeof setInterval> | null = null
    let inflight = false

    function currentUserId(): number | null {
        return auth.user?.userId ?? readUserId()
    }

    async function refresh() {
        // Avoid competing with desktop prefs sync during boot skeleton.
        if (!bootstrapProgress.startupComplete) return
        if (inflight) return
        inflight = true
        try {
            if (!teams.value.length) {
                await teamStore.load().catch(() => undefined)
            }
            pendingCount.value = await countPendingProductionApprovals(teams.value, {
                currentUserId: currentUserId(),
            })
        } finally {
            inflight = false
        }
    }

    onMounted(() => {
        void refresh()
        timer = setInterval(() => {
            void refresh()
        }, REFRESH_MS)
    })

    onUnmounted(() => {
        if (timer != null) clearInterval(timer)
        timer = null
    })

    watch(teams, () => {
        void refresh()
    })

    watch(
        () => auth.user?.userId,
        () => {
            void refresh()
        },
    )

    watch(
        () => bootstrapProgress.startupComplete,
        (ready) => {
            if (ready) void refresh()
        },
    )

    return {pendingCount, refresh}
}
