import {shallowRef} from 'vue'
import type {NavModule, SettingsSection, ShortcutPanel} from '@/core/types'
import type {ShortcutActionId} from '@/core/shortcuts/types'
import type {SideRailItemId} from '@/features/layout/constants/side-rail-nav'
import {
    FeaturePermission,
    type FeaturePermissionKey,
    type FeaturePermissionMap,
    type PermissionPresetId,
} from '@/features/auth/types/feature-permission.types'
import {SETTINGS_SECTION_PERMISSION_MAP} from '@/features/settings/constants/settings-nav.config'
import {canReadResource, canWriteResource} from '@/features/auth/services/user-resource-policy'
import {isGuestSession} from '@/features/auth/services/user-access-policy'
import {UserResource} from '@/features/auth/types/user-resource.types'

const ALL_KEYS = Object.values(FeaturePermission) as FeaturePermissionKey[]

const activePermissions = shallowRef<FeaturePermissionMap>(createPreset('full'))

export function setActiveFeaturePermissions(map: Partial<FeaturePermissionMap> | null | undefined): void {
    activePermissions.value = normalizePermissions(map)
}

export function getActiveFeaturePermissions(): FeaturePermissionMap {
    return activePermissions.value
}

export function canAccessFeature(key: FeaturePermissionKey): boolean {
    return activePermissions.value[key] === true
}

export function createPreset(preset: PermissionPresetId): FeaturePermissionMap {
    if (preset === 'full') {
        return Object.fromEntries(ALL_KEYS.map((key) => [key, true])) as FeaturePermissionMap
    }
    if (preset === 'developer') {
        const map = createPreset('full')
        map[FeaturePermission.SettingsUserPermissions] = false
        map[FeaturePermission.SettingsTenants] = false
        map[FeaturePermission.SettingsIntegrations] = false
        map[FeaturePermission.SettingsBackupCenter] = false
        return map
    }
    if (preset === 'analyst') {
        const map = createPreset('workbench')
        map[FeaturePermission.NavDashboard] = true
        map[FeaturePermission.NavAi] = true
        map[FeaturePermission.NavSettings] = true
        map[FeaturePermission.ShortcutExport] = true
        map[FeaturePermission.WorkbenchConsoleAi] = true
        map[FeaturePermission.WorkbenchResultAiSummary] = true
        map[FeaturePermission.WorkbenchExplorerCatalogAi] = true
        map[FeaturePermission.SettingsBasic] = true
        map[FeaturePermission.SettingsProfile] = true
        map[FeaturePermission.SettingsAi] = true
        map[FeaturePermission.SettingsAbout] = true
        map[FeaturePermission.WorkbenchConsoleDangerousSql] = false
        map[FeaturePermission.WorkbenchExplorerContextDangerous] = false
        return map
    }
    if (preset === 'readonly') {
        const map = createPreset('workbench')
        map[FeaturePermission.WorkbenchConsoleDangerousSql] = false
        map[FeaturePermission.WorkbenchExplorerContextDangerous] = false
        map[FeaturePermission.WorkbenchExplorerAdd] = false
        map[FeaturePermission.WorkbenchExplorerContextEdit] = false
        return map
    }
    const map = Object.fromEntries(ALL_KEYS.map((key) => [key, false])) as FeaturePermissionMap
    if (preset === 'workbench') {
        map[FeaturePermission.NavDatabase] = true
        map[FeaturePermission.UtilRefresh] = true
        map[FeaturePermission.ShortcutInfo] = true
        map[FeaturePermission.ShortcutHistory] = true
        map[FeaturePermission.ShortcutConsole] = true
        map[FeaturePermission.WorkbenchConsoleRun] = true
        map[FeaturePermission.WorkbenchExplorerRefresh] = true
        map[FeaturePermission.WorkbenchExplorerLocate] = true
        map[FeaturePermission.WorkbenchExplorerSearch] = true
        map[FeaturePermission.WorkbenchExplorerContextOpen] = true
        map[FeaturePermission.WorkbenchExplorerContextConsole] = true
        map[FeaturePermission.WorkbenchExplorerContextCopy] = true
        map[FeaturePermission.WorkbenchExplorerAdd] = true
        map[FeaturePermission.WorkbenchExplorerContextEdit] = true
        map[FeaturePermission.WorkbenchTabNew] = true
        map[FeaturePermission.WorkbenchExplorerCatalogModels] = false
        map[FeaturePermission.WorkbenchExplorerCatalogWorkspaces] = false
        map[FeaturePermission.WorkbenchExplorerCatalogAi] = false
    }
    return map
}

