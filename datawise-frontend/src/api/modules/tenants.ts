import {API_PATHS} from '@/shared/api/http/paths'
import {deleteJson, getJson, postJson, putJson} from '@/shared/api/http/request'
import type {TenantAiUsage, TenantMember, TenantSummary} from '@/shared/api/types'

export const tenantsApi = {
    listMine: () => getJson<TenantSummary[]>(API_PATHS.tenants.mine),
    aiUsage: () => getJson<TenantAiUsage>(API_PATHS.tenants.aiUsage),
    listAll: () => getJson<TenantSummary[]>(API_PATHS.tenants.list),
    create: (body: {name: string; slug?: string; adminUserId?: number}) =>
        postJson<TenantSummary>(API_PATHS.tenants.create, body),
    updateStatus: (tenantId: string, status: string) =>
        putJson<TenantSummary>(API_PATHS.tenants.status(tenantId), {status}),
    listMembers: (tenantId: string) =>
        getJson<TenantMember[]>(API_PATHS.tenants.members(tenantId)),
    inviteMember: (tenantId: string, body: {userId?: number; username?: string; roleKeys?: string[]}) =>
        postJson<TenantSummary>(API_PATHS.tenants.members(tenantId), body),
    removeMember: (tenantId: string, userId: number) =>
        deleteJson<void>(API_PATHS.tenants.member(tenantId, userId)),
}
