import {onActivated, onDeactivated, onMounted, ref, type Ref} from 'vue'

/**
 * Tracks whether the current component's page is the visible one.
 *
 * - KeepAlive: true while activated, false after deactivate (tab switch).
 * - Non-KeepAlive: true after mount until unmount.
 *
 * Use for page-local shortcuts / document listeners so cached tabs cannot
 * steal keys from other pages. App-level shortcuts (settings) stay global.
 */
export function usePageLocalActive(initial = true): Ref<boolean> {
    const pageActive = ref(initial)

    onMounted(() => {
        pageActive.value = true
    })
    onActivated(() => {
        pageActive.value = true
    })
    onDeactivated(() => {
        pageActive.value = false
    })

    return pageActive
}
