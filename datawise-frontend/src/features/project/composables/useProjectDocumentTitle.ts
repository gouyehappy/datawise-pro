import {watch} from 'vue'
import {useProjectStore} from '@/features/project/stores/project'

/** 窗口标题同步活动项目名：`DataWise — {项目}`。 */
export function useProjectDocumentTitle() {
    const projectStore = useProjectStore()
    watch(
        () => projectStore.displayName,
        (name) => {
            const trimmed = name?.trim()
            document.title = trimmed ? `DataWise — ${trimmed}` : 'DataWise'
        },
        {immediate: true},
    )
}
