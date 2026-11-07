import type {UserAdminApi} from '@/shared/api/types'
import type {
    FeaturePermissionMap,
    TenantRoleSummary,
    UserPermissionSummary,
} from '@/shared/auth/feature-permission.types'
import type {
    SaveTenantRoleRequest,
    TenantRoleDto,
    UpdateUserPermissionsRequest,
    UserPermissionSummaryDto,
} from '@/shared/api/generated'
import {API_PATHS} from '@/shared/api/http/paths'
import {deleteJson, getJson, postJson, putJson} from '@/shared/api/http/request'

function mapPermissions(raw: Record<string, boolean> | undefined): FeaturePermissionMap {
    return {...(raw ?? {})} as FeaturePermissionMap
}

function mapUser(wire: UserPermissionSummaryDto): UserPermissionSummary {
    return {
        id: Number(wire.id ?? 0),
        username: String(wire.username ?? ''),
        displayName: String(wire.displayName ?? ''),
        guest: Boolean(wire.guest),
        admin: Boolean(wire.admin),
        featurePermissions: mapPermissions(wire.featurePermissions),
        roleIds: wire.roleIds,
        roleKeys: wire.roleKeys,
        usesLegacyPermissions: wire.usesLegacyPermissions,
    }
}

function mapRole(wire: TenantRoleDto): TenantRoleSummary {
    return {
        id: String(wire.id ?? ''),
        key: String(wire.key ?? ''),
        name: String(wire.name ?? ''),
        system: Boolean(wire.system),
        permissions: wire.permissions ? mapPermissions(wire.permissions) : undefined,
    }
}

/** User-admin HTTP client — wire DTOs from OpenAPI. */
export function createHttpUserAdminApi(): UserAdminApi {
    return {
        listUsers: async () => {
            const list = await getJson<UserPermissionSummaryDto[]>(API_PATHS.admin.users)
            return (list ?? []).map(mapUser)
        },
        listTenantRoles: async () => {
            const list = await getJson<TenantRoleDto[]>(API_PATHS.admin.tenantRoles)
            return (list ?? []).map(mapRole)
        },
        createTenantRole: async (body) => {
            const request: SaveTenantRoleRequest = {
                key: body.key,
                name: body.name,
                permissions: body.permissions,
            }
            return mapRole(await postJson<TenantRoleDto>(API_PATHS.admin.tenantRoles, request))
        },
        updateTenantRole: async (roleId, body) => {
            const request: SaveTenantRoleRequest = {
                key: body.key,
                name: body.name,
                permissions: body.permissions,
            }
            return mapRole(await putJson<TenantRoleDto>(API_PATHS.admin.tenantRole(roleId), request))
        },
        deleteTenantRole: async (roleId) =>
            deleteJson<void>(API_PATHS.admin.tenantRole(roleId)),
        updateUserPermissions: async (userId, featurePermissions) => {
            const body: UpdateUserPermissionsRequest = {featurePermissions}
            return mapUser(
                await putJson<UserPermissionSummaryDto>(
                    API_PATHS.admin.userPermissions(userId),
                    body,
                ),
            )
        },
        updateUserRoles: async (userId, roleIds) =>
            mapUser(
                await putJson<UserPermissionSummaryDto>(
                    API_PATHS.admin.userRoles(userId),
                    {roleIds},
                ),
            ),
    }
}
