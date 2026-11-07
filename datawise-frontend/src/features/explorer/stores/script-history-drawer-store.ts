import {defineStore} from 'pinia'
import {ref} from 'vue'

export interface ScriptHistoryTarget {
    connectionId: string
    instanceName: string
    fileName: string
    connectionLabel?: string
}

export const useScriptHistoryDrawerStore = defineStore('script-history-drawer', () => {
    const open = ref(false)
    const target = ref<ScriptHistoryTarget | null>(null)

    function openDrawer(next: ScriptHistoryTarget) {
        target.value = {...next}
        open.value = true
    }

    function closeDrawer() {
        open.value = false
        target.value = null
    }

    return {
        open,
        target,
        openDrawer,
        closeDrawer,
    }
})
