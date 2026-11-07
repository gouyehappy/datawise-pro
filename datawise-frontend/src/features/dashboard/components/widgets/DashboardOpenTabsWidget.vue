<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import type {WorkspaceTab, WorkspaceTabType} from '@/core/types'
import DashboardWidgetFrame from '@/features/dashboard/components/DashboardWidgetFrame.vue'
import {EmptyState, StatusPill} from '@/core/components'
import '@/features/dashboard/styles/dashboard-widgets.css'

defineProps<{
  editMode: boolean
  isDragging: boolean
  isDropTarget: boolean
  tabs: WorkspaceTab[]
  activeTabId: string | null
}>()

const emit = defineEmits<{
  openTab: [tabId: string]
  'drag-start': [event: DragEvent]
  'drag-over': []
  drop: []
  'drag-end': []
}>()

const {t} = useI18n()

function tabTypeLabel(type: WorkspaceTabType): string {
  return t(`dashboard.tabTypes.${type}`)
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
      <h2 class="dash-card__title">{{ t('dashboard.openTabs') }}</h2>
      <span class="dash-card__badge">{{ tabs.length }}</span>
    </header>
    <div class="dash-card__body">
      <EmptyState v-if="!tabs.length" embedded :title="t('dashboard.noOpenTabs')"/>
      <button
          v-for="tab in tabs"
          :key="tab.id"
          class="dash-tab"
          :class="{ 'is-active': tab.id === activeTabId }"
          type="button"
          @click="emit('openTab', tab.id)"
      >
        <span class="dash-tab__copy">
          <span class="dash-tab__name">{{ tab.title }}</span>
          <span class="dash-tab__type">{{ tabTypeLabel(tab.type) }}</span>
        </span>
        <StatusPill v-if="tab.id === activeTabId" variant="primary">
          {{ t('dashboard.activeTab') }}
        </StatusPill>
      </button>
    </div>
  </DashboardWidgetFrame>
</template>
