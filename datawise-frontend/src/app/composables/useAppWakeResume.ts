import {onMounted, onUnmounted} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {
    WAKE_AWAY_MS,
    clearWakeReloadCount,
    resumeAfterLongAway,
} from '@/app/services/app-wake-resume.service'

/**
 * 休眠/长时间切走后的唤醒：保证能离开首屏并恢复到可操作状态。
 * 空闲断连保留；唤醒失败时最多自动 reload 一次。
 */
export function useAppWakeResume(options: {
    isSplashVisible: () => boolean
    leaveSplash: () => void
}) {
    const {t} = useI18n()
    const toast = useAppToast()
    let hiddenSinceMs: number | null = null
    let running = false

    async function runWake(awayMs: number) {
        if (running || awayMs < WAKE_AWAY_MS) return
        running = true
        try {
            const result = await resumeAfterLongAway({
                awayMs,
                isSplashVisible: options.isSplashVisible,
                leaveSplash: options.leaveSplash,
            })
            if (result.reloaded) return
            if (!result.backendOnline) {
                toast.warning(t('app.wake.backendOffline'))
                return
            }
            if (result.evictedConnections > 0 || result.leftSplash) {
                toast.show(t('app.wake.resumed'), {variant: 'info'})
            }
        } finally {
            running = false
        }
    }

    function onVisibilityChange() {
        if (document.visibilityState === 'hidden') {
            hiddenSinceMs = Date.now()
            return
        }
        const awayMs = hiddenSinceMs == null ? 0 : Date.now() - hiddenSinceMs
        hiddenSinceMs = null
        void runWake(awayMs)
    }

    function onPageShow(event: PageTransitionEvent) {
        if (event.persisted) {
            void runWake(WAKE_AWAY_MS)
        }
    }

    onMounted(() => {
        clearWakeReloadCount()
        document.addEventListener('visibilitychange', onVisibilityChange)
        window.addEventListener('pageshow', onPageShow)
    })

    onUnmounted(() => {
        document.removeEventListener('visibilitychange', onVisibilityChange)
        window.removeEventListener('pageshow', onPageShow)
    })
}
