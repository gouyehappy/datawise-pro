import {onMounted, onUnmounted} from 'vue'
import {applyDeepLinkOpen} from '@/features/layout/services/deep-link-open.service'
import {isDesktopApp} from '@/features/layout/services/desktop-chrome'

export function useDeepLinkListener() {
    let unsubscribe: (() => void) | undefined

    onMounted(() => {
        if (!isDesktopApp()) return

        const api = window.datawise?.deepLink
        if (!api) return

        void api.flushPending?.().then((payload) => {
            if (payload) void applyDeepLinkOpen(payload)
        })

        if (api.onOpen) {
            unsubscribe = api.onOpen((payload) => {
                void applyDeepLinkOpen(payload)
            })
        }
    })

    onUnmounted(() => {
        unsubscribe?.()
    })
}
