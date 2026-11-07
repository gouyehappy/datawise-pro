import {computed} from 'vue'
import type {UserResourceType} from '@/features/auth/types/user-resource.types'
import {useUserResourcePolicy} from '@/features/auth/composables/useUserResourcePolicy'

/** 设置页 / 工作区写操作守卫：只读时依赖页面 guest-notice + 控件 disabled，不再弹 Toast。 */
export function useResourceWriteGuard(resource: UserResourceType) {
    const policy = useUserResourcePolicy()
    const readOnly = computed(() => !policy.canWrite(resource))
    const hint = policy.readOnlyHint

    function denyIfReadOnly(): boolean {
        return readOnly.value
    }

    function guardWrite(action: () => void): boolean {
        return policy.guardWrite(resource, action)
    }

    return {readOnly, hint, denyIfReadOnly, guardWrite}
}
