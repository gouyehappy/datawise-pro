import type {
    AuthApi,
    AuthSessionPolicy,
    AuthUserProfile,
    LoginResult,
    SessionInfo,
    TenantSummary,
} from '@/shared/api/types'
import type {
    AuthSessionPolicyDto,
    ChangePasswordRequest,
    LoginResult as WireLoginResult,
    OidcConfigDto,
    RegisterRequest,
    SaveOidcConfigRequest as WireSaveOidcConfigRequest,
    SessionInfo as WireSessionInfo,
    TenantSummaryDto,
} from '@/shared/api/generated'
import type {HttpRequestOptions} from '@/shared/api/http/request'
import {getJson, postForm, postJson, putJson} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'

/** Host-only fields not yet in exported OpenAPI schemas. */
type LoginWire = WireLoginResult & {
    mustChangePassword?: boolean
}

type SessionWire = WireSessionInfo & {
    hasLocalPassword?: boolean
    mustChangePassword?: boolean
}

function mapTenant(wire: TenantSummaryDto): TenantSummary {
    return {
        id: String(wire.id ?? ''),
        slug: String(wire.slug ?? ''),
        name: String(wire.name ?? ''),
        status: String(wire.status ?? ''),
        roleKeys: wire.roleKeys,
    }
}

function mapLogin(wire: LoginWire): LoginResult {
    return {
        sessionId: String(wire.sessionId ?? ''),
        userName: wire.userName,
        securityConfigType: wire.securityConfigType,
        expiresAtEpochMs: wire.expiresAtEpochMs ?? null,
        userId: wire.userId ?? null,
        admin: wire.admin,
        featurePermissions: wire.featurePermissions,
        tenantId: wire.tenantId ?? null,
        tenantName: wire.tenantName ?? null,
        tenancyMode: wire.tenancyMode ?? null,
        platformAdmin: wire.platformAdmin,
        tenants: (wire.tenants ?? []).map(mapTenant),
        mustChangePassword: Boolean(wire.mustChangePassword),
    }
}

function mapSession(wire: SessionWire): SessionInfo {
    return {
        sessionId: String(wire.sessionId ?? ''),
        userName: String(wire.userName ?? ''),
        guest: Boolean(wire.guest),
        expiresAtEpochMs: wire.expiresAtEpochMs ?? null,
        userId: wire.userId ?? null,
        admin: wire.admin,
        featurePermissions: wire.featurePermissions,
        tenantId: wire.tenantId ?? null,
        tenantName: wire.tenantName ?? null,
        tenancyMode: wire.tenancyMode ?? null,
        platformAdmin: wire.platformAdmin,
        tenants: (wire.tenants ?? []).map(mapTenant),
        hasLocalPassword: Boolean(wire.hasLocalPassword),
        mustChangePassword: Boolean(wire.mustChangePassword),
    }
}

function mapSessionPolicy(wire: AuthSessionPolicyDto): AuthSessionPolicy {
    return {
        ttlMinutes: Number(wire.ttlMinutes ?? 0),
        slidingRenewal: Boolean(wire.slidingRenewal),
    }
}

function mapOidcConfig(wire: OidcConfigDto): import('@/shared/api/types').OidcConfig {
    return {
        enabled: Boolean(wire.enabled),
        issuer: wire.issuer ?? null,
        clientId: wire.clientId ?? null,
        hasClientSecret: Boolean(wire.hasClientSecret),
        redirectUri: wire.redirectUri ?? null,
        frontendRedirectBase: wire.frontendRedirectBase ?? null,
        scopes: wire.scopes ?? null,
        localLoginEnabled: Boolean(wire.localLoginEnabled),
        tenantClaim: wire.tenantClaim ?? null,
        tenantClaimMap: wire.tenantClaimMap ?? null,
        defaultOidcRoleKey: wire.defaultOidcRoleKey ?? null,
        autoProvisionMembership: wire.autoProvisionMembership,
        roleClaim: wire.roleClaim ?? null,
        roleClaimMap: wire.roleClaimMap ?? null,
        syncRolesFromClaim: wire.syncRolesFromClaim,
        deprovisionMissingRoleClaim: wire.deprovisionMissingRoleClaim,
    }
}

function resolveHttpUserProfile(userName: string, isGuest: boolean): AuthUserProfile {
    if (isGuest) {
        return {displayName: 'Guest', email: 'guest@datawise.local'}
    }
    return {displayName: userName, email: `${userName}@datawise.local`}
}

/**
 * Auth HTTP client — login/session/policy wire types from OpenAPI;
 * maps to domain {@link LoginResult} / {@link SessionInfo} for store consumers.
 */
export function createHttpAuthApi(): AuthApi {
    return {
        login: async (userName, userPassword) => {
            const body = new URLSearchParams({userName, userPassword})
            return mapLogin(await postForm<LoginWire>(API_PATHS.auth.login, body, {authBypass: true}))
        },

        loginAsGuest: async () =>
            mapLogin(
                await postForm<LoginWire>(API_PATHS.auth.loginGuest, new URLSearchParams(), {
                    authBypass: true,
                }),
            ),

        register: async (request) => {
            const body: RegisterRequest = {
                userName: request.userName,
                password: request.password,
                email: request.email,
                displayName: request.displayName,
                tenantName: request.tenantName,
                tenantSlug: request.tenantSlug,
                createTenant: request.createTenant,
            }
            return mapLogin(await postJson<LoginWire>(API_PATHS.auth.register, body, {authBypass: true}))
        },

        signOut: async () => {
            await postForm<void>(API_PATHS.auth.signOut, new URLSearchParams(), {authBypass: true})
        },

        getCurrentSession: async (options) =>
            mapSession(await getJson<SessionWire>(API_PATHS.auth.session, undefined, options)),

        switchTenant: async (tenantId) =>
            mapSession(await postJson<SessionWire>(API_PATHS.auth.switchTenant, {tenantId})),

        getSessionPolicy: async () =>
            mapSessionPolicy(await getJson<AuthSessionPolicyDto>(API_PATHS.auth.sessionPolicy)),

        updateSessionPolicy: async (policy) => {
            const body: AuthSessionPolicyDto = {
                ttlMinutes: policy.ttlMinutes,
                slidingRenewal: policy.slidingRenewal,
            }
            return mapSessionPolicy(await putJson<AuthSessionPolicyDto>(API_PATHS.auth.sessionPolicy, body))
        },

        changePassword: async (currentPassword, newPassword) => {
            const body: ChangePasswordRequest = {currentPassword, newPassword}
            await postJson<void>(API_PATHS.auth.changePassword, body)
        },

        verifyPassword: async (password) => {
            await postJson<void>(API_PATHS.auth.verifyPassword, {password}, {silent: true})
        },

        getLoginOptions: async () =>
            getJson(API_PATHS.auth.loginOptions, undefined, {authBypass: true, silent: true}),

        getOidcConfig: async () => mapOidcConfig(await getJson<OidcConfigDto>(API_PATHS.auth.oidcConfig)),

        updateOidcConfig: async (request) => {
            const body: WireSaveOidcConfigRequest = {...request}
            return mapOidcConfig(await putJson<OidcConfigDto>(API_PATHS.auth.oidcConfig, body))
        },

        resolveUserProfile: resolveHttpUserProfile,
    }
}
