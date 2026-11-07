import {ref} from 'vue'

export type ConfirmDialogRequest = {
    title: string
    message: string
    confirmLabel?: string
    confirmVariant?: 'primary' | 'danger'
}

/**
 * Promise-based confirm dialog state for irreversible / destructive actions.
 * Pair with `<ConfirmDialog>` using the returned refs and handlers.
 */
export function useConfirmDialog(defaultVariant: 'primary' | 'danger' = 'danger') {
    const open = ref(false)
    const title = ref('')
    const message = ref('')
    const confirmLabel = ref<string | undefined>()
    const confirmVariant = ref<'primary' | 'danger'>(defaultVariant)
    const confirmLoading = ref(false)
    let resolveAsk: ((confirmed: boolean) => void) | null = null

    function settle(confirmed: boolean) {
        open.value = false
        confirmLoading.value = false
        const resolve = resolveAsk
        resolveAsk = null
        resolve?.(confirmed)
    }

    function ask(request: ConfirmDialogRequest): Promise<boolean> {
        if (resolveAsk) {
            settle(false)
        }
        title.value = request.title
        message.value = request.message
        confirmLabel.value = request.confirmLabel
        confirmVariant.value = request.confirmVariant ?? defaultVariant
        confirmLoading.value = false
        open.value = true
        return new Promise((resolve) => {
            resolveAsk = resolve
        })
    }

    function onConfirm() {
        settle(true)
    }

    function onOpenUpdate(value: boolean) {
        if (!value) {
            settle(false)
            return
        }
        open.value = true
    }

    return {
        open,
        title,
        message,
        confirmLabel,
        confirmVariant,
        confirmLoading,
        ask,
        onConfirm,
        onOpenUpdate,
    }
}
