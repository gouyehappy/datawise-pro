import {onMounted, onUnmounted, ref} from 'vue'
import {
    countConnectorUpdatesAvailable,
    fetchConnectorMarketBundle,
} from '@/features/datasource/services/connector-market.service'

const updateCount = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
let subscribers = 0

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
        subscribers += 1
        void refreshConnectorUpdateCount()
        if (subscribers === 1) {
            timer = setInterval(() => {
                void refreshConnectorUpdateCount()
            }, 5 * 60_000)
        }
    })

    onUnmounted(() => {
        subscribers = Math.max(0, subscribers - 1)
        if (subscribers === 0 && timer != null) {
            clearInterval(timer)
            timer = null
        }
    })

    return {
        connectorUpdateCount: updateCount,
        refreshConnectorUpdateCount,
    }
}
