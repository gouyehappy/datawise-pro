<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {DwButton, DwInput, DwSecretInput, FormField, StatusPill, SettingsSwitch} from '@/core/components'
import {DwIcon} from '@/core/icons'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import {useOidcIntegrationSettings} from '@/features/settings/composables/useOidcIntegrationSettings'

defineOptions({name: 'OidcEditView'})

const props = defineProps<{
  settings: ReturnType<typeof useOidcIntegrationSettings>
}>()

const emit = defineEmits<{
  back: []
}>()

const {t} = useI18n()

const {
  oidc,
  oidcSaving,
  directorySyncScopeWarn,
  roleClaimPreview,
  addRecommendedDirectoryScopes,
  saveOidc,
} = props.settings
</script>

<template>
  <SettingsPageShell embedded>
    <div class="ai-edit-panel">
      <header class="ai-edit-panel__head">
        <button class="ai-back-link" type="button" @click="emit('back')">
          <DwIcon name="chevron-left" size="sm" :stroke-width="2.25"/>
          {{ t('settings.integrations.backToIntegrations') }}
        </button>
      </header>

      <div class="ai-edit-card">
        <div class="ai-edit-card__hero">
          <div class="ai-edit-card__hero-copy">
            <StatusPill variant="info">OIDC</StatusPill>
            <h3>{{ t('settings.integrations.oidcTitle') }}</h3>
            <p>{{ t('settings.integrations.oidcHint') }}</p>
          </div>
          <div class="ai-edit-card__hero-badges">
            <StatusPill :variant="oidc.enabled ? 'success' : 'neutral'" dot>
              {{ oidc.enabled ? t('settings.integrations.statusEnabled') : t('settings.integrations.statusDisabled') }}
            </StatusPill>
          </div>
        </div>

        <div class="ai-edit-section">
          <h4 class="ai-edit-section__title">{{ t('settings.integrations.oidcEnabled') }}</h4>
          <div class="settings-section__card int-option-switches">
            <SettingsSwitch v-model="oidc.enabled" :label="t('settings.integrations.oidcEnabled')"/>
            <SettingsSwitch v-model="oidc.localLoginEnabled" :label="t('settings.integrations.localLoginEnabled')"/>
          </div>
        </div>

        <div class="ai-edit-section">
          <h4 class="ai-edit-section__title">{{ t('settings.integrations.issuer') }}</h4>
          <div class="field-grid">
            <FormField :label="t('settings.integrations.issuer')">
              <DwInput v-model="oidc.issuer" placeholder="https://idp.example.com/realms/datawise"/>
            </FormField>
            <FormField :label="t('settings.integrations.clientId')">
              <DwInput v-model="oidc.clientId"/>
            </FormField>
            <FormField :label="t('settings.integrations.clientSecret')">
              <DwSecretInput
                  v-model="oidc.clientSecret"
                  :placeholder="oidc.hasClientSecret ? t('settings.integrations.secretKeep') : ''"
              />
            </FormField>
            <FormField :label="t('settings.integrations.redirectUri')">
              <DwInput v-model="oidc.redirectUri" placeholder="http://localhost:18421/api/auth/oidc/callback"/>
            </FormField>
            <FormField :label="t('settings.integrations.frontendRedirectBase')">
              <DwInput v-model="oidc.frontendRedirectBase" placeholder="http://localhost:28413"/>
            </FormField>
            <FormField :label="t('settings.integrations.scopes')">
              <DwInput v-model="oidc.scopes"/>
            </FormField>
            <FormField :label="t('settings.integrations.tenantClaim')">
              <DwInput v-model="oidc.tenantClaim" placeholder="org_id"/>
            </FormField>
            <FormField :label="t('settings.integrations.defaultOidcRoleKey')">
              <DwInput v-model="oidc.defaultOidcRoleKey" placeholder="developer"/>
            </FormField>
          </div>
          <p v-if="directorySyncScopeWarn" class="field-hint int-warn">
            {{ t('settings.integrations.directorySyncScopeWarn') }}
            <DwButton variant="ghost" size="sm" type="button" @click="addRecommendedDirectoryScopes">
              {{ t('settings.integrations.addRecommendedScopes') }}
            </DwButton>
          </p>
        </div>

        <div class="ai-edit-section">
          <h4 class="ai-edit-section__title">{{ t('settings.integrations.tenantClaimMap') }}</h4>
          <FormField :label="t('settings.integrations.tenantClaimMap')">
            <template #default="{ id }">
              <DwInput
                  :id="id"
                  v-model="oidc.tenantClaimMapText"
                  class="int-claim-map"
                  variant="mono"
                  :rows="4"
                  :placeholder="t('settings.integrations.tenantClaimMapPlaceholder')"
              />
            </template>
          </FormField>
          <div class="field-grid">
            <FormField :label="t('settings.integrations.roleClaim')">
              <DwInput v-model="oidc.roleClaim" placeholder="groups"/>
            </FormField>
          </div>
          <FormField :label="t('settings.integrations.roleClaimMap')">
            <template #default="{ id }">
              <DwInput
                  :id="id"
                  v-model="oidc.roleClaimMapText"
                  class="int-claim-map"
                  variant="mono"
                  :rows="4"
                  :placeholder="t('settings.integrations.roleClaimMapPlaceholder')"
              />
            </template>
          </FormField>
          <div v-if="roleClaimPreview.length" class="int-claim-preview">
            <p class="int-claim-preview__title">{{ t('settings.integrations.roleClaimMapPreview') }}</p>
            <ul>
              <li v-for="row in roleClaimPreview" :key="`${row.from}=${row.to}`">
                <code>{{ row.from }}</code> → <code>{{ row.to }}</code>
              </li>
            </ul>
          </div>
        </div>

        <div class="ai-edit-section">
          <h4 class="ai-edit-section__title">{{ t('settings.integrations.directorySyncHint') }}</h4>
          <p class="field-hint">{{ t('settings.integrations.directorySyncHint') }}</p>
          <div class="settings-section__card int-option-switches">
            <SettingsSwitch
                v-model="oidc.autoProvisionMembership"
                :label="t('settings.integrations.autoProvisionMembership')"
            />
            <SettingsSwitch
                v-model="oidc.syncRolesFromClaim"
                :label="t('settings.integrations.syncRolesFromClaim')"
            />
            <SettingsSwitch
                v-model="oidc.deprovisionMissingRoleClaim"
                :label="t('settings.integrations.deprovisionMissingRoleClaim')"
                :disabled="!oidc.syncRolesFromClaim"
            />
          </div>
        </div>
      </div>

      <footer class="ai-edit-footer">
        <DwButton variant="ghost" @click="emit('back')">{{ t('settings.integrations.reset') }}</DwButton>
        <DwButton variant="primary" :loading="oidcSaving" @click="saveOidc">
          {{ t('settings.integrations.saveOidc') }}
        </DwButton>
      </footer>
    </div>
  </SettingsPageShell>
</template>

<style scoped>
/* checkbox row */
.int-checks {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

/* warn text with button */
.int-warn {
  color: var(--dw-warning-fg) !important;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

/* claim map textarea */
.int-claim-map,
:deep(.int-claim-map) {
  width: 100%;
  min-height: 88px;
  font-family: var(--dw-font-mono, ui-monospace, monospace);
  font-size: var(--dw-text-sm);
  resize: vertical;
}

.int-claim-preview {
  margin: 4px 0 0;
  padding: 8px 12px;
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-muted);
  font-size: var(--dw-text-sm);
}
.int-claim-preview__title {
  font-size: var(--dw-text-sm);
  font-weight: 500;
  margin: 0 0 4px;
}
.int-claim-preview ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
}
.int-claim-preview code { font-size: var(--dw-text-xs); }

.int-edit-footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.ai-edit-footer > :first-child {
  margin-right: auto;
}
</style>
