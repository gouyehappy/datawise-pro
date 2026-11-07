<script setup lang="ts">
import {computed, toRef} from 'vue'
import {useI18n} from 'vue-i18n'
import type {PluginItem} from '@/core/types'
import {AppModal, DwButton, DwInlineAlert, StatusPill} from '@/core/components'
import {
    PLUGIN_REGISTRY,
    listPluginRequires,
    pluginHasUnmetRequires,
    resolvePluginSettingsTab,
    type PluginId,
} from '@/features/plugin/services/plugin-registry.service'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {useModalFeedback} from '@/core/composables/useModalFeedback'
import {
    getPluginUsage,
    pluginUsageTotal,
} from '@/features/plugin/services/plugin-usage.service'

import {shouldShowPresetAlignAllAction} from '@/features/plugin/services/plugin-navigation.service'
import {
    findPluginPreset,
    countPluginsConflictingWithPreset,
    pluginConflictsWithPreset,
    resolvePresetTargetState,
    type PluginPresetId,
} from '@/features/plugin/services/plugin-preset.service'

const props = defineProps<{
  open: boolean
  plugin: PluginItem | null
  referencePresetId?: PluginPresetId | null
}>()

const emit = defineEmits<{
  close: []
  openFeature: []
  openSettings: []
  toggle: []
  pluginUpdated: [PluginItem | null]
}>()

const {t, te} = useI18n()
const pluginStore = usePluginStore()
const {feedback, showSuccess} = useModalFeedback(toRef(props, 'open'))

const meta = computed(() =>
    props.plugin ? PLUGIN_REGISTRY[props.plugin.id as PluginId] : undefined,
)

const pluginSettingsTab = computed(() =>
    props.plugin ? resolvePluginSettingsTab(props.plugin.id as PluginId) : undefined,
)

const canOpenPluginSettings = computed(
    () => Boolean(props.plugin?.enabled && pluginSettingsTab.value === 'plugins'),
)

const pluginName = computed(() => {
  if (!props.plugin) return ''
  const key = `plugin.items.${props.plugin.id}.name`
  return te(key) ? t(key) : props.plugin.name
})

const pluginDesc = computed(() => {
  if (!props.plugin) return ''
  const key = `plugin.items.${props.plugin.id}.description`
  return te(key) ? t(key) : props.plugin.description
})

const surfaces = computed(() => meta.value?.surfaces ?? [])

const requires = computed(() =>
    props.plugin ? listPluginRequires(props.plugin.id as PluginId) : [],
)

const hasUnmetRequires = computed(() =>
    props.plugin
        ? pluginHasUnmetRequires(props.plugin, (id) => pluginStore.isEnabled(id))
        : false,
)

const usage = computed(() =>
    props.plugin ? getPluginUsage(props.plugin.id) : null,
)

const usageTotal = computed(() => pluginUsageTotal(usage.value))

const usageLastAtLabel = computed(() => {
  const lastAt = usage.value?.lastAt
  if (!lastAt) return ''
  try {
    return new Date(lastAt).toLocaleString()
  } catch {
    return lastAt
  }
})

const referencePreset = computed(() => {
  const presetId = props.referencePresetId
  if (!presetId) return null
  return findPluginPreset(presetId) ?? null
})

const presetExpectedEnabled = computed(() => {
  if (!props.plugin || !referencePreset.value) return undefined
  return resolvePresetTargetState(referencePreset.value, props.plugin.id as PluginId)
})

const presetMismatch = computed(() => {
  if (!props.plugin || !referencePreset.value) return false
  return pluginConflictsWithPreset(
      props.plugin.id as PluginId,
      referencePreset.value,
      (id) => pluginStore.isEnabled(id),
  )
})

const presetLabel = computed(() => {
  const presetId = props.referencePresetId
  if (!presetId) return ''
  const key = `plugin.presets.${presetId}.label`
  return te(key) ? t(key) : presetId
})

