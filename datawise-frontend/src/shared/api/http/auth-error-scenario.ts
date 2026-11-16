import {ApiError} from '@/shared/api/http/api-error'

/**
 * 认证 / 权限类 API 失败的场景化判定。
 *
 * 同一个 403 在不同身份下含义完全不同：
 * - 游客 / 未登录：是「这个功能登录后才能用」，不该甩一句「当前账号没有此操作权限」；
 * - 已登录用户：才真的是账号权限不足；
 * - 会话失效恢复中 / 后台自动请求：任何提示都是噪音，交给恢复流程处理。
 *
 * 纯函数，不读 localStorage / store，方便回归测试直接覆盖各分支。
 */

export type AuthFailureKind =
    | 'unauthorized'
    | 'guest-not-allowed'
    | 'permission'
    | 'admin'
    | 'other'

export type AuthErrorScene = {
    /** 游客或尚未登录 */
    isGuest: boolean
    /** 401 会话恢复进行中（含 API 被临时拦截） */
    recovering: boolean
    /** 启动 / 轮询 / 状态同步等后台请求，非用户主动操作 */
    background: boolean
}

export type AuthErrorToastPlan =
    /** 完全不弹 Toast（会话恢复、后台任务、非认证错误以外的场景） */
    | {kind: 'silent'}
    /** 游客友好引导：说明「登录后可解锁」，并给出登录入口 */
    | {kind: 'guest-hint'; messageKey: string}
    /** 走原有稳定错误码本地化（登录用户权限不足等） */
    | {kind: 'normal'}

const UNAUTHORIZED_CODES = new Set([
    'UNAUTHORIZED',
    'HTTP 401',
    'HTTP_401',
    '401',
])

const GUEST_NOT_ALLOWED_CODES = new Set(['GUEST_NOT_ALLOWED'])

const PERMISSION_CODES = new Set([
    'PERMISSION_DENIED',
    'FORBIDDEN',
    'HTTP 403',
    'HTTP_403',
    '403',
])

const ADMIN_CODES = new Set([
    'ADMIN_REQUIRED',
    'PLATFORM_ADMIN_REQUIRED',
])

/** 后端稳定码优先，其次才是 msg（可能是中文可读文案 / HTTP 状态）。 */
export function readAuthFailureCode(error: unknown): string | null {
    if (!(error instanceof ApiError)) return null
    if (error.data && typeof error.data === 'object') {
        const code = (error.data as {errorCode?: unknown}).errorCode
        if (typeof code === 'string' && code.trim()) return code.trim()
    }
    return error.message?.trim() || null
}

export function classifyAuthFailure(error: unknown): AuthFailureKind {
    const code = readAuthFailureCode(error)
    if (!code) return 'other'
    const normalized = code.toUpperCase()
    if (UNAUTHORIZED_CODES.has(normalized) || /^HTTP 401\b/.test(normalized)) return 'unauthorized'
    if (GUEST_NOT_ALLOWED_CODES.has(normalized) || code.includes('访客模式下无法')) {
        return 'guest-not-allowed'
    }
    if (ADMIN_CODES.has(normalized)) return 'admin'
    if (
        PERMISSION_CODES.has(normalized)
        || /^HTTP 403\b/.test(normalized)
        || code.includes('没有此操作权限')
        || code.includes('权限不足')
    ) {
        return 'permission'
    }
    return 'other'
}

/**
 * 决定全局 API 错误通知怎么展示：
 * 1. 401 / 会话恢复中 / 后台请求 → 静默；
 * 2. 游客遇到权限类失败 → 友好引导（带登录入口）；
 * 3. 已登录用户权限不足 → 保留原有「当前账号没有此操作权限」等文案；
 * 4. 其它错误 → 原有流程。
 */
export function resolveAuthErrorToastPlan(
    error: unknown,
    scene: AuthErrorScene,
): AuthErrorToastPlan {
    const kind = classifyAuthFailure(error)
    if (kind === 'other') return {kind: 'normal'}
    if (kind === 'unauthorized') return {kind: 'silent'}
    if (scene.recovering || scene.background) return {kind: 'silent'}
    if (!scene.isGuest) return {kind: 'normal'}
    if (kind === 'guest-not-allowed') {
        return {kind: 'guest-hint', messageKey: 'auth.guestNotAllowed'}
    }
    return {kind: 'guest-hint', messageKey: 'auth.guestFeatureLocked'}
}
