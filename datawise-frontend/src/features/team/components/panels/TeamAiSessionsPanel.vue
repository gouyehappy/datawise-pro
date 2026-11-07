<script setup lang="ts">
import {defineAsyncComponent} from 'vue'
import type {TeamSharedAiSessionDetail, TeamSharedAiSessionSummary} from '@/core/types'

const TeamSharedAiSessionViewer = defineAsyncComponent((() =>
    import.meta.env.VITE_DATAWISE_EDITION === 'standard'
        ? import('@/features/pack/stubs/TeamAiSessionStub.vue')
        : import('@/features/team/components/TeamSharedAiSessionViewer.vue')
) as any)

defineProps<{
  loadingList: boolean
  loadingDetail: boolean
  sessions: TeamSharedAiSessionSummary[]
  selectedSession: TeamSharedAiSessionDetail | null
  formatDate: (value: string) => string
}>()

const emit = defineEmits<{
  select: [sessionId: string]
}>()
</script>

<template>
  <div class="tab-panel ai-sessions-panel">
    <p v-if="loadingList" class="mp-empty">{{ $t('team.loading') }}</p>
    <p v-else-if="!sessions.length" class="mp-empty">{{ $t('team.sharedAiSessions.empty') }}</p>
    <div v-else class="ai-sessions-layout">
      <ul class="detail-list ai-sessions-list">
        <li
            v-for="session in sessions"
            :key="session.id"
            class="detail-list__row ai-sessions-list__row"
            :class="{ 'is-active': selectedSession?.id === session.id }"
            @click="emit('select', session.id)"
        >
          <div>
            <div class="detail-list__name">{{ session.title }}</div>
            <div class="detail-list__meta">
              {{ $t('team.sharedAiSessions.meta', {
                name: session.sharedByUserName,
                count: session.messageCount,
                time: formatDate(session.sharedAt),
              }) }}
            </div>
          </div>
        </li>
      </ul>
      <div class="ai-sessions-detail">
        <p v-if="loadingDetail" class="mp-empty">{{ $t('team.loading') }}</p>
        <p v-else-if="!selectedSession" class="mp-empty">
          {{ $t('team.sharedAiSessions.selectHint') }}
        </p>
        <TeamSharedAiSessionViewer v-else :session="selectedSession"/>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
}

.detail-list__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-space-6);
  padding: var(--dw-pad-control-lg);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-panel);
}

.detail-list__name {
  font-size: var(--dw-text-md);
  font-weight: 600;
}

.detail-list__meta {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  margin-top: var(--dw-space-1);
}

.ai-sessions-layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: var(--dw-space-6);
  min-height: 320px;
}

.ai-sessions-list {
  overflow: auto;
  max-height: 420px;
}

.ai-sessions-list__row {
  cursor: pointer;
}

.ai-sessions-list__row.is-active {
  border-color: color-mix(in srgb, var(--dw-primary) 35%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-primary-soft) 40%, var(--dw-bg-panel));
}

.ai-sessions-detail {
  min-height: 0;
  overflow: auto;
  padding: var(--dw-space-6);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-panel);
}

@media (max-width: 900px) {
  .ai-sessions-layout {
    grid-template-columns: 1fr;
  }
}
</style>
