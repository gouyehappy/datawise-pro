import {onMounted, onUnmounted, ref} from 'vue'
import {HINT_INLINE_SHORTCUT_IDS} from '@sql-editor/editor/shortcut-config'
import type {HintShortcutItem} from '@sql-editor/types'

const SHOW_DELAY_MS = 100
const HIDE_DELAY_MS = 160

export function useHintShortcutsPopover(shortcutItems: () => readonly HintShortcutItem[]) {
    const shortcutsVisible = ref(false)
    const shortcutsRootRef = ref<HTMLElement | null>(null)
    const panelPos = ref({top: 0, left: 0, placement: 'below' as 'below' | 'above'})

    const inlineShortcuts = () => {
        const byId = new Map(shortcutItems().map((item) => [item.id, item]))
        return HINT_INLINE_SHORTCUT_IDS.map((id) => byId.get(id)).filter(Boolean) as HintShortcutItem[]
    }

    const restShortcuts = () => {
        const inlineIds = new Set<string>(HINT_INLINE_SHORTCUT_IDS)
        return shortcutItems().filter((item) => !inlineIds.has(item.id))
    }

    const restShortcutCount = () => restShortcuts().length

    let showTimer: ReturnType<typeof setTimeout> | null = null
    let hideTimer: ReturnType<typeof setTimeout> | null = null

    function clearTimers() {
        if (showTimer) {
            clearTimeout(showTimer)
            showTimer = null
        }
        if (hideTimer) {
            clearTimeout(hideTimer)
            hideTimer = null
        }
    }

    function placePanel() {
        const root = shortcutsRootRef.value
        if (!root) return
        const rect = root.getBoundingClientRect()
        const spaceBelow = window.innerHeight - rect.bottom
        const spaceAbove = rect.top
        const placement = spaceBelow >= 180 || spaceBelow >= spaceAbove ? 'below' : 'above'

        panelPos.value = {
            top: placement === 'below' ? rect.bottom + 6 : rect.top - 6,
            left: rect.right,
            placement,
        }
    }

    function openShortcuts() {
        if (restShortcutCount() === 0) return
        clearTimers()
        showTimer = setTimeout(() => {
            placePanel()
            shortcutsVisible.value = true
        }, SHOW_DELAY_MS)
    }

    function scheduleClose() {
        clearTimers()
        hideTimer = setTimeout(() => {
            shortcutsVisible.value = false
        }, HIDE_DELAY_MS)
    }

    function keepShortcutsOpen() {
        clearTimers()
    }

    function onWindowChange() {
        if (!shortcutsVisible.value) return
        placePanel()
    }

    onMounted(() => {
        window.addEventListener('resize', onWindowChange)
        window.addEventListener('scroll', onWindowChange, true)
    })

    onUnmounted(() => {
        clearTimers()
        window.removeEventListener('resize', onWindowChange)
        window.removeEventListener('scroll', onWindowChange, true)
    })

    return {
        shortcutsVisible,
        shortcutsRootRef,
        panelPos,
        inlineShortcuts,
        restShortcuts,
        restShortcutCount,
        openShortcuts,
        scheduleClose,
        keepShortcutsOpen,
    }
}
