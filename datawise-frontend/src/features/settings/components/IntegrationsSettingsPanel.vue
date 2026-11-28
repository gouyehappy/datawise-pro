<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {StatusPill, ConfirmDialog, EmptyState} from '@/core/components'
import {DwIcon} from '@/core/icons'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsTipsCard from '@/features/settings/components/SettingsTipsCard.vue'
import SettingsSegmentTabs from '@/features/settings/components/SettingsSegmentTabs.vue'
import WebhookEditView from '@/features/settings/components/WebhookEditView.vue'
import OidcEditView from '@/features/settings/components/OidcEditView.vue'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useConfirmDialog} from '@/core/composables/useConfirmDialog'
import {
  useOutboundWebhookSettings,
  type IntegrationsListTab,
  type IntegrationsRootView,
  type WebhookEditTab,
} from '@/features/settings/composables/useOutboundWebhookSettings'
import {useOidcIntegrationSettings} from '@/features/settings/composables/useOidcIntegrationSettings'

const {t} = useI18n()
const auth = useAuthStore()
const {
  open: confirmOpen,
  title: confirmTitle,
  message: confirmMessage,
  confirmLabel,
  confirmVariant,
  ask: askConfirm,
  onConfirm: onConfirmDialog,
  onOpenUpdate: onConfirmOpenUpdate,
} = useConfirmDialog()

const listTab = ref<IntegrationsListTab>('webhook')
const rootView = ref<IntegrationsRootView>('list')
const editTab = ref<WebhookEditTab>('connection')

function openList(tab?: IntegrationsListTab) {
  rootView.value = 'list'
  if (tab) listTab.value = tab
}

const webhook = useOutboundWebhookSettings({
  rootView,
  editTab,
  openList,
  askConfirm,
})

const {
  hooks,
  loading,
  hookListItems,
  openNewHook,
  openEditHook,
  reloadHooks,
  reloadWebhookSchema,
  isWebhookFormDirty,
} = webhook

const oidcSettings = useOidcIntegrationSettings({
  rootView,
  isWebhookFormDirty,
})

const {
  oidc,
  oidcLoaded,
  openOidcEdit,
  reloadOidc,
} = oidcSettings

const listSegmentTabs = computed(() => [
  {id: 'webhook', label: t('settings.integrations.webhookTitle'), count: hooks.value.length},
  {id: 'oidc', label: t('settings.integrations.oidcTitle')},
])

onMounted(async () => {
  await Promise.all([reloadWebhookSchema(), reloadHooks(), reloadOidc()])
})
</script>

