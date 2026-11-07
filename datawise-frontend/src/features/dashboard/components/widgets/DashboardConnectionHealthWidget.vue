<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import DashboardWidgetFrame from '@/features/dashboard/components/DashboardWidgetFrame.vue'
import {EmptyState, StatusPill} from '@/core/components'
import DbTypeIcon from '@/core/components/DbTypeIcon.vue'
import {DB_TYPE_ICON_SIZE} from '@/features/connection/constants/db-type-icon-sizes'
import type {DashboardConnectionHealthRow, DashboardRuntimeOverview} from '@/features/dashboard/services/dashboard-connection-runtime.service'
import '@/features/dashboard/styles/dashboard-widgets.css'

const props = defineProps<{
  editMode: boolean
  isDragging: boolean
  isDropTarget: boolean
  connections: DashboardConnectionHealthRow[]
  healthSummary: { ok: number; error: number; unknown: number }
  healthChecking: boolean
  healthCheckedAt: number | null
  runtimeOverview: DashboardRuntimeOverview
  runtimeLoading: boolean
}>()

const emit = defineEmits<{
  refresh: []
  openSettings: []
  openDatabase: []
  'drag-start': [event: DragEvent]
  'drag-over': []
  drop: []
  'drag-end': []
}>()

const {t} = useI18n()

const healthCheckedLabel = computed(() => {
  const ts = props.healthCheckedAt
  if (!ts) return t('dashboard.connectionHealthNeverChecked')
  return t('dashboard.connectionHealthLastChecked', {
    time: new Date(ts).toLocaleTimeString(),
  })
})

function connectionStatusLabel(status: 'ok' | 'error' | 'unknown'): string {
  return t(`dashboard.status.${status}`)
}

const runtimeMetricsLabel = computed(() => {
  if (props.runtimeOverview.metricsError) {
    return t('dashboard.runtimeMetricsUnavailable')
  }
  return t('dashboard.runtimeOverview', {
    pools: props.runtimeOverview.jdbcPoolsActive,
    sessions: props.runtimeOverview.schemaSessionsActive,
    failed: props.runtimeOverview.failedProbes,
  })
})
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
      <h2 class="dash-card__title">{{ t('dashboard.connections') }}</h2>
      <div class="dash-card__head-actions">
        <span class="dash-card__badge">{{ connections.length }}</span>
        <button
            class="dw-text-btn dw-text-btn--compact"
            type="button"
            :disabled="healthChecking || runtimeLoading"
            @click="emit('refresh')"
        >
          {{ healthChecking || runtimeLoading ? t('dashboard.connectionHealthChecking') : t('dashboard.connectionHealthRefresh') }}
        </button>
        <button
            class="dw-text-btn dw-text-btn--compact"
            type="button"
            @click="emit('openSettings')"
        >
          {{ t('dashboard.connectionHealthSettings') }}
        </button>
      </div>
    </header>
    <div class="dash-card__body">
      <p v-if="connections.length" class="dash-health-summary">
        {{ t('dashboard.connectionHealthSummary', healthSummary) }}
        <span class="dash-health-summary__meta">{{ healthCheckedLabel }}</span>
      </p>
      <p v-if="connections.length" class="dash-runtime-summary" :class="{ 'is-error': runtimeOverview.metricsError }">
        {{ runtimeMetricsLabel }}
      </p>
      <EmptyState v-if="!connections.length" embedded :title="t('dashboard.noConnections')"/>
      <button
          v-for="conn in connections"
          :key="conn.id"
          class="dash-conn"
          type="button"
          @click="emit('openDatabase')"
      >
        <span class="dash-conn__dot" :class="`is-${conn.status}`" aria-hidden="true"/>
        <DbTypeIcon :db-type="conn.dbType" :size="DB_TYPE_ICON_SIZE.list"/>
        <span class="dash-conn__copy">
          <span class="dash-conn__name">{{ conn.name }}</span>
          <span class="dash-conn__meta">
            <span class="dash-conn__type">{{ conn.dbType }}</span>
            <span v-if="conn.poolLabel" class="dash-conn__pool">
              {{ t('dashboard.poolUsage', { usage: conn.poolLabel }) }}
            </span>
            <span v-if="conn.pool?.pending" class="dash-conn__pending">
              {{ t('dashboard.poolPending', { n: conn.pool.pending }) }}
            </span>
          </span>
        </span>
        <StatusPill :status="conn.status" domain="connection">
          {{ connectionStatusLabel(conn.status) }}
        </StatusPill>
      </button>
    </div>
  </DashboardWidgetFrame>
</template>
