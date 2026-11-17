<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwInlineAlert, DwInput, DwSecretInput, DwSelect, FormField, StatusPill, EmptyState} from '@/core/components'
import {DwIcon} from '@/core/icons'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsSegmentTabs from '@/features/settings/components/SettingsSegmentTabs.vue'
import {shouldAutoConfirmWebhook} from '@/features/settings/services/webhook-settings.service'
import {
  useOutboundWebhookSettings,
  type WebhookEditTab,
} from '@/features/settings/composables/useOutboundWebhookSettings'

defineOptions({name: 'WebhookEditView'})

const props = defineProps<{
  settings: ReturnType<typeof useOutboundWebhookSettings>
  editTab: WebhookEditTab
}>()

const emit = defineEmits<{
  'update:editTab': [value: WebhookEditTab]
  back: []
}>()

const {t} = useI18n()

const editTabModel = computed({
  get: () => props.editTab,
  set: (value: WebhookEditTab) => emit('update:editTab', value),
})

const {
  saving,
  testing,
  selectedSubscriptionType,
  lastFeedback,
  formError,
  form,
  showMessageTab,
  showMentionSection,
  editSegmentTabs,
  availableSelected,
  subscribedSelected,
  availableEvents,
  selectedSubscription,
  selectedBodyTemplate,
  selectedTitleTemplate,
  selectedMentionAll,
  selectedMentionMobilesText,
  selectedMentionUserIdsText,
  toggleAvailableItem,
  toggleSubscribedItem,
  moveToSubscribed,
  moveToAvailable,
  moveAllToSubscribed,
  moveAllToAvailable,
  channelOptions,
  channelLabel,
  urlPlaceholder,
  secretPlaceholder,
  selectedHook,
  editTitle,
  confirmationHint,
  TEMPLATE_VARS,
  defaultTemplatePlaceholder,
  defaultTitleTemplatePlaceholder,
  insertVar,
  urlChannelMismatch,
  eventTypeLabel,
  saveHook,
  removeHook,
  testHook,
} = props.settings
</script>

