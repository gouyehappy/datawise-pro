<script setup lang="ts">
import {computed, nextTick, onMounted, watch} from 'vue'
import {storeToRefs} from 'pinia'
import {useI18n} from 'vue-i18n'
import {StatusPill} from '@/core/components'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {useResourceWriteGuard} from '@/features/auth/composables/useResourceWriteGuard'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsSectionCard from '@/features/settings/components/SettingsSectionCard.vue'
import SettingsSegmentTabs from '@/features/settings/components/SettingsSegmentTabs.vue'
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

const presetTabs = computed(() =>
    PLUGIN_PRESET_IDS.map((presetId) => ({
        id: presetId,
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
      <SettingsSectionCard
          :id="SETTINGS_PLUGIN_REFERENCE_PRESET_ANCHOR"
          :title="t('settings.plugins.referencePresetTitle')"
          :hint="t('settings.plugins.referencePresetHint')"
          icon="plugins"
          tone="primary"
      >
        <SettingsSegmentTabs
            variant="inline"
            :model-value="referencePresetId"
            :tabs="presetTabs"
            :aria-label="t('settings.plugins.referencePresetTitle')"
            @update:model-value="selectPreset"
        />
        <div class="reference-status">
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
        <p class="field-note">{{ t('settings.plugins.referencePresetPersist') }}</p>
      </SettingsSectionCard>

      <SettingsSectionCard
          :title="t('settings.plugins.centerTitle')"
          :hint="t('settings.plugins.centerHint')"
          icon="plugins"
          tone="sky"
          :badge="`${pluginStore.enabledCount}/${pluginStore.items.length}`"
      >
        <p class="field-note">
          {{ t('settings.plugins.statsNote', {
            enabled: pluginStore.enabledCount,
            total: pluginStore.items.length,
          }) }}
        </p>
      </SettingsSectionCard>

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
  margin-top: var(--dw-space-6);
}

</style>
