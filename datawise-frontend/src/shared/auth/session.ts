import {
    clearDesktopSessionKeys,
    persistDesktopUiKeys,
} from '@/shared/browser/desktop-ui-store'

export const SESSION_KEY = 'dw-cli-session-id'
export const USERNAME_KEY = 'dw-cli-username'
export const USER_ID_KEY = 'dw-cli-user-id'
export const GUEST_KEY = 'dw-cli-is-guest'
export const EXPIRES_AT_KEY = 'dw-cli-session-expires-at'

export function isLoggedIn(): boolean {
    return Boolean(localStorage.getItem(SESSION_KEY))
}

export function readGuestFlag(): boolean {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem(GUEST_KEY) === '1'
}

export function readSessionExpiresAt(): number | null {
    const raw = localStorage.getItem(EXPIRES_AT_KEY)
    if (!raw) return null
    const value = Number(raw)
    return Number.isFinite(value) ? value : null
}

export function isLocalSessionExpired(now = Date.now()): boolean {
    const expiresAt = readSessionExpiresAt()
    return expiresAt != null && expiresAt <= now
}

export function readUserId(): number | null {
    const raw = localStorage.getItem(USER_ID_KEY)
    if (!raw) return null
    const value = Number(raw)
    return Number.isFinite(value) ? value : null
}

export function persistSession(
    sessionId: string,
    userName: string,
    isGuest = false,
    expiresAtEpochMs?: number | null,
    userId?: number | null,
): void {
    localStorage.setItem(SESSION_KEY, sessionId)
    localStorage.setItem(USERNAME_KEY, userName)
    localStorage.setItem(GUEST_KEY, isGuest ? '1' : '0')
    if (userId != null && Number.isFinite(userId)) {
        localStorage.setItem(USER_ID_KEY, String(userId))
    } else {
        localStorage.removeItem(USER_ID_KEY)
    }
    if (expiresAtEpochMs != null && Number.isFinite(expiresAtEpochMs)) {
        localStorage.setItem(EXPIRES_AT_KEY, String(expiresAtEpochMs))
    } else {
        localStorage.removeItem(EXPIRES_AT_KEY)
    }
    persistDesktopUiKeys({
        sessionId,
        userName,
        guest: isGuest ? '1' : '0',
        expiresAt: expiresAtEpochMs != null && Number.isFinite(expiresAtEpochMs)
            ? String(expiresAtEpochMs)
            : null,
        userId: userId != null && Number.isFinite(userId) ? String(userId) : null,
    })
}

export function clearSession(): void {
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(USERNAME_KEY)
    localStorage.removeItem(USER_ID_KEY)
    localStorage.removeItem(GUEST_KEY)
    localStorage.removeItem(EXPIRES_AT_KEY)
    clearDesktopSessionKeys()
}
