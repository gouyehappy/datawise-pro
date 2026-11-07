<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import DashboardWidgetFrame from '@/features/dashboard/components/DashboardWidgetFrame.vue'
import {EmptyState, StatusPill} from '@/core/components'
import type {SqlLogEntry} from '@/core/types'
import '@/features/dashboard/styles/dashboard-widgets.css'

defineProps<{
  editMode: boolean
  isDragging: boolean
  isDropTarget: boolean
  logs: SqlLogEntry[]
}>()

const emit = defineEmits<{
  openLog: [sql: string]
  'drag-start': [event: DragEvent]
  'drag-over': []
  drop: []
  'drag-end': []
}>()

const {t} = useI18n()
</script>

<template>
  <DashboardWidgetFrame
      card-class="dash-card--feed"
      :edit-mode="editMode"
      :is-dragging="isDragging"
      :is-drop-target="isDropTarget"
      @drag-start="emit('drag-start', $event)"
      @drag-over="emit('drag-over')"
      @drop="emit('drop')"
      @drag-end="emit('drag-end')"
  >
    <header class="dash-card__head">
      <h2 class="dash-card__title">{{ t('dashboard.recentSql') }}</h2>
      <span class="dash-card__badge">{{ logs.length }}</span>
    </header>
    <div class="dash-card__body dash-card__body--feed">
      <EmptyState v-if="!logs.length" embedded :title="t('dashboard.noLogs')"/>
      <button
          v-for="log in logs"
          :key="log.id"
          class="dash-sql"
          type="button"
          @click="emit('openLog', log.sql)"
      >
        <div class="dash-sql__top">
          <StatusPill :status="log.status" domain="log">
            {{ t(`dashboard.sqlStatus.${log.status}`) }}
          </StatusPill>
          <span class="dash-sql__meta">
            {{ log.time }}
            <span class="dash-sql__sep">·</span>
            {{ log.duration }}
            <template v-if="log.rows != null">
              <span class="dash-sql__sep">·</span>
              {{ log.rows }} rows
            </template>
          </span>
        </div>
        <pre class="dash-sql__code">{{ log.sql }}</pre>
      </button>
    </div>
  </DashboardWidgetFrame>
</template>
