import {isRegisteredUserSession} from '@/shared/auth/user-access-policy'
import {UserResource} from '@/shared/auth/user-resource.types'
import {canSyncServerResource} from '@/shared/auth/user-resource-policy'

/** 登录切换期间可关闭，避免 debounce 写入落到错误会话。 */
let serverSyncEnabled = true

export function setServerConfigSyncEnabled(enabled: boolean): void {
    serverSyncEnabled = enabled
}

/** 注册用户且未处于会话切换窗口时，才向 config/*.xml 同步。 */
export function shouldSyncConfigToServer(): boolean {
    return canSyncServerResource(UserResource.AppConfig, serverSyncEnabled)
}

/** 注册用户才写入 localStorage 中的用户级缓存；访客仅会话内有效。 */
export function shouldPersistUserScopedLocalData(): boolean {
    return isRegisteredUserSession()
}

export {isRegisteredUserSession, isGuestSession} from '@/shared/auth/user-access-policy'
export {
    canReadResource,
    canWriteResource,
    canPersistLocalResource,
    canSyncServerResource,
} from '@/shared/auth/user-resource-policy'
export {UserResource} from '@/shared/auth/user-resource.types'
