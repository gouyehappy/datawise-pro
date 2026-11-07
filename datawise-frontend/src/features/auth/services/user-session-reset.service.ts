import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useNotificationStore} from '@/features/layout/stores/notification-store'
import {useShortcutPanelStore} from '@/features/layout/stores/shortcut-panel-store'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {cancelDeferredConfigServerWrites} from '@/shared/config/app-config.service'
import {setServerConfigSyncEnabled} from '@/shared/config/config-server-sync'
import {syncAppConfigStorageScopeFromSession} from '@/shared/config/app-config-storage-scope'
import {createDefaultAppConfig} from '@/shared/config/app-config.defaults'
import {normalizeAppConfig} from '@/shared/config/app-config.service'
import {readUserId} from '@/shared/auth/session'
import {syncAiPreferences} from '@/api'

/** 从 auth store 同步 localStorage 命名空间（登录/切换租户等完整会话态已就绪时）。 */
export function syncAppConfigStorageScopeFromAuth(): void {
    const auth = useAuthStore()
    syncAppConfigStorageScopeFromSession({
        userId: auth.user?.userId ?? readUserId(),
        userName: auth.user?.userName,
        isGuest: auth.isGuest,
        tenantId: auth.tenantId,
    })
}

/** 登录/退出/切换用户后重载 Explorer、配置与工作区状态。 */
export async function resetUserScopedState(): Promise<void> {
    cancelDeferredConfigServerWrites()
    setServerConfigSyncEnabled(false)

    try {
        syncAppConfigStorageScopeFromAuth()

        const explorer = useExplorerStore()
        const auth = useAuthStore()
        const appConfig = useAppConfigStore()
        const workspace = useWorkspaceStore()

        // 先切到正确命名空间再读置顶；refreshTree → commitExplorerTree 会按 localStorage 排序
        explorer.refreshPinnedNodeIds()

        // Drop any in-flight tab persist from the previous user before clearing tabs.
        appConfig.cancelPendingWorkspaceSessionPersist()

        // Clear previous user's in-memory tabs BEFORE sync. syncFromServer restores the
        // incoming user's workspace-session.json — closing after sync was wiping restores.
        workspace.closeAllClosable()

        const {useTeamStore} = await import('@/features/team/stores/team-store')
        const teamStore = useTeamStore()
        teamStore.resetForSession()
        const {useProjectStore} = await import('@/features/project/stores/project')
        const projectStore = useProjectStore()
        projectStore.resetForSession()

        // Guest：私有配置回默认；主题/界面款式/编辑器经 normalize 读取本机 last-write。
        const configTask = auth.isGuest
            ? Promise.resolve(appConfig.reloadForCurrentScope(normalizeAppConfig(createDefaultAppConfig())))
            : appConfig.syncFromServer()
        // Project scope must be ready before explorer refresh so「项目文档/脚本」roots inject.
        await Promise.all([
            configTask,
            auth.isGuest ? Promise.resolve() : teamStore.load().catch(() => {}),
            auth.isGuest ? Promise.resolve() : projectStore.load().catch(() => {}),
        ])
        await explorer.refreshTree()
        if (import.meta.env.VITE_DATAWISE_EDITION !== 'standard') {
            const {useAiAssistantChatStore, useAiChatStore} = await import('@/features/ai/stores/ai-chat')
            useAiChatStore().reloadForCurrentScope()
            useAiAssistantChatStore().reloadForCurrentScope()
            syncAiPreferences(appConfig.aiPreferences)
        }
        await useShortcutPanelStore().load()
        await useNotificationStore().load()
    } finally {
        setServerConfigSyncEnabled(true)
    }
}
