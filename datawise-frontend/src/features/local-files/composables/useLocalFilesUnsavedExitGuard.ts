import {onMounted, onUnmounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useConfirmDialog} from '@/core/composables/useConfirmDialog'
import {listDirtyLocalWorkspaceTabs} from '@/features/local-files/services/local-files-workspace-tabs'
import {
    confirmLocalFilesExitIfNeeded,
    registerLocalFilesExitAsk,
} from '@/features/local-files/services/local-files-exit-guard'

/**
 * Guard desktop close / page unload when local file tabs are dirty.
 * Title-bar close uses a confirm dialog; browser reload uses beforeunload.
 */
export function useLocalFilesUnsavedExitGuard() {
    const {t} = useI18n()
    const exitConfirm = useConfirmDialog('danger')
    const guarding = ref(false)

    function hasDirtyLocalTabs(): boolean {
        return listDirtyLocalWorkspaceTabs().length > 0
    }

    function onBeforeUnload(event: BeforeUnloadEvent) {
        if (!hasDirtyLocalTabs()) return
        event.preventDefault()
        event.returnValue = ''
    }

    async function confirmCloseIfNeeded(): Promise<boolean> {
        const dirty = listDirtyLocalWorkspaceTabs()
        if (!dirty.length) return true
        if (guarding.value) return false
        guarding.value = true
        try {
            return await exitConfirm.ask({
                title: t('explorer.localFiles.unsavedExitTitle'),
                message: t('explorer.localFiles.unsavedExitMessage', {count: dirty.length}),
                confirmLabel: t('explorer.localFiles.unsavedExitConfirm'),
                confirmVariant: 'danger',
            })
        } finally {
            guarding.value = false
        }
    }

    onMounted(() => {
        registerLocalFilesExitAsk(confirmCloseIfNeeded)
        window.addEventListener('beforeunload', onBeforeUnload)
    })

    onUnmounted(() => {
        registerLocalFilesExitAsk(null)
        window.removeEventListener('beforeunload', onBeforeUnload)
    })

    return {
        /** @deprecated prefer flattened open/title/… bindings */
        exitConfirm,
        open: exitConfirm.open,
        title: exitConfirm.title,
        message: exitConfirm.message,
        confirmLabel: exitConfirm.confirmLabel,
        confirmVariant: exitConfirm.confirmVariant,
        onOpenUpdate: exitConfirm.onOpenUpdate,
        onConfirm: exitConfirm.onConfirm,
        confirmCloseIfNeeded,
        confirmLocalFilesExitIfNeeded,
    }
}
