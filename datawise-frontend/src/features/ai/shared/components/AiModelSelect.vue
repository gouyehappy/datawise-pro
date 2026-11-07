<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {usePopoverEscape} from '@/core/composables/usePopoverEscape'
import AiIcon from '@/core/components/AiIcon.vue'
import {EmptyState} from '@/core/components'
import {DwIcon} from '@/core/icons'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import type {AiLlmProfile} from '@/shared/config/app-config.types'

withDefaults(
    defineProps<{
      variant?: 'default' | 'composer'
    }>(),
    {variant: 'default'},
)

const {t} = useI18n()
const appConfig = useAppConfigStore()
const rootRef = ref<HTMLElement>()
const open = ref(false)
const query = ref('')

usePopoverEscape(open, () => {
  open.value = false
}, {
  containRefs: () => [rootRef.value],
})

const profiles = computed(() => appConfig.aiPreferences.llmProfiles)

const selectedId = computed({
  get: () => appConfig.aiPreferences.workbenchLlmId || appConfig.aiPreferences.defaultLlmId,
  set: (id: string) => appConfig.setWorkbenchLlmProfile(id),
})

const selectedProfile = computed(
    () => profiles.value.find((profile) => profile.id === selectedId.value) ?? profiles.value[0],
)

const showSearch = computed(() => profiles.value.length > 5)

const composerLabel = computed(() => {
  const profile = selectedProfile.value
  if (!profile) return ''
  const meta = profileMeta(profile)
  return meta ? `${profile.name} · ${meta}` : profile.name
})

const filteredProfiles = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return profiles.value
  return profiles.value.filter((profile) => {
    const meta = profileMeta(profile).toLowerCase()
    return profile.name.toLowerCase().includes(keyword) || meta.includes(keyword)
  })
})

function profileMeta(profile: AiLlmProfile | undefined) {
  if (!profile) return ''
  if (profile.provider === 'mock') {
    return t(`settings.ai.providers.${profile.provider}`)
  }
  return profile.model.trim() || t('settings.ai.profileMetaUnset')
}

function profileShortcut(profile: AiLlmProfile) {
  const meta = profileMeta(profile)
  if (profile.id === appConfig.aiPreferences.defaultLlmId) {
    return meta ? `${meta} · ${t('settings.ai.defaultBadge')}` : t('settings.ai.defaultBadge')
  }
  return meta
}

function select(id: string) {
  selectedId.value = id
  open.value = false
  query.value = ''
}

function toggleOpen() {
  if (profiles.value.length <= 1) return
  open.value = !open.value
}

watch(open, (isOpen) => {
  if (!isOpen) query.value = ''
})
</script>

<template>
  <div
      v-if="profiles.length"
      ref="rootRef"
      class="ai-model-select"
      :class="[`ai-model-select--${variant}`, { 'is-static': profiles.length <= 1 }]"
  >
    <button
        class="ai-model-select__trigger"
        :class="{ open }"
        type="button"
        :aria-haspopup="profiles.length > 1 ? 'listbox' : undefined"
        :aria-expanded="profiles.length > 1 ? open : undefined"
        :aria-label="t('ai.modelSelect.aria')"
        :disabled="profiles.length <= 1"
        @click="toggleOpen"
    >
      <AiIcon
          v-if="variant === 'composer'"
          class="ai-model-select__icon"
          :size="11"
      />
      <span
          v-if="variant === 'composer'"
          class="ai-model-select__label"
          :title="composerLabel"
      >
        {{ composerLabel }}
      </span>
      <span v-else class="ai-model-select__body">
        <span class="ai-model-select__value">{{ selectedProfile?.name }}</span>
      </span>
      <span v-if="profiles.length > 1 && variant !== 'composer'" class="ai-model-select__count">
        {{ profiles.length }}
      </span>
      <DwIcon
          v-if="profiles.length > 1"
          class="ai-model-select__chevron"
          name="chevron-down"
          size="xs"
          :stroke-width="1.5"
      />
    </button>

    <Transition name="model-menu">
      <div v-if="open" class="ai-model-select__panel">
        <div class="dw-ctx-menu dw-ctx-menu--anchored">
          <div class="dw-ctx-menu__head">
            {{ t('ai.modelSelect.label') }}
            <span v-if="profiles.length > 1" class="ai-model-select__head-count">
              {{ profiles.length }}
            </span>
          </div>

          <div v-if="showSearch" class="ai-model-select__search-wrap">
            <input
                v-model="query"
                class="ai-model-select__search-input"
                type="search"
                :placeholder="t('ai.modelSelect.search')"
                @keydown.stop
            />
          </div>
          <div v-if="showSearch" class="dw-ctx-menu__divider"/>

          <div class="dw-ctx-menu__body ai-model-select__menu-body" role="listbox">
            <EmptyState
                v-if="!filteredProfiles.length"
                embedded
                compact
                class="ai-model-select__empty"
                :title="t('ai.modelSelect.noMatch')"
            />
            <button
                v-for="profile in filteredProfiles"
                :key="profile.id"
                class="dw-ctx-menu__item"
                :class="{ 'is-selected': profile.id === selectedId }"
                type="button"
                role="option"
                :aria-selected="profile.id === selectedId"
                @click="select(profile.id)"
            >
              <span
                  class="dw-ctx-menu__icon ai-model-select__provider-icon"
                  :class="profile.provider === 'mock' ? 'is-mock' : 'is-api'"
                  aria-hidden="true"
              >
                <DwIcon v-if="profile.provider === 'mock'" name="cpu" size="xs" :stroke-width="1.4"/>
                <DwIcon v-else name="feedback" size="xs" :stroke-width="1.4"/>
              </span>
              <span class="dw-ctx-menu__label">{{ profile.name }}</span>
              <span class="dw-ctx-menu__shortcut">{{ profileShortcut(profile) }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.ai-model-select {
  position: relative;
  flex-shrink: 0;
  max-width: 100%;
}

.ai-model-select__trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  max-width: 100%;
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-radius-pill);
  background: var(--dw-bg-muted);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-md);
  line-height: var(--dw-leading);
  font-weight: 500;
  cursor: pointer;
  transition: var(--dw-transition-colors),
  color 0.15s ease;
}