<template>
  <SettingsPageShell embedded>
    <div class="ai-edit-panel">
      <header class="ai-edit-panel__head">
        <button class="ai-back-link" type="button" @click="emit('back')">
          <DwIcon name="chevron-left" size="sm" :stroke-width="2.25"/>
          {{ t('settings.integrations.backToWebhooks') }}
        </button>
      </header>

      <div class="ai-edit-card">
        <!-- Hero -->
        <div class="ai-edit-card__hero">
          <div class="ai-edit-card__hero-copy">
            <StatusPill variant="info">{{ channelLabel(form.channel) }}</StatusPill>
            <h3>{{ editTitle }}</h3>
            <p>{{ confirmationHint }}</p>
          </div>
          <div class="ai-edit-card__hero-badges">
            <StatusPill :variant="form.enabled ? 'success' : 'neutral'" dot>
              {{ form.enabled ? t('settings.integrations.statusEnabled') : t('settings.integrations.statusDisabled') }}
            </StatusPill>
            <StatusPill :variant="shouldAutoConfirmWebhook(form.channel) ? 'primary' : 'warn'">
              {{ shouldAutoConfirmWebhook(form.channel) ? t('settings.integrations.confirmationAuto') : t('settings.integrations.confirmationManualOnly') }}
            </StatusPill>
          </div>
        </div>

        <!-- Feedback / error -->
        <div v-if="formError || lastFeedback" class="ai-edit-section int-edit-alerts">
          <DwInlineAlert v-if="formError" :message="formError" density="banner"/>
          <DwInlineAlert
              v-if="lastFeedback"
              :message="lastFeedback.message"
              :variant="lastFeedback.ok ? 'success' : 'warning'"
              density="banner"
          />
        </div>

        <!-- Edit sub-tabs -->
        <div class="int-edit-tabs">
          <SettingsSegmentTabs
              v-model="editTabModel"
              variant="inline"
              :tabs="editSegmentTabs"
              :aria-label="t('settings.integrations.editTabsAria')"
          />
        </div>

        <!-- ── Connection tab ─────────────────────────────────────────── -->
        <div v-show="editTab === 'connection'" class="ai-edit-section">
          <div class="int-section-head">
            <h4 class="ai-edit-section__title">{{ t('settings.integrations.sectionConnection') }}</h4>
            <p class="int-section-desc">{{ t(`settings.integrations.channelHint.${form.channel}`) }}</p>
          </div>

          <div class="field-grid">
            <FormField :label="t('settings.integrations.name')">
              <DwInput v-model="form.name" :placeholder="t('settings.integrations.namePlaceholder')"/>
            </FormField>
            <FormField :label="t('settings.integrations.channelLabel')">
              <DwSelect v-model="form.channel" size="sm" :options="channelOptions"/>
            </FormField>
            <div class="field field--full">
              <FormField :label="t('settings.integrations.url')">
                <DwInput v-model="form.url" :placeholder="urlPlaceholder()"/>
              </FormField>
              <p v-if="urlChannelMismatch" class="field-hint field-hint--warn">{{ urlChannelMismatch }}</p>
            </div>
            <FormField :label="t('settings.integrations.secret')">
              <DwSecretInput v-model="form.secret" :placeholder="secretPlaceholder()"/>
            </FormField>
            <FormField :label="t('settings.integrations.timeoutMs')">
              <DwInput v-model.number="form.timeoutMs" type="number"/>
            </FormField>
          </div>

          <div class="int-option-grid">
            <button
                class="int-option-tile"
                type="button"
                :class="{'is-on': form.enabled}"
                @click="form.enabled = !form.enabled"
            >
              <span class="int-option-tile__switch" :aria-hidden="true"/>
              <span class="int-option-tile__copy">
                <strong>{{ t('settings.integrations.enabled') }}</strong>
                <small>{{ t('settings.integrations.enabledHint') }}</small>
              </span>
            </button>
            <button
                class="int-option-tile"
                type="button"
                :class="{'is-on': form.includeSql}"
                @click="form.includeSql = !form.includeSql"
            >
              <span class="int-option-tile__switch" :aria-hidden="true"/>
              <span class="int-option-tile__copy">
                <strong>{{ t('settings.integrations.includeSql') }}</strong>
                <small>{{ t('settings.integrations.includeSqlHint') }}</small>
              </span>
            </button>
          </div>
        </div>

        <!-- ── Events tab ─────────────────────────────────────────────── -->
        <div v-show="editTab === 'events'" class="ai-edit-section">
          <div class="int-section-head">
            <h4 class="ai-edit-section__title">{{ t('settings.integrations.eventTypes') }}</h4>
            <p class="int-section-desc">{{ t('settings.integrations.eventTypesHint') }}</p>
          </div>

          <div class="int-dual-list">
            <div class="int-dual-list__pane">
              <div class="int-dual-list__pane-title">
                {{ t('settings.integrations.eventsAvailable') }}
                <span class="int-dual-list__count">({{ availableEvents.length }})</span>
              </div>
              <ul class="int-dual-list__list" role="listbox" aria-multiselectable="true">
                <li
                    v-for="ev in availableEvents"
                    :key="ev"
                    class="int-dual-list__item"
                    :class="{'is-selected': availableSelected.includes(ev)}"
                    role="option"
                    :aria-selected="availableSelected.includes(ev)"
                    @click="toggleAvailableItem(ev, $event)"
                    @dblclick="moveToSubscribed([ev])"
                >
                  {{ eventTypeLabel(ev) }}
                </li>
                <li v-if="!availableEvents.length" class="int-dual-list__empty" role="presentation">
                  <EmptyState
                      embedded
                      compact
                      :title="t('settings.integrations.eventsAllSubscribed')"
                  />
                </li>
              </ul>
            </div>

            <div class="int-dual-list__controls">
              <button
                  class="int-dual-list__btn"
                  type="button"
                  :title="t('settings.integrations.eventsMoveAllRight')"
                  @click="moveAllToSubscribed"
              >
                <DwIcon name="chevron-right" size="sm" :stroke-width="2.2"/>
                <DwIcon name="chevron-right" size="sm" :stroke-width="2.2" style="margin-left:-9px"/>
              </button>
              <button
                  class="int-dual-list__btn"
                  type="button"
                  :disabled="!availableSelected.length"
                  :title="t('settings.integrations.eventsMoveRight')"
                  @click="moveToSubscribed(availableSelected)"
              >
                <DwIcon name="chevron-right" size="sm" :stroke-width="2.2"/>
              </button>
              <button
                  class="int-dual-list__btn"
                  type="button"
                  :disabled="!subscribedSelected.length"
                  :title="t('settings.integrations.eventsMoveLeft')"
                  @click="moveToAvailable(subscribedSelected)"
              >
                <DwIcon name="chevron-left" size="sm" :stroke-width="2.2"/>
              </button>
              <button
                  class="int-dual-list__btn"
                  type="button"
                  :title="t('settings.integrations.eventsMoveAllLeft')"
                  @click="moveAllToAvailable"
              >
                <DwIcon name="chevron-left" size="sm" :stroke-width="2.2"/>
                <DwIcon name="chevron-left" size="sm" :stroke-width="2.2" style="margin-left:-9px"/>
              </button>
            </div>

            <div class="int-dual-list__pane">
              <div class="int-dual-list__pane-title">
                {{ t('settings.integrations.eventsSubscribed') }}
                <span class="int-dual-list__count">({{ form.subscriptions.length }})</span>
              </div>
              <ul class="int-dual-list__list" role="listbox" aria-multiselectable="true">
                <li
                    v-for="subscription in form.subscriptions"
                    :key="subscription.eventType"
                    class="int-dual-list__item"
                    :class="{'is-selected': subscribedSelected.includes(subscription.eventType)}"
                    role="option"
                    :aria-selected="subscribedSelected.includes(subscription.eventType)"
                    @click="toggleSubscribedItem(subscription.eventType, $event); selectedSubscriptionType = subscription.eventType"
                    @dblclick="moveToAvailable([subscription.eventType])"
                >
                  {{ eventTypeLabel(subscription.eventType) }}
                </li>
                <li v-if="!form.subscriptions.length" class="int-dual-list__empty" role="presentation">
                  <EmptyState
                      embedded
                      compact
                      :title="t('settings.integrations.eventsNoneSubscribed')"
                  />
                </li>
              </ul>
            </div>
          </div>
          <p class="field-hint">{{ t('settings.integrations.eventsDualListHint') }}</p>
        </div>

        <!-- ── Message tab ────────────────────────────────────────────── -->
        <div v-show="editTab === 'message' && showMessageTab" class="ai-edit-section int-message-tab">
          <DwInlineAlert
              v-if="!selectedSubscription"
              variant="info"
              :message="t('settings.integrations.selectEventToConfigure')"
              style="margin-bottom: 12px"
          />
          <div class="int-msg-panel">
            <div class="int-msg-panel__head">
              <div>
                <h4 class="ai-edit-section__title">{{ t('settings.integrations.messageTemplate') }}</h4>
                <p class="int-section-desc">
                  {{ selectedSubscription ? eventTypeLabel(selectedSubscription.eventType) : t('settings.integrations.messageTemplateHint') }}
                </p>
              </div>
              <button
                  class="int-msg-fill-btn"
                  type="button"
                  :disabled="!selectedSubscription"
                  @click="selectedBodyTemplate = defaultTemplatePlaceholder"
              >
                {{ t('settings.integrations.fillDefaultTemplate') }}
              </button>
            </div>

            <FormField :label="t('settings.integrations.messageTitleTemplate')">
              <DwInput
                  v-model="selectedTitleTemplate"
                  :placeholder="defaultTitleTemplatePlaceholder"
                  :disabled="!selectedSubscription"
              />
              <p class="field-hint">{{ t('settings.integrations.messageTitleTemplateHint') }}</p>
            </FormField>

            <div class="int-msg-editor-shell">
              <div class="int-template-vars int-template-vars--toolbar">
                <span class="int-template-vars__label">{{ t('settings.integrations.templateVarsLabel') }}</span>
                <button
                    v-for="v in TEMPLATE_VARS"
                    :key="v.key"
                    class="int-template-var-chip int-template-var-chip--compact"
                    type="button"
                    :title="v.title"
                    :disabled="!selectedSubscription"
                    @click="insertVar(v.token)"
                >
                  <code>{{ v.key }}</code>
                  <span>{{ v.short }}</span>
                </button>
              </div>
              <DwInput
                  v-model="selectedBodyTemplate"
                  class="int-template-editor"
                  variant="mono"
                  :rows="10"
                  :placeholder="defaultTemplatePlaceholder"
                  :disabled="!selectedSubscription"
                  :spellcheck="false"
              />
              <p class="field-hint">{{ t('settings.integrations.messageTemplateEmpty') }}</p>
            </div>
          </div>

          <div v-if="showMentionSection" class="int-msg-panel int-msg-panel--mention">
            <div class="int-msg-panel__head">
              <div>
                <h4 class="ai-edit-section__title">{{ t('settings.integrations.mentionTitle') }}</h4>
                <p class="int-section-desc">{{ t('settings.integrations.mentionHint') }}</p>
              </div>
              <button
                  class="int-mention-all"
                  type="button"
                  :class="{'is-on': selectedMentionAll}"
                  :disabled="!selectedSubscription"
                  @click="selectedMentionAll = !selectedMentionAll"
              >
                <span class="int-mention-all__switch" aria-hidden="true"/>
                <span>{{ t('settings.integrations.mentionAll') }}</span>
              </button>
            </div>

            <div class="field-grid int-mention-grid">
              <FormField :label="t('settings.integrations.mentionMobiles')">
                <DwInput
                    v-model="selectedMentionMobilesText"
                    :disabled="!selectedSubscription"
                    :placeholder="t('settings.integrations.mentionMobilesPlaceholder')"
                />
              </FormField>
              <FormField :label="t('settings.integrations.mentionUserIds')">
                <DwInput
                    v-model="selectedMentionUserIdsText"
                    :disabled="!selectedSubscription"
                    :placeholder="t('settings.integrations.mentionUserIdsPlaceholder')"
                />
              </FormField>
            </div>
            <p class="field-hint">{{ t('settings.integrations.mentionFieldsHint') }}</p>
          </div>
        </div>
      </div>

      <footer class="ai-edit-footer">
        <DwButton variant="ghost" @click="emit('back')">
          {{ t('settings.integrations.cancelEdit') }}
        </DwButton>
        <div class="int-edit-footer-actions">
          <DwButton v-if="selectedHook" variant="danger" size="sm" @click="removeHook(selectedHook.id)">
            {{ t('settings.integrations.delete') }}
          </DwButton>
          <DwButton v-if="form.id" variant="secondary" :disabled="testing" @click="testHook(form.id)">
            {{ t('settings.integrations.test') }}
          </DwButton>
          <DwButton variant="primary" :loading="saving" @click="saveHook">
            {{ form.id ? t('settings.integrations.update') : t('settings.integrations.create') }}
          </DwButton>
        </div>
      </footer>
    </div>
  </SettingsPageShell>
