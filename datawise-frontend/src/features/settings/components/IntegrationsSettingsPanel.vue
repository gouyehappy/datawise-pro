<script setup lang="ts">
import {computed, onMounted, reactive, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwCheckbox, DwInlineAlert, DwInput, DwSecretInput, DwSelect, FormField, StatusPill, ConfirmDialog, EmptyState} from '@/core/components'
import type {SelectOption} from '@/core/components'
import {DwIcon} from '@/core/icons'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsTipsCard from '@/features/settings/components/SettingsTipsCard.vue'
import SettingsSegmentTabs from '@/features/settings/components/SettingsSegmentTabs.vue'
import {authApi, platformApi} from '@/api'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {resolveDisplayApiErrorMessage} from '@/shared/api/http/api-error-message'
import type {
  OutboundEventDefinition,
  OutboundWebhook,
  OutboundWebhookSubscription,
  OidcConfig,
  OutboundWebhookTestResult,
} from '@/shared/api/types'
import {
  claimMapPreviewRows,
  directorySyncScopesIncomplete,
  formatClaimMap,
  parseClaimMap,
  withRecommendedDirectorySyncScopes,
} from '@/features/settings/services/oidc-directory-sync.service'
import {isIssueWebhookChannel, shouldAutoConfirmWebhook} from '@/features/settings/services/webhook-settings.service'
import {useConfirmDialog} from '@/core/composables/useConfirmDialog'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'

type ListTab = 'webhook' | 'oidc'
type RootView = 'list' | 'webhook-edit' | 'oidc-edit'
type EditTab = 'connection' | 'events' | 'message'

interface HookListItem {
  id: string
  name: string
  channelLabel: string
  meta: string
  statusVariant: 'success' | 'warn' | 'neutral'
  statusText: string
  hasError: boolean
}

const {t, locale} = useI18n()
const auth = useAuthStore()
const entitlement = useEntitlementStore()
const toast = useAppToast()
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

function apiErrorMessage(error: unknown, fallbackKey: string) {
  return resolveDisplayApiErrorMessage(error, (key) => String(t(key))) || t(fallbackKey)
}

function eventTypeLabel(type: string) {
  const schemaLabel = eventDefinitions.value.find((item) => item.type === type)
  const localizedSchemaLabel = schemaLabel
    ? (locale.value.startsWith('zh') ? schemaLabel.displayNameZh : schemaLabel.displayNameEn)
    : ''
  if (localizedSchemaLabel) return localizedSchemaLabel
  const key = `settings.integrations.events.${type.replace(/\./g, '_')}`
  const label = t(key)
  return label === key ? type : label
}

const eventDefinitions = ref<OutboundEventDefinition[]>([])
const eventOptions = computed(() => eventDefinitions.value.map((item) => item.type))

// ─── List tab ─────────────────────────────────────────────────────────────────

const listTab = ref<ListTab>('webhook')
const rootView = ref<RootView>('list')
const editTab = ref<EditTab>('connection')

const listSegmentTabs = computed(() => [
  {id: 'webhook', label: t('settings.integrations.webhookTitle'), count: hooks.value.length},
  {id: 'oidc', label: t('settings.integrations.oidcTitle')},
])

// ─── Webhook ──────────────────────────────────────────────────────────────────

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
  if (editTab.value === 'message' && !showMessageTab.value) {
    editTab.value = 'connection'
  }
}

watch(() => form.channel, () => {
  ensureEditTabValid()
})

// ─── Dual-list ────────────────────────────────────────────────────────────────

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

// ─── Channel helpers ──────────────────────────────────────────────────────────

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

// ─── List items ───────────────────────────────────────────────────────────────

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

// ─── OIDC ─────────────────────────────────────────────────────────────────────

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

// ─── Navigation ───────────────────────────────────────────────────────────────

function openList(tab?: ListTab) {
  rootView.value = 'list'
  if (tab) listTab.value = tab
}

function openOidcEdit() {
  rootView.value = 'oidc-edit'
}

function openNewHook() {
  if (!entitlement.guardPack('pack.security', 'settings.security')) return
  resetForm()
  selectedHookId.value = ''
  editTab.value = 'connection'
  rootView.value = 'webhook-edit'
}

function openEditHook(id: string) {
  if (!entitlement.guardPack('pack.security', 'settings.security')) return
  const hook = hooks.value.find((item) => item.id === id)
  if (!hook) return
  setFormFromHook(hook)
  formError.value = ''
  lastFeedback.value = null
  editTab.value = 'connection'
  rootView.value = 'webhook-edit'
}

