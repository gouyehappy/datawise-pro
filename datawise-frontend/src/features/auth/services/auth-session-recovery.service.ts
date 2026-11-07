import {authApi} from '@/api'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {persistAuthSession} from '@/features/auth/services/auth-session-persist.service'
import {isUnauthorizedApiError} from '@/shared/api/http/api-error'
import {
    registerUnauthorizedRecoveryHandler,
    setUnauthorizedRecoveryInProgress,
    unblockApiSession,
} from '@/shared/api/http/session-guard'

let recoveryPromise: Promise<void> | null = null

export type SessionProbeResult = 'valid' | 'unauthorized' | 'unknown'

/**
 * Re-check the active session before wiping a logged-in user.
 * Business endpoints may return UNAUTHORIZED for non-auth reasons; only
 * `/api/auth/session` failing with UNAUTHORIZED means the login is actually gone.
 */
export async function probeActiveSession(): Promise<SessionProbeResult> {
    try {
        const session = await authApi.getCurrentSession({silent: true, authBypass: true})
        if (!session?.sessionId) return 'unauthorized'
        const auth = useAuthStore()
        persistAuthSession(session)
        auth.applySessionInfo(session)
        return 'valid'
    } catch (error) {
        if (isUnauthorizedApiError(error)) return 'unauthorized'
        return 'unknown'
    }
}

/** @internal test helper — decide whether to clear login after a probe. */
export function shouldClearLoginAfterSessionProbe(
    isGuest: boolean,
    probe: SessionProbeResult,
): boolean {
    if (isGuest) return true
    return probe === 'unauthorized'
}

async function runUnauthorizedRecovery(): Promise<void> {
    const auth = useAuthStore()
    setUnauthorizedRecoveryInProgress(true)
    try {
        if (!auth.isGuest) {
            const probe = await probeActiveSession()
            if (!shouldClearLoginAfterSessionProbe(false, probe)) {
                if (import.meta.env.DEV) {
                    console.warn(
                        '[auth] ignored UNAUTHORIZED recovery: session probe=',
                        probe,
                        '(business 401 or transient error; login kept)',
                    )
                }
                return
            }
            if (import.meta.env.DEV) {
                console.warn(
                    '[auth] confirmed session dead via /api/auth/session — opening login',
                )
            }
        }
        await auth.handleUnauthorizedAccess()
    } finally {
        unblockApiSession()
        setUnauthorizedRecoveryInProgress(false)
    }
}

/** 等待进行中的 401 恢复（游客登录 / 登录框）；无则立刻返回 */
export function awaitUnauthorizedRecovery(): Promise<void> {
    return recoveryPromise ?? Promise.resolve()
}

export function installUnauthorizedSessionRecovery(): void {
    registerUnauthorizedRecoveryHandler(() => {
        if (!recoveryPromise) {
            recoveryPromise = runUnauthorizedRecovery().finally(() => {
                recoveryPromise = null
            })
        }
        void recoveryPromise
    })
}
