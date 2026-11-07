import {backendPackagedBaseUrl} from '@/shared/config/runtime-ports'
import {isPackagedRenderer} from '@/shared/api/desktop-renderer'
import {isNativeDesktopHost, readDatawiseHost} from '@/shared/browser/desktop-bridge'
import {readUserConfiguredApiBaseUrl} from '@/shared/api/api-server-prefs'

/** 桌面打包态无 Vite 代理时的默认后端地址 */
export const DEFAULT_DESKTOP_API_BASE = backendPackagedBaseUrl('127.0.0.1')

function normalizeBaseUrl(raw: string): string {
    return raw.trim().replace(/\/$/, '')
}

function readConfiguredBaseUrl(): string {
    const fromEnv = import.meta.env?.VITE_API_BASE_URL?.trim()
    if (fromEnv) return normalizeBaseUrl(fromEnv)

    if (typeof window !== 'undefined') {
        const injected = readDatawiseHost()?.apiBaseUrl?.trim()
        if (injected) return normalizeBaseUrl(injected)
    }
    return ''
}

function shouldUseDesktopDefault(): boolean {
    if (typeof window === 'undefined') return false
    if (isNativeDesktopHost()) return true
    return isPackagedRenderer()
}

/**
 * 统一读取 API 基址。
 * 优先级：设置中的云端地址 → 环境变量 / 桌面桥 → 桌面本地默认 → 空（Vite 代理相对路径）
 */
export function readApiBaseUrl(): string {
    const userRemote = readUserConfiguredApiBaseUrl()
    if (userRemote) return userRemote

    const configured = readConfiguredBaseUrl()
    if (configured) return configured
    if (shouldUseDesktopDefault()) return DEFAULT_DESKTOP_API_BASE
    return ''
}

/** 本地模式下将解析到的地址（忽略用户云端偏好），用于设置页展示 */
export function resolveLocalApiBaseUrlLabel(): string {
    const configured = readConfiguredBaseUrl()
    if (configured) return configured
    if (shouldUseDesktopDefault()) return DEFAULT_DESKTOP_API_BASE
    if (typeof window !== 'undefined' && window.location?.origin) {
        return `${window.location.origin}/api`
    }
    return '/api'
}
