import {onMounted, onUnmounted, ref} from 'vue'
import {
    countConnectorUpdatesAvailable,
    fetchConnectorMarketBundle,
} from '@/features/datasource/services/connector-market.service'

const updateCount = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
let started = false

async function refreshConnectorUpdateCount() {
    try {
        const bundle = await fetchConnectorMarketBundle()
        updateCount.value = countConnectorUpdatesAvailable(bundle.connectors ?? [])
    } catch {
        // Badge is best-effort; keep last known count.
    }
}

export function useConnectorUpdateBadge() {
    onMounted(() => {
        if (started) return
        started = true
        void refreshConnectorUpdateCount()
        timer = setInterval(() => {
            void refreshConnectorUpdateCount()
        }, 5 * 60_000)
    })

    onUnmounted(() => {
        // Keep shared timer for app lifetime; AppSideRail stays mounted.
    })

    return {
        connectorUpdateCount: updateCount,
        refreshConnectorUpdateCount,
    }
}
