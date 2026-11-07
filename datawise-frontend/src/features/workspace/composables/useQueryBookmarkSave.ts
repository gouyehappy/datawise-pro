import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {platformApi} from '@/api'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useShortcutPanelStore} from '@/features/layout/stores/shortcut-panel-store'
import {useTeamStore} from '@/features/team/stores/team-store'

export type BookmarkDefaults = {
    name: string
    connectionName: string
    sql: string
}

export function useQueryBookmarkSave(resolveDefaults: () => BookmarkDefaults) {
    const {t} = useI18n()
    const layout = useLayoutStore()
    const shortcutPanel = useShortcutPanelStore()
    const teamStore = useTeamStore()

    const bookmarkDialogOpen = ref(false)
    const bookmarkSaving = ref(false)
    const bookmarkDefaults = ref<BookmarkDefaults>({
        name: '',
        connectionName: '',
        sql: '',
    })

    function openSaveBookmarkDialog() {
        bookmarkDefaults.value = resolveDefaults()
        bookmarkDialogOpen.value = true
    }

    async function onSaveBookmark(payload: {
        name: string
        connectionName: string
        sql: string
        folder: string
        tags: string[]
        saveToQueryLibrary?: boolean
        changeNote?: string
        queryId?: string
    }) {
        bookmarkSaving.value = true
        try {
            const savedId = await shortcutPanel.saveConsole(payload)
            if (payload.saveToQueryLibrary && teamStore.activeTeamId) {
                await platformApi.saveQueryLibraryVersion({
                    teamId: teamStore.activeTeamId,
                    queryId: payload.queryId || savedId,
                    title: payload.name,
                    sql: payload.sql,
                    changeNote: payload.changeNote || undefined,
                })
            }
            bookmarkDialogOpen.value = false
            layout.showSuccessToast(t('shortcut.bookmarks.saveSuccess'))
        } catch {
            layout.showErrorToast(t('shortcut.bookmarks.saveFailed'))
        } finally {
            bookmarkSaving.value = false
        }
    }

    return {
        bookmarkDialogOpen,
        bookmarkSaving,
        bookmarkDefaults,
        openSaveBookmarkDialog,
        onSaveBookmark,
    }
}
