import {
    FeaturePermission,
    type FeaturePermissionKey,
} from '@/features/auth/types/feature-permission.types'
import {buildSettingsPermissionNavItems} from '@/features/settings/constants/settings-nav.config'

export interface FeaturePermissionGroupItem {
    key: FeaturePermissionKey
    labelKey: string
}

export interface FeaturePermissionGroup {
    id: string
    labelKey: string
    items: FeaturePermissionGroupItem[]
}

const STATIC_FEATURE_PERMISSION_GROUPS: FeaturePermissionGroup[] = [
    {
        id: 'nav',
        labelKey: 'settings.userPermissions.groups.nav',
        items: [
            {key: FeaturePermission.NavDatabase, labelKey: 'settings.userPermissions.items.navDatabase'},
            {key: FeaturePermission.NavDashboard, labelKey: 'settings.userPermissions.items.navDashboard'},
            {key: FeaturePermission.NavAi, labelKey: 'settings.userPermissions.items.navAi'},
            {key: FeaturePermission.NavPlugin, labelKey: 'settings.userPermissions.items.navPlugin'},
            {key: FeaturePermission.NavConnectorMarket, labelKey: 'settings.userPermissions.items.navConnectorMarket'},
            {key: FeaturePermission.NavPluginDev, labelKey: 'settings.userPermissions.items.navPluginDev'},
            {key: FeaturePermission.NavTeam, labelKey: 'settings.userPermissions.items.navTeam'},
            {key: FeaturePermission.NavSettings, labelKey: 'settings.userPermissions.items.navSettings'},
        ],
    },
    {
        id: 'util',
        labelKey: 'settings.userPermissions.groups.util',
        items: [
            {key: FeaturePermission.UtilRefresh, labelKey: 'settings.userPermissions.items.utilRefresh'},
            {key: FeaturePermission.UtilNotify, labelKey: 'settings.userPermissions.items.utilNotify'},
            {key: FeaturePermission.UtilFeedback, labelKey: 'settings.userPermissions.items.utilFeedback'},
            {key: FeaturePermission.UtilTerminal, labelKey: 'settings.userPermissions.items.utilTerminal'},
        ],
    },
    {
        id: 'shortcut',
        labelKey: 'settings.userPermissions.groups.shortcut',
        items: [
            {key: FeaturePermission.ShortcutInfo, labelKey: 'settings.userPermissions.items.shortcutInfo'},
            {key: FeaturePermission.ShortcutHistory, labelKey: 'settings.userPermissions.items.shortcutHistory'},
            {key: FeaturePermission.ShortcutMonitor, labelKey: 'settings.userPermissions.items.shortcutMonitor'},
            {key: FeaturePermission.ShortcutConsole, labelKey: 'settings.userPermissions.items.shortcutConsole'},
            {key: FeaturePermission.ShortcutMigration, labelKey: 'settings.userPermissions.items.shortcutMigration'},
            {key: FeaturePermission.ShortcutExport, labelKey: 'settings.userPermissions.items.shortcutExport'},
        ],
    },
    {
        id: 'workbenchConsole',
        labelKey: 'settings.userPermissions.groups.workbenchConsole',
        items: [
            {key: FeaturePermission.WorkbenchConsoleRun, labelKey: 'settings.userPermissions.items.workbenchConsoleRun'},
            {key: FeaturePermission.WorkbenchConsoleExplain, labelKey: 'settings.userPermissions.items.workbenchConsoleExplain'},
            {key: FeaturePermission.WorkbenchConsoleDangerousSql, labelKey: 'settings.userPermissions.items.workbenchConsoleDangerousSql'},
            {key: FeaturePermission.WorkbenchConsoleSave, labelKey: 'settings.userPermissions.items.workbenchConsoleSave'},
            {key: FeaturePermission.WorkbenchConsoleSaveAs, labelKey: 'settings.userPermissions.items.workbenchConsoleSaveAs'},
            {key: FeaturePermission.WorkbenchConsoleBookmark, labelKey: 'settings.userPermissions.items.workbenchConsoleBookmark'},
            {key: FeaturePermission.WorkbenchConsoleViewModel, labelKey: 'settings.userPermissions.items.workbenchConsoleViewModel'},
            {key: FeaturePermission.WorkbenchConsoleFormat, labelKey: 'settings.userPermissions.items.workbenchConsoleFormat'},
            {key: FeaturePermission.WorkbenchConsoleFullscreen, labelKey: 'settings.userPermissions.items.workbenchConsoleFullscreen'},
            {key: FeaturePermission.WorkbenchConsoleAi, labelKey: 'settings.userPermissions.items.workbenchConsoleAi'},
            {key: FeaturePermission.WorkbenchConsoleTransaction, labelKey: 'settings.userPermissions.items.workbenchConsoleTransaction'},
        ],
    },
    {
        id: 'workbenchExplorer',
        labelKey: 'settings.userPermissions.groups.workbenchExplorer',
        items: [
            {key: FeaturePermission.WorkbenchExplorerAdd, labelKey: 'settings.userPermissions.items.workbenchExplorerAdd'},
            {key: FeaturePermission.WorkbenchExplorerRefresh, labelKey: 'settings.userPermissions.items.workbenchExplorerRefresh'},
            {key: FeaturePermission.WorkbenchExplorerLocate, labelKey: 'settings.userPermissions.items.workbenchExplorerLocate'},
            {key: FeaturePermission.WorkbenchExplorerSettings, labelKey: 'settings.userPermissions.items.workbenchExplorerSettings'},
            {key: FeaturePermission.WorkbenchExplorerSearch, labelKey: 'settings.userPermissions.items.workbenchExplorerSearch'},
            {key: FeaturePermission.WorkbenchExplorerCatalogModels, labelKey: 'settings.userPermissions.items.workbenchExplorerCatalogModels'},
            {key: FeaturePermission.WorkbenchExplorerCatalogWorkspaces, labelKey: 'settings.userPermissions.items.workbenchExplorerCatalogWorkspaces'},
            {key: FeaturePermission.WorkbenchExplorerCatalogAi, labelKey: 'settings.userPermissions.items.workbenchExplorerCatalogAi'},
        ],
    },
    {
        id: 'workbenchExplorerContext',
        labelKey: 'settings.userPermissions.groups.workbenchExplorerContext',
        items: [
            {key: FeaturePermission.WorkbenchExplorerContextOpen, labelKey: 'settings.userPermissions.items.workbenchExplorerContextOpen'},
            {key: FeaturePermission.WorkbenchExplorerContextConsole, labelKey: 'settings.userPermissions.items.workbenchExplorerContextConsole'},
            {key: FeaturePermission.WorkbenchExplorerContextEdit, labelKey: 'settings.userPermissions.items.workbenchExplorerContextEdit'},
            {key: FeaturePermission.WorkbenchExplorerContextExport, labelKey: 'settings.userPermissions.items.workbenchExplorerContextExport'},
            {key: FeaturePermission.WorkbenchExplorerContextCopy, labelKey: 'settings.userPermissions.items.workbenchExplorerContextCopy'},
            {key: FeaturePermission.WorkbenchExplorerContextPin, labelKey: 'settings.userPermissions.items.workbenchExplorerContextPin'},
            {key: FeaturePermission.WorkbenchExplorerContextConnection, labelKey: 'settings.userPermissions.items.workbenchExplorerContextConnection'},
            {key: FeaturePermission.WorkbenchExplorerContextDangerous, labelKey: 'settings.userPermissions.items.workbenchExplorerContextDangerous'},
        ],
    },
    {
        id: 'workbenchOther',
        labelKey: 'settings.userPermissions.groups.workbenchOther',
        items: [
            {key: FeaturePermission.WorkbenchTabNew, labelKey: 'settings.userPermissions.items.workbenchTabNew'},
            {key: FeaturePermission.WorkbenchResultAiSummary, labelKey: 'settings.userPermissions.items.workbenchResultAiSummary'},
        ],
    },
    {
        id: 'titleBar',
        labelKey: 'settings.userPermissions.groups.titleBar',
        items: [
            {key: FeaturePermission.TitleBarConfig, labelKey: 'settings.userPermissions.items.titleBarConfig'},
            {key: FeaturePermission.TitleBarHelp, labelKey: 'settings.userPermissions.items.titleBarHelp'},
            {key: FeaturePermission.TitleBarWorkspace, labelKey: 'settings.userPermissions.items.titleBarWorkspace'},
        ],
    },
    {
        id: 'profile',
        labelKey: 'settings.userPermissions.groups.profile',
        items: [
            {key: FeaturePermission.ProfileSettings, labelKey: 'settings.userPermissions.items.profileSettings'},
            {key: FeaturePermission.ProfileOnboarding, labelKey: 'settings.userPermissions.items.profileOnboarding'},
            {key: FeaturePermission.ProfileTeam, labelKey: 'settings.userPermissions.items.profileTeam'},
        ],
    },
]

/** 账号权限页分组；settings 分组与设置侧栏顺序同步。 */
export function buildFeaturePermissionGroups(): FeaturePermissionGroup[] {
    const groups = STATIC_FEATURE_PERMISSION_GROUPS.map((group) => ({
        ...group,
        items: [...group.items],
    }))
    groups.splice(groups.findIndex((group) => group.id === 'titleBar') + 1, 0, {
        id: 'settings',
        labelKey: 'settings.userPermissions.groups.settings',
        items: buildSettingsPermissionNavItems(),
    })
    return groups
}

export const FEATURE_PERMISSION_GROUPS = buildFeaturePermissionGroups()