.ai-model-select--default .ai-model-select__trigger {
  height: var(--dw-control-h);
  padding: 0 var(--dw-space-5) 0 var(--dw-space-6);
}

.ai-model-select--composer .ai-model-select__trigger {
  height: var(--dw-btn-height);
  padding: 0 var(--dw-space-4) 0 var(--dw-space-3);
  gap: var(--dw-gap-xs);
  max-width: min(240px, 46vw);
  border-color: transparent;
  background: transparent;
  color: var(--dw-text-secondary);
}

.ai-model-select--composer .ai-model-select__trigger:hover:not(:disabled),
.ai-model-select--composer .ai-model-select__trigger.open {
  border-color: var(--dw-border-light);
  background: var(--dw-bg-muted);
}

.ai-model-select__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--dw-text-md);
  font-weight: 500;
  color: var(--dw-text);
  line-height: var(--dw-leading);
}

.ai-model-select--composer .ai-model-select__trigger:hover:not(:disabled) .ai-model-select__label,
.ai-model-select--composer .ai-model-select__trigger.open .ai-model-select__label {
  color: var(--dw-text);
}

.ai-model-select.is-static .ai-model-select__trigger {
  cursor: default;
}

.ai-model-select__trigger:hover:not(:disabled) {
  border-color: var(--dw-border);
  background: var(--dw-bg-hover);
  color: var(--dw-text);
}

.ai-model-select__trigger.open {
  border-color: var(--dw-border);
  background: var(--dw-bg);
  color: var(--dw-text);
}

.ai-model-select__icon {
  flex-shrink: 0;
  color: var(--dw-text-muted);
}

.ai-model-select__body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  text-align: left;
}

.ai-model-select--default .ai-model-select__body {
  flex-direction: row;
  align-items: center;
}

.ai-model-select__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: var(--dw-text);
}

.ai-model-select__count {
  flex-shrink: 0;
  min-width: var(--dw-icon-size-lg);
  height: var(--dw-icon-size-lg);
  padding: 0 var(--dw-space-2);
  border-radius: var(--dw-radius-pill);
  background: var(--dw-bg);
  border: 1px solid var(--dw-border-light);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  line-height: var(--dw-tab-title-line);
  text-align: center;
}

.ai-model-select__chevron {
  flex-shrink: 0;
  opacity: 0.55;
  transition: transform var(--dw-duration) var(--dw-ease);
}

.ai-model-select__trigger.open .ai-model-select__chevron {
  transform: rotate(180deg);
}

.model-menu-enter-active,
.model-menu-leave-active {
  transition: opacity var(--dw-duration-fast) var(--dw-ease), transform var(--dw-duration-fast) var(--dw-ease);
}

.model-menu-enter-from,
.model-menu-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
