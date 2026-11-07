import {UserResource} from '@/features/auth/types/user-resource.types'
import {useResourceWriteGuard} from '@/features/auth/composables/useResourceWriteGuard'

/** @deprecated 使用 useResourceWriteGuard(UserResource.*) 按资源裁决 */
export function useGuestReadOnly() {
    return useResourceWriteGuard(UserResource.AppConfig)
}
