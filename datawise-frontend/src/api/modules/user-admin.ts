import {api} from '@/shared/api'
import type {
    FeaturePermissionMap,
    TenantRoleSummary,
    UserPermissionSummary,
} from '@/features/auth/types/feature-permission.types'

export const userAdminApi = {
    listUsers: () => api.userAdmin.listUsers(),
    listTenantRoles: () => api.userAdmin.listTenantRoles(),
    createTenantRole: (body: {key: string; name: string; permissions: FeaturePermissionMap}) =>
        api.userAdmin.createTenantRole(body),
    updateTenantRole: (
        roleId: string,
        body: {key?: string; name: string; permissions: FeaturePermissionMap},
    ) => api.userAdmin.updateTenantRole(roleId, body),
    deleteTenantRole: (roleId: string) => api.userAdmin.deleteTenantRole(roleId),
    updateUserPermissions: (userId: number, featurePermissions: FeaturePermissionMap) =>
        api.userAdmin.updateUserPermissions(userId, featurePermissions),
    updateUserRoles: (userId: number, roleIds: string[]) =>
        api.userAdmin.updateUserRoles(userId, roleIds),
}

export type {UserPermissionSummary, TenantRoleSummary}