</template>

<style scoped>
/* ─── Dual-list (fixed-height, no scroll leaking) ────────────────────── */
.int-dual-list {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 8px;
  height: 260px;
}
.int-dual-list__pane {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--dw-panel-border);
  border-radius: var(--dw-panel-radius);
  overflow: hidden;
  background: var(--dw-bg-panel);
}
.int-dual-list__pane-title {
  padding: 5px 10px;
  font-size: var(--dw-text-xs);
  font-weight: 600;
  color: var(--dw-text-muted);
  border-bottom: 1px solid var(--dw-border-light);
  background: var(--dw-bg-editor);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  flex-shrink: 0;
}
.int-dual-list__count { font-weight: 400; }
.int-dual-list__list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  overflow-y: auto;
  flex: 1;
}
.int-dual-list__item {
  padding: 4px 10px;
  font-size: var(--dw-text-sm);
  cursor: pointer;
  user-select: none;
  border-radius: var(--dw-control-radius-sm);
  margin: 1px 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--dw-text-secondary);
}
.int-dual-list__item:hover {
  background: color-mix(in srgb, var(--dw-primary) 8%, transparent);
  color: var(--dw-text);
}
.int-dual-list__item.is-selected {
  background: color-mix(in srgb, var(--dw-primary) 14%, transparent);
  color: var(--dw-primary);
  font-weight: 600;
}
.int-dual-list__empty {
  padding: 4px 6px;
  list-style: none;
}