export function detectPreset(map: FeaturePermissionMap): PermissionPresetId {
    const candidates: PermissionPresetId[] = ['full', 'developer', 'analyst', 'workbench', 'readonly']
    for (const id of candidates) {
        const preset = createPreset(id)
        if (ALL_KEYS.every((key) => map[key] === preset[key])) return id
    }
    return 'custom'
}

/** 系统角色 key → 权限预设（与后端 TenantRolePresets 对齐）。 */
export function presetForSystemRoleKey(roleKey: string): PermissionPresetId | null {
    switch (roleKey) {
        case 'tenant_admin':
            return 'full'
        case 'developer':
            return 'developer'
        case 'analyst':
            return 'analyst'
        case 'readonly':
            return 'readonly'
        default:
            return null
    }
}

export function sideRailFeatureKey(id: SideRailItemId): FeaturePermissionKey | null {
    switch (id) {
        case 'database':
            return FeaturePermission.NavDatabase
        case 'dashboard':
            return FeaturePermission.NavDashboard
        case 'ai':
            return FeaturePermission.NavAi
        case 'plugin':
            return FeaturePermission.NavPlugin
        case 'packStore':
            return FeaturePermission.NavPlugin
        case 'connectorMarket':
            return FeaturePermission.NavConnectorMarket
        case 'pluginDev':
            return FeaturePermission.NavPluginDev
        case 'refresh':
            return FeaturePermission.UtilRefresh
        case 'notify':
            return FeaturePermission.UtilNotify
        case 'assistant':
            return FeaturePermission.NavAi
        case 'feedback':
            return FeaturePermission.UtilFeedback
        case 'terminal':
            return FeaturePermission.UtilTerminal
        default:
            return null
    }
}

export function shortcutFeatureKey(id: ShortcutPanel): FeaturePermissionKey {
    switch (id) {
        case 'info':
            return FeaturePermission.ShortcutInfo
        case 'history':
            return FeaturePermission.ShortcutHistory
        case 'monitor':
            return FeaturePermission.ShortcutMonitor
        case 'console':
            return FeaturePermission.ShortcutConsole
        case 'migration':
            return FeaturePermission.ShortcutMigration
        case 'export':
            return FeaturePermission.ShortcutExport
    }
}

export function settingsSectionFeatureKey(section: SettingsSection): FeaturePermissionKey {
    const key = SETTINGS_SECTION_PERMISSION_MAP[section]
    if (!key) {
        throw new Error(`Unknown settings section for permissions: ${section}`)
    }
    return key
}

/** Settings section gate shared by layout shell and app-config (avoids Pinia cycle). */
export function canOpenSettingsSection(section: SettingsSection): boolean {
    if (!canAccessFeature(FeaturePermission.NavSettings)) return false
    return canAccessFeature(settingsSectionFeatureKey(section))
}

export function titleBarMenuFeatureKey(id: string): FeaturePermissionKey | null {
    switch (id) {
        case 'new-connection':
            return FeaturePermission.NavDatabase
        case 'new-console':
            return FeaturePermission.WorkbenchTabNew
        case 'connectors':
            return FeaturePermission.NavConnectorMarket
        case 'community-plugins':
            return FeaturePermission.NavPlugin
        case 'config':
            return FeaturePermission.TitleBarConfig
        case 'help':
            return FeaturePermission.TitleBarHelp
        default:
            return null
    }
}

export function titleBarMenuChildFeatureKey(id: string): FeaturePermissionKey | null {
    switch (id) {
        case 'config:preferences':
            return FeaturePermission.SettingsBasic
        case 'config:side-rail':
        case 'config:explorer':
        case 'config:shortcut-rail':
        case 'config:focus-mode':
            return FeaturePermission.SettingsLayout
        case 'help:onboarding':
            return FeaturePermission.ProfileOnboarding
        case 'help:runtime-setup':
            return FeaturePermission.ProfileOnboarding
        case 'help:about':
            return FeaturePermission.SettingsAbout
        default:
            return null
    }
}