const referencePresetConflictCount = computed(() => {
  if (!referencePreset.value) return 0
  return countPluginsConflictingWithPreset(
      referencePreset.value,
      (id) => pluginStore.isEnabled(id),
  )
})

const showAlignAllButton = computed(() =>
    shouldShowPresetAlignAllAction(referencePresetConflictCount.value, presetMismatch.value),
)

function requiredPluginName(id: PluginId): string {
  const key = `plugin.items.${id}.name`
  return te(key) ? t(key) : id
}

function enableSuggestedRequires() {
  if (!props.plugin) return
  const touched = pluginStore.satisfyPluginRequires(props.plugin.id as PluginId)
  if (touched.length) {
    showSuccess(t('plugin.enableRequiresSuccess', {count: touched.length}))
    const updated = pluginStore.items.find((item) => item.id === props.plugin!.id) ?? null
    emit('pluginUpdated', updated)
  }
}

function alignToReferencePreset() {
  if (!props.plugin || !props.referencePresetId) return
  const aligned = pluginStore.alignPluginToReferencePreset(
      props.plugin.id as PluginId,
      props.referencePresetId,
  )
  if (aligned) {
    showSuccess(t('plugin.detail.presetAlignSuccess', {preset: presetLabel.value}))
    const updated = pluginStore.items.find((item) => item.id === props.plugin!.id) ?? null
    emit('pluginUpdated', updated)
  }
}

function alignAllToReferencePreset() {
  if (!props.referencePresetId || referencePresetConflictCount.value === 0) return
  pluginStore.alignToReferencePreset()
  const updated = props.plugin
      ? pluginStore.items.find((item) => item.id === props.plugin!.id) ?? null
      : null
  emit('pluginUpdated', updated)
}
</script>

