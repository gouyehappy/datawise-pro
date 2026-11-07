import {datasourcesApi} from '@/api/modules/datasources'

const DEFAULT_TIMEOUT_MS = 90_000
const POLL_MS = 200

function delay(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/**
 * Waits until deferred {@code config/plugins} scan finishes (READY or FAILED).
 * Safe no-op when the status endpoint is unavailable (older backends).
 */
export async function waitForConnectorPluginsReady(
    timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        try {
            const status = await datasourcesApi.pluginLoadStatus()
            // Null/empty payload means the endpoint is absent or stubbed — do not spin.
            if (status == null) {
                return false
            }
            if (status.ready) {
                return true
            }
        } catch {
            // Older backends or transient errors: do not block boot forever.
            return false
        }
        await delay(POLL_MS)
    }
    return false
}
