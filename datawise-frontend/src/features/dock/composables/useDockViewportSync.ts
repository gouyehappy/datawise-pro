import {onMounted, onUnmounted} from 'vue'
import {useDockPlacementStore} from '@/features/dock/stores/dock-placement-store'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'

const PERSIST_DEBOUNCE_MS = 400

/**
 * Keep dock float rects inside the window when the user resizes / restores the shell.
 * Maximized floats re-fill the viewport; others are clamped without changing placement side.
 * Viewport-driven clamps are debounced into layout persistence so a restore after shrink stays fixed.
 */
export function useDockViewportSync() {
    const dock = useDockPlacementStore()
    const appConfig = useAppConfigStore()
    let raf = 0
    let persistTimer: ReturnType<typeof setTimeout> | null = null

    function schedulePersist() {
        if (persistTimer) clearTimeout(persistTimer)
        persistTimer = setTimeout(() => {
            persistTimer = null
            appConfig.persistDockLayout()
        }, PERSIST_DEBOUNCE_MS)
    }

    function sync() {
        if (raf) cancelAnimationFrame(raf)
        raf = requestAnimationFrame(() => {
            raf = 0
            if (dock.syncFloatsToViewport()) schedulePersist()
        })
    }

    onMounted(() => {
        window.addEventListener('resize', sync)
        // First paint may report the restored size after layout load — sync once.
        sync()
    })

    onUnmounted(() => {
        window.removeEventListener('resize', sync)
        if (raf) cancelAnimationFrame(raf)
        raf = 0
        if (persistTimer) {
            clearTimeout(persistTimer)
            persistTimer = null
        }
    })
}
