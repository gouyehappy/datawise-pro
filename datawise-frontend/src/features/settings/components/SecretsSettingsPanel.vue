<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, SettingsRow} from '@/core/components'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsGroup from '@/features/settings/components/SettingsGroup.vue'
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

const refExamples = computed(() => [
  {code: 'dwsecret:env:DB_PASSWORD', desc: t('settings.secrets.refEnv')},
  {code: 'dwsecret:file:secrets/db-password.txt', desc: t('settings.secrets.refFile')},
  {code: 'dwsecret:json-file:secrets/bundle.json#dbPassword', desc: t('settings.secrets.refJsonFile')},
  {code: 'dwsecret:properties:secrets/bundle.properties#db.password', desc: t('settings.secrets.refProperties')},
  {code: 'dwsecret:dotenv:secrets/.env#DB_PASSWORD', desc: t('settings.secrets.refDotenv')},
  {code: 'dwsecret:vault:secret/data/myapp/db#password', desc: t('settings.secrets.refVault')},
])

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
    <div class="settings-groups">
      <SettingsGroup
          :title="t('settings.secrets.masterKeyTitle')"
          :hint="t('settings.secrets.masterKeyHint')"
      >
        <template v-if="status">
          <SettingsRow :label="t('settings.secrets.masterKeySource')">
            <code class="settings-secrets__value">{{ sourceLabel }}</code>
          </SettingsRow>
          <SettingsRow :label="t('settings.secrets.envPreferred')">
            <span class="settings-secrets__plain">
              {{ status.masterKeyFromEnvironment ? t('common.yes') : t('common.no') }}
            </span>
          </SettingsRow>
        </template>
        <p v-else-if="loading" class="settings-secrets__status">{{ t('settings.secrets.loading') }}</p>
        <p v-else-if="error" class="settings-secrets__error">{{ error }}</p>
        <SettingsRow :label="t('settings.secrets.refresh')">
          <DwButton
              variant="secondary"
              size="sm"
              type="button"
              :disabled="loading"
              @click="loadStatus"
          >
            {{ t('settings.secrets.refresh') }}
          </DwButton>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
          :title="t('settings.secrets.refsTitle')"
          :hint="t('settings.secrets.refsHint')"
      >
        <ul class="settings-secrets__list">
          <li v-for="item in refExamples" :key="item.code">
            <code>{{ item.code }}</code>
            <span>{{ item.desc }}</span>
          </li>
        </ul>
        <p class="settings-secrets__note">{{ t('settings.secrets.refsNote') }}</p>
        <p v-if="status?.secretRefHint" class="settings-secrets__note settings-secrets__note--follow">
          {{ status.secretRefHint }}
        </p>
      </SettingsGroup>
    </div>
  </SettingsPageShell>
</template>

<style scoped>
.settings-secrets__value {
  display: inline-block;
  max-width: min(36ch, 42vw);
  padding: var(--dw-space-2) var(--dw-space-3);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-muted);
  font-family: var(--dw-mono);
  font-size: var(--dw-text-xs);
  color: var(--dw-text);
  word-break: break-all;
  line-height: var(--dw-leading);
}

.settings-secrets__plain {
  font-size: var(--dw-text-sm);
  font-weight: 500;
  color: var(--dw-text);
}

.settings-secrets__status,
.settings-secrets__error {
  margin: var(--dw-space-3) 0;
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-relaxed);
}

.settings-secrets__status {
  color: var(--dw-text-muted);
}

.settings-secrets__error {
  color: var(--dw-danger);
}

.settings-secrets__list {
  list-style: none;
  margin: var(--dw-space-2) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.settings-secrets__list li {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-1);
  padding: var(--dw-space-4) 0;
  border-bottom: 1px solid color-mix(in srgb, var(--dw-text) 7%, transparent);
}

.settings-secrets__list li:last-child {
  border-bottom: 0;
}

.settings-secrets__list code {
  font-family: var(--dw-mono);
  font-size: var(--dw-text-xs);
  font-weight: 500;
  color: var(--dw-text);
  word-break: break-all;
  line-height: var(--dw-leading);
}

.settings-secrets__list span {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  line-height: var(--dw-leading-relaxed);
}

.settings-secrets__note {
  margin: 0 0 var(--dw-space-2);
  padding-top: var(--dw-space-3);
  border-top: 1px solid color-mix(in srgb, var(--dw-text) 7%, transparent);
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  line-height: var(--dw-leading-relaxed);
}

.settings-secrets__note--follow {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}
</style>
