import {computed, ref, type Ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {usePageLocalShortcuts} from '@/core/composables/usePageLocalShortcuts'
import {useConfirmDialog} from '@/core/composables/useConfirmDialog'
import {formatBinding} from '@/core/shortcuts/shortcut.service'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useLocalFilesStore} from '@/features/local-files/stores/local-files-store'
import {pickAndOpenLocalWorkspaceFile} from '@/features/layout/services/desktop-file-open.service'
import {closeWorkspaceTabsForLocalPath} from '@/features/local-files/services/local-files-workspace-tabs'
import {localFileParentPath} from '@/features/local-files/services/local-files-path'

export type LocalTextEditorShortcutHandlers = {
    tabId: string
    save: () => void | Promise<void>
    filePath: Ref<string>
    fileName: Ref<string>
    dirty: Ref<boolean>
    /** True only while the Monaco editor widget has focus. */
    editorFocused: Ref<boolean>
}

/**
 * Document shortcuts for local text tabs — bound only while the editor has focus
 * (not while focus is on the toolbar, tree, or other panels).
 */
export function useLocalTextEditorShortcuts(handlers: LocalTextEditorShortcutHandlers) {
    const {t} = useI18n()
    const layout = useLayoutStore()
    const explorer = useExplorerStore()
    const workspace = useWorkspaceStore()
    const localFiles = useLocalFilesStore()
    const deleteConfirm = useConfirmDialog('danger')

    const unsavedCloseOpen = ref(false)
    let unsavedCloseResolver: ((action: 'save' | 'discard' | 'cancel') => void) | null = null

    const shortcutActive = computed(
        () => layout.isDatabaseModule && handlers.editorFocused.value,
    )

    function hint(label: string, binding: string): string {
        const formatted = formatBinding(binding)
        return formatted ? `${label} (${formatted})` : label
    }

    function promptUnsavedClose(): Promise<'save' | 'discard' | 'cancel'> {
        if (unsavedCloseResolver) {
            unsavedCloseResolver('cancel')
            unsavedCloseResolver = null
        }
        unsavedCloseOpen.value = true
        return new Promise((resolve) => {
            unsavedCloseResolver = resolve
        })
    }

    function resolveUnsavedClose(action: 'save' | 'discard' | 'cancel') {
        unsavedCloseOpen.value = false
        unsavedCloseResolver?.(action)
        unsavedCloseResolver = null
    }

    async function openFile() {
        await pickAndOpenLocalWorkspaceFile()
    }

    async function newFile() {
        if (explorer.panelMode !== 'files') {
            layout.showErrorToast(t('explorer.switchToFilesViewFirst'))
            return
        }
        if (!localFiles.rootPath) {
            layout.showErrorToast(t('explorer.localFiles.noRoot'))
            return
        }
        const parent =
            (handlers.filePath.value && localFileParentPath(handlers.filePath.value))
            || localFiles.rootPath
        await localFiles.beginCreate('create-file', parent, {
            fileName: t('explorer.localFiles.fileNameDefault'),
        })
    }

    async function closeFile() {
        const tab = workspace.tabs.find((item) => item.id === handlers.tabId)
        if (!tab?.closable) return

        if (handlers.dirty.value) {
            const action = await promptUnsavedClose()
            if (action === 'cancel') return
            if (action === 'save') {
                const ok = await workspace.saveDirtyTab(handlers.tabId)
                if (!ok) {
                    layout.showErrorToast(t('console.saveFailed'))
                    return
                }
            }
        }
        workspace.closeTab(handlers.tabId)
    }

    async function deleteFile() {
        const path = handlers.filePath.value
        if (!path) return
        const ok = await deleteConfirm.ask({
            title: t('explorer.localFiles.delete'),
            message: t('explorer.localFiles.deleteConfirm', {name: handlers.fileName.value}),
            confirmLabel: t('explorer.localFiles.delete'),
            confirmVariant: 'danger',
        })
        if (!ok) return
        try {
            await localFiles.remove(path, false)
            closeWorkspaceTabsForLocalPath(path, false)
            layout.showSuccessToast(t('explorer.localFiles.deleted', {name: handlers.fileName.value}))
        } catch {
            layout.showErrorToast(t('explorer.localFiles.deleteFailed'))
        }
    }

    usePageLocalShortcuts(`local-text:${handlers.tabId}`, {
        isActive: shortcutActive,
        keys: () => ({
            'Ctrl+S': () => {
                void handlers.save()
            },
            'Ctrl+O': () => {
                void openFile()
            },
            'Ctrl+N': () => {
                void newFile()
            },
            'Ctrl+W': () => {
                void closeFile()
            },
            'Ctrl+Shift+Backspace': () => {
                void deleteFile()
            },
        }),
    })

    return {
        deleteConfirm,
        unsavedCloseOpen,
        unsavedCloseTitle: computed(() => t('workspace.unsavedTitle')),
        unsavedCloseMessage: computed(() =>
            t('workspace.unsavedMessageSingle', {name: handlers.fileName.value}),
        ),
        resolveUnsavedClose,
        saveShortcutTitle: computed(() => hint(t('explorer.localFiles.save'), 'Ctrl+S')),
        openShortcutTitle: computed(() => hint(t('explorer.localFiles.openFile'), 'Ctrl+O')),
        newShortcutTitle: computed(() => hint(t('explorer.localFiles.newFile'), 'Ctrl+N')),
        closeShortcutTitle: computed(() => hint(t('explorer.localFiles.closeFile'), 'Ctrl+W')),
        deleteShortcutTitle: computed(() =>
            hint(t('explorer.localFiles.delete'), 'Ctrl+Shift+Backspace'),
        ),
        openFile,
        newFile,
        closeFile,
        deleteFile,
    }
}
