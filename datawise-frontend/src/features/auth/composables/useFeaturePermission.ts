import {computed} from 'vue'
import {
    canAccessFeature,
    getActiveFeaturePermissions,
} from '@/features/auth/services/feature-permission.service'
import type {FeaturePermissionKey} from '@/features/auth/types/feature-permission.types'

export function useFeaturePermission() {
    const permissions = computed(() => getActiveFeaturePermissions())

    function can(feature: FeaturePermissionKey): boolean {
        return permissions.value[feature] === true
    }

    return {
        permissions,
        can,
        canAccessFeature,
    }
}