.int-dual-list__empty :deep(.dw-empty) {
  padding: 6px 4px;
  align-items: flex-start;
  text-align: left;
}

.int-dual-list__empty :deep(p) {
  font-size: var(--dw-text-sm);
  font-weight: 400;
  font-style: italic;
  color: var(--dw-text-muted);
}
.int-dual-list__controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 2px;
}
.int-dual-list__btn {
  display: inline-flex;
  align-items: center;
  padding: 4px 5px;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-panel);
  color: var(--dw-text-secondary);
  cursor: pointer;
  transition: background 0.1s, border-color 0.1s, color 0.1s;
  line-height: 1;
}
.int-dual-list__btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--dw-primary) 10%, var(--dw-bg-panel));
  border-color: color-mix(in srgb, var(--dw-primary) 40%, var(--dw-border));
  color: var(--dw-primary);
}
.int-dual-list__btn:disabled {
  opacity: var(--dw-control-disabled-opacity);
  color: var(--dw-text-muted);
  cursor: default;
}

@media (max-width: 900px) {
  .int-dual-list {
    grid-template-columns: 1fr;
    grid-template-rows: 180px auto 180px;
    height: auto;
  }
  .int-dual-list__controls {
    flex-direction: row;
    justify-content: center;
  }
}

/* ─── Message template editor ────────────────────────────────────────── */
.int-message-tab {
  display: grid;
  gap: 14px;
}
.int-msg-panel {
  padding: 14px;
  border: 1px solid var(--dw-panel-border);
  border-radius: var(--dw-menu-radius);
  background: var(--dw-bg-editor);
}
.int-msg-panel--mention {
  background: var(--dw-bg-panel);
}
.int-msg-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.int-msg-panel__head .ai-edit-section__title {
  margin-bottom: 4px;
}
.int-msg-fill-btn {
  flex-shrink: 0;
  padding: 5px 10px;
  font-size: var(--dw-text-xs);
  font-weight: 550;
  color: var(--dw-primary);
  background: color-mix(in srgb, var(--dw-primary) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--dw-primary) 22%, transparent);
  border-radius: var(--dw-control-radius);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s;
}
.int-msg-fill-btn:hover {
  background: color-mix(in srgb, var(--dw-primary) 14%, transparent);
  border-color: color-mix(in srgb, var(--dw-primary) 40%, transparent);
}
.int-msg-editor-shell {
  display: grid;
  gap: 8px;
}
.int-template-vars {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.int-template-vars--toolbar {
  padding: 8px;
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius) var(--dw-control-radius) 0 0;
  border-bottom: none;
  background: var(--dw-bg-panel);
  margin-bottom: 0;
}
.int-template-vars__label {
  font-size: var(--dw-text-xs);
  font-weight: 600;
  color: var(--dw-text-muted);
  letter-spacing: 0.02em;
  flex-shrink: 0;
  margin-right: 2px;
}
.int-template-var-chip {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 4px 8px;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-secondary);
  background: color-mix(in srgb, var(--dw-primary) 8%, var(--dw-bg-panel));
  border: 1px solid color-mix(in srgb, var(--dw-primary) 25%, transparent);
  border-radius: var(--dw-control-radius);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  user-select: none;
  text-align: left;
  line-height: 1.3;
}
.int-template-var-chip--compact {
  flex-direction: row;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: var(--dw-radius-pill);
}
.int-template-var-chip code {
  font-family: var(--dw-font-mono, monospace);
  font-size: var(--dw-text-xs);
  color: var(--dw-primary);
  background: transparent;
  padding: 0;
}
.int-template-var-chip span {
  font-size: var(--dw-text-2xs);
  color: var(--dw-text-muted);
}
.int-template-var-chip--compact span {
  font-size: var(--dw-text-xs);
}
.int-template-var-chip:hover {
  background: color-mix(in srgb, var(--dw-primary) 15%, var(--dw-bg-panel));
  border-color: color-mix(in srgb, var(--dw-primary) 45%, transparent);
}
.int-template-editor,
:deep(.int-template-editor) {
  width: 100%;
  box-sizing: border-box;
  font-size: var(--dw-text-sm);
  font-family: var(--dw-font-mono, monospace);
  line-height: 1.65;
  border-radius: 0 0 var(--dw-panel-radius) var(--dw-panel-radius);
  resize: vertical;
  min-height: 180px;
}
.int-mention-grid {
  margin-top: 0;
}
.int-mention-all {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 6px 10px;
  border: 1px solid var(--dw-panel-border);
  border-radius: var(--dw-radius-pill);
  background: var(--dw-bg-editor);
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
  font-weight: 550;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}