<template>
  <!-- ─── LIST VIEW ──────────────────────────────────────────────────── -->
  <SettingsPageShell
      v-if="rootView === 'list'"
      :title="t('settings.integrations.title')"
      :subtitle="t('settings.integrations.subtitle')"
  >
    <!-- same structure as AiSettingsPanel list view -->
    <div class="ai-list-shell">
      <!-- Tips card — uses global .tips-card from settings-panel.css -->
      <SettingsTipsCard
          :title="t('settings.integrations.tipsTitle')"
          :content="t('settings.integrations.tipsContent')"
          icon="connection"
      />

      <!-- Segment tabs toolbar -->
      <div class="ai-list-shell__toolbar">
        <SettingsSegmentTabs
            v-model="listTab"
            variant="inline"
            :tabs="listSegmentTabs"
            :aria-label="t('settings.integrations.title')"
        />
      </div>

      <!-- Webhook tab -->
      <p v-if="listTab === 'webhook'" class="ai-list-note">{{ t('settings.integrations.webhookHint') }}</p>
      <p v-if="listTab === 'webhook' && !auth.isAdmin" class="ai-list-note">{{ t('settings.integrations.webhookAdminOnly') }}</p>

      <div v-if="listTab === 'webhook'" class="ai-model-list" role="list">
        <EmptyState
            v-if="loading"
            embedded
            compact
            class="ai-model-list__empty"
            :title="t('settings.integrations.loading')"
        />

        <template v-else>
          <EmptyState
              v-if="!hookListItems.length && !auth.isAdmin"
              embedded
              compact
              class="ai-model-list__empty"
              :title="t('settings.integrations.empty')"
          />

          <button
              v-for="item in hookListItems"
              :key="item.id"
              class="ai-model-card"
              type="button"
              role="listitem"
              @click="openEditHook(item.id)"
          >
            <span class="ai-model-card__icon is-chat" :class="{'has-error': item.hasError}" aria-hidden="true">
              <DwIcon name="connection" size="md" :stroke-width="1.5"/>
            </span>
            <span class="ai-model-card__body">
              <span class="ai-model-card__title-row">
                <span class="ai-model-card__name">{{ item.name }}</span>
                <span class="ai-model-card__kind">{{ item.channelLabel }}</span>
                <StatusPill :variant="item.statusVariant" dot>{{ item.statusText }}</StatusPill>
              </span>
              <span class="ai-model-card__meta">{{ item.meta }}</span>
            </span>
            <span class="ai-model-card__chevron" aria-hidden="true">
              <DwIcon name="chevron-right" size="md" :stroke-width="2.25"/>
            </span>
          </button>

          <button
              v-if="auth.isAdmin"
              class="ai-model-add"
              type="button"
              @click="openNewHook"
          >
            <span class="ai-model-add__icon" aria-hidden="true">
              <DwIcon name="plus" size="lg" :stroke-width="1.5"/>
            </span>
            <span class="ai-model-add__body">
              <span class="ai-model-add__title">{{ t('settings.integrations.addWebhook') }}</span>
              <span class="ai-model-add__hint">{{ t('settings.integrations.addWebhookHint') }}</span>
            </span>
          </button>
        </template>
      </div>

      <!-- OIDC tab -->
      <p v-if="listTab === 'oidc'" class="ai-list-note">{{ t('settings.integrations.oidcHint') }}</p>

      <div v-if="listTab === 'oidc' && auth.isAdmin" class="ai-model-list" role="list">
        <button class="ai-model-card" type="button" @click="openOidcEdit">
          <span class="ai-model-card__icon is-chat" aria-hidden="true">
            <DwIcon name="lock" size="md" :stroke-width="1.5"/>
          </span>
          <span class="ai-model-card__body">
            <span class="ai-model-card__title-row">
              <span class="ai-model-card__name">{{ t('settings.integrations.oidcTitle') }}</span>
              <StatusPill v-if="oidcLoaded" :variant="oidc.enabled ? 'success' : 'neutral'" dot>
                {{ oidc.enabled ? t('settings.integrations.statusEnabled') : t('settings.integrations.statusDisabled') }}
              </StatusPill>
            </span>
            <span class="ai-model-card__meta">
              {{ oidcLoaded && oidc.issuer ? oidc.issuer : t('settings.integrations.oidcNotConfigured') }}
            </span>
          </span>
          <span class="ai-model-card__chevron" aria-hidden="true">
            <DwIcon name="chevron-right" size="md" :stroke-width="2.25"/>
          </span>
        </button>
      </div>
    </div>
  </SettingsPageShell>

  <WebhookEditView
      v-else-if="rootView === 'webhook-edit'"
      :settings="webhook"
      v-model:edit-tab="editTab"
      @back="openList('webhook')"
  />

  <OidcEditView
      v-else-if="rootView === 'oidc-edit'"
      :settings="oidcSettings"
      @back="openList('oidc')"
  />

  <ConfirmDialog
      :open="confirmOpen"
      :title="confirmTitle"
      :message="confirmMessage"
      :confirm-label="confirmLabel"
      :confirm-variant="confirmVariant"
      @update:open="onConfirmOpenUpdate"
      @confirm="onConfirmDialog"
  />
</template>

<style scoped>
/* icon error state —— 中性描边 + 文字表达，避免与全局中性化用 !important 对抗 */
.ai-model-card__icon.has-error {
  color: var(--dw-text-secondary);
  border-color: color-mix(in srgb, var(--dw-text) 30%, var(--dw-border-light));
  background: var(--dw-bg-muted);
}
</style>
