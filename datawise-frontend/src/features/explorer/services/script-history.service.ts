import {instanceSqlApi} from '@/api'
import type {ScriptHistoryTarget} from '@/features/explorer/stores/script-history-drawer-store'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'

export async function restoreScriptHistoryVersion(
    target: ScriptHistoryTarget,
    versionId: string,
): Promise<string> {
    const result = await instanceSqlApi.restoreHistoryVersion({
        connectionId: target.connectionId,
        instanceName: target.instanceName,
        fileName: target.fileName,
        versionId,
    })

    const workspace = useWorkspaceStore()
    const explorer = useExplorerStore()
    const tab = workspace.tabs.find(
        (item) =>
            item.type === 'console'
            && item.connectionId === target.connectionId
            && item.sqlFile === target.fileName
            && (item.database === target.instanceName || item.instanceId != null),
    )
    if (tab) {
        tab.sql = result.sql
        workspace.markConsoleTabSaved(tab.id, result.sql)
    }

    await explorer.reloadWorkspacesFolder(target.connectionId, target.instanceName)
    return result.sql
}