.int-mention-all.is-on {
  border-color: color-mix(in srgb, var(--dw-primary) 40%, var(--dw-panel-border));
  background: color-mix(in srgb, var(--dw-primary) 8%, var(--dw-bg-panel));
  color: var(--dw-primary);
}
.int-mention-all__switch {
  width: 28px;
  height: var(--dw-icon-size-md);
  border-radius: var(--dw-radius-pill);
  background: var(--dw-border);
  position: relative;
  transition: background 0.15s;
}
.int-mention-all__switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: var(--dw-icon-size-xs);
  height: var(--dw-icon-size-xs);
  border-radius: 50%;
  background: var(--dw-bg);
  box-shadow: var(--dw-shadow-sm);
  transition: transform 0.15s;
}
.int-mention-all.is-on .int-mention-all__switch {
  background: var(--dw-primary);
}
.int-mention-all.is-on .int-mention-all__switch::after {
  transform: translateX(12px);
}

/* ─── Edit layout polish ─────────────────────────────────────────────── */
.int-edit-tabs {
  padding: 10px 16px 0;
  border-bottom: 1px solid var(--dw-border-light);
}
.int-edit-alerts {
  display: grid;
  gap: 8px;
  padding-bottom: 0 !important;
}
.int-section-head {
  margin-bottom: 14px;
}
.int-section-head .ai-edit-section__title {
  margin-bottom: 4px;
}
.int-section-head--nested {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid var(--dw-border-light);
}
.int-section-desc {
  margin: 0;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
  line-height: 1.55;
}
.int-option-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}
.int-option-grid--single {
  grid-template-columns: 1fr;
}
.int-option-tile {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  text-align: left;
  border: 1px solid var(--dw-panel-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-editor);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}
