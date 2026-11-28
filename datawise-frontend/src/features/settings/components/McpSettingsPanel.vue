<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwInput, SettingsRow} from '@/core/components'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsGroup from '@/features/settings/components/SettingsGroup.vue'
import SettingsActions from '@/features/settings/components/SettingsActions.vue'
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
      <template #tips>
        <SettingsTipsCard
            :title="t('settings.mcp.tipsTitle')"
            :content="t('settings.mcp.tipsContent')"
        />
      </template>

      <div class="settings-groups">
        <SettingsGroup
            :title="t('settings.mcp.configTitle')"
            :hint="t('settings.mcp.configHint')"
        >
          <SettingsRow :label="t('settings.mcp.apiUrl')">
            <DwInput v-model="apiUrl" :placeholder="t('settings.mcp.apiUrlPlaceholder')"/>
          </SettingsRow>
          <SettingsRow
              :label="t('settings.mcp.allowlist')"
              :hint="t('settings.mcp.allowlistHint')"
          >
            <DwInput
                v-model="allowlistText"
                :rows="4"
                :placeholder="t('settings.mcp.allowlistPlaceholder')"
            />
          </SettingsRow>
          <SettingsRow
              :label="t('settings.mcp.permissionTier')"
              :hint="t('settings.mcp.permissionTierHint')"
          >
            <span class="mcp-tier">readonly</span>
          </SettingsRow>
          <div class="settings-section__block">
            <pre class="mcp-json">{{ configJson }}</pre>
            <SettingsActions align="end">
              <DwButton variant="primary" @click="copyConfig">
                {{ copied ? t('settings.mcp.copied') : t('settings.mcp.copyConfig') }}
              </DwButton>
            </SettingsActions>
          </div>
        </SettingsGroup>

        <SettingsGroup
            :title="t('settings.mcp.governanceTitle')"
            :hint="t('settings.mcp.governanceBody')"
        >
          <ul class="mcp-list">
            <li>{{ t('settings.mcp.toolReadonly') }}</li>
            <li>{{ t('settings.mcp.toolReview') }}</li>
            <li>{{ t('settings.mcp.toolNoWrite') }}</li>
          </ul>
        </SettingsGroup>
      </div>
    </SettingsPageShell>
  </div>
</template>

<style scoped>
.mcp-tier {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-muted);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  font-family: var(--dw-mono);
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

.mcp-list {
  margin: 0;
  padding-left: 1.25rem;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-secondary);
  line-height: 1.6;
}
</style>
