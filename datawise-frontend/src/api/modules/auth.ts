import {api} from '@/shared/api'

export const authApi = {
    login: (userName: string, userPassword: string) => api.auth.login(userName, userPassword),
    loginAsGuest: () => api.auth.loginAsGuest(),
    register: (request: import('@/shared/api/types').RegisterRequest) => api.auth.register(request),
    signOut: () => api.auth.signOut(),
    changePassword: (currentPassword: string, newPassword: string) =>
        api.auth.changePassword(currentPassword, newPassword),
    verifyPassword: (password: string) => api.auth.verifyPassword(password),
    getCurrentSession: (options?: import('@/shared/api/http/request').HttpRequestOptions) =>
        api.auth.getCurrentSession(options),
    switchTenant: (tenantId: string) => api.auth.switchTenant(tenantId),
    getSessionPolicy: () => api.auth.getSessionPolicy(),
    updateSessionPolicy: (policy: import('@/shared/api/types').AuthSessionPolicy) =>
        api.auth.updateSessionPolicy(policy),
    getLoginOptions: () => api.auth.getLoginOptions(),
    getOidcConfig: () => api.auth.getOidcConfig(),
    updateOidcConfig: (request: import('@/shared/api/types').SaveOidcConfigRequest) =>
        api.auth.updateOidcConfig(request),
    resolveUserProfile: (userName: string, isGuest: boolean) =>
        api.auth.resolveUserProfile(userName, isGuest),
}
