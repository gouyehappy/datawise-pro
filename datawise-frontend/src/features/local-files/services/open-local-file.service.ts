import {t} from '@/i18n'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useLocalFilesStore} from '@/features/local-files/stores/local-files-store'
import {canUseLocalFilesWorkspace, readLocalTextFile} from '@/features/local-files/services/local-files.service'
import {
    canOpenLocalFileInEditor,
    fileExtension,
    isLocalBinaryFileName,
    isLocalSqlFileName,
    localFileBaseName,
    localFileNodeId,
} from '@/features/local-files/services/local-files-path'
import {
    isLocalDataPreviewFileName,
    previewLocalDataFile,
} from '@/features/local-files/services/local-data-preview.service'

export async function openLocalWorkspaceFile(path: string): Promise<string | null> {
    const layout = useLayoutStore()
    const workspace = useWorkspaceStore()
    const localFiles = useLocalFilesStore()
    const trimmed = path.trim()
    if (!trimmed) return null

    // Parquet (and other binary data files): table preview via community plugin.
    if (fileExtension(trimmed) === '.parquet' || (isLocalBinaryFileName(trimmed) && isLocalDataPreviewFileName(trimmed))) {
        const ok = await previewLocalDataFile(trimmed)
        return ok ? trimmed : null
    }

    if (isLocalBinaryFileName(trimmed) || !canOpenLocalFileInEditor(trimmed)) {
        layout.showErrorToast(t('explorer.localFiles.binaryFile'))
        return null
    }

    layout.setModule('database')

    let content: string
    try {
        content = await readLocalTextFile(trimmed)
    } catch (err) {
        const message = err instanceof Error ? err.message : ''
        if (/too large/i.test(message)) {
            layout.showErrorToast(t('explorer.localFiles.fileTooLarge'))
        } else {
            layout.showErrorToast(t('explorer.localFiles.readFailed'))
        }
        return null
    }

    const nodeId = localFileNodeId(trimmed)
    const title = localFileBaseName(trimmed)
    let tabId: string | null = null

    if (isLocalSqlFileName(trimmed)) {
        tabId = (await workspace.openConsole({
            sql: content,
            sqlFile: trimmed,
            title,
            skipEnsureScriptFile: true,
            explorerNodeId: nodeId,
        })) ?? null
    } else {
        tabId = (await workspace.openLocalTextTab({
            path: trimmed,
            content,
            title,
            explorerNodeId: nodeId,
        })) ?? null
    }

    if (canUseLocalFilesWorkspace()) {
        void localFiles.reveal(trimmed)
    }
    return tabId
}

/** Open a local SQL/DDL file in Console and queue an execute (dangerous SQL still confirms). */
export async function openAndRunLocalSqlFile(path: string): Promise<void> {
    const layout = useLayoutStore()
    const workspace = useWorkspaceStore()
    const trimmed = path.trim()
    if (!trimmed || !isLocalSqlFileName(trimmed)) {
        layout.showErrorToast(t('explorer.localFiles.unsupportedFile'))
        return
    }

    const tabId = await openLocalWorkspaceFile(trimmed)
    if (!tabId) return

    const tab = workspace.tabs.find((item) => item.id === tabId)
    if (!tab?.connectionId) {
        layout.showErrorToast(t('explorer.localFiles.runNeedsConnection'))
        return
    }
    workspace.requestConsoleAutoRun(tabId)
}
