import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import type {UserResourceType} from '@/features/auth/types/user-resource.types'
import {
    canReadResource,
    canSyncServerResource,
    canWriteResource,
} from '@/features/auth/services/user-resource-policy'
import {isGuestSession} from '@/features/auth/services/user-access-policy'

/** 组件层统一资源策略：读写守卫 + 访客提示。 */
export function useUserResourcePolicy() {
    const {t} = useI18n()

    const isGuest = computed(() => isGuestSession())
    const readOnlyHint = computed(() => (isGuest.value ? t('auth.guestReadOnlyHint') : ''))

    function canRead(resource: UserResourceType): boolean {
        return canReadResource(resource)
    }

    function canWrite(resource: UserResourceType): boolean {
        return canWriteResource(resource)
    }

    function canSyncServer(resource: UserResourceType, serverSyncEnabled = true): boolean {
        return canSyncServerResource(resource, serverSyncEnabled)
    }

    function guardWrite(resource: UserResourceType, action: () => void, onDenied?: () => void): boolean {
        if (!canWriteResource(resource)) {
            onDenied?.()
            return false
        }
        action()
        return true
    }

    return {
        isGuest,
        readOnlyHint,
        canRead,
        canWrite,
        canSyncServer,
        guardWrite,
    }
}
