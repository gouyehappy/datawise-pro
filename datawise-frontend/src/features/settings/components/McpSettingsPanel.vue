<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwInput} from '@/core/components'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsSectionCard from '@/features/settings/components/SettingsSectionCard.vue'
import SettingsTipsCard from '@/features/settings/components/SettingsTipsCard.vue'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {flashSettingsAnchor} from '@/features/settings/services/settings-search-index'
import {
    buildMcpCursorConfigJson,
    loadMcpUiPrefs,
    saveMcpUiPrefs,
    type McpUiPrefs,
} from '@/features/settings/services/mcp-settings.service'

const {t} = useI18n()
const toast = useAppToast()
const layout = useLayoutStore()

const prefs = ref<McpUiPrefs>(loadMcpUiPrefs())
const apiUrl = ref(prefs.value.apiUrl)
const allowlistText = ref(prefs.value.connectionAllowlist.join('\n'))
const copied = ref(false)

const configJson = computed(() =>
    buildMcpCursorConfigJson({
        apiUrl: apiUrl.value,
        connectionAllowlist: allowlistText.value
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter(Boolean),
        permissionTier: prefs.value.permissionTier,
    }),
)

function persist() {
    const next: McpUiPrefs = {
        apiUrl: apiUrl.value.trim() || 'http://localhost:18421',
        connectionAllowlist: allowlistText.value
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter(Boolean),
        permissionTier: 'readonly',
    }
    prefs.value = next
    saveMcpUiPrefs(next)
}

watch([apiUrl, allowlistText], () => persist())

async function copyConfig() {
    try {
        await navigator.clipboard.writeText(configJson.value)
        copied.value = true
        window.setTimeout(() => {
            copied.value = false
        }, 1600)
    } catch {
        toast.error(t('settings.mcp.copyFailed'))
    }
}

onMounted(() => {
    if (layout.settingsScrollAnchor === 'settings-mcp') {
        flashSettingsAnchor('settings-mcp')
        layout.clearSettingsScrollAnchor()
    }
})
</script>

<template>
  <div id="settings-mcp">
    <SettingsPageShell
        :title="t('settings.mcp.title')"
        :subtitle="t('settings.mcp.subtitle')"
    >
      <SettingsTipsCard
          :title="t('settings.mcp.tipsTitle')"
          :content="t('settings.mcp.tipsContent')"
      />

      <SettingsSectionCard :title="t('settings.mcp.configTitle')">
        <p class="mcp-hint">{{ t('settings.mcp.configHint') }}</p>
        <div class="mcp-fields">
          <label class="mcp-field">
            <span>{{ t('settings.mcp.apiUrl') }}</span>
            <DwInput v-model="apiUrl" :placeholder="t('settings.mcp.apiUrlPlaceholder')"/>
          </label>
          <label class="mcp-field">
            <span>{{ t('settings.mcp.allowlist') }}</span>
            <DwInput
                v-model="allowlistText"
                :rows="4"
                :placeholder="t('settings.mcp.allowlistPlaceholder')"
            />
            <small>{{ t('settings.mcp.allowlistHint') }}</small>
          </label>
          <p class="mcp-field mcp-field--note">
            <strong>{{ t('settings.mcp.permissionTier') }}</strong>
            <small>{{ t('settings.mcp.permissionTierHint') }}</small>
          </p>
        </div>
        <pre class="mcp-json">{{ configJson }}</pre>
        <div class="mcp-actions">
          <DwButton variant="primary" @click="copyConfig">
            {{ copied ? t('settings.mcp.copied') : t('settings.mcp.copyConfig') }}
          </DwButton>
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard :title="t('settings.mcp.governanceTitle')">
        <p class="mcp-hint">{{ t('settings.mcp.governanceBody') }}</p>
        <ul class="mcp-list">
          <li>{{ t('settings.mcp.toolReadonly') }}</li>
          <li>{{ t('settings.mcp.toolReview') }}</li>
          <li>{{ t('settings.mcp.toolNoWrite') }}</li>
        </ul>
      </SettingsSectionCard>
    </SettingsPageShell>
  </div>
</template>

<style scoped>
.mcp-hint {
  margin: 0 0 var(--dw-space-4);
  font-size: var(--dw-text-sm);
  color: var(--dw-text-secondary);
  line-height: 1.5;
}

.mcp-fields {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-4);
  margin-bottom: var(--dw-space-4);
}

.mcp-field {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
  font-size: var(--dw-text-sm);
  color: var(--dw-text);
}

.mcp-field small {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.mcp-field--note strong {
  font-weight: 600;
}

.mcp-json {
  margin: 0 0 var(--dw-space-4);
  padding: var(--dw-pad-tight);
  border-radius: var(--dw-control-radius-sm);
  border: 1px solid var(--dw-border-light);
  background: var(--dw-bg-subtle);
  font-family: var(--dw-mono);
  font-size: var(--dw-text-xs);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 280px;
  overflow: auto;
}

.mcp-actions {
  display: flex;
  gap: var(--dw-gap);
}

.mcp-list {
  margin: 0;
  padding-left: 1.25rem;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-secondary);
  line-height: 1.6;
}
</style>
