import {onUnmounted, watch, type Ref} from 'vue'
import {usePageLocalActive} from './usePageLocalActive'

type ListenerTarget = Window | Document | HTMLElement

/**
 * Window/document event listener that is bound only while this page is active.
 * Survives KeepAlive correctly: unbinds on deactivate, rebinds on activate.
 *
 * Global shortcuts: useAppShortcutListener (AppShell).
 * Page-local shortcuts: usePageLocalShortcuts (auto unbind on leave / module hide / KeepAlive deactivate).
 */
export function usePageLocalEventListener(
    target: ListenerTarget | (() => ListenerTarget | null | undefined),
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
    pageActive?: Ref<boolean>,
): Ref<boolean> {
    const active = pageActive ?? usePageLocalActive()
    let bound = false

    function resolveTarget(): ListenerTarget | null {
        const value = typeof target === 'function' ? target() : target
        return value ?? null
    }

    function bind() {
        if (bound) return
        const el = resolveTarget()
        if (!el) return
        el.addEventListener(type, handler, options)
        bound = true
    }

    function unbind() {
        if (!bound) return
        const el = resolveTarget()
        el?.removeEventListener(type, handler, options)
        bound = false
    }

    watch(
        active,
        (isActive) => {
            if (isActive) bind()
            else unbind()
        },
        {immediate: true},
    )

    onUnmounted(unbind)

    return active
}
