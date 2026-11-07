/** 功能权限键：与后端 UserFeaturePermission 对齐。 */
export const FeaturePermission = {
    NavDatabase: 'nav.database',
    NavDashboard: 'nav.dashboard',
    NavAi: 'nav.ai',
    NavPlugin: 'nav.plugin',
    NavConnectorMarket: 'nav.connectorMarket',
    NavPluginDev: 'nav.pluginDev',
    NavTeam: 'nav.team',
    NavSettings: 'nav.settings',

    UtilRefresh: 'util.refresh',
    UtilNotify: 'util.notify',
    UtilFeedback: 'util.feedback',
    UtilTerminal: 'util.terminal',

    ShortcutInfo: 'shortcut.info',
    ShortcutHistory: 'shortcut.history',
    ShortcutMonitor: 'shortcut.monitor',
    ShortcutConsole: 'shortcut.console',
    ShortcutMigration: 'shortcut.migration',
    ShortcutExport: 'shortcut.export',

    ProfileSettings: 'profile.settings',
    ProfileOnboarding: 'profile.onboarding',
    ProfileTeam: 'profile.team',

    TitleBarConfig: 'titleBar.config',
    TitleBarHelp: 'titleBar.help',
    TitleBarWorkspace: 'titleBar.workspace',

    WorkbenchConsoleRun: 'workbench.console.run',
    WorkbenchConsoleExplain: 'workbench.console.explain',
    WorkbenchConsoleDangerousSql: 'workbench.console.dangerousSql',
    WorkbenchConsoleSave: 'workbench.console.save',
    WorkbenchConsoleSaveAs: 'workbench.console.saveAs',
    WorkbenchConsoleBookmark: 'workbench.console.bookmark',
    WorkbenchConsoleViewModel: 'workbench.console.viewModel',
    WorkbenchConsoleFormat: 'workbench.console.format',
    WorkbenchConsoleFullscreen: 'workbench.console.fullscreen',
    WorkbenchConsoleAi: 'workbench.console.ai',
    WorkbenchConsoleTransaction: 'workbench.console.transaction',

    WorkbenchExplorerAdd: 'workbench.explorer.add',
    WorkbenchExplorerRefresh: 'workbench.explorer.refresh',
    WorkbenchExplorerLocate: 'workbench.explorer.locate',
    WorkbenchExplorerSettings: 'workbench.explorer.settings',
    WorkbenchExplorerSearch: 'workbench.explorer.search',

    WorkbenchExplorerCatalogModels: 'workbench.explorer.catalog.models',
    WorkbenchExplorerCatalogWorkspaces: 'workbench.explorer.catalog.workspaces',
    WorkbenchExplorerCatalogAi: 'workbench.explorer.catalog.ai',

    WorkbenchExplorerContextOpen: 'workbench.explorer.context.open',
    WorkbenchExplorerContextConsole: 'workbench.explorer.context.console',
    WorkbenchExplorerContextEdit: 'workbench.explorer.context.edit',
    WorkbenchExplorerContextExport: 'workbench.explorer.context.export',
    WorkbenchExplorerContextCopy: 'workbench.explorer.context.copy',
    WorkbenchExplorerContextPin: 'workbench.explorer.context.pin',
    WorkbenchExplorerContextConnection: 'workbench.explorer.context.connection',
    WorkbenchExplorerContextDangerous: 'workbench.explorer.context.dangerous',

    WorkbenchTabNew: 'workbench.tab.new',
    WorkbenchResultAiSummary: 'workbench.result.aiSummary',

    SettingsBasic: 'settings.basic',
    SettingsLayout: 'settings.layout',
    SettingsProfile: 'settings.profile',
    SettingsEditor: 'settings.editor',
    SettingsShortcuts: 'settings.shortcuts',
    SettingsSqlEditor: 'settings.sqlEditor',
    SettingsSqlSnippets: 'settings.sqlSnippets',
    SettingsConnectionHealth: 'settings.connectionHealth',
    SettingsSystemMetrics: 'settings.systemMetrics',
    SettingsAi: 'settings.ai',
    SettingsDataAgent: 'settings.dataAgent',
    SettingsPlugins: 'settings.plugins',
    SettingsAbout: 'settings.about',
    SettingsIntegrations: 'settings.integrations',
    SettingsBackupCenter: 'settings.backupCenter',
    SettingsUserPermissions: 'settings.userPermissions',
    SettingsTenants: 'settings.tenants',
    SettingsProjects: 'settings.projects',
} as const

export type FeaturePermissionKey = (typeof FeaturePermission)[keyof typeof FeaturePermission]

export type FeaturePermissionMap = Record<FeaturePermissionKey, boolean>

/** 与后端 TenantRolePresets / full|workbench 对齐；custom 表示逐项覆盖。 */
export type PermissionPresetId =
    | 'full'
    | 'developer'
    | 'analyst'
    | 'readonly'
    | 'workbench'
    | 'custom'

export interface TenantRoleSummary {
    id: string
    key: string
    name: string
    system: boolean
    permissions?: FeaturePermissionMap
}

export interface UserPermissionSummary {
    id: number
    username: string
    displayName: string
    guest: boolean
    admin: boolean
    featurePermissions: FeaturePermissionMap
    roleIds?: string[]
    roleKeys?: string[]
    usesLegacyPermissions?: boolean
}
