import {watch} from 'vue'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useLocalFilesStore} from '@/features/local-files/stores/local-files-store'
import {canUseLocalFilesWorkspace} from '@/features/local-files/services/local-files.service'
import {isLocalAbsolutePath} from '@/features/local-files/services/local-files-path'
import {isProjectFileUri} from '@/features/project/services/project-files-api'

/** When the active tab is a desktop local file, reveal it in the tree if Files view is already open. */
export function useLocalFilesTabSync() {
    const workspace = useWorkspaceStore()
    const explorer = useExplorerStore()
    const localFiles = useLocalFilesStore()

    watch(
        () => workspace.activeTabId,
        async () => {
            if (!canUseLocalFilesWorkspace()) return
            if (explorer.panelMode !== 'files') return
            const tab = workspace.activeTab
            if (!tab) return

            const path =
                tab.type === 'local-text'
                    ? tab.localFilePath
                    : tab.type === 'console' && isLocalAbsolutePath(tab.sqlFile)
                      ? tab.sqlFile
                      : null
            // 项目沙箱 URI（dw-project://）留在「数据库」资源树，勿切到本地「文件」视图
            if (!path || isProjectFileUri(path) || !isLocalAbsolutePath(path)) return

            const ready = await localFiles.ensureRootForPath(path)
            if (!ready) return
            await localFiles.reveal(path)
        },
    )
}
