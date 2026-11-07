import type {DbType} from '@/core/types'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {
    buildPlatformWorkspaceOpenHandlers,
    dispatchPlatformWorkspaceOpen,
} from '@/features/explorer/services/explorer-platform-menu-actions.service'
import {planOpenMongoConsole} from '@/features/workspace/services/workspace-stateless-open.service'
import {resolveWelcomePrimaryOpen} from '@/features/workspace/services/welcome-open-connection.service'

/** 打开连接主入口（工作台 / SQL / 插件），供欢迎页与底栏快启共用 */
export async function openWelcomeConnectionPrimary(options: {
    connectionId: string
    connectionName: string
    dbType: DbType
}): Promise<void> {
    const {connectionId, connectionName, dbType} = options
    const explorer = useExplorerStore()
    const workspace = useWorkspaceStore()
    const target = resolveWelcomePrimaryOpen(dbType)
    const ctx = {
        connectionId,
        connectionName,
        explorerNodeId: connectionId,
    }

    if (target.mode === 'plugin') {
        await explorer.connectConnection(connectionId, {notify: true})
        return
    }

    if (target.mode === 'platform') {
        await explorer.connectConnection(connectionId, {notify: false}).catch(() => undefined)
        dispatchPlatformWorkspaceOpen(
            target.open,
            ctx,
            buildPlatformWorkspaceOpenHandlers(workspace),
        )
        return
    }

    if (target.mode === 'mongo') {
        await explorer.connectConnection(connectionId, {notify: false}).catch(() => undefined)
        workspace.openWithPlan(planOpenMongoConsole, ctx, 'mongodb')
        return
    }

    if (target.mode === 'sql') {
        void workspace.openConsole({
            connectionId,
            connectionName,
        })
        return
    }

    await explorer.connectConnection(connectionId, {notify: true})
}
