<script setup lang="ts">
import type {TeamInvite} from '@/core/types'
import {DwButton} from '@/core/components'

defineProps<{
  loading: boolean
  invites: TeamInvite[]
  inviteActionId: string | null
  inviteStatusLabel: (status: string) => string
  formatDate: (value: string) => string
}>()

const emit = defineEmits<{
  approve: [invite: TeamInvite]
  reject: [invite: TeamInvite]
}>()
</script>

<template>
  <div class="tab-panel" data-testid="team-invites">
    <p v-if="loading" class="mp-empty">{{ $t('team.loading') }}</p>
    <p v-else-if="!invites.length" class="mp-empty">{{ $t('team.emptyInvites') }}</p>
    <ul v-else class="detail-list" data-testid="team-invites-list">
      <li v-for="invite in invites" :key="invite.id" class="detail-list__row" data-testid="team-invite-row">
        <div>
          <div class="detail-list__name">{{ invite.userName }}</div>
          <div class="detail-list__meta">
            {{ inviteStatusLabel(invite.status) }} · {{ formatDate(invite.requestedAt) }}
          </div>
        </div>
        <div class="invite-actions">
          <DwButton
              variant="primary"
              size="sm"
              data-testid="team-invite-approve"
              :disabled="inviteActionId === invite.id"
              :loading="inviteActionId === invite.id"
              @click="emit('approve', invite)"
          >
            {{ $t('team.approveInvite') }}
          </DwButton>
          <DwButton
              variant="secondary"
              size="sm"
              data-testid="team-invite-reject"
              :disabled="inviteActionId === invite.id"
              @click="emit('reject', invite)"
          >
            {{ $t('team.rejectInvite') }}
          </DwButton>
        </div>
      </li>
    </ul>
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

.invite-actions {
  display: flex;
  gap: var(--dw-gap);
  flex-shrink: 0;
}
</style>
