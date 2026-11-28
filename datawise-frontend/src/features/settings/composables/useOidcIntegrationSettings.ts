import {computed, reactive, ref, type Ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {authApi} from '@/api'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {resolveDisplayApiErrorMessage} from '@/shared/api/http/api-error-message'
import type {OidcConfig} from '@/shared/api/types'
import {
  claimMapPreviewRows,
  directorySyncScopesIncomplete,
  formatClaimMap,
  parseClaimMap,
  withRecommendedDirectorySyncScopes,
} from '@/features/settings/services/oidc-directory-sync.service'
import type {IntegrationsRootView} from '@/features/settings/composables/useOutboundWebhookSettings'

export type OidcIntegrationSettingsDeps = {
  rootView: Ref<IntegrationsRootView>
  /** Cross-check: warn when saving OIDC while webhook edit form is dirty. */
  isWebhookFormDirty: () => boolean
}

/** OIDC form load / save / directory-sync helpers. */
export function useOidcIntegrationSettings(deps: OidcIntegrationSettingsDeps) {
  const {t} = useI18n()
  const auth = useAuthStore()
  const toast = useAppToast()

  function apiErrorMessage(error: unknown, fallbackKey: string) {
    return resolveDisplayApiErrorMessage(error, (key) => String(t(key))) || t(fallbackKey)
  }

  const oidc = reactive({
    enabled: false,
    issuer: '',
    clientId: '',
    clientSecret: '',
    redirectUri: '',
    frontendRedirectBase: '',
    scopes: 'openid profile email',
    localLoginEnabled: true,
    hasClientSecret: false,
    tenantClaim: 'org_id',
    tenantClaimMapText: '',
    defaultOidcRoleKey: 'developer',
    autoProvisionMembership: true,
    roleClaim: 'groups',
    roleClaimMapText: '',
    syncRolesFromClaim: false,
    deprovisionMissingRoleClaim: false,
  })
  const oidcSaving = ref(false)
  const oidcLoaded = ref(false)

  const directorySyncScopeWarn = computed(() =>
    oidc.syncRolesFromClaim && directorySyncScopesIncomplete(oidc.scopes, oidc.roleClaim),
  )
  const roleClaimPreview = computed(() => claimMapPreviewRows(oidc.roleClaimMapText))

  function addRecommendedDirectoryScopes() {
    oidc.scopes = withRecommendedDirectorySyncScopes(oidc.scopes, oidc.roleClaim)
  }

  function openOidcEdit() {
    deps.rootView.value = 'oidc-edit'
  }

  async function reloadOidc() {
    if (!auth.isAdmin) return
    try {
      const config: OidcConfig = await authApi.getOidcConfig()
      oidc.enabled = config.enabled
      oidc.issuer = config.issuer || ''
      oidc.clientId = config.clientId || ''
      oidc.redirectUri = config.redirectUri || ''
      oidc.frontendRedirectBase = config.frontendRedirectBase || ''
      oidc.scopes = config.scopes || 'openid profile email'
      oidc.localLoginEnabled = config.localLoginEnabled
      oidc.hasClientSecret = config.hasClientSecret
      oidc.clientSecret = ''
      oidc.tenantClaim = config.tenantClaim || 'org_id'
      oidc.tenantClaimMapText = formatClaimMap(config.tenantClaimMap)
      oidc.defaultOidcRoleKey = config.defaultOidcRoleKey || 'developer'
      oidc.autoProvisionMembership = config.autoProvisionMembership !== false
      oidc.roleClaim = config.roleClaim || 'groups'
      oidc.roleClaimMapText = formatClaimMap(config.roleClaimMap)
      oidc.syncRolesFromClaim = Boolean(config.syncRolesFromClaim)
      oidc.deprovisionMissingRoleClaim = Boolean(config.deprovisionMissingRoleClaim)
      oidcLoaded.value = true
    } catch {
      // non-admin skip
    }
  }

  async function saveOidc() {
    if (deps.rootView.value === 'webhook-edit' && deps.isWebhookFormDirty()) {
      toast.warning(t('settings.integrations.webhookUnsavedHint'))
    }
    oidcSaving.value = true
    try {
      const saved = await authApi.updateOidcConfig({
        enabled: oidc.enabled,
        issuer: oidc.issuer,
        clientId: oidc.clientId,
        clientSecret: oidc.clientSecret || undefined,
        redirectUri: oidc.redirectUri,
        frontendRedirectBase: oidc.frontendRedirectBase,
        scopes: oidc.scopes,
        localLoginEnabled: oidc.localLoginEnabled,
        tenantClaim: oidc.tenantClaim,
        tenantClaimMap: parseClaimMap(oidc.tenantClaimMapText),
        defaultOidcRoleKey: oidc.defaultOidcRoleKey,
        autoProvisionMembership: oidc.autoProvisionMembership,
        roleClaim: oidc.roleClaim,
        roleClaimMap: parseClaimMap(oidc.roleClaimMapText),
        syncRolesFromClaim: oidc.syncRolesFromClaim,
        deprovisionMissingRoleClaim: oidc.deprovisionMissingRoleClaim,
      })
      oidc.hasClientSecret = saved.hasClientSecret
      oidc.clientSecret = ''
      oidc.tenantClaim = saved.tenantClaim || 'org_id'
      oidc.tenantClaimMapText = formatClaimMap(saved.tenantClaimMap)
      oidc.defaultOidcRoleKey = saved.defaultOidcRoleKey || 'developer'
      oidc.autoProvisionMembership = saved.autoProvisionMembership !== false
      oidc.roleClaim = saved.roleClaim || 'groups'
      oidc.roleClaimMapText = formatClaimMap(saved.roleClaimMap)
      oidc.syncRolesFromClaim = Boolean(saved.syncRolesFromClaim)
      oidc.deprovisionMissingRoleClaim = Boolean(saved.deprovisionMissingRoleClaim)
    } catch (error) {
      toast.error(apiErrorMessage(error, 'settings.integrations.saveFailed'))
    } finally {
      oidcSaving.value = false
    }
  }

  return {
    oidc,
    oidcSaving,
    oidcLoaded,
    directorySyncScopeWarn,
    roleClaimPreview,
    addRecommendedDirectoryScopes,
    openOidcEdit,
    reloadOidc,
    saveOidc,
  }
}
