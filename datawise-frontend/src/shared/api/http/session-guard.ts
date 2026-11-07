import {ApiError, isUnauthorizedApiError} from '@/shared/api/http/api-error'
import {SESSION_KEY} from '@/shared/auth/session'

export type SessionGuardOptions = {
    authBypass?: boolean
    /**
     * Session id present on the request when it was sent.
     * When set (including `null` = anonymous), a 401 only triggers recovery if it still
     * matches the active localStorage session — so login rotation cannot be wiped by
     * in-flight responses that still carried the previous session id.
     * Omit the field to keep legacy “any UNAUTHORIZED recovers” behavior.
     */
    requestSessionId?: string | null
}

let sessionBlocked = false
/** 401 恢复进行中：放行新会话后的 scoped reload，并忽略期间再次触发的恢复 */
let recoveryInProgress = false
let recoveryHandler: ((options?: SessionGuardOptions) => void) | null = null

export function registerUnauthorizedRecoveryHandler(
    handler: ((options?: SessionGuardOptions) => void) | null,
): void {
    recoveryHandler = handler
}

export function isApiSessionBlocked(): boolean {
    return sessionBlocked
}

export function isUnauthorizedRecoveryInProgress(): boolean {
    return recoveryInProgress
}

export function setUnauthorizedRecoveryInProgress(active: boolean): void {
    recoveryInProgress = active
}

export function shouldBypassSessionGuard(options?: SessionGuardOptions): boolean {
    return options?.authBypass === true
}

/** Active UI session id (localStorage); null when logged out / SSR. */
export function readActiveSessionId(): string | null {
    if (typeof localStorage === 'undefined') return null
    const value = localStorage.getItem(SESSION_KEY)
    return value && value.trim() ? value.trim() : null
}

/**
 * Whether a 401 for `requestSessionId` should clear the current login.
 * Bound requests: only when the failing credential is still the active one.
 */
export function shouldRecoverUnauthorizedForRequestSession(
    requestSessionId: string | null | undefined,
    options?: {bound?: boolean; activeSessionId?: string | null},
): boolean {
    // Unbound callers (no requestSessionId field) keep historical behavior.
    if (options?.bound === false) return true
    if (options?.bound !== true && requestSessionId === undefined) return true

    const current = options?.activeSessionId !== undefined
        ? options.activeSessionId
        : readActiveSessionId()
    const requested = requestSessionId != null && String(requestSessionId).trim()
        ? String(requestSessionId).trim()
        : null

    // Anonymous request failed after a newer login already landed — ignore.
    if (requested == null) {
        return current == null
    }
    // Stale credential from a previous login/guest session — ignore.
    return requested === current
}

export function scheduleUnauthorizedRecovery(options?: SessionGuardOptions): void {
    if (shouldBypassSessionGuard(options)) return
    // 恢复流程中已换成新游客会话：勿再次拦截，否则 resetUserScopedState 的 API 会被挡掉
    if (recoveryInProgress) return
    sessionBlocked = true
    recoveryHandler?.(options)
}

export function rejectBlockedApiRequest(): never {
    throw new ApiError('UNAUTHORIZED')
}

export function maybeRejectBlockedRequest(options?: SessionGuardOptions): void {
    if (sessionBlocked && !shouldBypassSessionGuard(options)) {
        rejectBlockedApiRequest()
    }
}

export function notifyUnauthorizedIfNeeded(error: ApiError, options?: SessionGuardOptions): void {
    if (!isUnauthorizedApiError(error)) return
    const bound = options != null && Object.prototype.hasOwnProperty.call(options, 'requestSessionId')
    if (!shouldRecoverUnauthorizedForRequestSession(options?.requestSessionId, {bound})) {
        return
    }
    scheduleUnauthorizedRecovery(options)
}

/** 会话失效 / 恢复中的失败：配置落盘等路径应静默，避免控制台刷屏 */
export function isQuietAuthFailure(error: unknown): boolean {
    if (sessionBlocked) return true
    return isUnauthorizedApiError(error)
}

/**
 * Background config sync (app.xml / snippets / detail JSON): also quiet when the
 * backend is simply not reachable — expected during boot / offline, not a code bug.
 * (Message strings match {@link HTTP_NOT_READY} / {@link HTTP_TIMEOUT} in request.ts —
 * keep inline to avoid a circular import with request ↔ session-guard.)
 */
export function isQuietBackgroundSyncFailure(error: unknown): boolean {
    if (isQuietAuthFailure(error)) return true
    const message = error instanceof Error ? error.message.trim() : String(error ?? '')
    return message === 'HTTP_TIMEOUT'
        || message.startsWith('HTTP API request failed')
}

export function unblockApiSession(): void {
    sessionBlocked = false
}

/** @internal test helper */
export function resetUnauthorizedRecoveryState(): void {
    sessionBlocked = false
    recoveryInProgress = false
    recoveryHandler = null
}

/** @internal test helper */
export function markApiSessionBlockedForTest(): void {
    sessionBlocked = true
}
