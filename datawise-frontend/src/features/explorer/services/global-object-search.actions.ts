import type {GlobalObjectSearchEntry} from '@/features/explorer/services/global-object-search.service'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {findAncestorByType} from '@/core/utils/tree'

/** 选中搜索结果：定位树节点；表/视图额外打开 Tab；指标打开语义目录 */
export async function activateGlobalObjectSearchEntry(entry: GlobalObjectSearchEntry): Promise<void> {
    const layout = useLayoutStore()
    const appConfig = useAppConfigStore()
    const explorer = useExplorerStore()
    const workspace = useWorkspaceStore()

    layout.setModule('database')
    appConfig.setShowExplorerPanel(true)

    if (entry.kind === 'metric') {
        if (!entry.connectionId || !entry.database) return
        workspace.openPlatformCatalog({
            feature: 'semantic_metrics',
            connectionId: entry.connectionId,
            database: entry.database,
        })
        return
    }

    const node = await explorer.locateNode(entry.nodeId)
    if (!node) {
        if ((entry.kind === 'table' || entry.kind === 'view') && entry.connectionId) {
            workspace.openTable(
                entry.name,
                entry.connectionId,
                undefined,
                entry.database || undefined,
                entry.nodeId,
                'properties',
                entry.kind,
            )
        }
        return
    }

    if (entry.kind === 'table' || entry.kind === 'view') {
        const databaseNode = findAncestorByType(explorer.tree, entry.nodeId, 'database')
        workspace.openTable(
            entry.name,
            entry.connectionId,
            databaseNode?.id,
            entry.database || undefined,
            entry.nodeId,
            'properties',
            entry.kind,
        )
    }
}
