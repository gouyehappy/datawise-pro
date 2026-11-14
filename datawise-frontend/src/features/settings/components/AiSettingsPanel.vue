<script setup lang="ts">
import {computed, ref, toRaw, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import {
  AI_DEFAULT_BASE_URLS,
  AI_DEFAULT_COMPLETIONS_PATH,
  AI_DEFAULT_EMBEDDINGS_PATH,
  AI_EMBEDDING_DIMENSIONS_MAX,
  AI_EMBEDDING_DIMENSIONS_MIN,
  AI_EMBEDDING_MODEL_SUGGESTIONS,
  AI_EMBEDDING_PROVIDER_OPTIONS,
  AI_MAX_TOKENS_MAX,
  AI_MAX_TOKENS_MIN,
  AI_MODEL_SUGGESTIONS,
  AI_PROVIDER_OPTIONS,
  AI_TEMPERATURE_MAX,
  AI_TEMPERATURE_MIN,
  createAiEmbeddingProfile,
  createAiLlmProfile,
} from '@/features/settings/constants/ai-presets'
import {aiApi} from '@/api'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {useResourceWriteGuard} from '@/features/auth/composables/useResourceWriteGuard'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsTipsCard from '@/features/settings/components/SettingsTipsCard.vue'
import SettingsSegmentTabs from '@/features/settings/components/SettingsSegmentTabs.vue'
import {DwActionFeedback, DwButton, DwInlineAlert, DwInput, DwSecretInput, EmptyState, FormField, StatusPill, ConfirmDialog} from '@/core/components'
import {useConfirmDialog} from '@/core/composables/useConfirmDialog'
import type {
  AiEmbeddingProfile,
  AiEmbeddingProviderId,
  AiLlmProfile,
  AiLlmSettings,
  AiProviderId,
} from '@/shared/config/app-config.types'
import {resolveCaughtMessage} from '@/shared/api/http/api-error-message'

type FilterKind = 'all' | 'chat' | 'embedding'
type ModelKind = 'chat' | 'embedding'
type ViewMode = 'list' | 'edit'

interface ModelListItem {
  kind: ModelKind
  id: string
  name: string
  meta: string
  providerLabel: string
  isDefault: boolean
}

const {t} = useI18n()
const appConfig = useAppConfigStore()
const layout = useLayoutStore()
const {readOnly, hint, denyIfReadOnly} = useResourceWriteGuard(UserResource.AiPreferences)
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

const filterKind = ref<FilterKind>('all')
const viewMode = ref<ViewMode>('list')
const editKind = ref<ModelKind>('chat')
const isNewDraft = ref(false)
const markDefaultOnSave = ref(false)
const saving = ref(false)
const testing = ref(false)
const embeddingTesting = ref(false)
const formError = ref('')
const testFeedback = ref<{message: string; ok: boolean} | null>(null)
const profileQuery = ref('')
const chatDraft = ref<AiLlmProfile | null>(null)
const embeddingDraft = ref<AiEmbeddingProfile | null>(null)

const selectedChatProfileId = ref(appConfig.aiPreferences.defaultLlmId)
const selectedEmbeddingProfileId = ref(appConfig.aiPreferences.defaultEmbeddingId)

watch(
    () => appConfig.aiPreferences,
    (ai) => {
      if (!ai.llmProfiles.some((profile) => profile.id === selectedChatProfileId.value)) {
        selectedChatProfileId.value = ai.defaultLlmId
      }
      if (!ai.embeddingProfiles.some((profile) => profile.id === selectedEmbeddingProfileId.value)) {
        selectedEmbeddingProfileId.value = ai.defaultEmbeddingId
      }
    },
    {deep: true},
)

watch(filterKind, () => {
  profileQuery.value = ''
})

const chatProfiles = computed(() => appConfig.aiPreferences.llmProfiles)
const embeddingProfiles = computed(() => appConfig.aiPreferences.embeddingProfiles)

const filterTabs = computed(() => [
  {id: 'all' as const, label: t('settings.ai.filterAll'), count: chatProfiles.value.length + embeddingProfiles.value.length},
  {id: 'chat' as const, label: t('settings.ai.modelKindChat'), count: chatProfiles.value.length},
  {id: 'embedding' as const, label: t('settings.ai.modelKindEmbedding'), count: embeddingProfiles.value.length},
])

const filterSegmentTabs = computed(() =>
    filterTabs.value.map((tab) => ({
      id: tab.id,
      label: tab.label,
      count: tab.count,
    })),
)

const listItems = computed<ModelListItem[]>(() => {
  const items: ModelListItem[] = []
  if (filterKind.value === 'all' || filterKind.value === 'chat') {
    for (const profile of chatProfiles.value) {
      items.push({
        kind: 'chat',
        id: profile.id,
        name: profile.name,
        meta: chatProfileMeta(profile),
        providerLabel: t(`settings.ai.providers.${profile.provider}`),
        isDefault: profile.id === appConfig.aiPreferences.defaultLlmId,
      })
    }
  }
  if (filterKind.value === 'all' || filterKind.value === 'embedding') {
    for (const profile of embeddingProfiles.value) {
      items.push({
        kind: 'embedding',
        id: profile.id,
        name: profile.name,
        meta: embeddingProfileMeta(profile),
        providerLabel: t(`settings.ai.embeddingProviders.${profile.provider}`),
        isDefault: profile.id === appConfig.aiPreferences.defaultEmbeddingId,
      })
    }
  }
  const keyword = profileQuery.value.trim().toLowerCase()
  if (!keyword) return items
  return items.filter((item) =>
      item.name.toLowerCase().includes(keyword)
      || item.meta.toLowerCase().includes(keyword)
      || item.providerLabel.toLowerCase().includes(keyword),
  )
})

const showProfileSearch = computed(() => {
  const total = filterKind.value === 'all'
      ? chatProfiles.value.length + embeddingProfiles.value.length
      : filterKind.value === 'chat'
          ? chatProfiles.value.length
          : embeddingProfiles.value.length
  return total > 5
})

const emptyTitle = computed(() => {
  if (profileQuery.value.trim()) return t('settings.ai.noProfileMatch')
  if (filterKind.value === 'chat') return t('settings.ai.emptyChat')
  if (filterKind.value === 'embedding') return t('settings.ai.emptyEmbedding')
  return t('settings.ai.emptyAll')
})

const emptyHint = computed(() => {
  if (profileQuery.value.trim()) return undefined
  return t('settings.ai.emptyHint')
})

const addModelTitle = computed(() => {
  if (filterKind.value === 'chat') return t('settings.ai.addChatModel')
  if (filterKind.value === 'embedding') return t('settings.ai.addEmbeddingModel')
  return t('settings.ai.addModel')
})

const addModelHint = computed(() => {
  if (filterKind.value === 'chat') return t('settings.ai.addChatModelHint')
  if (filterKind.value === 'embedding') return t('settings.ai.addEmbeddingModelHint')
  return t('settings.ai.addModelHintAll')
})

const showAddRow = computed(() => !profileQuery.value.trim())

const isEditingChat = computed(() => editKind.value === 'chat')

const editTitle = computed(() => {
  if (isNewDraft.value) return addModelTitle.value
  if (isEditingChat.value) return chatDraft.value?.name || t('settings.ai.editNewTitle')
  return embeddingDraft.value?.name || t('settings.ai.editNewTitle')
})

const canRemoveEditing = computed(() => {
  if (isNewDraft.value) return false
  return isEditingChat.value ? chatProfiles.value.length > 1 : embeddingProfiles.value.length > 1
})

const isDraftDefault = computed(() => {
  if (isEditingChat.value && chatDraft.value) {
    return markDefaultOnSave.value || chatDraft.value.id === appConfig.aiPreferences.defaultLlmId
  }
  if (embeddingDraft.value) {
    return markDefaultOnSave.value || embeddingDraft.value.id === appConfig.aiPreferences.defaultEmbeddingId
  }
  return false
})

const isApiReady = computed(
    () => chatDraft.value
        && chatDraft.value.provider !== 'mock'
        && chatDraft.value.baseUrl.trim().length > 0
        && (chatDraft.value.apiKey.trim().length > 0 || chatDraft.value.apiKeyConfigured === true),
)

const chatStatusText = computed(() => {
  if (!chatDraft.value) return ''
  if (chatDraft.value.provider === 'mock') return t('settings.ai.statusMock')
  return isApiReady.value ? t('settings.ai.statusReady') : t('settings.ai.statusPending')
})

const chatStatusVariant = computed(() => {
  if (!chatDraft.value || chatDraft.value.provider === 'mock') return 'neutral' as const
  return isApiReady.value ? 'success' as const : 'warn' as const
})

const isEmbeddingApiReady = computed(
    () => embeddingDraft.value
        && (embeddingDraft.value.provider === 'hash'
            || (embeddingDraft.value.baseUrl.trim().length > 0
                && (embeddingDraft.value.apiKey.trim().length > 0
                    || embeddingDraft.value.apiKeyConfigured === true))),
)

const embeddingStatusText = computed(() => {
  if (!embeddingDraft.value) return ''
  if (embeddingDraft.value.provider === 'hash') return t('settings.ai.embeddingStatusHash')
  return isEmbeddingApiReady.value
      ? t('settings.ai.embeddingStatusReady')
      : t('settings.ai.embeddingStatusPending')
})

const embeddingStatusVariant = computed(() => {
  if (!embeddingDraft.value || embeddingDraft.value.provider === 'hash') return 'neutral' as const
  return isEmbeddingApiReady.value ? 'success' as const : 'warn' as const
})

function chatProfileMeta(profile: AiLlmProfile) {
  if (profile.provider === 'mock') return t(`settings.ai.providers.${profile.provider}`)
  return profile.model.trim() || t('settings.ai.profileMetaUnset')
}

function embeddingProfileMeta(profile: AiEmbeddingProfile) {
  if (profile.provider === 'hash') return t('settings.ai.embeddingProviders.hash')
  return profile.model.trim() || t('settings.ai.profileMetaUnset')
}

function cloneChatProfile(profile: AiLlmProfile): AiLlmProfile {
  return structuredClone(toRaw(profile))
}

function cloneEmbeddingProfile(profile: AiEmbeddingProfile): AiEmbeddingProfile {
  return structuredClone(toRaw(profile))
}

function openEdit(item: ModelListItem) {
  editKind.value = item.kind
  isNewDraft.value = false
  markDefaultOnSave.value = false
  if (item.kind === 'chat') {
    const profile = chatProfiles.value.find((entry) => entry.id === item.id)
    if (!profile) return
    chatDraft.value = cloneChatProfile(profile)
    embeddingDraft.value = null
    selectedChatProfileId.value = item.id
  } else {
    const profile = embeddingProfiles.value.find((entry) => entry.id === item.id)
    if (!profile) return
    embeddingDraft.value = cloneEmbeddingProfile(profile)
    chatDraft.value = null
    selectedEmbeddingProfileId.value = item.id
  }
  viewMode.value = 'edit'
}

function discardDraft() {
  chatDraft.value = null
  embeddingDraft.value = null
  isNewDraft.value = false
  markDefaultOnSave.value = false
}

function backToList() {
  discardDraft()
  viewMode.value = 'list'
}

function addKindForFilter(): ModelKind {
  if (filterKind.value === 'embedding') return 'embedding'
  return 'chat'
}

function addProfile() {
  if (denyIfReadOnly()) return
  const kind = addKindForFilter()
  editKind.value = kind
  isNewDraft.value = true
  markDefaultOnSave.value = false
  if (kind === 'chat') {
    chatDraft.value = createAiLlmProfile(t('settings.ai.newProfileName', {n: chatProfiles.value.length + 1}))
    embeddingDraft.value = null
  } else {
    embeddingDraft.value = createAiEmbeddingProfile(
        t('settings.ai.newEmbeddingProfileName', {n: embeddingProfiles.value.length + 1}),
    )
    chatDraft.value = null
  }
  viewMode.value = 'edit'
}

function patchChatDraft(patch: Partial<AiLlmProfile>) {
  if (!chatDraft.value) return
  chatDraft.value = {...chatDraft.value, ...patch}
}

function patchEmbeddingDraft(patch: Partial<AiEmbeddingProfile>) {
  if (!embeddingDraft.value) return
  embeddingDraft.value = {...embeddingDraft.value, ...patch}
}

function selectEmbeddingProvider(provider: AiEmbeddingProviderId) {
  if (!embeddingDraft.value || embeddingDraft.value.provider === provider) return
  const patch: Partial<AiEmbeddingProfile> = {provider}
  if (provider === 'openai' && !embeddingDraft.value.baseUrl.trim()) {
    patch.baseUrl = AI_DEFAULT_BASE_URLS.openai
  }
  patchEmbeddingDraft(patch)
}

function selectChatProvider(provider: AiProviderId) {
  if (!chatDraft.value || chatDraft.value.provider === provider) return
  const patch: Partial<AiLlmSettings> = {provider}
  if (provider === 'openai' && !chatDraft.value.baseUrl.trim()) {
    patch.baseUrl = AI_DEFAULT_BASE_URLS.openai
  }
  patchChatDraft(patch)
}

function setTemperature(value: number) {
  if (!Number.isFinite(value) || !chatDraft.value) return
  patchChatDraft({
    temperature: Math.min(AI_TEMPERATURE_MAX, Math.max(AI_TEMPERATURE_MIN, value)),
  })
}

function setMaxTokens(value: number) {
  if (!Number.isFinite(value) || !chatDraft.value) return
  patchChatDraft({
    maxTokens: Math.min(AI_MAX_TOKENS_MAX, Math.max(AI_MAX_TOKENS_MIN, value)),
  })
}

function setEditingDefault() {
  markDefaultOnSave.value = true
}

function saveProfile() {
  if (denyIfReadOnly() || saving.value) return
  formError.value = ''
  testFeedback.value = null
  if (isEditingChat.value) {
    const draft = chatDraft.value
    if (!draft?.name.trim()) {
      formError.value = t('settings.ai.errors.profileNameRequired')
      return
    }
    saving.value = true
    try {
      const payload = {...draft, name: draft.name.trim()}
      if (isNewDraft.value) {
        appConfig.insertLlmProfile(payload)
        selectedChatProfileId.value = payload.id
      } else {
        appConfig.updateLlmProfile(payload.id, payload)
      }
      if (markDefaultOnSave.value) appConfig.setDefaultLlmProfile(payload.id)
      appConfig.persistConfigNow()
      discardDraft()
      viewMode.value = 'list'
    } finally {
      saving.value = false
    }
    return
  }

  const draft = embeddingDraft.value
  if (!draft?.name.trim()) {
    formError.value = t('settings.ai.errors.profileNameRequired')
    return
  }
  saving.value = true
  try {
    const payload = {...draft, name: draft.name.trim(), useChatConnection: false}
    if (isNewDraft.value) {
      appConfig.insertEmbeddingProfile(payload)
      selectedEmbeddingProfileId.value = payload.id
    } else {
      appConfig.updateEmbeddingProfile(payload.id, payload)
    }
    if (markDefaultOnSave.value) appConfig.setDefaultEmbeddingProfile(payload.id)
    appConfig.persistConfigNow()
    discardDraft()
    viewMode.value = 'list'
  } finally {
    saving.value = false
  }
}

async function removeEditingProfile() {
  if (denyIfReadOnly() || isNewDraft.value) return
  const name = isEditingChat.value
      ? (chatDraft.value?.name ?? '')
      : (embeddingDraft.value?.name ?? '')
  const confirmed = await askConfirm({
    title: t('settings.ai.removeProfile'),
    message: t('settings.ai.removeProfileConfirm', {name}),
    confirmLabel: t('settings.ai.removeProfile'),
  })
  if (!confirmed) return
  if (isEditingChat.value && chatDraft.value) {
    appConfig.removeLlmProfile(chatDraft.value.id)
    selectedChatProfileId.value = appConfig.aiPreferences.defaultLlmId
  } else if (embeddingDraft.value) {
    appConfig.removeEmbeddingProfile(embeddingDraft.value.id)
    selectedEmbeddingProfileId.value = appConfig.aiPreferences.defaultEmbeddingId
  }
  appConfig.persistConfigNow()
  discardDraft()
  viewMode.value = 'list'
}

async function runChatTest() {
  if (testing.value || !chatDraft.value) return
  testing.value = true
  testFeedback.value = null
  try {
    const result = await aiApi.testConnection(chatDraft.value)
    const ok = result.ok !== false
    testFeedback.value = {
      ok,
      message: ok
        ? (result.message?.trim() || t('settings.ai.testSuccess'))
        : resolveCaughtMessage(result.message, t, 'settings.ai.testFailed'),
    }
  } finally {
    testing.value = false
  }
}

async function runEmbeddingTest() {
  if (embeddingTesting.value || !embeddingDraft.value) return
  embeddingTesting.value = true
  testFeedback.value = null
  try {
    const result = await aiApi.testEmbedding(embeddingDraft.value)
    const ok = result.ok !== false
    testFeedback.value = {
      ok,
      message: ok
        ? (result.message?.trim() || t('settings.ai.testSuccess'))
        : resolveCaughtMessage(result.message, t, 'settings.ai.testFailed'),
    }
  } finally {
    embeddingTesting.value = false
  }
}
</script>

<template>
  <SettingsPageShell
      v-if="viewMode === 'list'"
      :title="t('settings.ai.title')"
      :subtitle="t('settings.ai.subtitleList')"
      :readonly="readOnly"
      :readonly-hint="hint"
  >
    <template #tips>
      <SettingsTipsCard
          :title="t('settings.ai.title')"
          :content="t('settings.ai.storageNoteShort')"
          icon="feedback"
      />
    </template>

    <div class="ai-list-shell">
        <div class="ai-list-shell__toolbar">
          <SettingsSegmentTabs
              v-model="filterKind"
              variant="inline"
              :tabs="filterSegmentTabs"
              :aria-label="t('settings.ai.modelKindGroup')"
          />

          <div v-if="showProfileSearch" class="ai-list-toolbar">
            <DwInput
                v-model="profileQuery"
                variant="sm"
                type="search"
                :placeholder="t('settings.ai.searchProfiles')"
            />
          </div>
        </div>

        <div class="ai-model-list" role="list">
          <EmptyState
              v-if="!listItems.length"
              embedded
              compact
              class="ai-model-list__empty"
              :title="emptyTitle"
              :hint="emptyHint && showAddRow ? emptyHint : undefined"
          />

          <button
              v-for="item in listItems"
              :key="`${item.kind}-${item.id}`"
              class="ai-model-card"
              type="button"
              role="listitem"
              @click="openEdit(item)"
          >
            <span class="ai-model-card__icon" :class="item.kind === 'chat' ? 'is-chat' : 'is-embedding'" aria-hidden="true">
              <DwIcon v-if="item.kind === 'chat'" name="feedback" size="md" :stroke-width="1.5"/>
              <DwIcon v-else name="plus" size="md" :stroke-width="1.5"/>
            </span>
            <span class="ai-model-card__body">
              <span class="ai-model-card__title-row">
                <span class="ai-model-card__name">{{ item.name }}</span>
                <span class="ai-model-card__kind">{{ item.kind === 'chat' ? t('settings.ai.modelKindChat') : t('settings.ai.modelKindEmbedding') }}</span>
                <span v-if="item.isDefault" class="ai-model-card__badge">{{ t('settings.ai.defaultBadge') }}</span>
              </span>
              <span class="ai-model-card__meta">{{ item.providerLabel }} · {{ item.meta }}</span>
            </span>
            <span class="ai-model-card__chevron" aria-hidden="true">
              <DwIcon name="chevron-right" size="md" :stroke-width="2.25"/>
            </span>
          </button>

          <button
              v-if="showAddRow"
              class="ai-model-add"
              type="button"
              @click="addProfile"
          >
            <span class="ai-model-add__icon" aria-hidden="true">
              <DwIcon name="plus" size="lg" :stroke-width="1.5"/>
            </span>
            <span class="ai-model-add__body">
              <span class="ai-model-add__title">{{ addModelTitle }}</span>
              <span class="ai-model-add__hint">{{ addModelHint }}</span>
            </span>
          </button>
        </div>
      </div>
  </SettingsPageShell>

  <SettingsPageShell
      v-else
      embedded
      :readonly="readOnly"
      :readonly-hint="hint"
  >
    <div class="ai-edit-panel">
        <header class="ai-edit-panel__head">
          <button class="ai-back-link" type="button" @click="backToList">
            <DwIcon name="chevron-left" size="sm" :stroke-width="2.25"/>
            {{ t('settings.ai.backToList') }}
          </button>
        </header>

        <div v-if="isEditingChat && chatDraft" class="ai-edit-card">
          <div class="ai-edit-card__hero">
            <div class="ai-edit-card__hero-copy">
              <StatusPill variant="info">{{ t('settings.ai.modelKindChat') }}</StatusPill>
              <h3>{{ editTitle }}</h3>
              <p>{{ t('settings.ai.editHint') }}</p>
            </div>
            <div class="ai-edit-card__hero-badges">
              <StatusPill :variant="chatDraft.provider === 'mock' ? 'neutral' : 'info'">
                {{ t(`settings.ai.providers.${chatDraft.provider}`) }}
              </StatusPill>
              <StatusPill v-if="isDraftDefault" variant="primary">{{ t('settings.ai.defaultBadge') }}</StatusPill>
              <StatusPill :variant="chatStatusVariant" dot>{{ chatStatusText }}</StatusPill>
            </div>
          </div>

          <div class="ai-edit-section">
            <FormField :label="t('settings.ai.profileName')" input-id="ai-profile-name">
              <template #default="{ id }">
                <DwInput :id="id" v-model="chatDraft.name"/>
              </template>
            </FormField>
            <div v-if="canRemoveEditing || !isDraftDefault" class="ai-edit-inline-actions">
              <DwButton v-if="!isDraftDefault" variant="secondary" size="sm" @click="setEditingDefault">
                {{ t('settings.ai.setDefault') }}
              </DwButton>
              <DwButton v-if="canRemoveEditing" variant="danger" size="sm" @click="removeEditingProfile">
                {{ t('settings.ai.removeProfile') }}
              </DwButton>
            </div>
          </div>

          <div class="ai-edit-section">
            <h4 class="ai-edit-section__title">{{ t('settings.ai.provider') }}</h4>
            <div class="provider-grid">
              <button
                  v-for="provider in AI_PROVIDER_OPTIONS"
                  :key="provider"
                  class="provider-card"
                  :class="{ active: chatDraft.provider === provider }"
                  type="button"
                  @click="selectChatProvider(provider)"
              >
                <span class="provider-card__label">{{ t(`settings.ai.providers.${provider}`) }}</span>
              </button>
            </div>
          </div>

          <div v-if="chatDraft.provider === 'mock'" class="ai-edit-section mock-note">
            <p>{{ t('settings.ai.mockNote') }}</p>
          </div>

          <template v-else>
            <div class="ai-edit-section">
              <h4 class="ai-edit-section__title">{{ t('settings.ai.connectionSection') }}</h4>
              <div class="field-grid">
                <div class="field field--full">
                  <FormField :label="t('settings.ai.baseUrl')" input-id="ai-base-url">
                    <template #default="{ id }">
                      <DwInput :id="id" v-model="chatDraft.baseUrl" type="url" :placeholder="AI_DEFAULT_BASE_URLS.openai"/>
                    </template>
                  </FormField>
                  <p class="field-hint">{{ t('settings.ai.baseUrlHint') }}</p>
                </div>
                <div class="field field--full">
                  <FormField :label="t('settings.ai.apiKey')" input-id="ai-api-key">
                    <template #default="{ id }">
                      <DwSecretInput
                          :id="id"
                          v-model="chatDraft.apiKey"
                          :placeholder="chatDraft.apiKeyConfigured && !chatDraft.apiKey.trim()
                            ? t('settings.ai.apiKeySavedPlaceholder')
                            : t('settings.ai.apiKeyPlaceholder')"
                          :show-label="t('settings.ai.showKey')"
                          :hide-label="t('settings.ai.hideKey')"
                      />
                    </template>
                  </FormField>
                  <p class="field-hint">{{ t('settings.ai.apiKeyHint') }}</p>
                </div>
              </div>
            </div>

            <div class="ai-edit-section">
              <h4 class="ai-edit-section__title">{{ t('settings.ai.chatModelSection') }}</h4>
              <div class="field-grid">
                <FormField :label="t('settings.ai.model')" input-id="ai-model">
                  <template #default="{ id }">
                    <DwInput :id="id" v-model="chatDraft.model" variant="mono" list="ai-model-suggestions"/>
                  </template>
                </FormField>
                <datalist id="ai-model-suggestions">
                  <option v-for="model in AI_MODEL_SUGGESTIONS" :key="model" :value="model"/>
                </datalist>
                <FormField :label="t('settings.ai.completionsPath')" input-id="ai-completions-path">
                  <template #default="{ id }">
                    <DwInput
                        :id="id"
                        v-model="chatDraft.completionsPath"
                        variant="mono"
                        :placeholder="AI_DEFAULT_COMPLETIONS_PATH"
                    />
                  </template>
                </FormField>
              </div>
            </div>

            <div class="ai-edit-section">
              <h4 class="ai-edit-section__title">{{ t('settings.ai.generationSection') }}</h4>
              <div class="slider-grid">
                <div class="slider-field">
                  <div class="slider-field__head">
                    <label for="ai-temperature">{{ t('settings.ai.temperature') }}</label>
                    <span>{{ chatDraft.temperature.toFixed(1) }}</span>
                  </div>
                  <input
                      id="ai-temperature"
                      class="range-input"
                      type="range"
                      :min="AI_TEMPERATURE_MIN"
                      :max="AI_TEMPERATURE_MAX"
                      step="0.1"
                      :value="chatDraft.temperature"
                      @input="setTemperature(Number(($event.target as HTMLInputElement).value))"
                  />
                </div>
                <div class="slider-field">
                  <div class="slider-field__head">
                    <label for="ai-max-tokens">{{ t('settings.ai.maxTokens') }}</label>
                    <span>{{ chatDraft.maxTokens }}</span>
                  </div>
                  <input
                      id="ai-max-tokens"
                      class="range-input"
                      type="range"
                      :min="AI_MAX_TOKENS_MIN"
                      :max="AI_MAX_TOKENS_MAX"
                      step="256"
                      :value="chatDraft.maxTokens"
                      @input="setMaxTokens(Number(($event.target as HTMLInputElement).value))"
                  />
                </div>
              </div>
              <div class="ai-action-row">
                <DwButton variant="secondary" :loading="testing" :disabled="!isApiReady" @click="runChatTest">
                  {{ testing ? t('settings.ai.testing') : t('settings.ai.testConnection') }}
                </DwButton>
                <DwActionFeedback
                    :message="testFeedback?.message"
                    :ok="testFeedback?.ok ?? null"
                />
              </div>
            </div>
          </template>
          <DwInlineAlert :message="formError && isEditingChat ? formError : null"/>
        </div>

        <div v-else-if="embeddingDraft" class="ai-edit-card">
          <div class="ai-edit-card__hero">
            <div class="ai-edit-card__hero-copy">
              <StatusPill variant="info">{{ t('settings.ai.modelKindEmbedding') }}</StatusPill>
              <h3>{{ editTitle }}</h3>
              <p>{{ t('settings.ai.editHint') }}</p>
            </div>
            <div class="ai-edit-card__hero-badges">
              <StatusPill :variant="embeddingDraft.provider === 'hash' ? 'neutral' : 'info'">
                {{ t(`settings.ai.embeddingProviders.${embeddingDraft.provider}`) }}
              </StatusPill>
              <StatusPill v-if="isDraftDefault" variant="primary">{{ t('settings.ai.defaultBadge') }}</StatusPill>
              <StatusPill :variant="embeddingStatusVariant" dot>{{ embeddingStatusText }}</StatusPill>
            </div>
          </div>

          <div class="ai-edit-section">
            <FormField :label="t('settings.ai.profileName')" input-id="embedding-profile-name">
              <template #default="{ id }">
                <DwInput :id="id" v-model="embeddingDraft.name"/>
              </template>
            </FormField>
            <div v-if="canRemoveEditing || !isDraftDefault" class="ai-edit-inline-actions">
              <DwButton v-if="!isDraftDefault" variant="secondary" size="sm" @click="setEditingDefault">
                {{ t('settings.ai.setDefault') }}
              </DwButton>
              <DwButton v-if="canRemoveEditing" variant="danger" size="sm" @click="removeEditingProfile">
                {{ t('settings.ai.removeProfile') }}
              </DwButton>
            </div>
          </div>

          <div class="ai-edit-section">
            <h4 class="ai-edit-section__title">{{ t('settings.ai.embeddingProvider') }}</h4>
            <div class="provider-grid">
              <button
                  v-for="provider in AI_EMBEDDING_PROVIDER_OPTIONS"
                  :key="provider"
                  class="provider-card"
                  :class="{ active: embeddingDraft.provider === provider }"
                  type="button"
                  @click="selectEmbeddingProvider(provider)"
              >
                <span class="provider-card__label">{{ t(`settings.ai.embeddingProviders.${provider}`) }}</span>
              </button>
            </div>
          </div>

          <div v-if="embeddingDraft.provider === 'hash'" class="ai-edit-section mock-note">
            <p>{{ t('settings.ai.embeddingHashNote') }}</p>
          </div>

          <template v-else>
            <div class="ai-edit-section">
              <h4 class="ai-edit-section__title">{{ t('settings.ai.connectionSection') }}</h4>
              <div class="field-grid">
                <div class="field field--full">
                  <FormField :label="t('settings.ai.baseUrl')" input-id="embedding-base-url">
                    <template #default="{ id }">
                      <DwInput :id="id" v-model="embeddingDraft.baseUrl" type="url" :placeholder="AI_DEFAULT_BASE_URLS.openai"/>
                    </template>
                  </FormField>
                  <p class="field-hint">{{ t('settings.ai.baseUrlHint') }}</p>
                </div>
                <div class="field field--full">
                  <FormField :label="t('settings.ai.apiKey')" input-id="embedding-api-key">
                    <template #default="{ id }">
                      <DwSecretInput
                          :id="id"
                          v-model="embeddingDraft.apiKey"
                          :placeholder="embeddingDraft.apiKeyConfigured && !embeddingDraft.apiKey.trim()
                            ? t('settings.ai.apiKeySavedPlaceholder')
                            : t('settings.ai.apiKeyPlaceholder')"
                          :show-label="t('settings.ai.showKey')"
                          :hide-label="t('settings.ai.hideKey')"
                      />
                    </template>
                  </FormField>
                  <p class="field-hint">{{ t('settings.ai.apiKeyHint') }}</p>
                </div>
              </div>
            </div>

            <div class="ai-edit-section">
              <h4 class="ai-edit-section__title">{{ t('settings.ai.embeddingModelSection') }}</h4>
              <div class="field-grid">
                <FormField :label="t('settings.ai.model')" input-id="embedding-model">
                  <template #default="{ id }">
                    <DwInput :id="id" v-model="embeddingDraft.model" variant="mono" list="embedding-model-suggestions"/>
                  </template>
                </FormField>
                <datalist id="embedding-model-suggestions">
                  <option v-for="model in AI_EMBEDDING_MODEL_SUGGESTIONS" :key="model" :value="model"/>
                </datalist>
                <FormField :label="t('settings.ai.embeddingsPath')" input-id="embedding-path">
                  <template #default="{ id }">
                    <DwInput
                        :id="id"
                        v-model="embeddingDraft.embeddingsPath"
                        variant="mono"
                        :placeholder="AI_DEFAULT_EMBEDDINGS_PATH"
                    />
                  </template>
                </FormField>
                <FormField :label="t('settings.ai.embeddingDimensions')" input-id="embedding-dimensions">
                  <template #default="{ id }">
                    <DwInput
                        :id="id"
                        variant="mono"
                        type="number"
                        :min="AI_EMBEDDING_DIMENSIONS_MIN"
                        :max="AI_EMBEDDING_DIMENSIONS_MAX"
                        :placeholder="t('settings.ai.embeddingDimensionsPlaceholder')"
                        :model-value="embeddingDraft.dimensions ?? ''"
                        @update:model-value="patchEmbeddingDraft({
                          dimensions: $event === '' || $event == null ? null : Number($event),
                        })"
                    />
                  </template>
                </FormField>
              </div>
              <div class="ai-action-row">
                <DwButton
                    variant="secondary"
                    :loading="embeddingTesting"
                    :disabled="!isEmbeddingApiReady"
                    @click="runEmbeddingTest"
                >
                  {{ embeddingTesting ? t('settings.ai.testing') : t('settings.ai.testEmbedding') }}
                </DwButton>
                <p class="field-hint">{{ t('settings.ai.embeddingUsageNote') }}</p>
                <DwActionFeedback
                    :message="testFeedback?.message"
                    :ok="testFeedback?.ok ?? null"
                />
              </div>
            </div>
          </template>
          <DwInlineAlert :message="formError && !isEditingChat ? formError : null"/>
        </div>

        <footer class="ai-edit-footer">
          <DwButton variant="ghost" @click="backToList">{{ t('settings.ai.cancel') }}</DwButton>
          <DwButton variant="primary" :loading="saving" @click="saveProfile">{{ t('settings.ai.save') }}</DwButton>
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
