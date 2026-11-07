import {canPersistLocalResource, canReadResource} from '@/shared/auth/user-resource-policy'
import {UserResource} from '@/shared/auth/user-resource.types'
import {isLoggedIn, readGuestFlag} from '@/shared/auth/session'

/** 访客或未登录：不使用 localStorage / 服务端缓存的 AI 配置，始终回落内置默认（mock）。 */
export function shouldUseBuiltinAppConfig(): boolean {
    if (!canReadResource(UserResource.AppConfig)) return true
    if (readGuestFlag()) return true
    if (!isLoggedIn()) return true
    return !canPersistLocalResource(UserResource.AppConfig)
}
