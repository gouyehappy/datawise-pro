<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import type {TeamSharedAiSessionSummary} from '@/core/types'
import DashboardWidgetFrame from '@/features/dashboard/components/DashboardWidgetFrame.vue'
import {EmptyState} from '@/core/components'
import '@/features/dashboard/styles/dashboard-widgets.css'

defineProps<{
  editMode: boolean
  isDragging: boolean
  isDropTarget: boolean
  loading: boolean
  hasTeam: boolean
  sessions: TeamSharedAiSessionSummary[]
}>()

const emit = defineEmits<{
  openTeam: []
  'drag-start': [event: DragEvent]
  'drag-over': []
  drop: []
  'drag-end': []
}>()

const {t} = useI18n()

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
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
      <h2 class="dash-card__title">{{ t('dashboard.recentAnalysis.title') }}</h2>
      <span v-if="sessions.length" class="dash-card__badge">{{ sessions.length }}</span>
    </header>
    <div class="dash-card__body">
      <EmptyState v-if="loading" embedded :title="t('dashboard.recentAnalysis.loading')"/>
      <EmptyState v-else-if="!hasTeam" embedded :title="t('dashboard.recentAnalysis.noTeam')">
        <template #hint>
          <button class="dw-link-btn" type="button" @click="emit('openTeam')">
            {{ t('dashboard.recentAnalysis.openTeam') }}
          </button>
        </template>
      </EmptyState>
      <EmptyState v-else-if="!sessions.length" embedded :title="t('dashboard.recentAnalysis.empty')"/>
      <button
          v-for="session in sessions"
          v-else
          :key="session.id"
          class="dash-item"
          type="button"
          @click="emit('openTeam')"
      >
        <span class="dash-item__title">{{ session.title }}</span>
        <span class="dash-item__meta">
          {{ t('dashboard.recentAnalysis.meta', {
            name: session.sharedByUserName,
            count: session.messageCount,
            time: formatDate(session.sharedAt),
          }) }}
        </span>
      </button>
    </div>
  </DashboardWidgetFrame>
</template>
