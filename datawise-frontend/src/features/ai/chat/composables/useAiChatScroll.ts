import {nextTick, onBeforeUnmount, watch, type ComputedRef, type Ref} from 'vue'

const NEAR_BOTTOM_PX = 80

/** 消息列表滚动到底部（流式时节流；用户上翻时不抢滚动） */
export function useAiChatScroll(
    listRef: Ref<HTMLElement | undefined> | ComputedRef<HTMLElement | undefined>,
    activeSessionId: Ref<string | null>,
) {
    let pinnedToBottom = true
    let raf = 0
    let scrollListening: HTMLElement | null = null

    function isNearBottom(el: HTMLElement): boolean {
        return el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX
    }

    function onUserScroll() {
        const el = listRef.value
        if (!el) return
        pinnedToBottom = isNearBottom(el)
    }

    function bindScrollListener(el: HTMLElement | undefined) {
        if (scrollListening === el) return
        if (scrollListening) {
            scrollListening.removeEventListener('scroll', onUserScroll)
            scrollListening = null
        }
        if (!el) return
        scrollListening = el
        el.addEventListener('scroll', onUserScroll, {passive: true})
        pinnedToBottom = isNearBottom(el)
    }

    function flushScroll() {
        raf = 0
        const el = listRef.value
        if (!el) return
        bindScrollListener(el)
        if (!pinnedToBottom) return
        // Instant jump — smooth + per-token calls fight the user and leave the view truncated.
        el.scrollTop = el.scrollHeight
    }

    async function scrollToBottom(options?: {force?: boolean}) {
        await nextTick()
        const el = listRef.value
        if (!el) return
        bindScrollListener(el)
        if (options?.force) pinnedToBottom = true
        if (!pinnedToBottom && !options?.force) return
        if (raf) cancelAnimationFrame(raf)
        raf = requestAnimationFrame(flushScroll)
    }

    watch(activeSessionId, () => {
        pinnedToBottom = true
        void scrollToBottom({force: true})
    })

    watch(
        () => listRef.value,
        (el) => bindScrollListener(el),
        {immediate: true, flush: 'post'},
    )

    onBeforeUnmount(() => {
        if (raf) cancelAnimationFrame(raf)
        if (scrollListening) {
            scrollListening.removeEventListener('scroll', onUserScroll)
            scrollListening = null
        }
    })

    return {scrollToBottom}
}
