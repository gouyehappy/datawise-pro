/** 客户端 API 服务器偏好：本地 / 云端，持久化到 localStorage */

export type ApiServerMode = 'local' | 'remote'

export interface ApiServerPreferences {
    mode: ApiServerMode
    /** 云端模式下的 API 基址，如 https://api.example.com（无尾斜杠） */
    remoteUrl: string
}

export const API_SERVER_STORAGE_KEY = 'dw-cli-api-server'

export const DEFAULT_API_SERVER_PREFERENCES: ApiServerPreferences = {
    mode: 'local',
    remoteUrl: '',
}

/** 规范化并校验 URL；非法时返回 null */
export function normalizeApiServerUrl(raw: string): string | null {
    const trimmed = raw.trim().replace(/\/$/, '')
    if (!trimmed) return null
    let parsed: URL
    try {
        parsed = new URL(trimmed)
    } catch {
        return null
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null
    }
    if (!parsed.hostname) return null
    let path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '')
    // 常见误填：根地址末尾带 /api（实际请求路径已含 /api/...）
    if (path === '/api') {
        path = ''
    }
    return parsed.origin + path
}

export function loadApiServerPreferences(): ApiServerPreferences {
    if (typeof localStorage === 'undefined') {
        return {...DEFAULT_API_SERVER_PREFERENCES}
    }
    try {
        const raw = localStorage.getItem(API_SERVER_STORAGE_KEY)
        if (!raw) return {...DEFAULT_API_SERVER_PREFERENCES}
        const parsed = JSON.parse(raw) as Partial<ApiServerPreferences>
        const mode: ApiServerMode = parsed.mode === 'remote' ? 'remote' : 'local'
        const remoteUrl =
            typeof parsed.remoteUrl === 'string' ? parsed.remoteUrl.trim().replace(/\/$/, '') : ''
        return {mode, remoteUrl}
    } catch {
        return {...DEFAULT_API_SERVER_PREFERENCES}
    }
}

export function saveApiServerPreferences(prefs: ApiServerPreferences): void {
    if (typeof localStorage === 'undefined') return
    const mode: ApiServerMode = prefs.mode === 'remote' ? 'remote' : 'local'
    const remoteUrl = typeof prefs.remoteUrl === 'string' ? prefs.remoteUrl.trim().replace(/\/$/, '') : ''
    localStorage.setItem(API_SERVER_STORAGE_KEY, JSON.stringify({mode, remoteUrl}))
}

/**
 * 用户显式选择云端且 URL 合法时返回基址；否则 null（走本地/环境默认解析）。
 */
export function readUserConfiguredApiBaseUrl(): string | null {
    const prefs = loadApiServerPreferences()
    if (prefs.mode !== 'remote') return null
    return normalizeApiServerUrl(prefs.remoteUrl)
}
