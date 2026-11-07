import {
    UserResource,
    type StorageScope,
    type UserResourceRule,
    type UserResourceType,
} from '@/shared/auth/user-resource.types'
import {isGuestSession, isRegisteredUserSession} from '@/shared/auth/user-access-policy'
import {resolveUserStorageKey} from '@/shared/config/app-config-storage-scope'

/** 所有用户资源的读写与隔离规则（单一事实来源）。 */
const RESOURCE_RULES: Record<UserResourceType, UserResourceRule> = {
    [UserResource.LayoutMenu]: {
        localScope: 'user',
        serverScope: 'user',
        guestRead: true,
        guestWrite: false,
    },
    [UserResource.AppConfig]: {
        localScope: 'user',
        serverScope: 'user',
        guestRead: false,
        guestWrite: false,
    },
    [UserResource.AiPreferences]: {
        localScope: 'user',
        serverScope: 'user',
        guestRead: false,
        guestWrite: false,
    },
    [UserResource.AiKnowledge]: {
        localScope: 'none',
        serverScope: 'user',
        guestRead: true,
        guestWrite: false,
    },
    [UserResource.AiChat]: {
        localScope: 'user',
        serverScope: 'none',
        guestRead: true,
        guestWrite: false,
    },
    [UserResource.AiAnalysisTemplates]: {
        localScope: 'user',
        serverScope: 'none',
        guestRead: true,
        guestWrite: false,
    },
    [UserResource.DataQualityTemplates]: {
        localScope: 'user',
        serverScope: 'none',
        guestRead: true,
        guestWrite: false,
    },
    [UserResource.ConnectionCatalog]: {
        localScope: 'none',
        serverScope: 'session',
        guestRead: true,
        guestWrite: true,
    },
    [UserResource.WorkspaceScripts]: {
        localScope: 'none',
        serverScope: 'user',
        guestRead: true,
        guestWrite: false,
    },
    [UserResource.WorkspaceUserData]: {
        localScope: 'none',
        serverScope: 'user',
        guestRead: true,
        guestWrite: false,
    },
    [UserResource.SqlSnippetsPersonal]: {
        localScope: 'user',
        serverScope: 'user',
        guestRead: true,
        guestWrite: false,
    },
    [UserResource.SqlSnippetsShared]: {
        localScope: 'global',
        serverScope: 'global',
        guestRead: true,
        guestWrite: false,
    },
    [UserResource.MigrationHistory]: {
        localScope: 'user',
        serverScope: 'none',
        guestRead: true,
        guestWrite: false,
    },
    [UserResource.PinnedExplorerNodes]: {
        localScope: 'user',
        serverScope: 'none',
        guestRead: true,
        guestWrite: false,
    },
    [UserResource.GridViewState]: {
        localScope: 'user',
        serverScope: 'none',
        guestRead: true,
        guestWrite: false,
    },
    [UserResource.EditorPreferences]: {
        localScope: 'user',
        serverScope: 'user',
        guestRead: true,
        guestWrite: false,
    },
    [UserResource.ThemePreferences]: {
        localScope: 'user',
        serverScope: 'user',
        guestRead: true,
        guestWrite: false,
    },
    [UserResource.UpdatePreferences]: {
        localScope: 'global',
        serverScope: 'global',
        guestRead: true,
        guestWrite: false,
    },
}

export function getResourceRule(resource: UserResourceType): UserResourceRule {
    return RESOURCE_RULES[resource]
}

export function canReadResource(resource: UserResourceType): boolean {
    const rule = getResourceRule(resource)
    if (isGuestSession()) return rule.guestRead
    return isRegisteredUserSession()
}

export function canWriteResource(resource: UserResourceType): boolean {
    const rule = getResourceRule(resource)
    if (isGuestSession()) return rule.guestWrite
    return isRegisteredUserSession()
}

/** 是否允许写入 localStorage（按资源 localScope 裁决）。 */
export function canPersistLocalResource(resource: UserResourceType): boolean {
    if (!canWriteResource(resource)) return false
    const scope = getResourceRule(resource).localScope
    return scope === 'user' || scope === 'global'
}

/** 是否允许同步到服务端（须注册用户；具体范围见 serverScope）。 */
export function canSyncServerResource(resource: UserResourceType, serverSyncEnabled = true): boolean {
    if (!serverSyncEnabled || !isRegisteredUserSession()) return false
    const scope = getResourceRule(resource).serverScope
    return scope === 'user' || scope === 'global' || scope === 'session'
}

export function resolveResourceStorageKey(resource: UserResourceType, baseKey: string): string | null {
    const scope = getResourceRule(resource).localScope
    if (scope === 'none') return null
    if (scope === 'global') return baseKey
    if (scope === 'user') return resolveUserStorageKey(baseKey)
    return baseKey
}

export function localScopeOf(resource: UserResourceType): StorageScope {
    return getResourceRule(resource).localScope
}

export function serverScopeOf(resource: UserResourceType): StorageScope {
    return getResourceRule(resource).serverScope
}
