import {onMounted, onUnmounted} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {
    persistAuthSession,
    refreshSessionToken,
} from '@/features/auth/services/auth-session-persist.service'
import {readSessionExpiresAt} from '@/shared/auth/session'
import {useAppToast} from '@/features/layout/composables/useAppToast'

const KEEPALIVE_MS = 5 * 60 * 1000
/** Warn once when remaining TTL drops below this window. */
const EXPIRY_WARN_WITHIN_MS = 10 * 60 * 1000

/** 使用系统期间定期校验并滑动续期登录 token */
export function useSessionKeepalive() {
    const auth = useAuthStore()
    const toast = useAppToast()
    const {t} = useI18n()
    let timer: ReturnType<typeof setInterval> | null = null
    let expiryWarned = false

    /**
     * Check local expiresAt independently of renew success.
     * With default 60m TTL + sliding renew at half, warn mainly fires when renew
     * is off/failing, TTL is short, or the user returns near expiry.
     */
    function maybeWarnExpiry() {
        if (auth.isGuest) return
        const expiresAt = readSessionExpiresAt()
        if (expiresAt == null) return
        const remaining = expiresAt - Date.now()
        if (remaining <= 0) return
        if (remaining < EXPIRY_WARN_WITHIN_MS) {
            if (!expiryWarned) {
                expiryWarned = true
                toast.warning(t('auth.sessionExpiringSoon'))
            }
            return
        }
        expiryWarned = false
    }

    async function touchSession() {
        if (auth.isGuest) return
        // Warn from local clock even if network renew fails.
        maybeWarnExpiry()
        const session = await refreshSessionToken()
        if (!session) return
        persistAuthSession(session)
        auth.applySessionInfo(session)
        maybeWarnExpiry()
    }

    function start() {
        stop()
        void touchSession()
        timer = setInterval(() => {
            if (document.visibilityState !== 'visible') return
            void touchSession()
        }, KEEPALIVE_MS)
    }

    function stop() {
        if (timer) {
            clearInterval(timer)
            timer = null
        }
    }

    function onVisibilityChange() {
        if (document.visibilityState === 'visible') {
            void touchSession()
        }
    }

    onMounted(() => {
        start()
        document.addEventListener('visibilitychange', onVisibilityChange)
    })

    onUnmounted(() => {
        document.removeEventListener('visibilitychange', onVisibilityChange)
        stop()
    })
}
