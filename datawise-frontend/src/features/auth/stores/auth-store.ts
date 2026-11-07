import {defineStore} from 'pinia'
import {computed, nextTick, ref} from 'vue'
import {authApi, type AuthUser} from '@/api'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {
    clearSession,
    isLoggedIn,
    isLocalSessionExpired,
    persistSession,
    readGuestFlag,
    readUserId,
    SESSION_KEY,
    USERNAME_KEY,
} from '@/shared/auth/session'
import {
    shouldRecoverStaleSession,
    shouldValidateBackendSession,
} from '@/features/auth/services/auth-session.service'
import {
    persistAuthSession,
    persistLoginResult,
} from '@/features/auth/services/auth-session-persist.service'
import {resetUserScopedState} from '@/features/auth/services/user-session-reset.service'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {syncAppConfigStorageScopeFromSession} from '@/shared/config/app-config-storage-scope'
import {cancelDeferredConfigServerWrites} from '@/shared/config/app-config.service'
import {unblockApiSession} from '@/shared/api/http/session-guard'
import type {SessionInfo, LoginResult, TenantSummary} from '@/shared/api/types'
import {
    setActiveFeaturePermissions,
    createPreset,
    normalizeFeaturePermissionMap,
} from '@/features/auth/services/feature-permission.service'
import {FeaturePermission} from '@/features/auth/types/feature-permission.types'
import {t} from '@/i18n'

function createLocalSessionId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** 后端 SessionStore 签发的会话以 session- 开头；本地离线占位会话不是有效凭证。 */
function isBackendSessionId(sessionId: string | null | undefined): boolean {
    return Boolean(sessionId?.startsWith('session-'))
}

