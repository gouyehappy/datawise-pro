import {onMounted, onUnmounted, watch} from 'vue'
import {probeBackendHealth} from '@/features/layout/services/backend-health.service'
import {desktopStartupProgress} from '@/features/layout/services/desktop-backend-startup.service'
import {isDesktopApp} from '@/features/layout/services/desktop-chrome'

const PROBE_INTERVAL_MS = 5_000

/** 定时探测内嵌/远程后端 health，驱动状态栏连接指示 */
export function useBackendHealthMonitor() {
    const desktopApp = isDesktopApp()
    let timer: ReturnType<typeof setInterval> | null = null

    function shouldProbe() {
        if (document.visibilityState !== 'visible') return false
        if (desktopApp && !desktopStartupProgress.complete) return false
        return true
    }

    async function probe(background = false) {
        if (!shouldProbe()) return
        await probeBackendHealth({background})
    }

    function startTimer() {
        if (timer) clearInterval(timer)
        timer = setInterval(() => {
            void probe(true)
        }, PROBE_INTERVAL_MS)
    }

    function onVisibilityChange() {
        if (document.visibilityState === 'visible') {
            void probe(true)
        }
    }

    onMounted(() => {
        void probe(false)
        startTimer()
        document.addEventListener('visibilitychange', onVisibilityChange)

        if (desktopApp) {
            watch(
                () => desktopStartupProgress.complete,
                (complete) => {
                    if (complete) void probe(true)
                },
            )
        }
    })

    onUnmounted(() => {
        if (timer) clearInterval(timer)
        document.removeEventListener('visibilitychange', onVisibilityChange)
    })
}
