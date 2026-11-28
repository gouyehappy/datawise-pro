import {computed, reactive, ref, watch, type Ref} from 'vue'
import {useI18n} from 'vue-i18n'
import type {SelectOption} from '@/core/components'
import {platformApi} from '@/api'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {resolveDisplayApiErrorMessage} from '@/shared/api/http/api-error-message'
import type {
  OutboundEventDefinition,
  OutboundWebhook,
  OutboundWebhookSubscription,
  OutboundWebhookTestResult,
} from '@/shared/api/types'
import {isIssueWebhookChannel} from '@/features/settings/services/webhook-settings.service'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'

export type IntegrationsListTab = 'webhook' | 'oidc'
export type IntegrationsRootView = 'list' | 'webhook-edit' | 'oidc-edit'
export type WebhookEditTab = 'connection' | 'events' | 'message'

export interface HookListItem {
  id: string
  name: string
  channelLabel: string
  meta: string
  statusVariant: 'success' | 'warn' | 'neutral'
  statusText: string
  hasError: boolean
}

export type OutboundWebhookSettingsDeps = {
  rootView: Ref<IntegrationsRootView>
  editTab: Ref<WebhookEditTab>
  openList: (tab?: IntegrationsListTab) => void
  askConfirm: (options: {
    title: string
    message: string
    confirmLabel: string
  }) => Promise<boolean>
}

