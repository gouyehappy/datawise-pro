import {readGuestFlag, readUserId, USERNAME_KEY} from '@/shared/auth/session'

export const APP_CONFIG_KEY = 'dw-app-config'

/** 用户全局偏好：不随租户切换（主题 / 编辑器 / app-config）。 */
const USER_GLOBAL_STORAGE_BASE_KEYS = [
    APP_CONFIG_KEY,
    'dw-cli-editor-settings',
    'dw-cli-theme-prefs',
    'dw-cli-ai-assistant-float',
] as const

/** 连接/组织相关：随租户切换隔离。 */
const USER_TENANT_STORAGE_BASE_KEYS = [
    'dw-cli-ai-chat',
    'dw-cli-ai-assistant-chat',
    'dw-cli-ai-analysis-templates',
    'datawise-pinned-explorer-nodes',
    'dw-grid-view-state-v1',
    'datawise.table-migration.history',
] as const

const SCOPED_STORAGE_BASE_KEYS = [
    ...USER_GLOBAL_STORAGE_BASE_KEYS,
    ...USER_TENANT_STORAGE_BASE_KEYS,
] as const

let activeUserScope = 'guest'
let activeTenantScope = 'guest'
let activeAppConfigStorageKey = `${APP_CONFIG_KEY}:${activeUserScope}`

export function resolveAppConfigStorageKey(): string {
    return activeAppConfigStorageKey
}

/**
 * 按当前登录用户解析 localStorage key。
 * 连接相关 key 自动带上租户后缀；全局偏好仅按用户隔离。
 */
export function resolveUserStorageKey(baseKey: string): string {
    if ((USER_TENANT_STORAGE_BASE_KEYS as readonly string[]).includes(baseKey)) {
        return `${baseKey}:${activeTenantScope}`
    }
    return `${baseKey}:${activeUserScope}`
}

function migrateLegacyScopedKey(baseKey: string, scope: string, legacyScopes: string[] = []): void {
    if (typeof localStorage === 'undefined') return
    const scopedKey = `${baseKey}:${scope}`
    if (localStorage.getItem(scopedKey)) return

    const legacy = localStorage.getItem(baseKey)
    if (legacy) {
        localStorage.setItem(scopedKey, legacy)
        return
    }

    for (const legacyScope of legacyScopes) {
        const legacyKey = `${baseKey}:${legacyScope}`
        const legacyValue = localStorage.getItem(legacyKey)
        if (legacyValue) {
            localStorage.setItem(scopedKey, legacyValue)
            return
        }
    }
}

export interface AppConfigStorageScopeOptions {
    userId?: number | null
    userName?: string
    isGuest: boolean
    tenantId?: string | null
}

/** 切换登录用户 / 租户时更新 localStorage 命名空间。 */
export function setAppConfigStorageScope(options: AppConfigStorageScopeOptions): void {
    const userScope = options.isGuest
        ? 'guest'
        : `user:${options.userId ?? 'unknown'}`
    const tenantId = (options.tenantId || 'default').trim() || 'default'
    const tenantScope = options.isGuest
        ? 'guest'
        : `${userScope}:tenant:${tenantId}`

    activeUserScope = userScope
    activeTenantScope = tenantScope
    activeAppConfigStorageKey = `${APP_CONFIG_KEY}:${userScope}`

    const legacyScopes = !options.isGuest && options.userName?.trim()
        ? [options.userName.trim()]
        : []

    if (typeof localStorage !== 'undefined') {
        for (const baseKey of USER_GLOBAL_STORAGE_BASE_KEYS) {
            migrateLegacyScopedKey(baseKey, userScope, legacyScopes)
        }
        for (const baseKey of USER_TENANT_STORAGE_BASE_KEYS) {
            // 从旧 user-only key 迁到 user+tenant（默认租户）
            migrateLegacyScopedKey(baseKey, tenantScope, [userScope, ...legacyScopes])
        }
    }
}

/**
 * 从 localStorage 会话快照同步命名空间（冷启动 / 会话恢复）。
 * 可传入已解析的会话字段覆盖快照（例如 applySessionInfo 后的 tenantId）。
 */
export function syncAppConfigStorageScopeFromSession(
    overrides?: Partial<AppConfigStorageScopeOptions>,
): void {
    setAppConfigStorageScope({
        userId: overrides?.userId ?? readUserId(),
        userName: overrides?.userName ?? localStorage.getItem(USERNAME_KEY) ?? undefined,
        isGuest: overrides?.isGuest ?? readGuestFlag(),
        tenantId: overrides?.tenantId,
    })
}

// Cold start: align keys with the session already in localStorage before any store reads.
// Otherwise early writes land under the default `:guest` namespace and vanish after auth sync.
if (typeof localStorage !== 'undefined') {
    try {
        syncAppConfigStorageScopeFromSession()
    } catch {
        /* ignore — session snapshot unavailable in constrained hosts */
    }
}

/** @deprecated 仅测试兼容：全部 scoped keys 列表 */
export const __TEST_SCOPED_STORAGE_BASE_KEYS = SCOPED_STORAGE_BASE_KEYS
