import {ref} from 'vue'
import {usePageLocalEventListener} from '@/core/composables/usePageLocalEventListener'

/** SQL 编辑器全屏：隐藏结果区，Esc 退出（仅本 Tab 有效） */
export function useEditorFullscreen() {
    const isFullscreen = ref(false)

    function toggle() {
        isFullscreen.value = !isFullscreen.value
    }

    function exit() {
        isFullscreen.value = false
    }

    function onKeydown(e: Event) {
        const event = e as KeyboardEvent
        if (event.key !== 'Escape' || !isFullscreen.value) return
        event.preventDefault()
        exit()
    }

    usePageLocalEventListener(window, 'keydown', onKeydown)

    return {isFullscreen, toggle, exit}
}
