<script setup lang="ts">
import {computed, nextTick, onMounted, watch} from 'vue'
import {storeToRefs} from 'pinia'
import {useI18n} from 'vue-i18n'
import {StatusPill, SettingsRow} from '@/core/components'
import SettingsSelect from '@/core/components/SettingsSelect.vue'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {useResourceWriteGuard} from '@/features/auth/composables/useResourceWriteGuard'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsGroup from '@/features/settings/components/SettingsGroup.vue'
import SettingsTipsCard from '@/features/settings/components/SettingsTipsCard.vue'
import {usePluginPresetSummary} from '@/features/plugin/composables/usePluginPresetSummary'
import {
    PLUGIN_PRESET_IDS,
    type PluginPresetId,
} from '@/features/plugin/services/plugin-preset.service'
import {CONNECTOR_CAPABILITY_DOC} from '@/features/plugin/services/plugin-connector-crossref.service'
import {SETTINGS_PLUGIN_REFERENCE_PRESET_ANCHOR} from '@/features/plugin/services/plugin-navigation.service'

const {t, te} = useI18n()
const pluginStore = usePluginStore()
const layout = useLayoutStore()
const {settingsScrollAnchor} = storeToRefs(layout)
const {readOnly, hint, denyIfReadOnly} = useResourceWriteGuard(UserResource.AppConfig)

const {referencePresetId: summaryReferencePresetId, referencePresetConflictCount} = usePluginPresetSummary()

const referencePresetId = computed<PluginPresetId>({
    get: () => summaryReferencePresetId.value,
    set: (id) => {
        if (denyIfReadOnly()) return
        pluginStore.setReferencePresetId(id)
    },
})

const presetOptions = computed(() =>
    PLUGIN_PRESET_IDS.map((presetId) => ({
        value: presetId,
        label: presetLabel(presetId),
    })),
)

function presetLabel(id: PluginPresetId): string {
    const key = `plugin.presets.${id}.label`
    return te(key) ? t(key) : id
}

function selectPreset(id: string) {
    if (denyIfReadOnly()) return
    referencePresetId.value = id as PluginPresetId
}

function alignToReferencePreset() {
    if (denyIfReadOnly()) return
    pluginStore.alignToReferencePreset()
}

function openPresetDiff() {
    pluginStore.openPluginPresetDiff()
}

function scrollToSettingsAnchor() {
    if (settingsScrollAnchor.value !== SETTINGS_PLUGIN_REFERENCE_PRESET_ANCHOR) return
    void nextTick(() => {
        document.getElementById(SETTINGS_PLUGIN_REFERENCE_PRESET_ANCHOR)?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
        })
        layout.clearSettingsScrollAnchor()
    })
}

onMounted(scrollToSettingsAnchor)
watch(settingsScrollAnchor, scrollToSettingsAnchor)
</script>

<template>
  <SettingsPageShell
      :title="t('settings.plugins.title')"
      :subtitle="t('settings.plugins.subtitle')"
      :readonly="readOnly"
      :readonly-hint="hint"
  >
    <template #tips>
      <SettingsTipsCard
          :title="t('settings.plugins.title')"
          :content="t('settings.plugins.subtitle')"
          icon="plugins"
      />
    </template>

    <div class="settings-groups">
      <SettingsGroup
          :id="SETTINGS_PLUGIN_REFERENCE_PRESET_ANCHOR"
          :title="t('settings.plugins.referencePresetTitle')"
          :hint="t('settings.plugins.referencePresetHint')"
      >
        <SettingsRow
            :label="t('settings.plugins.referencePresetTitle')"
            :disabled="readOnly"
        >
          <SettingsSelect
              id="plugin-reference-preset"
              :model-value="referencePresetId"
              :options="presetOptions"
              :disabled="readOnly"
              @update:model-value="selectPreset"
          />
        </SettingsRow>
        <div class="settings-section__block reference-status">
          <StatusPill
              v-if="referencePresetConflictCount > 0"
              variant="warn"
          >
            {{ t('settings.plugins.presetConflicts', { count: referencePresetConflictCount }) }}
          </StatusPill>
          <StatusPill v-else variant="neutral">
            {{ t('settings.plugins.presetSynced') }}
          </StatusPill>
          <button
              v-if="referencePresetConflictCount > 0"
              class="dw-text-btn dw-text-btn--compact"
              type="button"
              :disabled="readOnly"
              @click="alignToReferencePreset"
          >
            {{ t('settings.plugins.alignReferencePreset') }}
          </button>
          <button
              class="dw-text-btn dw-text-btn--compact"
              type="button"
              @click="openPresetDiff"
          >
            {{ t('settings.plugins.viewPresetDiff') }}
          </button>
        </div>
        <p class="settings-section__block-hint">{{ t('settings.plugins.referencePresetPersist') }}</p>
      </SettingsGroup>

      <SettingsGroup
          :title="t('settings.plugins.centerTitle')"
          :hint="t('settings.plugins.centerHint')"
      >
        <div class="settings-section__block">
          <p class="settings-section__block-hint">
            {{ t('settings.plugins.statsNote', {
              enabled: pluginStore.enabledCount,
              total: pluginStore.items.length,
            }) }}
          </p>
        </div>
      </SettingsGroup>

      <p class="field-note settings-footnote">
        {{ t('settings.plugins.crossrefHint', {doc: CONNECTOR_CAPABILITY_DOC}) }}
      </p>
    </div>
  </SettingsPageShell>
</template>

<style scoped>
.reference-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-gap);
  margin-top: var(--dw-space-2);
}

</style>