<template>
  <AppModal
      v-if="plugin"
      :open="open"
      :title="pluginName"
      :subtitle="t('plugin.detail.versionAuthor', { version: plugin.version, author: plugin.author })"
      width="520px"
      @close="emit('close')"
  >
    <p class="plugin-detail__desc">{{ pluginDesc }}</p>

    <DwInlineAlert
        v-if="feedback"
        density="banner"
        :variant="feedback.variant"
        :message="feedback.message"
    />

    <div class="plugin-detail__meta">
      <StatusPill :variant="plugin.enabled ? 'success' : 'neutral'">
        {{ plugin.enabled ? t('plugin.enabled') : t('plugin.disabled') }}
      </StatusPill>
      <StatusPill variant="neutral">{{ t(`plugin.category.${plugin.category}`) }}</StatusPill>
    </div>

    <div v-if="requires.length" class="plugin-detail__requires">
      <span class="plugin-detail__label">{{ t('plugin.detail.requires') }}</span>
      <div class="plugin-detail__chips">
        <span v-for="reqId in requires" :key="reqId" class="mp-chip mp-chip--hint">
          {{ requiredPluginName(reqId) }}
        </span>
      </div>
    </div>

    <div v-if="surfaces.length" class="plugin-detail__surfaces">
      <span class="plugin-detail__label">{{ t('plugin.surfacesTitle') }}</span>
      <div class="plugin-detail__chips">
        <span v-for="surface in surfaces" :key="surface" class="mp-chip">
          {{ t(`plugin.surfaces.${surface}`) }}
        </span>
      </div>
    </div>

    <div v-if="usageTotal" class="plugin-detail__usage">
      <span class="plugin-detail__label">{{ t('plugin.detail.usageTitle') }}</span>
      <p class="plugin-detail__usage-text">
        {{ t('plugin.usage.totalToggles', {count: usageTotal}) }}
        ·
        {{ t('plugin.usage.enableDisable', {
          enable: usage?.enable ?? 0,
          disable: usage?.disable ?? 0,
        }) }}
      </p>
      <p v-if="usageLastAtLabel" class="plugin-detail__usage-meta">
        {{ t('plugin.detail.usageLastAt', {time: usageLastAtLabel}) }}
      </p>
    </div>

    <div v-if="presetExpectedEnabled !== undefined" class="plugin-detail__preset">
      <span class="plugin-detail__label">{{ t('plugin.detail.presetTitle', {preset: presetLabel}) }}</span>
      <div class="plugin-detail__meta">
        <StatusPill :variant="presetExpectedEnabled ? 'success' : 'neutral'">
          {{ presetExpectedEnabled ? t('plugin.detail.presetExpectedOn') : t('plugin.detail.presetExpectedOff') }}
        </StatusPill>
        <StatusPill v-if="presetMismatch" variant="warn">
          {{ t('plugin.detail.presetMismatch') }}
        </StatusPill>
        <StatusPill v-else variant="success">
          {{ t('plugin.detail.presetMatch') }}
        </StatusPill>
      </div>
      <p v-if="presetMismatch" class="plugin-detail__preset-hint">
        {{ t('plugin.detail.presetMismatchHint', {
          preset: presetLabel,
          actual: plugin.enabled ? t('plugin.enabled') : t('plugin.disabled'),
        }) }}
      </p>
      <div v-if="presetMismatch || showAlignAllButton" class="plugin-detail__align-actions">
        <DwButton
            v-if="presetMismatch"
            variant="ghost"
            type="button"
            class="plugin-detail__align-btn"
            @click="alignToReferencePreset"
        >
          {{ t('plugin.detail.presetAlign', {preset: presetLabel}) }}
        </DwButton>
        <DwButton
            v-if="showAlignAllButton"
            variant="ghost"
            type="button"
            class="plugin-detail__align-btn"
            @click="alignAllToReferencePreset"
        >
          {{ t('plugin.detail.presetAlignAll', {count: referencePresetConflictCount}) }}
        </DwButton>
      </div>
    </div>

    <template #footer>
      <DwButton
          v-if="hasUnmetRequires"
          variant="ghost"
          type="button"
          @click="enableSuggestedRequires"
      >
        {{ t('plugin.enableRequires') }}
      </DwButton>
      <DwButton
          v-if="canOpenPluginSettings"
          variant="ghost"
          type="button"
          @click="emit('openSettings')"
      >
        {{ t('plugin.detail.openSettings') }}
      </DwButton>
      <DwButton variant="ghost" type="button" @click="emit('toggle')">
        {{ plugin.enabled ? t('plugin.detail.disable') : t('plugin.detail.enable') }}
      </DwButton>
      <DwButton
          variant="primary"
          type="button"
          :disabled="!plugin.enabled || !meta?.openModule"
          @click="emit('openFeature')"
      >
        {{ t('plugin.openFeature') }}
      </DwButton>
    </template>
  </AppModal>
</template>

<style scoped>
.plugin-detail__desc {
  margin: 0 0 var(--dw-space-8);
  font-size: var(--dw-text-lg);
  line-height: var(--dw-leading-loose);
  color: var(--dw-text-secondary);
}

.plugin-detail__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap);
  margin-bottom: var(--dw-space-8);
}

.plugin-detail__surfaces,
.plugin-detail__requires,
.plugin-detail__usage,
.plugin-detail__preset {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
  margin-bottom: var(--dw-space-8);
}

.plugin-detail__preset-hint {
  margin: 0;
  font-size: var(--dw-text-md);
  color: var(--dw-text-muted);
}

.plugin-detail__align-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap);
}

.plugin-detail__align-btn {
  align-self: flex-start;
}

.plugin-detail__usage-text,
.plugin-detail__usage-meta {
  margin: 0;
  font-size: var(--dw-text-xl);
  color: var(--dw-text-secondary);
}

.plugin-detail__usage-meta {
  font-size: var(--dw-text-md);
  color: var(--dw-text-muted);
}

.plugin-detail__label {
  font-size: var(--dw-text-md);
  color: var(--dw-text-muted);
}

.plugin-detail__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-sm);
}
</style>
