<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import DashboardWidgetFrame from '@/features/dashboard/components/DashboardWidgetFrame.vue'
import {DwIcon} from '@/core/icons'
import type {DwIconName} from '@/core/icons'
import type {DashboardQuickActionId} from '@/features/dashboard/services/dashboard-summary.service'
import '@/features/dashboard/styles/dashboard-widgets.css'

const QUICK_ACTION_IDS: DashboardQuickActionId[] = [
  'newConsole',
  'continueWork',
  'openAi',
  'openPlugins',
]

const QUICK_ACTION_ICON: Record<DashboardQuickActionId, DwIconName> = {
  newConsole: 'plus',
  continueWork: 'chevron-right',
  openAi: 'ai',
  openPlugins: 'plugins',
}

const ACTION_TONE: Record<DashboardQuickActionId, string> = {
  newConsole: 'violet',
  continueWork: 'sky',
  openAi: 'rose',
  openPlugins: 'emerald',
}

defineProps<{
  editMode: boolean
  isDragging: boolean
  isDropTarget: boolean
  hasOpenTabs: boolean
}>()

const emit = defineEmits<{
  action: [id: DashboardQuickActionId]
  'drag-start': [event: DragEvent]
  'drag-over': []
  drop: []
  'drag-end': []
}>()

const {t} = useI18n()

function isDisabled(id: DashboardQuickActionId, hasOpenTabs: boolean): boolean {
  return id === 'continueWork' && !hasOpenTabs
}
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
      <h2 class="dash-card__title">{{ t('dashboard.quickActions') }}</h2>
    </header>
    <div class="dash-card__body dash-card__body--actions">
      <button
          v-for="id in QUICK_ACTION_IDS"
          :key="id"
          class="dash-action"
          :class="`dash-action--${ACTION_TONE[id]}`"
          type="button"
          :disabled="isDisabled(id, hasOpenTabs)"
          @click="emit('action', id)"
      >
        <span class="dash-action__icon" aria-hidden="true">
          <DwIcon :name="QUICK_ACTION_ICON[id]" :stroke-width="1.7"/>
        </span>
        <span class="dash-action__copy">
          <span class="dash-action__label">{{ t(`dashboard.actions.${id}`) }}</span>
          <span class="dash-action__hint">{{ t(`dashboard.actions.${id}Hint`) }}</span>
        </span>
        <DwIcon class="dash-action__arrow" name="chevron-right" :stroke-width="2.25"/>
      </button>
    </div>
  </DashboardWidgetFrame>
</template>
