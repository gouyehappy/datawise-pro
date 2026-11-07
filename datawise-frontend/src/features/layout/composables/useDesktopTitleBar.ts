import {onMounted, onUnmounted, ref} from 'vue'
import {desktopPlatform, isDesktopApp} from '@/features/layout/services/desktop-chrome'

/** JCEF frameless: one startDrag + endDrag; Java polls mouse (no per-move IPC). */
export function beginFramelessWindowDrag(event: PointerEvent) {
    const chrome = window.datawise?.chrome
    if (!chrome?.startDrag) return
    if (event.button !== 0) return
    // Do not preventDefault here — it can stall pointerup in CEF.

    void chrome.startDrag(event.screenX, event.screenY).then((started) => {
        if (started === false) return
        const onUp = () => {
            window.removeEventListener('pointerup', onUp)
            window.removeEventListener('pointercancel', onUp)
            void chrome.endDrag?.()
        }
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', onUp)
    })
}

export function useDesktopTitleBar() {
    const visible = ref(isDesktopApp())
    const maximized = ref(false)
    const isMac = ref(desktopPlatform() === 'darwin')

    let offMaximize: (() => void) | undefined
    let offState: (() => void) | undefined

    onMounted(() => {
        const chrome = window.datawise?.chrome
        const windowApi = window.datawise?.window
        if (!chrome) return

        void chrome.isMaximized().then((value) => {
            maximized.value = value
        })

        offMaximize = chrome.onMaximizeChange((value) => {
            maximized.value = value
        })

        offState = windowApi?.onStateChange((state) => {
            if (typeof state.maximized === 'boolean') {
                maximized.value = state.maximized
            }
        })
    })

    onUnmounted(() => {
        offMaximize?.()
        offState?.()
    })

    function minimize() {
        void window.datawise?.chrome?.minimize()
    }

    function toggleMaximize() {
        void window.datawise?.chrome?.toggleMaximize()
    }

    function close() {
        void window.datawise?.chrome?.close()
    }

    return {
        visible,
        maximized,
        isMac,
        minimize,
        toggleMaximize,
        close,
        beginFramelessWindowDrag,
    }
}
