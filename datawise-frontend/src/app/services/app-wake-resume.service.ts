import {probeBackendHealth} from '@/features/layout/services/backend-health.service'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {
    persistAuthSession,
    refreshSessionToken,
} from '@/features/auth/services/auth-session-persist.service'
import {
    WAKE_AWAY_MS,
    clearWakeReloadCount as clearWakeReloadCountPure,
    resumeAfterLongAwayPure,
    type WakeResumeResult,
} from '@/app/services/app-wake-resume.pure'

export {WAKE_AWAY_MS, type WakeResumeResult}

function sessionStorageOrMemory(): {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
    removeItem(key: string): void
} {
    try {
        if (typeof sessionStorage !== 'undefined') return sessionStorage
    } catch {
        /* ignore */
    }
    const map = new Map<string, string>()
    return {
        getItem: (key) => map.get(key) ?? null,
        setItem: (key, value) => {
            map.set(key, value)
        },
        removeItem: (key) => {
            map.delete(key)
        },
    }
}

const storage = sessionStorageOrMemory()

export function clearWakeReloadCount(): void {
    clearWakeReloadCountPure(storage)
}

async function defaultRefreshSession(): Promise<void> {
    const auth = useAuthStore()
    if (auth.isGuest) return
    try {
        const session = await refreshSessionToken()
        if (!session) return
        persistAuthSession(session)
        auth.applySessionInfo(session)
    } catch {
        /* session overlay / guest recovery handles hard failures */
    }
}

async function defaultSyncExplorer(): Promise<{beforePooled: number; afterPooled: number}> {
    const explorer = useExplorerStore()
    const beforePooled = explorer.pooledConnectionIds.size
    await explorer.syncPooledConnectionState({notifyIdleDisconnect: true})
    const afterPooled = explorer.pooledConnectionIds.size
    if (afterPooled > 0) {
        await explorer.probeAllConnectionHealth()
    }
    return {beforePooled, afterPooled}
}

/**
 * 长时间离开/休眠后恢复：
 * 1) 立刻离开启动首屏（避免卡在 AppSplash）
 * 2) 探活后端；仍失败则自动 reload 一次
 * 3) 同步 JDBC 池回收，让工作台出现「重新连接」
 */
export async function resumeAfterLongAway(options: {
    awayMs: number
    isSplashVisible: () => boolean
    leaveSplash: () => void
    reload?: () => void
}): Promise<WakeResumeResult> {
    return resumeAfterLongAwayPure({
        awayMs: options.awayMs,
        isSplashVisible: options.isSplashVisible,
        leaveSplash: options.leaveSplash,
        reload: options.reload ?? (() => location.reload()),
        storage,
        probeBackend: () => probeBackendHealth({background: false}),
        syncExplorer: defaultSyncExplorer,
        refreshSession: defaultRefreshSession,
    })
}
