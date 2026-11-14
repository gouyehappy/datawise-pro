import {computed, nextTick, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {
    bootstrapApp,
    bootstrapProgress,
    forceBootstrapStartupComplete,
} from '@/app/services/bootstrap-app.service'
import {notifyDesktopBootReadyAfterPaint} from '@/features/layout/services/desktop-app-mounted.service'
import {scheduleWorkbenchWarmup} from '@/app/services/workbench-warmup.service'
import {useAppWakeResume} from '@/app/composables/useAppWakeResume'
import {currentLocale} from '@/i18n'
import {isDesktopApp} from '@/features/layout/services/desktop-chrome'
import {desktopStartupProgress} from '@/features/layout/services/desktop-backend-startup.service'
import {markStartupPhase} from '@/app/services/startup-timing.service'

/** After JVM wait (~120s) + sync budget; must still force shell if a step hangs. */
const BOOTSTRAP_TIMEOUT_DESKTOP_MS = 135_000
const BOOTSTRAP_TIMEOUT_WEB_MS = 45_000
/** Prefer leaving the sync skeleton quickly when config APIs stall. */
const BOOTSTRAP_SOFT_TIMEOUT_DESKTOP_MS = 28_000

function waitNextPaint(): Promise<void> {
    return new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
}

/**
 * 启动编排（两条路径，无中间阶段）：
 *
 * · 桌面 JCEF — Shell 骨架 → bootstrap 完成 → 主界面
 * · Web — AppSplash → bootstrap 完成 → Shell
 */
export function useAppBoot() {
    const {locale} = useI18n()

    const desktopApp = computed(() => isDesktopApp())
    const webBootReady = ref(false)

    /** 桌面 bootstrap 未完成 */
    const desktopBooting = computed(
        () => desktopApp.value && !bootstrapProgress.startupComplete,
    )
    /** JCEF：Shell 内骨架 */
    const shellBooting = computed(() => desktopBooting.value)

    let desktopFinishPromise: Promise<void> | null = null

    function finishWebBoot() {
        webBootReady.value = true
        scheduleWorkbenchWarmup()
        markStartupPhase('shell-ready')
    }

    async function finishDesktopBoot() {
        if (desktopFinishPromise) return desktopFinishPromise

        desktopFinishPromise = (async () => {
            scheduleWorkbenchWarmup()
            notifyDesktopBootReadyAfterPaint()

            await nextTick()
            await waitNextPaint()
            markStartupPhase('shell-ready')
        })()

        return desktopFinishPromise
    }

    useAppWakeResume({
        isSplashVisible: () => (desktopApp.value ? desktopBooting.value : !webBootReady.value),
        leaveSplash: () => {
            if (!desktopApp.value) finishWebBoot()
        },
    })

    watch(
        [currentLocale, locale],
        () => {
            document.documentElement.lang = currentLocale.value
        },
        {immediate: true},
    )

    onMounted(() => {
        const timeoutMs = desktopApp.value ? BOOTSTRAP_TIMEOUT_DESKTOP_MS : BOOTSTRAP_TIMEOUT_WEB_MS
        const softTimeout = desktopApp.value
            ? window.setTimeout(() => {
                // Only bail out of hung session/prefs sync — never interrupt JVM warm-up.
                const phase = desktopStartupProgress.phase
                if (
                    !bootstrapProgress.startupComplete
                    && (phase === 'session' || phase === 'sync' || phase === 'ready')
                ) {
                    forceBootstrapStartupComplete('desktop-sync-soft-timeout')
                    void finishDesktopBoot()
                }
            }, BOOTSTRAP_SOFT_TIMEOUT_DESKTOP_MS)
            : 0
        const timeout = window.setTimeout(() => {
            forceBootstrapStartupComplete(desktopApp.value ? 'desktop-hard-timeout' : 'web-timeout')
            if (desktopApp.value) {
                void finishDesktopBoot()
                return
            }
            finishWebBoot()
        }, timeoutMs)

        void bootstrapApp().finally(() => {
            window.clearTimeout(timeout)
            if (softTimeout) window.clearTimeout(softTimeout)
            if (desktopApp.value) {
                void finishDesktopBoot()
                return
            }
            finishWebBoot()
        })
    })

    return {
        desktopApp,
        webBootReady,
        shellBooting,
    }
}
