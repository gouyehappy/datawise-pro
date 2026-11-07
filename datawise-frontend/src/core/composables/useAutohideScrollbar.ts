/**
 * @deprecated 请用 `DwOverlayScroll` / `useOverlayScrollbar`。
 * 保留最小实现，避免旧引用崩溃。
 */
import {onBeforeUnmount, ref} from 'vue'
import {OVERLAY_SB_HIDE_MS} from './overlay-scrollbar-metrics'

export function useAutohideScrollbar(hideAfterMs = OVERLAY_SB_HIDE_MS) {
    const scrolling = ref(false)
    let timer: ReturnType<typeof setTimeout> | null = null

    function onScroll() {
        scrolling.value = true
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
            scrolling.value = false
            timer = null
        }, hideAfterMs)
    }

    onBeforeUnmount(() => {
        if (timer) clearTimeout(timer)
    })

    return {scrolling, onScroll}
}