.int-option-tile:hover {
  border-color: color-mix(in srgb, var(--dw-primary) 35%, var(--dw-panel-border));
}
.int-option-tile.is-on {
  border-color: color-mix(in srgb, var(--dw-primary) 45%, var(--dw-panel-border));
  background: color-mix(in srgb, var(--dw-primary) 6%, var(--dw-bg-panel));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dw-primary) 18%, transparent);
}
.int-option-tile__switch {
  flex-shrink: 0;
  width: 34px;
  height: var(--dw-icon-size-xl);
  margin-top: 1px;
  border-radius: var(--dw-radius-pill);
  background: var(--dw-border);
  position: relative;
  transition: background 0.15s;
}
.int-option-tile__switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: var(--dw-icon-size-md);
  height: var(--dw-icon-size-md);
  border-radius: 50%;
  background: var(--dw-bg);
  box-shadow: var(--dw-shadow-sm);
  transition: transform 0.15s;
}
.int-option-tile.is-on .int-option-tile__switch {
  background: var(--dw-primary);
}
.int-option-tile.is-on .int-option-tile__switch::after {
  transform: translateX(14px);
}
.int-option-tile__copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.int-option-tile__copy strong {
  font-size: var(--dw-text-md);
  font-weight: 600;
  color: var(--dw-text);
}
.int-option-tile__copy small {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  line-height: 1.45;
}
.int-edit-footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.ai-edit-footer > :first-child {
  margin-right: auto;
}

@media (max-width: 720px) {
  .int-option-grid {
    grid-template-columns: 1fr;
  }
  .int-msg-panel__head {
    flex-direction: column;
    align-items: stretch;
  }
  .int-mention-grid {
    grid-template-columns: 1fr;
  }
}
</style>
