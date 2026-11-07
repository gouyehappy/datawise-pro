export type ShortcutCategory = 'explorer' | 'workspace' | 'app'

/** global：应用级常驻；local：仅所在页面挂载时生效（如 SQL 编辑器） */
export type ShortcutScope = 'global' | 'local'

export type ShortcutActionId =
    | 'explorer.search'
    | 'explorer.refresh'
    | 'explorer.locate'
    | 'explorer.openNode'
    | 'explorer.editNode'
    | 'explorer.deleteNode'
    | 'explorer.openDatabaseSql'
    | 'explorer.openRecentDatabaseSql'
    | 'explorer.newDatabaseSql'
    | 'explorer.openDatabaseConsole'
    | 'explorer.toggleColumnComment'
    | 'explorer.toggleTableComment'
    | 'explorer.toggleAllComments'
    | 'workspace.newConsole'
    | 'workspace.runSql'
    | 'workspace.selectFirstRows'
    | 'workspace.countRows'
    | 'workspace.saveConsole'
    | 'workspace.aiPrompt'
    | 'app.openSettings'
    | 'app.toggleTerminal'
    | 'app.toggleNotifications'
    | 'app.toggleAssistant'
    | 'app.globalObjectSearch'
    | 'app.zoomIn'
    | 'app.zoomOut'
    | 'app.zoomReset'
    | 'app.lockScreen'
    | 'app.shortcutCheatsheet'

export interface ShortcutDefinition {
    id: ShortcutActionId
    category: ShortcutCategory
    scope: ShortcutScope
    labelKey: string
    defaultBinding: string
    icon: string
}

export type ShortcutPreferences = Partial<Record<ShortcutActionId, string>>
