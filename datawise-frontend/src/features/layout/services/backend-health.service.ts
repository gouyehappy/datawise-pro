import {reactive, readonly} from 'vue'
import {settingsApi, type HealthStatus} from '@/api'

export type BackendHealthStatus = 'idle' | 'connecting' | 'online' | 'offline'

const BACKGROUND_OFFLINE_THRESHOLD = 2
const CONNECTING_OFFLINE_THRESHOLD = 3

const state = reactive({
    status: 'idle' as BackendHealthStatus,
    endpoint: settingsApi.resolveBackendEndpointLabel(),
    latencyMs: null as number | null,
    serverVersion: null as string | null,
})

let consecutiveBackgroundFailures = 0
let consecutiveConnectingFailures = 0

export const backendHealth = readonly(state)

export function applyBackendHealthResult(result: HealthStatus | null, endpoint: string): void {
    state.endpoint = endpoint
    if (!result) {
        noteProbeFailure(false)
        return
    }
    state.latencyMs = result.latencyMs
    state.serverVersion = result.serverVersion ?? null
    if (result.ok) {
        consecutiveBackgroundFailures = 0
        consecutiveConnectingFailures = 0
        state.status = 'online'
        return
    }
    noteProbeFailure(false)
}

/** API 暂不可达时进入「连接中」，避免直接显示错误态 */
export function markBackendOffline(): void {
    consecutiveBackgroundFailures = 0
    consecutiveConnectingFailures = 0
    state.status = 'connecting'
    state.latencyMs = null
}

function noteProbeFailure(background: boolean): boolean {
    if (state.status === 'online' && background) {
        consecutiveBackgroundFailures += 1
        if (consecutiveBackgroundFailures < BACKGROUND_OFFLINE_THRESHOLD) {
            return false
        }
    }

    consecutiveBackgroundFailures = 0
    state.latencyMs = null
    state.serverVersion = null

    if (state.status === 'online') {
        state.status = 'connecting'
        consecutiveConnectingFailures = 1
        return false
    }

    if (state.status === 'idle' || state.status === 'connecting') {
        consecutiveConnectingFailures += 1
        state.status =
            consecutiveConnectingFailures >= CONNECTING_OFFLINE_THRESHOLD ? 'offline' : 'connecting'
        return false
    }

    state.status = 'offline'
    return false
}

export async function probeBackendHealth(options?: { background?: boolean }): Promise<boolean> {
    const background = options?.background ?? false
    state.endpoint = settingsApi.resolveBackendEndpointLabel()
    const snapshot = await settingsApi.pingHealth()

    if (snapshot.result?.ok) {
        consecutiveBackgroundFailures = 0
        consecutiveConnectingFailures = 0
        applyBackendHealthResult(snapshot.result, snapshot.endpoint)
        return true
    }

    noteProbeFailure(background)
    return false
}
