<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import DashboardWidgetFrame from '@/features/dashboard/components/DashboardWidgetFrame.vue'
import {EmptyState} from '@/core/components'
import StatusPill from '@/core/components/ui/StatusPill.vue'
import type {OnCallConnectionRef} from '@/features/team/services/team-on-call-pack.service'
import {resolveConnectionEnvironmentLabel, resolveConnectionEnvironmentVariant} from '@/features/connection/services/connection-environment.service'
import '@/features/dashboard/styles/dashboard-widgets.css'

const props = defineProps<{
  editMode: boolean
  isDragging: boolean
  isDropTarget: boolean
  hasTeam: boolean
  teamName: string
  connections: OnCallConnectionRef[]
}>()

const emit = defineEmits<{
  openConnection: [connectionId: string]
  openTeam: []
  'drag-start': [event: DragEvent]
  'drag-over': []
  drop: []
  'drag-end': []
}>()

const {t} = useI18n()

const subtitle = computed(() =>
    props.teamName ? t('dashboard.onCallConnections.teamHint', {team: props.teamName}) : '',
)
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
      <div>
        <h2 class="dash-card__title">{{ t('dashboard.onCallConnections.title') }}</h2>
        <p v-if="subtitle" class="dash-card__subtitle">{{ subtitle }}</p>
      </div>
      <span v-if="connections.length" class="dash-card__badge">{{ connections.length }}</span>
    </header>
    <div class="dash-card__body">
      <EmptyState v-if="!hasTeam" embedded :title="t('dashboard.onCallConnections.noTeam')">
        <template #hint>
          <button class="dw-link-btn" type="button" @click="emit('openTeam')">
            {{ t('dashboard.onCallConnections.openTeam') }}
          </button>
        </template>
      </EmptyState>
      <EmptyState
          v-else-if="!connections.length"
          embedded
          :title="t('dashboard.onCallConnections.empty')"
      >
        <template #hint>
          <button class="dw-link-btn" type="button" @click="emit('openTeam')">
            {{ t('dashboard.onCallConnections.configure') }}
          </button>
        </template>
      </EmptyState>
      <button
          v-for="conn in connections"
          v-else
          :key="conn.id"
          class="dash-on-call"
          :class="{ 'is-missing': !conn.found }"
          type="button"
          @click="emit('openConnection', conn.id)"
      >
        <span class="dash-on-call__copy">
          <span class="dash-on-call__name">{{ conn.label }}</span>
          <code class="dash-on-call__id">{{ conn.id }}</code>
        </span>
        <StatusPill
            :variant="resolveConnectionEnvironmentVariant(conn.env)"
            inline
        >
          {{ resolveConnectionEnvironmentLabel(conn.env, conn.envCustom, t) }}
        </StatusPill>
      </button>
    </div>
  </DashboardWidgetFrame>
</template>

<style scoped>
.dash-card__subtitle {
  margin: var(--dw-space-2) 0 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  font-weight: 400;
}

.dash-on-call {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap-md);
  width: 100%;
  padding: var(--dw-pad-control-lg);
  border: 1px solid var(--dw-panel-outline, var(--dw-border-light));
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-panel);
  text-align: left;
  cursor: pointer;
}

.dash-on-call + .dash-on-call {
  margin-top: var(--dw-space-4);
}

.dash-on-call:hover {
  border-color: color-mix(in srgb, var(--dw-primary) 30%, var(--dw-panel-outline, var(--dw-border-light)));
}

.dash-on-call.is-missing {
  border-style: dashed;
  opacity: 0.85;
}

.dash-on-call__copy {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-1);
  min-width: 0;
}

.dash-on-call__name {
  font-size: var(--dw-text-md);
  font-weight: 600;
}

.dash-on-call__id {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}
</style>
