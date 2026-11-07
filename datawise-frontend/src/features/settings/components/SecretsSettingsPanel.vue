<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton} from '@/core/components'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsSectionCard from '@/features/settings/components/SettingsSectionCard.vue'
import {settingsApi} from '@/api'
import {resolveDisplayApiErrorMessage} from '@/shared/api/http/api-error-message'
import type {SecretsStatus} from '@/shared/api/http/system'

const {t} = useI18n()
const loading = ref(false)
const error = ref<string | null>(null)
const status = ref<SecretsStatus | null>(null)

const sourceLabel = computed(() => {
  const source = status.value?.masterKeySource
  if (!source) return '—'
  const key = `settings.secrets.source.${source}`
  const label = t(key)
  return label === key ? source : label
})

async function loadStatus() {
  loading.value = true
  error.value = null
  try {
    status.value = await settingsApi.fetchSecretsStatus()
  } catch (err) {
    error.value = resolveDisplayApiErrorMessage(err, (key) => String(t(key)))
        || t('settings.secrets.loadFailed')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadStatus()
})
</script>

<template>
  <SettingsPageShell
      :title="t('settings.secrets.title')"
      :subtitle="t('settings.secrets.subtitle')"
  >
    <SettingsSectionCard :title="t('settings.secrets.masterKeyTitle')">
      <p class="settings-secrets__lead">{{ t('settings.secrets.masterKeyHint') }}</p>
      <dl v-if="status" class="settings-secrets__meta">
        <div>
          <dt>{{ t('settings.secrets.masterKeySource') }}</dt>
          <dd>{{ sourceLabel }}</dd>
        </div>
        <div>
          <dt>{{ t('settings.secrets.envPreferred') }}</dt>
          <dd>{{ status.masterKeyFromEnvironment ? t('common.yes') : t('common.no') }}</dd>
        </div>
      </dl>
      <p v-else-if="loading" class="settings-secrets__muted">{{ t('settings.secrets.loading') }}</p>
      <p v-else-if="error" class="settings-secrets__error">{{ error }}</p>
      <div class="settings-secrets__actions">
        <DwButton variant="secondary" size="sm" type="button" :disabled="loading" @click="loadStatus">
          {{ t('settings.secrets.refresh') }}
        </DwButton>
      </div>
    </SettingsSectionCard>

    <SettingsSectionCard :title="t('settings.secrets.refsTitle')">
      <p class="settings-secrets__lead">{{ t('settings.secrets.refsHint') }}</p>
      <ul class="settings-secrets__list">
        <li><code>dwsecret:env:DB_PASSWORD</code> — {{ t('settings.secrets.refEnv') }}</li>
        <li><code>dwsecret:file:secrets/db-password.txt</code> — {{ t('settings.secrets.refFile') }}</li>
        <li><code>dwsecret:json-file:secrets/bundle.json#dbPassword</code> — {{ t('settings.secrets.refJsonFile') }}</li>
        <li><code>dwsecret:properties:secrets/bundle.properties#db.password</code> — {{ t('settings.secrets.refProperties') }}</li>
        <li><code>dwsecret:dotenv:secrets/.env#DB_PASSWORD</code> — {{ t('settings.secrets.refDotenv') }}</li>
        <li><code>dwsecret:vault:secret/data/myapp/db#password</code> — {{ t('settings.secrets.refVault') }}</li>
      </ul>
      <p class="settings-secrets__muted">{{ t('settings.secrets.refsNote') }}</p>
      <p v-if="status?.secretRefHint" class="settings-secrets__muted">{{ status.secretRefHint }}</p>
    </SettingsSectionCard>
  </SettingsPageShell>
</template>

<style scoped>
.settings-secrets__lead {
  margin: 0 0 var(--dw-space-4);
  font-size: var(--dw-text-sm);
  color: var(--dw-text-secondary);
  line-height: var(--dw-leading);
}

.settings-secrets__meta {
  display: grid;
  gap: var(--dw-space-3);
  margin: 0 0 var(--dw-space-4);
}

.settings-secrets__meta div {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-1);
}

.settings-secrets__meta dt {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.settings-secrets__meta dd {
  margin: 0;
  font-size: var(--dw-text-sm);
  color: var(--dw-text);
  font-family: var(--dw-mono);
}

.settings-secrets__list {
  margin: 0 0 var(--dw-space-4);
  padding-left: var(--dw-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
  font-size: var(--dw-text-sm);
  color: var(--dw-text-secondary);
}

.settings-secrets__list code {
  font-family: var(--dw-mono);
  font-size: var(--dw-text-xs);
  color: var(--dw-text);
}

.settings-secrets__muted {
  margin: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  line-height: var(--dw-leading);
}

.settings-secrets__error {
  margin: 0 0 var(--dw-space-3);
  font-size: var(--dw-text-sm);
  color: var(--dw-danger);
}

.settings-secrets__actions {
  margin-top: var(--dw-space-3);
}
</style>