export const useAuthStore = defineStore('auth', () => {
    const sessionId = ref<string | null>(null)
    const user = ref<AuthUser | null>(null)
    const loginDialogOpen = ref(false)
    /** Show login above first-run wizards when the user explicitly asks to sign in. */
    const loginOverWizards = ref(false)
    const isAdmin = ref(false)
    const hasLocalPassword = ref(false)
    const mustChangePassword = ref(false)
    const tenantId = ref<string | null>(null)
    const tenantName = ref<string | null>(null)
    const tenancyMode = ref<'single' | 'multi'>('single')
    const platformAdmin = ref(false)
    const tenants = ref<TenantSummary[]>([])

    const isGuest = computed(() => user.value?.isGuest ?? true)
    const canLockScreen = computed(() => !isGuest.value && hasLocalPassword.value)
    const canSwitchTenant = computed(
        () => tenancyMode.value === 'multi' && !isGuest.value && tenants.value.length > 1,
    )

    /** 会话就绪后对齐用户/租户 localStorage 命名空间，并重读 Explorer 置顶。 */
    function syncScopedLocalState(overrides?: {tenantId?: string | null}) {
        syncAppConfigStorageScopeFromSession({
            userId: user.value?.userId ?? readUserId(),
            userName: user.value?.userName ?? localStorage.getItem(USERNAME_KEY) ?? undefined,
            isGuest: user.value?.isGuest ?? readGuestFlag(),
            tenantId: overrides?.tenantId ?? tenantId.value,
        })
        useExplorerStore().refreshPinnedNodeIds()
    }

    function applyPermissionsFromSession(
        session: {
            admin?: boolean
            featurePermissions?: SessionInfo['featurePermissions']
            guest?: boolean
        },
    ) {
        isAdmin.value = session.admin === true
        if (session.admin) {
            setActiveFeaturePermissions(createPreset('full'))
        } else if (session.guest === true) {
            const permissions = session.featurePermissions && Object.keys(session.featurePermissions).length > 0
                ? normalizeFeaturePermissionMap(session.featurePermissions)
                : createPreset('workbench')
            permissions[FeaturePermission.NavDatabase] = true
            setActiveFeaturePermissions(permissions)
        } else if (session.featurePermissions && Object.keys(session.featurePermissions).length > 0) {
            setActiveFeaturePermissions(normalizeFeaturePermissionMap(session.featurePermissions))
        } else {
            setActiveFeaturePermissions(createPreset('full'))
        }
        void nextTick(() => useLayoutStore().ensureAccessibleModule())
    }

    function applyUserProfile(next: AuthUser) {
        user.value = next
        const layout = useLayoutStore()
        layout.profileName = next.displayName
        layout.profileEmail = next.email
    }

    function buildUser(
        userName: string,
        isGuestUser: boolean,
        userId?: number | null,
        admin = false,
    ): AuthUser {
        const profile = authApi.resolveUserProfile(userName, isGuestUser)
        return {
            userName,
            userId: userId ?? null,
            displayName: isGuestUser ? t('auth.guestDisplayName') : profile.displayName,
            email: profile.email,
            isGuest: isGuestUser,
            isAdmin: admin,
        }
    }

    function applyTenancyFromSession(session: SessionInfo | LoginResult) {
        tenantId.value = session.tenantId ?? null
        tenantName.value = session.tenantName ?? null
        tenancyMode.value = session.tenancyMode === 'multi' ? 'multi' : 'single'
        platformAdmin.value = session.platformAdmin === true
        tenants.value = Array.isArray(session.tenants) ? [...session.tenants] : []
    }

    function applySessionInfo(session: SessionInfo) {
        persistAuthSession(session)
        sessionId.value = session.sessionId
        hasLocalPassword.value = session.hasLocalPassword === true
        mustChangePassword.value = session.mustChangePassword === true
        applyPermissionsFromSession(session)
        applyTenancyFromSession(session)
        applyUserProfile(buildUser(session.userName, session.guest, session.userId, session.admin === true))
        syncScopedLocalState()
    }

    function applyGuestSession(
        nextSessionId: string,
        userName = 'guest',
        expiresAtEpochMs?: number | null,
        userId?: number | null,
        featurePermissions?: SessionInfo['featurePermissions'],
        admin = false,
    ) {
        persistSession(nextSessionId, userName, true, expiresAtEpochMs, userId ?? null)
        sessionId.value = nextSessionId
        hasLocalPassword.value = false
        mustChangePassword.value = false
        applyPermissionsFromSession({guest: true, admin, featurePermissions})
        applyUserProfile(buildUser(userName, true, userId, admin))
        syncScopedLocalState()
    }

    function restoreSession(applyFallbackPermissions = false) {
        if (!isLoggedIn()) return false
        const storedSessionId = localStorage.getItem(SESSION_KEY)
        if (!isBackendSessionId(storedSessionId)) {
            clearSession()
            return false
        }
        const userName = localStorage.getItem(USERNAME_KEY) ?? 'guest'
        const guest = readGuestFlag()
        sessionId.value = storedSessionId
        hasLocalPassword.value = !guest
        mustChangePassword.value = false
        if (applyFallbackPermissions) {
            applyPermissionsFromSession({guest, admin: false})
        }
        applyUserProfile(buildUser(userName, guest, readUserId(), false))
        syncScopedLocalState()
        return true
    }

    function bootstrapGuestSession() {
        applyGuestSession(createLocalSessionId('guest'))
    }

    function bootstrap() {
        if (restoreSession(true)) return
        bootstrapGuestSession()
    }

    async function recoverFromStaleSession(wasGuest: boolean) {
        cancelDeferredConfigServerWrites()
        clearSession()
        sessionId.value = null
        user.value = null
        hasLocalPassword.value = false
        mustChangePassword.value = false
        try {
            // 会话可能仍被 sessionBlocked 拦截；先建游客会话，放行后再 reset
            await loginAsGuest({skipScopedReset: true})
        } catch {
            bootstrapGuestSession()
        }
        unblockApiSession()
        await resetUserScopedState()
        if (!wasGuest) {
            openLoginDialog()
            useAppToast().show(t('auth.sessionExpired'))
        }
    }

    async function bootstrapAsync(backendConnected = true) {
        const hadSession = restoreSession(false)
        const guest = readGuestFlag()

        if (!hadSession) {
            try {
                await loginAsGuest()
            } catch {
                bootstrapGuestSession()
            }
            return
        }

        if (!shouldValidateBackendSession(hadSession, backendConnected)) {
            if (isLocalSessionExpired()) {
                await recoverFromStaleSession(guest)
            } else {
                applyPermissionsFromSession({guest, admin: false})
            }
            return
        }

        try {
            const session = await authApi.getCurrentSession({silent: true})
            applySessionInfo(session)
            return
        } catch (error) {
            // 只有服务端明确拒绝会话才退出。网络/CORS 等失败不能清掉已保存的登录。
            if (!shouldRecoverStaleSession(error)) {
                if (backendConnected) {
                    applyPermissionsFromSession({guest, admin: false})
                }
                return
            }
        }

        await recoverFromStaleSession(guest)
    }

    function openLoginDialog(options?: {overWizards?: boolean}) {
        loginDialogOpen.value = true
        loginOverWizards.value = options?.overWizards === true
    }

    function closeLoginDialog() {
        loginDialogOpen.value = false
        loginOverWizards.value = false
    }

    /**
     * Sign-in paths: close the login modal as soon as the session is applied, then hydrate
     * explorer/config/workspace in the background so the dialog never waits on tree reload.
     */
    function schedulePostLoginHydration() {
        closeLoginDialog()
        void resetUserScopedState().catch(() => {
            useAppToast().show(t('auth.workspaceHydrateFailed'))
        })
    }

    async function login(userName: string, userPassword: string) {
        const result = await authApi.login(userName, userPassword)
        if (!result.sessionId) {
            throw new Error(t('auth.failed'))
        }
        persistLoginResult(result, result.userName ?? userName, false)
        sessionId.value = result.sessionId
        hasLocalPassword.value = true
        mustChangePassword.value = result.mustChangePassword === true
        applyPermissionsFromSession({
            guest: false,
            admin: result.admin === true,
            featurePermissions: result.featurePermissions,
        })
        applyTenancyFromSession(result)
        applyUserProfile(buildUser(result.userName ?? userName, false, result.userId, result.admin === true))
        schedulePostLoginHydration()
    }

    async function register(payload: {
        userName: string
        password: string
        email?: string
        displayName?: string
        tenantName?: string
        tenantSlug?: string
        createTenant?: boolean
    }) {
        const result = await authApi.register(payload)
        if (!result.sessionId) {
            throw new Error(t('auth.failed'))
        }
        persistLoginResult(result, result.userName ?? payload.userName, false)
        sessionId.value = result.sessionId
        hasLocalPassword.value = true
        mustChangePassword.value = result.mustChangePassword === true
        applyPermissionsFromSession({
            guest: false,
            admin: result.admin === true,
            featurePermissions: result.featurePermissions,
        })
        applyTenancyFromSession(result)
        applyUserProfile(buildUser(
            result.userName ?? payload.userName,
            false,
            result.userId,
            result.admin === true,
        ))
        schedulePostLoginHydration()
    }

    /** Complete OIDC redirect: persist session id then refresh profile from backend. */
    async function completeOidcLogin(oidcSessionId: string, fallbackUserName?: string) {
        persistSession(oidcSessionId, fallbackUserName || 'oidc-user', false, null, null)
        sessionId.value = oidcSessionId
        const session = await authApi.getCurrentSession({authBypass: true})
        applySessionInfo(session)
        schedulePostLoginHydration()
    }

    async function loginAsGuest(options?: {skipScopedReset?: boolean}) {
        const result = await authApi.loginAsGuest()
        if (!result.sessionId) {
            throw new Error(t('auth.guestFailed'))
        }
        applyGuestSession(
            result.sessionId,
            result.userName ?? 'guest',
            result.expiresAtEpochMs,
            result.userId,
            result.featurePermissions,
            result.admin === true,
        )
        applyTenancyFromSession(result)
        if (!options?.skipScopedReset) {
            await resetUserScopedState()
        }
    }

    /** 从服务端重新拉取当前会话权限（管理员改权限后立即生效）。 */
    async function refreshSessionPermissions() {
        if (!sessionId.value || !isBackendSessionId(sessionId.value)) return
        try {
            const session = await authApi.getCurrentSession({silent: true})
            applySessionInfo(session)
        } catch {
            // 静默失败：保留现有权限
        }
    }

    async function handleUnauthorizedAccess() {
        const wasGuest = readGuestFlag()
        cancelDeferredConfigServerWrites()
        clearSession()
        sessionId.value = null
        user.value = null
        hasLocalPassword.value = false
        mustChangePassword.value = false
        try {
            // 此时 sessionBlocked=true，loginAsGuest 内的 reset 会被 API 拦截；
            // 先落到游客会话，解除拦截后再清 explorer / 配置等用户态
            await loginAsGuest({skipScopedReset: true})
        } catch {
            bootstrapGuestSession()
        }
        unblockApiSession()
        await resetUserScopedState()
        // 原登录用户：游客兜底后弹出登录框；访客则静默重登，避免控制台炸一堆 401
        if (!wasGuest) {
            openLoginDialog()
            useAppToast().show(t('auth.sessionExpired'))
        }
    }

    async function switchTenant(nextTenantId: string) {
        if (!nextTenantId || nextTenantId === tenantId.value) {
            return
        }
        const session = await authApi.switchTenant(nextTenantId)
        applySessionInfo(session)
        await resetUserScopedState()
        useAppToast().show(t('auth.tenantSwitched', {name: session.tenantName || nextTenantId}))
    }

    async function signOut(options?: {silent?: boolean}) {
        cancelDeferredConfigServerWrites()
        try {
            await authApi.signOut()
        } catch {
            // 后端不可达时仍清理本地会话
        }
        clearSession()
        mustChangePassword.value = false
        try {
            await loginAsGuest()
        } catch {
            bootstrapGuestSession()
        }
        await resetUserScopedState()
        if (!options?.silent) {
            useAppToast().show(t('auth.backToGuest'))
        }
    }

    function clearMustChangePassword() {
        mustChangePassword.value = false
    }

    return {
        sessionId,
        user,
        isGuest,
        isAdmin,
        hasLocalPassword,
        mustChangePassword,
        canLockScreen,
        tenantId,
        tenantName,
        tenancyMode,
        platformAdmin,
        tenants,
        canSwitchTenant,
        loginDialogOpen,
        loginOverWizards,
        restoreSession,
        bootstrap,
        bootstrapAsync,
        applySessionInfo,
        openLoginDialog,
        closeLoginDialog,
        login,
        register,
        completeOidcLogin,
        loginAsGuest,
        refreshSessionPermissions,
        handleUnauthorizedAccess,
        switchTenant,
        signOut,
        clearMustChangePassword,
    }
})
