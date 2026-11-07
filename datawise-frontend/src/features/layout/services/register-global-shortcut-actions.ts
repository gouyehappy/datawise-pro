import {configureGlobalShortcutActions} from '@/core/shortcuts/execute-action'
import {focusExplorerSearchInput} from '@/core/shortcuts/action-registry'
import {
    runExplorerDeleteSelectedNode,
    runExplorerEditSelectedNode,
    runExplorerOpenSelectedNode,
} from '@/features/explorer/services/explorer-node-shortcuts.service'
import {runExplorerDatabaseShortcut} from '@/features/explorer/services/explorer-database-shortcuts.service'
import {
    runExplorerLocate,
    runExplorerRefresh,
    runToggleAllComments,
    runToggleColumnComment,
    runToggleTableComment,
} from '@/features/explorer/services/explorer-toolbar.actions'
import {canExecuteShortcutAction} from '@/features/auth/services/feature-permission.service'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useGlobalObjectSearch} from '@/features/layout/composables/useGlobalObjectSearch'
import {
    desktopZoomIn,
    desktopZoomOut,
    desktopZoomReset,
} from '@/features/layout/services/desktop-zoom.service'
import {useLockScreenStore} from '@/features/auth/stores/lock-screen-store'
import {useShortcutCheatsheet} from '@/features/layout/composables/useShortcutCheatsheet'

let registered = false

/** Wire core `executeShortcutAction` to feature-owned handlers (call once from AppShell). */
export function registerGlobalShortcutActions(): void {
    if (registered) return
    registered = true

    configureGlobalShortcutActions({
        canExecute: canExecuteShortcutAction,
        handlers: {
            'explorer.search': () => {
                focusExplorerSearchInput()
                return true
            },
            'explorer.refresh': () => {
                void runExplorerRefresh()
                return true
            },
            'explorer.locate': () => {
                void runExplorerLocate()
                return true
            },
            'explorer.openNode': () => {
                runExplorerOpenSelectedNode()
                return true
            },
            'explorer.editNode': () => {
                runExplorerEditSelectedNode()
                return true
            },
            'explorer.deleteNode': () => {
                runExplorerDeleteSelectedNode()
                return true
            },
            'explorer.openDatabaseSql': () => {
                runExplorerDatabaseShortcut('open')
                return true
            },
            'explorer.openRecentDatabaseSql': () => {
                runExplorerDatabaseShortcut('recent')
                return true
            },
            'explorer.newDatabaseSql': () => {
                runExplorerDatabaseShortcut('new')
                return true
            },
            'explorer.openDatabaseConsole': () => {
                runExplorerDatabaseShortcut('console')
                return true
            },
            'explorer.toggleColumnComment': () => {
                runToggleColumnComment()
                return true
            },
            'explorer.toggleTableComment': () => {
                runToggleTableComment()
                return true
            },
            'explorer.toggleAllComments': () => {
                runToggleAllComments()
                return true
            },
            'workspace.newConsole': () => {
                useWorkspaceStore().openConsole()
                return true
            },
            'app.openSettings': () => {
                useLayoutStore().openSettingsModule('basic')
                return true
            },
            'app.toggleTerminal': () => {
                useLayoutStore().toggleTerminalPanel()
                return true
            },
            'app.toggleNotifications': () => {
                useLayoutStore().toggleNotificationDrawer()
                return true
            },
            'app.toggleAssistant': () => {
                const layout = useLayoutStore()
                if (!useEntitlementStore().guardAiNav()) return true
                if (!usePluginStore().isEnabled('p-ai-workbench')) {
                    layout.setModule('packStore')
                    return true
                }
                layout.toggleAssistantDrawer()
                return true
            },
            'app.globalObjectSearch': () => {
                useGlobalObjectSearch().toggleGlobalObjectSearch()
                return true
            },
            'app.zoomIn': () => {
                void desktopZoomIn()
                return true
            },
            'app.zoomOut': () => {
                void desktopZoomOut()
                return true
            },
            'app.zoomReset': () => {
                void desktopZoomReset()
                return true
            },
            'app.lockScreen': () => {
                useLockScreenStore().lock()
                return true
            },
            'app.shortcutCheatsheet': () => {
                useShortcutCheatsheet().toggle()
                return true
            },
        },
    })
}