/** Outbound webhook form / list / save / test / dual-list cluster. */
export function useOutboundWebhookSettings(deps: OutboundWebhookSettingsDeps) {
  const {t, locale} = useI18n()
  const toast = useAppToast()
  const entitlement = useEntitlementStore()

  function apiErrorMessage(error: unknown, fallbackKey: string) {
    return resolveDisplayApiErrorMessage(error, (key) => String(t(key))) || t(fallbackKey)
  }

  const eventDefinitions = ref<OutboundEventDefinition[]>([])
  const eventOptions = computed(() =>
    [...eventDefinitions.value]
      .sort((a, b) => {
        const cat = (a.category || '').localeCompare(b.category || '')
        if (cat !== 0) return cat
        return a.type.localeCompare(b.type)
      })
      .map((item) => item.type),
  )

  function eventTypeLabel(type: string) {
    const schemaLabel = eventDefinitions.value.find((item) => item.type === type)
    const localizedSchemaLabel = schemaLabel
      ? (locale.value.startsWith('zh') ? schemaLabel.displayNameZh : schemaLabel.displayNameEn)
      : ''
    if (localizedSchemaLabel) {
      return schemaLabel?.category
        ? `[${schemaLabel.category}] ${localizedSchemaLabel}`
        : localizedSchemaLabel
    }
    const key = `settings.integrations.events.${type.replace(/\./g, '_')}`
    const label = t(key)
    return label === key ? type : label
  }

  const hooks = ref<OutboundWebhook[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const testing = ref(false)
  const selectedHookId = ref<string>('')
  const selectedSubscriptionType = ref<string>('')
  const editingHasSecret = ref(false)
  const lastFeedback = ref<{message: string; ok: boolean} | null>(null)
  const formError = ref('')
  const form = reactive({
    id: '' as string,
    name: '',
    channel: 'webhook',
    url: '',
    secret: '',
    enabled: true,
    includeSql: false,
    timeoutMs: 5000,
    subscriptions: [] as OutboundWebhookSubscription[],
  })

  const showMessageTab = computed(() => ['webhook', 'dingtalk', 'feishu'].includes(form.channel))
  const showMentionSection = computed(() => form.channel === 'dingtalk' || form.channel === 'feishu')

  const editSegmentTabs = computed(() => {
    const tabs: Array<{id: string; label: string; count?: number}> = [
      {id: 'connection', label: t('settings.integrations.editTabConnection')},
      {id: 'events', label: t('settings.integrations.editTabEvents'), count: form.subscriptions.length},
    ]
    if (showMessageTab.value) {
      tabs.push({id: 'message', label: t('settings.integrations.editTabMessage')})
    }
    return tabs
  })

  function ensureEditTabValid() {
    if (deps.editTab.value === 'message' && !showMessageTab.value) {
      deps.editTab.value = 'connection'
    }
  }

  watch(() => form.channel, () => {
    ensureEditTabValid()
  })

  const availableSelected = ref<string[]>([])
  const subscribedSelected = ref<string[]>([])

  const availableEvents = computed(() =>
    eventOptions.value.filter((e) => !form.subscriptions.some((item) => item.eventType === e)),
  )

  const selectedEventDefinition = computed(() =>
    eventDefinitions.value.find((item) => item.type === selectedSubscriptionType.value) ?? null,
  )

  const selectedSubscription = computed(() =>
    form.subscriptions.find((item) => item.eventType === selectedSubscriptionType.value) ?? null,
  )

  const selectedBodyTemplate = computed({
    get: () => selectedSubscription.value?.bodyTemplate || '',
    set: (value: string) => {
      if (selectedSubscription.value) selectedSubscription.value.bodyTemplate = value
    },
  })

  const selectedTitleTemplate = computed({
    get: () => selectedSubscription.value?.titleTemplate || '',
    set: (value: string) => {
      if (selectedSubscription.value) selectedSubscription.value.titleTemplate = value
    },
  })

  const selectedMentionAll = computed({
    get: () => Boolean(selectedSubscription.value?.mentionAll),
    set: (value: boolean) => {
      if (selectedSubscription.value) selectedSubscription.value.mentionAll = value
    },
  })

  const selectedMentionMobilesText = computed({
    get: () => (selectedSubscription.value?.mentionMobiles || []).join(', '),
    set: (value: string) => {
      if (selectedSubscription.value) selectedSubscription.value.mentionMobiles = parseMentionList(value)
    },
  })

  const selectedMentionUserIdsText = computed({
    get: () => (selectedSubscription.value?.mentionUserIds || []).join(', '),
    set: (value: string) => {
      if (selectedSubscription.value) selectedSubscription.value.mentionUserIds = parseMentionList(value)
    },
  })

  function toggleAvailableItem(type: string, event: MouseEvent) {
    if (event.ctrlKey || event.metaKey) {
      const idx = availableSelected.value.indexOf(type)
      if (idx >= 0) availableSelected.value.splice(idx, 1)
      else availableSelected.value.push(type)
    } else {
      availableSelected.value = [type]
    }
    subscribedSelected.value = []
  }

  function toggleSubscribedItem(type: string, event: MouseEvent) {
    if (event.ctrlKey || event.metaKey) {
      const idx = subscribedSelected.value.indexOf(type)
      if (idx >= 0) subscribedSelected.value.splice(idx, 1)
      else subscribedSelected.value.push(type)
    } else {
      subscribedSelected.value = [type]
    }
    availableSelected.value = []
  }

  function moveToSubscribed(types: string[]) {
    for (const type of types) {
      if (!form.subscriptions.some((item) => item.eventType === type)) {
        form.subscriptions.push({
          eventType: type,
          enabled: true,
          titleTemplate: null,
          bodyTemplate: null,
          mentionAll: false,
          mentionMobiles: [],
          mentionUserIds: [],
        })
      }
    }
    if (!selectedSubscriptionType.value && types.length) selectedSubscriptionType.value = types[0]
    availableSelected.value = []
    subscribedSelected.value = []
  }

  function moveToAvailable(types: string[]) {
    form.subscriptions = form.subscriptions.filter((item) => !types.includes(item.eventType))
    if (types.includes(selectedSubscriptionType.value)) {
      selectedSubscriptionType.value = form.subscriptions[0]?.eventType || ''
    }
    subscribedSelected.value = []
    availableSelected.value = []
  }

  function moveAllToSubscribed() {
    moveToSubscribed(availableEvents.value)
    availableSelected.value = []
    subscribedSelected.value = []
  }

  function moveAllToAvailable() {
    form.subscriptions = []
    selectedSubscriptionType.value = ''
    availableSelected.value = []
    subscribedSelected.value = []
  }

  const channelOptions = computed<SelectOption[]>(() => [
    {value: 'webhook', label: t('settings.integrations.channel.webhook')},
    {value: 'feishu', label: t('settings.integrations.channel.feishu')},
    {value: 'dingtalk', label: t('settings.integrations.channel.dingtalk')},
    {value: 'email', label: t('settings.integrations.channel.email')},
    {value: 'github_issue', label: t('settings.integrations.channel.github_issue')},
    {value: 'gitlab_issue', label: t('settings.integrations.channel.gitlab_issue')},
    {value: 'jira_issue', label: t('settings.integrations.channel.jira_issue')},
  ])

  function channelLabel(channel: string | undefined) {
    const key = `settings.integrations.channel.${channel || 'webhook'}`
    const label = t(key)
    return label === key ? (channel || 'webhook') : label
  }

  function urlPlaceholder() {
    switch (form.channel) {
      case 'feishu': return 'https://open.feishu.cn/open-apis/bot/v2/hook/…'
      case 'dingtalk': return 'https://oapi.dingtalk.com/robot/send?access_token=…'
      case 'email': return 'mailto:ops@example.com  or  https://mail-gateway/send'
      case 'github_issue': return 'https://api.github.com/repos/{owner}/{repo}/issues'
      case 'gitlab_issue': return 'https://gitlab.example/api/v4/projects/{id}/issues'
      case 'jira_issue': return 'https://your-domain.atlassian.net/rest/api/3/issue?project=KEY'
      default: return 'https://example.com/hooks/datawise'
    }
  }

  function secretPlaceholder() {
    if (editingHasSecret.value && !form.secret.trim()) return t('settings.integrations.secretKeep')
    switch (form.channel) {
      case 'github_issue':
      case 'gitlab_issue':
      case 'jira_issue': return t('settings.integrations.issueTokenPlaceholder')
      case 'feishu':
      case 'dingtalk': return t('settings.integrations.botSecretPlaceholder')
      case 'email': return t('settings.integrations.emailSecretPlaceholder')
      default: return t('settings.integrations.secretPlaceholder')
    }
  }

  const hookListItems = computed<HookListItem[]>(() =>
      hooks.value.map((hook) => {
        let statusVariant: HookListItem['statusVariant'] = 'neutral'
        let statusText = t('settings.integrations.statusIdle')
        if (hook.lastError) {
          statusVariant = 'warn'
          statusText = t('settings.integrations.statusFailed')
        } else if (hook.lastSuccessAt) {
          statusVariant = 'success'
          statusText = t('settings.integrations.statusReady')
        }
        return {
          id: hook.id,
          name: hook.name,
          channelLabel: channelLabel(hook.channel),
          meta: hook.url,
          statusVariant,
          statusText,
          hasError: Boolean(hook.lastError),
        }
      }),
  )

  const selectedHook = computed(() => hooks.value.find((hook) => hook.id === selectedHookId.value) ?? null)
  const editTitle = computed(() => form.name.trim() || t('settings.integrations.newWebhook'))
  const confirmationHint = computed(() =>
      isIssueWebhookChannel(form.channel)
        ? t('settings.integrations.confirmationSkippedIssue')
        : t('settings.integrations.confirmationAutoSendHint'),
  )

  const TEMPLATE_VARS = computed(() => {
    const eventVars = (selectedEventDefinition.value?.variables || []).map((item) => ({
      key: item.name,
      token: `{{${item.name}}}`,
      title: locale.value.startsWith('zh') ? item.descriptionZh : item.descriptionEn,
      short: item.name,
    }))
    return [
      {key: 'title', token: '{{title}}', title: t('settings.integrations.templateVar.title'), short: t('settings.integrations.templateVarShort.title')},
      {key: 'type', token: '{{type}}', title: t('settings.integrations.templateVar.type'), short: t('settings.integrations.templateVarShort.type')},
      {key: 'body', token: '{{body}}', title: t('settings.integrations.templateVar.body'), short: t('settings.integrations.templateVarShort.body')},
      {key: 'occurredAt', token: '{{occurredAt}}', title: t('settings.integrations.templateVar.occurredAt'), short: t('settings.integrations.templateVarShort.occurredAt')},
      ...eventVars.filter((item) => !['title', 'type', 'body', 'occurredAt'].includes(item.key)),
    ]
  })

  function parseMentionList(text: string): string[] {
    return text
        .split(/[,，;\s\n]+/)
        .map((item) => item.trim())
        .filter(Boolean)
  }

  const defaultTemplatePlaceholder = computed(() => {
    if (selectedEventDefinition.value?.defaultBodyTemplate?.trim()) {
      return selectedEventDefinition.value.defaultBodyTemplate
    }
    if (form.channel === 'feishu') {
      return t('settings.integrations.defaultBodyFeishu')
    }
    if (form.channel === 'dingtalk') {
      return '#### {{title}}\n\n> **事件类型：** {{type}}  \n> {{body}}  \n\n来自 DataWise'
    }
    return '{{title}}\n{{type}}: {{body}}'
  })

  const defaultTitleTemplatePlaceholder = computed(() =>
    selectedEventDefinition.value?.defaultTitleTemplate || '{{title}}',
  )

  function insertVar(variable: string) {
    selectedBodyTemplate.value = (selectedBodyTemplate.value || '') + variable
  }

  const urlChannelMismatch = computed(() => {
    if (!form.url || !form.channel) return null
    const url = form.url.toLowerCase()
    if (form.channel === 'webhook') {
      if (url.includes('oapi.dingtalk.com')) return t('settings.integrations.channelMismatchDingtalk')
      if (url.includes('open.feishu.cn') || url.includes('open.larksuite.com')) return t('settings.integrations.channelMismatchFeishu')
    }
    return null
  })

  function setFormFromHook(hook: OutboundWebhook) {
    form.id = hook.id
    form.name = hook.name
    form.channel = hook.channel || 'webhook'
    form.url = hook.url
    form.secret = ''
    form.enabled = hook.enabled
    form.includeSql = hook.includeSql
    form.timeoutMs = hook.timeoutMs
    form.subscriptions = hook.subscriptions?.length
      ? hook.subscriptions.map((item) => ({
        eventType: item.eventType,
        enabled: item.enabled !== false,
        titleTemplate: item.titleTemplate || null,
        bodyTemplate: item.bodyTemplate || null,
        mentionAll: item.mentionAll ?? false,
        mentionMobiles: [...(item.mentionMobiles || [])],
        mentionUserIds: [...(item.mentionUserIds || [])],
      }))
      : (hook.eventTypes || []).map((eventType) => ({
        eventType,
        enabled: true,
        titleTemplate: null,
        bodyTemplate: hook.messageTemplate || null,
        mentionAll: hook.mentionAll ?? false,
        mentionMobiles: [...(hook.mentionMobiles || [])],
        mentionUserIds: [...(hook.mentionUserIds || [])],
      }))
    editingHasSecret.value = Boolean(hook.hasSecret)
    selectedHookId.value = hook.id
    selectedSubscriptionType.value = form.subscriptions[0]?.eventType || ''
    availableSelected.value = []
    subscribedSelected.value = []
  }

  function resetForm() {
    form.id = ''
    form.name = ''
    form.channel = 'webhook'
    form.url = ''
    form.secret = ''
    form.enabled = true
    form.includeSql = false
    form.timeoutMs = 5000
    form.subscriptions = []
    editingHasSecret.value = false
    formError.value = ''
    lastFeedback.value = null
    selectedSubscriptionType.value = ''
    availableSelected.value = []
    subscribedSelected.value = []
  }

  function isWebhookFormDirty() {
    return Boolean(
      form.name.trim() || form.url.trim() || form.secret.trim() ||
      form.subscriptions.length || form.includeSql || !form.enabled || form.timeoutMs !== 5000,
    )
  }

  function openNewHook() {
    if (!entitlement.guardPack('pack.security', 'settings.security')) return
    resetForm()
    selectedHookId.value = ''
    deps.editTab.value = 'connection'
    deps.rootView.value = 'webhook-edit'
  }

  function openEditHook(id: string) {
    if (!entitlement.guardPack('pack.security', 'settings.security')) return
    const hook = hooks.value.find((item) => item.id === id)
    if (!hook) return
    setFormFromHook(hook)
    formError.value = ''
    lastFeedback.value = null
    deps.editTab.value = 'connection'
    deps.rootView.value = 'webhook-edit'
  }

  async function reloadHooks(preferId?: string) {
    loading.value = true
    try {
      hooks.value = await platformApi.listOutboundWebhooks()
      const targetId = preferId ?? selectedHookId.value
      if (targetId && hooks.value.some((h) => h.id === targetId)) {
        selectedHookId.value = targetId
      } else if (hooks.value.length) {
        selectedHookId.value = hooks.value[0].id
      } else {
        selectedHookId.value = ''
      }
    } catch (error) {
      toast.error(apiErrorMessage(error, 'settings.integrations.loadFailed'))
    } finally {
      loading.value = false
    }
  }

  async function reloadWebhookSchema() {
    try {
      eventDefinitions.value = await platformApi.listOutboundWebhookSchema()
      if (!selectedSubscriptionType.value && form.subscriptions.length) {
        selectedSubscriptionType.value = form.subscriptions[0].eventType
      }
    } catch (error) {
      toast.error(apiErrorMessage(error, 'settings.integrations.loadFailed'))
    }
  }

  function formatConfirmationFeedback(result: OutboundWebhookTestResult | null | undefined): string {
    if (!result) return t('settings.integrations.confirmationUnknown')
    return result.ok
      ? t('settings.integrations.confirmationSent', {code: result.statusCode})
      : t('settings.integrations.confirmationFailed', {msg: result.message})
  }

  async function saveHook() {
    formError.value = ''
    lastFeedback.value = null
    if (!form.name.trim() || !form.url.trim()) {
      formError.value = t('settings.integrations.webhookRequired')
      return
    }
    if (isIssueWebhookChannel(form.channel) && !form.secret.trim() && !(form.id && editingHasSecret.value)) {
      formError.value = t('settings.integrations.issueSecretRequired')
      return
    }
    saving.value = true
    try {
      const timeoutMs = Number.isFinite(form.timeoutMs) ? Math.trunc(form.timeoutMs) : 5000
      const subscriptions = form.subscriptions.map((item) => ({
        eventType: item.eventType,
        enabled: item.enabled !== false,
        titleTemplate: item.titleTemplate?.trim() || null,
        bodyTemplate: item.bodyTemplate?.trim() || null,
        mentionAll: showMentionSection.value ? Boolean(item.mentionAll) : null,
        mentionMobiles: showMentionSection.value ? [...(item.mentionMobiles || [])] : [],
        mentionUserIds: showMentionSection.value ? [...(item.mentionUserIds || [])] : [],
      }))
      const result = await platformApi.saveOutboundWebhook({
        id: form.id || undefined,
        name: form.name.trim(),
        channel: form.channel,
        url: form.url.trim(),
        ...(form.secret.trim() ? {secret: form.secret.trim()} : {}),
        enabled: form.enabled,
        includeSql: form.includeSql,
        timeoutMs,
        eventTypes: subscriptions.filter((item) => item.enabled !== false).map((item) => item.eventType),
        subscriptions,
      })
      if (result.confirmationSkipped) {
        lastFeedback.value = {message: t('settings.integrations.confirmationSkippedIssue'), ok: true}
        toast.warning(t('settings.integrations.confirmationSkippedIssue'))
      } else if (result.confirmationAttempted) {
        const message = formatConfirmationFeedback(result.confirmationResult)
        const ok = Boolean(result.confirmationResult?.ok)
        lastFeedback.value = {message, ok}
        // 成功态看面板内 lastFeedback；失败仍 toast 提醒。
        if (!ok) toast.warning(message)
      }
      await reloadHooks(result.webhook.id)
      openEditHook(result.webhook.id)
    } catch (error) {
      formError.value = apiErrorMessage(error, 'settings.integrations.saveFailed')
    } finally {
      saving.value = false
    }
  }

  async function removeHook(id: string) {
    const hook = hooks.value.find((item) => item.id === id)
    const confirmed = await deps.askConfirm({
      title: t('settings.integrations.delete'),
      message: t('settings.integrations.deleteConfirm', {name: hook?.name ?? id}),
      confirmLabel: t('settings.integrations.delete'),
    })
    if (!confirmed) return
    try {
      await platformApi.deleteOutboundWebhook(id)
      await reloadHooks()
      if (deps.rootView.value === 'webhook-edit') {
        if (hooks.value.length && selectedHookId.value) openEditHook(selectedHookId.value)
        else deps.openList('webhook')
      }
    } catch (error) {
      toast.error(apiErrorMessage(error, 'settings.integrations.saveFailed'))
    }
  }

  async function testHook(id: string) {
    testing.value = true
    try {
      const result = await platformApi.testOutboundWebhook(id)
      let message: string
      if (result.ok) {
        message = t('settings.integrations.testOk', {code: result.statusCode})
      } else {
        // Show responseBody if it contains a platform-specific error (e.g. DingTalk errcode)
        const detail = result.responseBody
          ? ` — ${result.responseBody.slice(0, 200)}`
          : ''
        message = t('settings.integrations.testFailed', {msg: result.message}) + detail
      }
      lastFeedback.value = {message, ok: result.ok}
      if (!result.ok) toast.error(message)
    } catch (error) {
      const message = apiErrorMessage(error, 'settings.integrations.saveFailed')
      lastFeedback.value = {message, ok: false}
      toast.error(message)
    } finally {
      testing.value = false
    }
  }

  return {
    hooks,
    loading,
    saving,
    testing,
    selectedHookId,
    selectedSubscriptionType,
    editingHasSecret,
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
    hookListItems,
    selectedHook,
    editTitle,
    confirmationHint,
    TEMPLATE_VARS,
    defaultTemplatePlaceholder,
    defaultTitleTemplatePlaceholder,
    insertVar,
    urlChannelMismatch,
    eventTypeLabel,
    isWebhookFormDirty,
    openNewHook,
    openEditHook,
    reloadHooks,
    reloadWebhookSchema,
    saveHook,
    removeHook,
    testHook,
  }
}
