import type {SettingsSection} from '@/core/types'
import {listFeatureSettingsContributions} from '@/core/feature-contract'
import {
    FeaturePermission,
    type FeaturePermissionKey,
} from '@/features/auth/types/feature-permission.types'

export const SETTINGS_SECTION_PERMISSION_MAP: Partial<Record<SettingsSection, FeaturePermissionKey>> = {
    basic: FeaturePermission.SettingsBasic,
    layout: FeaturePermission.SettingsLayout,
    profile: FeaturePermission.SettingsProfile,
    editor: FeaturePermission.SettingsEditor,
    querySafety: FeaturePermission.SettingsEditor,
    shortcuts: FeaturePermission.SettingsShortcuts,
    sqlEditor: FeaturePermission.SettingsSqlEditor,
    sqlSnippets: FeaturePermission.SettingsSqlSnippets,
    connectionHealth: FeaturePermission.SettingsConnectionHealth,
    systemMetrics: FeaturePermission.SettingsSystemMetrics,
    /** Runtime (connectors/drivers/JRE) shares plugins permission for now */
    runtime: FeaturePermission.SettingsPlugins,
    ai: FeaturePermission.SettingsAi,
    dataAgent: FeaturePermission.SettingsDataAgent,
    knowledge: FeaturePermission.SettingsDataAgent,
    plugins: FeaturePermission.SettingsPlugins,
    about: FeaturePermission.SettingsAbout,
    integrations: FeaturePermission.SettingsIntegrations,
    mcp: FeaturePermission.SettingsIntegrations,
    secrets: FeaturePermission.SettingsIntegrations,
    backupCenter: FeaturePermission.SettingsBackupCenter,
    configPortability: FeaturePermission.SettingsBasic,
    userPermissions: FeaturePermission.SettingsUserPermissions,
    tenants: FeaturePermission.SettingsTenants,
    projects: FeaturePermission.SettingsProjects,
}

export interface SettingsNavItem {
    id: SettingsSection
    labelKey: string
    /** 租户管理员可见（账号权限 / 集成等） */
    adminOnly?: boolean
    /** 仅 multi 模式显示（租户管理） */
    multiOnly?: boolean
    /** 仅平台超管 + multi（历史兼容；优先用 adminOnly+multiOnly） */
    platformAdminOnly?: boolean
}

export interface SettingsNavGroup {
    labelKey: string
    items: SettingsNavItem[]
}

/**
 * 设置侧栏分组：个人偏好 → 编辑器 → 运行 → AI → 组织安全 → 本机账户。
 * 权限页「设置页入口」与此对齐。
 */
export const SETTINGS_NAV_GROUPS: SettingsNavGroup[] = [
    {
        labelKey: 'settings.nav.groups.preferences',
        items: [], // settings.feature.ts
    },
    {
        labelKey: 'settings.nav.groups.editor',
        items: [], // settings.feature.ts
    },
    {
        labelKey: 'settings.nav.groups.database',
        items: [], // settings.feature.ts
    },
    {
        labelKey: 'settings.nav.groups.ai',
        items: [], // ai.feature.ts
    },
    {
        labelKey: 'settings.nav.groups.security',
        items: [], // settings.feature.ts
    },
    {
        labelKey: 'settings.nav.groups.account',
        items: [], // settings.feature.ts
    },
]

export function flattenSettingsNavItems(options?: {includeAdminOnly?: boolean}): SettingsNavItem[] {
    const includeAdminOnly = options?.includeAdminOnly ?? true
    return mergeSettingsNavGroups(SETTINGS_NAV_GROUPS).flatMap((group) =>
        group.items.filter((item) => includeAdminOnly || (!item.adminOnly && !item.platformAdminOnly)),
    )
}

/** Merge Feature Contract settings contributions into host groups by groupKey. */
export function mergeSettingsNavGroups(base: SettingsNavGroup[]): SettingsNavGroup[] {
    const contributions = listFeatureSettingsContributions()
    if (contributions.length === 0) return base.map((group) => ({...group, items: [...group.items]}))

    const byGroup = new Map<string, SettingsNavItem[]>()
    for (const entry of contributions) {
        const item: SettingsNavItem = {
            id: entry.id as SettingsSection,
            labelKey: entry.labelKey,
            adminOnly: entry.adminOnly,
            multiOnly: entry.multiOnly,
        }
        const list = byGroup.get(entry.groupKey) ?? []
        list.push(item)
        byGroup.set(entry.groupKey, list)
    }

    return base.map((group) => {
        const extra = byGroup.get(group.labelKey) ?? []
        if (extra.length === 0) return {...group, items: [...group.items]}
        const seen = new Set(group.items.map((item) => item.id))
        const merged = [...group.items]
        for (const item of extra) {
            if (seen.has(item.id)) continue
            seen.add(item.id)
            merged.push(item)
        }
        return {...group, items: merged}
    })
}

const STANDARD_HIDDEN_SETTINGS_SECTIONS = new Set<SettingsSection>([
    'ai',
    'dataAgent',
    'knowledge',
    'backupCenter',
])

export function isAiSettingsSection(section: SettingsSection): boolean {
    return section === 'ai' || section === 'dataAgent' || section === 'knowledge'
}

export function isStandardHiddenSettingsSection(section: SettingsSection): boolean {
    return STANDARD_HIDDEN_SETTINGS_SECTIONS.has(section)
}

export function buildSettingsNavGroups(options: {
    isAdmin: boolean
    platformAdmin?: boolean
    multiTenancy?: boolean
    /** Standard edition strips AI settings from the nav (panels still stub if deep-linked). */
    hideAiSections?: boolean
    /** Standard edition hides Backup Center nav (panel still stubs if deep-linked). */
    hideBackupSection?: boolean
}): SettingsNavGroup[] {
    const hideAi = options.hideAiSections ?? import.meta.env.VITE_DATAWISE_EDITION === 'standard'
    const hideBackup =
        options.hideBackupSection ?? import.meta.env.VITE_DATAWISE_EDITION === 'standard'
    return mergeSettingsNavGroups(SETTINGS_NAV_GROUPS).map((group) => ({
        ...group,
        items: group.items.filter((item) => {
            if (hideAi && isAiSettingsSection(item.id)) {
                return false
            }
            if (hideBackup && item.id === 'backupCenter') {
                return false
            }
            if (item.platformAdminOnly) {
                return Boolean(options.platformAdmin && options.multiTenancy)
            }
            if (item.multiOnly && !options.multiTenancy) {
                return false
            }
            if (item.adminOnly) {
                return options.isAdmin
            }
            return true
        }),
    })).filter((group) => group.items.length > 0)
}

export function buildSettingsPermissionNavItems(): Array<{key: FeaturePermissionKey; labelKey: string}> {
    return flattenSettingsNavItems({includeAdminOnly: true})
        .map((item) => {
            const key = SETTINGS_SECTION_PERMISSION_MAP[item.id]
            if (!key) return null
            return {key, labelKey: item.labelKey}
        })
        .filter((item): item is {key: FeaturePermissionKey; labelKey: string} => item != null)
}
