import {onMounted, onUnmounted} from 'vue'
import {useLocalFilesStore} from '@/features/local-files/stores/local-files-store'

/**
 * Refresh lightweight git status when the window regains focus,
 * so external commits/edits show up without a manual tree refresh.
 */
export function useLocalFilesGitStatusWatch() {
    const localFiles = useLocalFilesStore()

    function onFocus() {
        if (!localFiles.rootPath) return
        localFiles.scheduleGitStatusRefresh()
    }

    function onVisibility() {
        if (document.visibilityState !== 'visible') return
        onFocus()
    }

    onMounted(() => {
        window.addEventListener('focus', onFocus)
        document.addEventListener('visibilitychange', onVisibility)
    })

    onUnmounted(() => {
        window.removeEventListener('focus', onFocus)
        document.removeEventListener('visibilitychange', onVisibility)
    })
}
