import {computed, onMounted, onUnmounted, ref, watch} from 'vue'
import {storeToRefs} from 'pinia'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {
    advanceMruHighlight,
    pruneMruTabIds,
    resolveMruSwitcherTabs,
    touchMruTabIds,
} from '@/features/workspace/services/mru-tab-switcher.service'
import {isEditableTarget, isTerminalTarget} from '@/core/shortcuts/shortcut.service'

/**
 * Ctrl/Cmd+Tab MRU tab switcher: hold modifier to preview, release to activate.
 */
export function useMruTabSwitcher() {
    const workspace = useWorkspaceStore()
    const {tabs, activeTabId} = storeToRefs(workspace)

    const mruIds = ref<string[]>([])
    const open = ref(false)
    const highlightIndex = ref(0)
    const holdModifier = ref<'ctrl' | 'meta' | null>(null)

    const switcherTabs = computed(() => resolveMruSwitcherTabs(mruIds.value, tabs.value))

    watch(
        activeTabId,
        (id) => {
            if (!id) return
            mruIds.value = touchMruTabIds(
                mruIds.value,
                id,
                tabs.value.map((tab) => tab.id),
            )
        },
        {immediate: true},
    )

    watch(
        tabs,
        (nextTabs) => {
            mruIds.value = pruneMruTabIds(
                mruIds.value,
                nextTabs.map((tab) => tab.id),
            )
        },
        {deep: false},
    )

    function commit() {
        if (!open.value) return
        const target = switcherTabs.value[highlightIndex.value]
        open.value = false
        holdModifier.value = null
        if (target) workspace.activateTab(target.id)
    }

    function cancel() {
        open.value = false
        holdModifier.value = null
    }

    function beginOrAdvance(direction: 1 | -1, modifier: 'ctrl' | 'meta') {
        const list = resolveMruSwitcherTabs(
            touchMruTabIds(
                mruIds.value,
                activeTabId.value ?? '',
                tabs.value.map((tab) => tab.id),
            ),
            tabs.value,
        )
        if (list.length < 2) return
        mruIds.value = list.map((tab) => tab.id)
        if (!open.value) {
            open.value = true
            holdModifier.value = modifier
            highlightIndex.value = direction === 1 ? 1 % list.length : list.length - 1
            return
        }
        highlightIndex.value = advanceMruHighlight(highlightIndex.value, list.length, direction)
    }

    function onKeydown(event: KeyboardEvent) {
        if (isTerminalTarget(event.target)) return
        if (isEditableTarget(event.target) && !(event.ctrlKey || event.metaKey)) return

        const key = event.key
        if (key === 'Escape' && open.value) {
            event.preventDefault()
            cancel()
            return
        }

        const isTab = key === 'Tab'
        if (!isTab || !(event.ctrlKey || event.metaKey)) return
        if (event.altKey) return

        event.preventDefault()
        event.stopPropagation()
        beginOrAdvance(event.shiftKey ? -1 : 1, event.metaKey ? 'meta' : 'ctrl')
    }

    function onKeyup(event: KeyboardEvent) {
        if (!open.value || !holdModifier.value) return
        if (holdModifier.value === 'ctrl' && event.key === 'Control') commit()
        if (holdModifier.value === 'meta' && event.key === 'Meta') commit()
    }

    function onBlur() {
        if (open.value) cancel()
    }

    onMounted(() => {
        window.addEventListener('keydown', onKeydown, true)
        window.addEventListener('keyup', onKeyup, true)
        window.addEventListener('blur', onBlur)
    })
    onUnmounted(() => {
        window.removeEventListener('keydown', onKeydown, true)
        window.removeEventListener('keyup', onKeyup, true)
        window.removeEventListener('blur', onBlur)
    })

    return {
        open,
        highlightIndex,
        switcherTabs,
    }
}
