import {readGuestFlag} from '@/shared/auth/session'

/** 当前是否为访客会话（不持久化个人配置）。 */
export function isGuestSession(): boolean {
    return readGuestFlag()
}

/** 当前是否为已登录注册用户。 */
export function isRegisteredUserSession(): boolean {
    return !isGuestSession()
}

/** 注册用户才写入 localStorage 用户级缓存。 */
export function canPersistUserScopedLocalData(): boolean {
    return isRegisteredUserSession()
}
