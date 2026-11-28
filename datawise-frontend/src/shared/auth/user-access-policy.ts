import {isLoggedIn, readGuestFlag} from '@/shared/auth/session'

/** 当前是否为访客会话（不持久化个人配置）。 */
export function isGuestSession(): boolean {
    return readGuestFlag()
}

/**
 * 游客或尚未建立会话（启动早期、退出登录、会话被清空）都按游客体验处理。
 * 仅 `readGuestFlag()` 在无 GUEST_KEY 时会误判为注册用户，故叠加登录态判断。
 */
export function isGuestOrAnonymousSession(): boolean {
    if (typeof localStorage === 'undefined') return true
    return readGuestFlag() || !isLoggedIn()
}

/** 已登录且非访客（clearSession 后无 GUEST_KEY 时不得误判为注册用户）。 */
export function isRegisteredUserSession(): boolean {
    return !isGuestOrAnonymousSession()
}

/** 注册用户才写入 localStorage 用户级缓存。 */
export function canPersistUserScopedLocalData(): boolean {
    return isRegisteredUserSession()
}
