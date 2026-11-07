import {onMounted, onUnmounted} from 'vue'
import {
    applyDesktopFileOpen,
    isDroppableWorkspaceFileName,
    openDroppedBrowserFile,
} from '@/features/layout/services/desktop-file-open.service'
import {isDesktopApp} from '@/features/layout/services/desktop-chrome'
import {readDatawiseHost} from '@/features/layout/services/desktop-bridge'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {t} from '@/i18n'

function isOsFileDrag(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

/** Host-pushed opens + HTML5 drop of .sql/.csv/… into the window (works inside CEF). */
export function useDesktopFileOpenListener() {
    let unsubscribe: (() => void) | undefined

    function onDragOver(event: DragEvent) {
        if (!isOsFileDrag(event)) return
        event.preventDefault()
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'copy'
        }
    }

    function onDrop(event: DragEvent) {
        if (!isOsFileDrag(event)) return
        event.preventDefault()
        const files = Array.from(event.dataTransfer?.files ?? [])
        const accepted = files.filter((file) => isDroppableWorkspaceFileName(file.name))
        const packages = files.filter((file) => file.name.toLowerCase().endsWith('.dwp'))
        if (accepted.length === 0) {
            if (files.length > 0 && packages.length === 0) {
                useLayoutStore().showErrorToast(t('app.desktopHost.unsupportedFile'))
            }
            return
        }
        for (const file of accepted) {
            void openDroppedBrowserFile(file)
        }
    }

    onMounted(() => {
        window.addEventListener('dragover', onDragOver)
        window.addEventListener('drop', onDrop)

        if (!isDesktopApp()) return
        const fs = readDatawiseHost()?.fs
        if (!fs?.onOpen) return
        unsubscribe = fs.onOpen((payload) => {
            if (payload?.path) {
                void applyDesktopFileOpen(payload)
            }
        })
    })

    onUnmounted(() => {
        window.removeEventListener('dragover', onDragOver)
        window.removeEventListener('drop', onDrop)
        unsubscribe?.()
    })
}
