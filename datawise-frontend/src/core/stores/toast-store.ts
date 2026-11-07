import {computed} from 'vue'
import {defineStore} from 'pinia'
import type {ToastVariant as ControllerVariant} from '@datawise/overlays'
import {getDwToastController} from '@/core/toast/dw-toast-singleton'

export type ToastVariant = 'info' | 'success' | 'warning' | 'error'

/** @deprecated 使用 info；保留以兼容旧调用 */
type LegacyToastVariant = 'default'

export type ToastAction = {
    label: string
    onClick: () => void
    /** Package-aligned alias of onClick */
    run?: () => void
}

export type ToastShowOptions = {
    durationMs?: number
    variant?: ToastVariant | LegacyToastVariant
    /** Optional one-shot action (e.g. Undo). Cleared when the toast dismisses. */
    action?: ToastAction
}

function normalizeVariant(variant: ToastVariant | LegacyToastVariant | undefined): ToastVariant {
    if (!variant || variant === 'default') return 'info'
    return variant
}

/**
 * Pinia facade over the shared `@datawise/overlays` toast controller.
 * Mutates the same singleton state that `app.provide(DW_TOAST, …)` injects.
 */
export const useToastStore = defineStore('toast', () => {
    const ctrl = getDwToastController()

    const message = computed(() => ctrl.message.value)
    const variant = computed(() => ctrl.variant.value as ToastVariant)
    /** Map package `run` ↔ host `onClick` for AppToast / callers. */
    const action = computed(() => {
        const a = ctrl.action.value
        if (!a) return null
        return {
            label: a.label,
            onClick: a.run,
            run: a.run,
        } satisfies ToastAction
    })

    function show(text: string, options?: ToastShowOptions | number) {
        if (typeof options === 'number') {
            ctrl.show(text, {durationMs: options})
            return
        }
        if (options) {
            const nextVariant = normalizeVariant(options.variant) as ControllerVariant
            ctrl.show(text, {
                durationMs: options.durationMs,
                variant: nextVariant,
                action: options.action
                    ? {label: options.action.label, onClick: options.action.onClick, run: options.action.run}
                    : undefined,
            })
            return
        }
        ctrl.show(text)
    }

    function runAction() {
        ctrl.runAction()
    }

    function showSuccess(text: string, durationMs = 2800) {
        ctrl.success(text, durationMs)
    }

    function showWarning(text: string, durationMs = 5000) {
        ctrl.warning(text, durationMs)
    }

    function showError(text: string, durationMs = 8000) {
        ctrl.error(text, durationMs)
    }

    function dismiss() {
        ctrl.dismiss()
    }

    /** @deprecated 使用 dismiss */
    function clear() {
        dismiss()
    }

    return {message, variant, action, show, showSuccess, showWarning, showError, runAction, dismiss, clear}
})
