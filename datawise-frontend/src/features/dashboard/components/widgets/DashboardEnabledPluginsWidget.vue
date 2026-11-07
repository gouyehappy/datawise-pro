<script setup lang="ts">
import {toRefs} from 'vue'
import {useI18n} from 'vue-i18n'
import DashboardWidgetFrame from '@/features/dashboard/components/DashboardWidgetFrame.vue'
import {EmptyState} from '@/core/components'
import type {PluginPresetId} from '@/features/plugin/services/plugin-preset.service'
import {useReferenceConflictBannerDismiss} from '@/features/plugin/composables/useReferenceConflictBannerDismiss'
import '@/features/dashboard/styles/dashboard-widgets.css'

interface PluginItem {
  id: string
  name: string
  version: string
}

const props = defineProps<{
  editMode: boolean
  isDragging: boolean
  isDropTarget: boolean
  plugins: PluginItem[]
  referencePresetId: PluginPresetId
  referencePresetConflictCount: number
}>()

const emit = defineEmits<{
  openPlugins: []
  openPresetDiff: []
  alignReferencePreset: []
  focusPlugin: [id: string]
  'drag-start': [event: DragEvent]
  'drag-over': []
  drop: []
  'drag-end': []
}>()

const {referencePresetId, referencePresetConflictCount} = toRefs(props)

const {
  visible: showReferenceConflictActions,
  dismiss: dismissReferenceConflict,
} = useReferenceConflictBannerDismiss(referencePresetId, referencePresetConflictCount)

const {t} = useI18n()
</script>

<template>
  <DashboardWidgetFrame
      :edit-mode="editMode"
      :is-dragging="isDragging"
      :is-drop-target="isDropTarget"
      @drag-start="emit('drag-start', $event)"
      @drag-over="emit('drag-over')"
      @drop="emit('drop')"
      @drag-end="emit('drag-end')"
  >
    <header class="dash-card__head">
      <h2 class="dash-card__title">{{ t('dashboard.enabledPluginsList') }}</h2>
      <div class="dash-card__head-actions">
        <span class="dash-card__badge">{{ plugins.length }}</span>
        <button
            class="dw-text-btn dw-text-btn--compact"
            type="button"
            @click="emit('openPresetDiff')"
        >
          {{ t('dashboard.openPresetDiff') }}
        </button>
        <button
            class="dw-text-btn dw-text-btn--compact"
            type="button"
            @click="emit('openPlugins')"
        >
          {{ t('dashboard.actions.openPlugins') }}
        </button>
      </div>
    </header>

    <div class="dash-card__body">
      <p class="dash-plugins-summary">
        {{ t('dashboard.referencePreset', {preset: t(`plugin.presets.${referencePresetId}.label`)}) }}
        <template v-if="referencePresetConflictCount > 0">
          · {{ t('dashboard.presetConflicts', {count: referencePresetConflictCount}) }}
        </template>
      </p>

      <div
          v-if="showReferenceConflictActions"
          class="dash-plugins-actions"
      >
        <button
            class="dw-text-btn dw-text-btn--accent dw-text-btn--compact"
            type="button"
            @click="emit('alignReferencePreset')"
        >
          {{ t('plugin.presets.referenceConflictAlignAll', {count: referencePresetConflictCount}) }}
        </button>
        <button
            class="dw-text-btn dw-text-btn--compact"
            type="button"
            @click="dismissReferenceConflict"
        >
          {{ t('plugin.presets.referenceConflictDismiss') }}
        </button>
      </div>

      <EmptyState v-if="!plugins.length" embedded :title="t('dashboard.noEnabledPlugins')"/>
      <button
          v-for="plugin in plugins"
          :key="plugin.id"
          class="dash-item dash-item--row"
          type="button"
          @click="emit('focusPlugin', plugin.id)"
      >
        <span class="dash-item__title">{{ plugin.name }}</span>
        <span class="dash-item__meta">v{{ plugin.version }}</span>
      </button>
    </div>
  </DashboardWidgetFrame>
</template>

<style scoped>
.dash-plugins-summary {
  margin: 0;
  padding: var(--dw-space-4) 18px var(--dw-space-2);
  font-size: var(--dw-text-sm);
  color: var(--dw-text-secondary);
  line-height: var(--dw-leading-relaxed);
}

.dash-plugins-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap);
  padding: 0 18px var(--dw-space-3);
}

.dash-plugins-actions :deep(.dw-text-btn) {
  border: 0;
  background: transparent;
  padding-inline: 0;
  height: auto;
  min-height: 0;
}

.dash-plugins-actions :deep(.dw-text-btn--accent) {
  color: color-mix(in srgb, var(--mp-shell-accent) 78%, var(--dw-text));
}

.dash-plugins-actions :deep(.dw-text-btn:hover:not(:disabled)) {
  background: transparent;
  box-shadow: none;
  text-decoration: underline;
}
</style>