export function shortcutActionFeatureKey(id: ShortcutActionId): FeaturePermissionKey | null {
    switch (id) {
        case 'explorer.search':
            return FeaturePermission.WorkbenchExplorerSearch
        case 'explorer.refresh':
            return FeaturePermission.WorkbenchExplorerRefresh
        case 'explorer.locate':
            return FeaturePermission.WorkbenchExplorerLocate
        case 'explorer.openNode':
            return FeaturePermission.WorkbenchExplorerContextOpen
        case 'explorer.editNode':
            return FeaturePermission.WorkbenchExplorerContextEdit
        case 'explorer.deleteNode':
            return FeaturePermission.WorkbenchExplorerContextDangerous
        case 'explorer.openDatabaseSql':
        case 'explorer.openRecentDatabaseSql':
        case 'explorer.newDatabaseSql':
        case 'explorer.openDatabaseConsole':
            return FeaturePermission.WorkbenchExplorerContextConsole
        case 'explorer.toggleColumnComment':
        case 'explorer.toggleTableComment':
        case 'explorer.toggleAllComments':
            return FeaturePermission.WorkbenchExplorerSettings
        case 'workspace.newConsole':
            return FeaturePermission.WorkbenchTabNew
        case 'workspace.runSql':
        case 'workspace.selectFirstRows':
        case 'workspace.countRows':
            return FeaturePermission.WorkbenchConsoleRun
        case 'workspace.saveConsole':
            return FeaturePermission.WorkbenchConsoleSave
        case 'workspace.aiPrompt':
            return FeaturePermission.WorkbenchConsoleAi
        case 'app.openSettings':
            return FeaturePermission.ProfileSettings
        case 'app.toggleTerminal':
            return FeaturePermission.UtilTerminal
        case 'app.toggleNotifications':
            return FeaturePermission.UtilNotify
        case 'app.toggleAssistant':
            return FeaturePermission.NavAi
        case 'app.globalObjectSearch':
            return null
        case 'app.zoomIn':
        case 'app.zoomOut':
        case 'app.zoomReset':
        case 'app.lockScreen':
        case 'app.shortcutCheatsheet':
            return null
    }
}

export function canExecuteShortcutAction(id: ShortcutActionId): boolean {
    const key = shortcutActionFeatureKey(id)
    if (!key) return true
    if (id === 'explorer.editNode') {
        if (isGuestSession() && canWriteResource(UserResource.ConnectionCatalog)) return true
        if (canAccessFeature(FeaturePermission.WorkbenchExplorerAdd)) return true
    }
    if (id === 'explorer.deleteNode') {
        if (isGuestSession() && canWriteResource(UserResource.ConnectionCatalog)) return true
    }
    return canAccessFeature(key)
}

/** 访客可写会话连接目录；注册用户需资源树编辑权限。 */
export function canOpenConnectionCatalogForm(isGuest: boolean): boolean {
    return canMutateConnectionCatalog(isGuest)
}

/** 连接目录增改（分组/连接）：访客走会话目录写权限，注册用户需编辑或新建权限。 */
export function canMutateConnectionCatalog(isGuest: boolean): boolean {
    if (isGuest) return canWriteResource(UserResource.ConnectionCatalog)
    return (
        canAccessFeature(FeaturePermission.WorkbenchExplorerContextEdit)
        || canAccessFeature(FeaturePermission.WorkbenchExplorerAdd)
    )
}

/** 连接/断开/重连：访客走会话目录读权限，注册用户走连接生命周期权限。 */
export function canManageExplorerConnectionLifecycle(isGuest: boolean): boolean {
    if (isGuest) return canReadResource(UserResource.ConnectionCatalog)
    return canAccessFeature(FeaturePermission.WorkbenchExplorerContextConnection)
}

export function isConnectionCatalogStructureType(nodeType?: string): boolean {
    return nodeType === 'connection' || nodeType === 'group'
}

/** 删除连接/分组：访客走会话目录写权限，注册用户走危险操作权限。 */
export function canDeleteConnectionCatalogNode(isGuest: boolean): boolean {
    if (isGuest) return canWriteResource(UserResource.ConnectionCatalog)
    return canAccessFeature(FeaturePermission.WorkbenchExplorerContextDangerous)
}

/** 删除 Explorer 节点：连接/分组与表等危险操作分流。 */
export function canDeleteExplorerNode(nodeType: string | undefined, isGuest: boolean): boolean {
    if (isConnectionCatalogStructureType(nodeType)) {
        return canDeleteConnectionCatalogNode(isGuest)
    }
    return canAccessFeature(FeaturePermission.WorkbenchExplorerContextDangerous)
}

