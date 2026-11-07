import {onMounted, onUnmounted} from 'vue'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {
    persistAuthSession,
    refreshSessionToken,
} from '@/features/auth/services/auth-session-persist.service'

const KEEPALIVE_MS = 5 * 60 * 1000

/** 使用系统期间定期校验并滑动续期登录 token */
export function useSessionKeepalive() {
    const auth = useAuthStore()
    let timer: ReturnType<typeof setInterval> | null = null

    async function touchSession() {
        if (auth.isGuest) return
        const session = await refreshSessionToken()
        if (!session) return
        persistAuthSession(session)
        auth.applySessionInfo(session)
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
