import {onBeforeUnmount, ref, watch, type Ref} from 'vue'

/**
 * Ephemeral panel notice: show while `active` is true, auto-hide after `ttlMs`,
 * and support manual dismiss. When `resetKey` changes while still active, show again.
 */
export function useEphemeralNotice(
    active: Ref<boolean>,
    options: {
        ttlMs?: number
        /** When this value changes and active stays true, re-show the notice. */
        resetKey?: Ref<string | number | boolean | null | undefined>
        /** Persist dismiss for the browser session (e.g. python simulated). */
        sessionKey?: string
    } = {},
) {
    const ttlMs = options.ttlMs ?? 6000
    const visible = ref(false)
    let timer: ReturnType<typeof setTimeout> | null = null

    function clearTimer() {
        if (timer != null) {
            clearTimeout(timer)
            timer = null
        }
    }

    function isSessionDismissed(): boolean {
        if (!options.sessionKey || typeof sessionStorage === 'undefined') return false
        try {
            return sessionStorage.getItem(options.sessionKey) === '1'
        } catch {
            return false
        }
    }

    function markSessionDismissed() {
        if (!options.sessionKey || typeof sessionStorage === 'undefined') return
        try {
            sessionStorage.setItem(options.sessionKey, '1')
        } catch {
            // ignore quota / private mode
        }
    }

    function hide() {
        clearTimer()
        visible.value = false
    }

    function dismiss() {
        markSessionDismissed()
        hide()
    }

    function show() {
        if (!active.value || isSessionDismissed()) {
            hide()
            return
        }
        visible.value = true
        clearTimer()
        timer = setTimeout(() => {
            visible.value = false
            timer = null
            // Auto-hide also counts as “seen” for session-scoped notices
            markSessionDismissed()
        }, ttlMs)
    }

    watch(
        active,
        (on) => {
            if (on) show()
            else hide()
        },
        {immediate: true},
    )

    if (options.resetKey) {
        watch(options.resetKey, () => {
            if (active.value && !options.sessionKey) show()
        })
    }

    onBeforeUnmount(clearTimer)

    return {visible, dismiss, show, hide}
}
