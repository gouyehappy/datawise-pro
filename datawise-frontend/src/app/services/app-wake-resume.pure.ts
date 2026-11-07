export const WAKE_AWAY_MS = 45_000
export const WAKE_RELOAD_KEY = 'dw-wake-auto-reload'
export const BACKEND_RETRY = 3
export const BACKEND_RETRY_GAP_MS = 900

export type WakeResumeResult = {
    awayMs: number
    backendOnline: boolean
    reloaded: boolean
    leftSplash: boolean
    evictedConnections: number
}

export type WakeResumeStorage = {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
    removeItem(key: string): void
}

function delay(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export function readWakeReloadCount(storage: WakeResumeStorage): number {
    try {
        const n = Number(storage.getItem(WAKE_RELOAD_KEY) ?? '0')
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
    } catch {
        return 0
    }
}

export function bumpWakeReloadCount(storage: WakeResumeStorage): number {
    const next = readWakeReloadCount(storage) + 1
    try {
        storage.setItem(WAKE_RELOAD_KEY, String(next))
    } catch {
        /* ignore */
    }
    return next
}

export function clearWakeReloadCount(storage: WakeResumeStorage): void {
    try {
        storage.removeItem(WAKE_RELOAD_KEY)
    } catch {
        /* ignore */
    }
}

async function ensureBackendOnline(
    probe: () => Promise<boolean>,
    retryGapMs = BACKEND_RETRY_GAP_MS,
): Promise<boolean> {
    for (let i = 0; i < BACKEND_RETRY; i++) {
        if (await probe()) return true
        if (i < BACKEND_RETRY - 1) await delay(retryGapMs)
    }
    return false
}

/** Pure wake/resume orchestration (no Pinia / Monaco imports). */
export async function resumeAfterLongAwayPure(options: {
    awayMs: number
    isSplashVisible: () => boolean
    leaveSplash: () => void
    reload?: () => void
    storage: WakeResumeStorage
    probeBackend: () => Promise<boolean>
    syncExplorer: () => Promise<{beforePooled: number; afterPooled: number}>
    refreshSession?: () => Promise<void>
    retryGapMs?: number
}): Promise<WakeResumeResult> {
    const result: WakeResumeResult = {
        awayMs: options.awayMs,
        backendOnline: false,
        reloaded: false,
        leftSplash: false,
        evictedConnections: 0,
    }

    if (options.awayMs < WAKE_AWAY_MS) {
        return result
    }

    if (options.isSplashVisible()) {
        options.leaveSplash()
        result.leftSplash = true
    }

    result.backendOnline = await ensureBackendOnline(
        options.probeBackend,
        options.retryGapMs ?? BACKEND_RETRY_GAP_MS,
    )

    if (!result.backendOnline) {
        if (readWakeReloadCount(options.storage) < 1) {
            bumpWakeReloadCount(options.storage)
            result.reloaded = true
            ;(options.reload ?? (() => undefined))()
            return result
        }
        return result
    }

    clearWakeReloadCount(options.storage)
    if (options.refreshSession) {
        await options.refreshSession()
    }
    const synced = await options.syncExplorer()
    result.evictedConnections = Math.max(0, synced.beforePooled - synced.afterPooled)
    return result
}
