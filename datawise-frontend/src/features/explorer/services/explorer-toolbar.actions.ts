import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {canAccessExplorerCatalogAi} from '@/features/auth/services/feature-permission.service'
import {resolveProjectSandboxTabLocateUri} from '@/features/explorer/services/explorer-locate.service'
import {isLocalAbsolutePath} from '@/features/local-files/services/local-files-path'
import {t} from '@/i18n'

export async function runExplorerRefresh() {
    const explorer = useExplorerStore()
    await explorer.refreshTree()
}

export async function runExplorerLocateActiveTab(): Promise<boolean> {
    const explorer = useExplorerStore()
    const workspace = useWorkspaceStore()
    const layout = useLayoutStore()
    const tab = workspace.activeTab

    const node = await explorer.locateActiveTabNode(tab)
    if (!node) {
        layout.showErrorToast(t('explorer.locateActiveTabFailed'))
        return false
    }

    if (tab?.id && node.id !== tab.explorerNodeId) {
        workspace.updateTabContext(tab.id, {explorerNodeId: node.id})
    }

    return true
}

export async function runExplorerLocateSelected(): Promise<boolean> {
    const explorer = useExplorerStore()
    const layout = useLayoutStore()

    const node = await explorer.locateSelectedNode()
    if (!node) {
        layout.showErrorToast(t('explorer.locateSelectedFailed'))
        return false
    }

    return true
}

/**
 * Locate respects Explorer panel mode ownership: never auto-call setPanelMode.
 * Disk-backed local files require「文件」; project sandbox tabs require「数据库」.
 */
export async function runExplorerLocate(): Promise<boolean> {
    const workspace = useWorkspaceStore()
    const explorer = useExplorerStore()
    const tab = workspace.activeTab
    const layout = useLayoutStore()

    const projectUri = resolveProjectSandboxTabLocateUri(tab)
    if (projectUri) {
        if (explorer.panelMode !== 'database') {
            layout.showErrorToast(t('explorer.switchToDatabaseViewFirst'))
            return false
        }
        return runExplorerLocateActiveTab()
    }

    const isLocalDiskTab =
        (tab?.type === 'local-text' && isLocalAbsolutePath(tab.localFilePath))
        || (tab?.type === 'console' && isLocalAbsolutePath(tab.sqlFile))

    if (isLocalDiskTab && explorer.panelMode !== 'files') {
        layout.showErrorToast(t('explorer.switchToFilesViewFirst'))
        return false
    }

    if (explorer.panelMode === 'files') {
        const {useLocalFilesStore} = await import('@/features/local-files/stores/local-files-store')
        const localFiles = useLocalFilesStore()
        const path =
            tab?.type === 'local-text' && isLocalAbsolutePath(tab.localFilePath)
                ? tab.localFilePath
                : tab?.type === 'console' && isLocalAbsolutePath(tab.sqlFile)
                  ? tab.sqlFile
                  : localFiles.selectedNode?.path
        if (!path) {
            layout.showErrorToast(t('explorer.localFiles.locateFailed'))
            return false
        }
        const ok = await localFiles.reveal(path)
        if (!ok) {
            layout.showErrorToast(t('explorer.localFiles.locateFailed'))
            return false
        }
        return true
    }

    if (tab && (tab.type === 'console' || tab.type === 'table') && tab.connectionId) {
        return runExplorerLocateActiveTab()
    }
    return runExplorerLocateSelected()
}

export function runToggleColumnComment() {
    const explorer = useExplorerStore()
    explorer.showColumnComment = !explorer.showColumnComment
}

export function runToggleTableComment() {
    const explorer = useExplorerStore()
    explorer.showTableComment = !explorer.showTableComment
}

export function runToggleAllComments() {
    const explorer = useExplorerStore()
    explorer.toggleAllComments()
}


export function runToggleSemanticLayer() {
    if (!canAccessExplorerCatalogAi()) return
    const explorer = useExplorerStore()
    explorer.showSemanticLayer = !explorer.showSemanticLayer
}