// ─── Form ─────────────────────────────────────────────────────────────────────

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

// ─── API ──────────────────────────────────────────────────────────────────────

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
    toast.success(t('settings.integrations.webhookSaved'))
    if (result.confirmationSkipped) {
      lastFeedback.value = {message: t('settings.integrations.confirmationSkippedIssue'), ok: true}
      toast.warning(t('settings.integrations.confirmationSkippedIssue'))
    } else if (result.confirmationAttempted) {
      const message = formatConfirmationFeedback(result.confirmationResult)
      const ok = Boolean(result.confirmationResult?.ok)
      lastFeedback.value = {message, ok}
      if (ok) toast.success(message)
      else toast.warning(message)
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
  const confirmed = await askConfirm({
    title: t('settings.integrations.delete'),
    message: t('settings.integrations.deleteConfirm', {name: hook?.name ?? id}),
    confirmLabel: t('settings.integrations.delete'),
  })
  if (!confirmed) return
  try {
    await platformApi.deleteOutboundWebhook(id)
    toast.success(t('settings.integrations.webhookDeleted'))
    await reloadHooks()
    if (rootView.value === 'webhook-edit') {
      if (hooks.value.length && selectedHookId.value) openEditHook(selectedHookId.value)
      else openList('webhook')
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
    if (result.ok) toast.success(message)
    else toast.error(message)
  } catch (error) {
    const message = apiErrorMessage(error, 'settings.integrations.saveFailed')
    lastFeedback.value = {message, ok: false}
    toast.error(message)
  } finally {
    testing.value = false
  }
}

async function saveOidc() {
  if (rootView.value === 'webhook-edit' && isWebhookFormDirty()) {
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
    toast.success(t('settings.integrations.oidcSaved'))
  } catch (error) {
    toast.error(apiErrorMessage(error, 'settings.integrations.saveFailed'))
  } finally {
    oidcSaving.value = false
  }
}

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

  <!-- ─── WEBHOOK EDIT VIEW ──────────────────────────────────────────── -->
  <SettingsPageShell v-else-if="rootView === 'webhook-edit'" embedded>
    <div class="ai-edit-panel">
      <header class="ai-edit-panel__head">
        <button class="ai-back-link" type="button" @click="openList('webhook')">
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
              v-model="editTab"
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
        <DwButton variant="ghost" @click="openList('webhook')">
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

  <!-- ─── OIDC EDIT VIEW ─────────────────────────────────────────────── -->
  <SettingsPageShell v-else-if="rootView === 'oidc-edit'" embedded>
    <div class="ai-edit-panel">
      <header class="ai-edit-panel__head">
        <button class="ai-back-link" type="button" @click="openList('oidc')">
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
          <div class="int-checks">
            <DwCheckbox v-model="oidc.enabled" :label="t('settings.integrations.oidcEnabled')"/>
            <DwCheckbox v-model="oidc.localLoginEnabled" :label="t('settings.integrations.localLoginEnabled')"/>
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
          <div class="int-checks">
            <DwCheckbox v-model="oidc.autoProvisionMembership" :label="t('settings.integrations.autoProvisionMembership')"/>
            <DwCheckbox v-model="oidc.syncRolesFromClaim" :label="t('settings.integrations.syncRolesFromClaim')"/>
            <DwCheckbox
                v-model="oidc.deprovisionMissingRoleClaim"
                :label="t('settings.integrations.deprovisionMissingRoleClaim')"
                :disabled="!oidc.syncRolesFromClaim"
            />
          </div>
        </div>
      </div>

      <footer class="ai-edit-footer">
        <DwButton variant="ghost" @click="openList('oidc')">{{ t('settings.integrations.reset') }}</DwButton>
        <DwButton variant="primary" :loading="oidcSaving" @click="saveOidc">
          {{ t('settings.integrations.saveOidc') }}
        </DwButton>
      </footer>
    </div>
  </SettingsPageShell>

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
/* icon error state */
.ai-model-card__icon.has-error {
  color: var(--dw-warning) !important;
  border-color: color-mix(in srgb, var(--dw-warning) 30%, var(--dw-border-light)) !important;
  background: color-mix(in srgb, var(--dw-warning) 10%, var(--dw-bg)) !important;
}

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