/** 工具栏「+」添加菜单：访客可写会话目录时可见。 */
export function canUseExplorerAddMenu(isGuest: boolean): boolean {
    if (isGuest) return canMutateConnectionCatalog(isGuest)
    return canAccessFeature(FeaturePermission.WorkbenchExplorerAdd)
}

/** 导入连接需导出权限；访客不可用。 */
export function canImportExplorerConnections(isGuest: boolean): boolean {
    if (isGuest) return false
    return canAccessFeature(FeaturePermission.WorkbenchExplorerContextExport)
}

/** 表/视图/函数/存储过程/触发器：随数据库工作台（连接）权限默认开放。 */
export function canAccessExplorerCatalogSchema(): boolean {
    return canAccessFeature(FeaturePermission.NavDatabase)
}

export function canAccessExplorerCatalogModels(): boolean {
    return canAccessFeature(FeaturePermission.WorkbenchExplorerCatalogModels)
}

export function canAccessExplorerCatalogWorkspaces(): boolean {
    return canAccessFeature(FeaturePermission.WorkbenchExplorerCatalogWorkspaces)
}

export function canAccessExplorerCatalogAi(): boolean {
    // Standard edition build strips platform AI catalog (Wave 33).
    if (import.meta.env.VITE_DATAWISE_EDITION === 'standard') {
        return false
    }
    return canAccessFeature(FeaturePermission.WorkbenchExplorerCatalogAi)
}

export function paletteNavigationEntryAllowed(
    entryId: string,
    can: (key: FeaturePermissionKey) => boolean,
    canNav: (module: NavModule) => boolean,
): boolean {
    if (entryId.startsWith('module:')) {
        return canNav(entryId.slice('module:'.length) as NavModule)
    }
    if (entryId === 'action:new-console') {
        return can(FeaturePermission.WorkbenchTabNew)
    }
    if (entryId === 'action:data-catalog') {
        return can(FeaturePermission.WorkbenchExplorerSearch) && can(FeaturePermission.WorkbenchTabNew)
    }
    if (entryId === 'ai:ask') {
        return canNav('ai')
    }
    if (entryId === 'action:bookmarks') {
        return can(FeaturePermission.ShortcutConsole)
    }
    if (entryId.startsWith('sql:')) {
        return can(FeaturePermission.ShortcutHistory) && can(FeaturePermission.WorkbenchTabNew)
    }
    if (entryId.startsWith('bookmark:')) {
        return can(FeaturePermission.WorkbenchTabNew)
    }
    if (entryId === 'action:plugin-center') {
        return can(FeaturePermission.NavPlugin)
    }
    if (entryId === 'action:connector-market') {
        return can(FeaturePermission.NavConnectorMarket)
    }
    if (entryId === 'action:plugin-dev-tools') {
        return can(FeaturePermission.NavPluginDev)
    }
    if (entryId === 'plugin:open-settings'
        || entryId.startsWith('plugin:toggle-')
        || entryId.startsWith('plugin:reference-preset:')
        || entryId.startsWith('plugin:preset:')
        || entryId === 'plugin:align-reference-preset'
        || entryId === 'plugin:open-preset-diff') {
        return can(FeaturePermission.SettingsPlugins)
    }
    if (entryId.startsWith('plugin:focus:')) {
        return can(FeaturePermission.NavPlugin)
    }
    return true
}

function normalizePermissions(map: Partial<FeaturePermissionMap> | null | undefined): FeaturePermissionMap {
    const base = createPreset('workbench')
    if (!map) return createPreset('full')
    for (const key of ALL_KEYS) {
        if (typeof map[key] === 'boolean') {
            base[key] = map[key]!
        }
    }
    // 旧权限表缺 settings.projects：有基础设置权限则默认放开项目管理
    if (
        typeof map[FeaturePermission.SettingsProjects] !== 'boolean'
        && map[FeaturePermission.SettingsBasic] === true
    ) {
        base[FeaturePermission.SettingsProjects] = true
    }
    return base
}

/** 将 API/草稿权限补全为完整键表，避免保存后 UI 因缺字段全部变未选。 */
export function normalizeFeaturePermissionMap(
    map: Partial<FeaturePermissionMap> | null | undefined,
): FeaturePermissionMap {
    return normalizePermissions(map)
}
