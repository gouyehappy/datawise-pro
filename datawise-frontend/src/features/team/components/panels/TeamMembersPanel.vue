<script setup lang="ts">
import type {TeamMember} from '@/core/types'
import type {SelectOption} from '@/core/components/select.types'
import DwSelect from '@/core/components/DwSelect.vue'
import {isTeamOwner, type TeamRole} from '@/features/team/services/team-role.service'

const props = defineProps<{
  loading: boolean
  members: TeamMember[]
  isOwner: boolean
  roleOptions: SelectOption[]
  roleUpdatingUserId: number | null
  roleLabel: (role: TeamRole | string) => string
  formatDate: (value: string) => string
}>()

const emit = defineEmits<{
  'update-role': [member: TeamMember, role: TeamRole]
}>()
</script>

<template>
  <div class="tab-panel" data-testid="team-members">
    <p v-if="loading" class="mp-empty">{{ $t('team.loading') }}</p>
    <p v-else-if="!members.length" class="mp-empty">{{ $t('team.emptyMembers') }}</p>
    <ul v-else class="detail-list" data-testid="team-members-list">
      <li v-for="member in members" :key="member.userId" class="detail-list__row" data-testid="team-member-row">
        <div>
          <div class="detail-list__name">{{ member.userName }}</div>
          <div class="detail-list__meta">{{ formatDate(member.joinedAt) }}</div>
        </div>
        <DwSelect
            v-if="isOwner && !isTeamOwner(member.role)"
            :model-value="member.role"
            size="sm"
            :options="roleOptions"
            :disabled="roleUpdatingUserId === member.userId"
            @update:model-value="emit('update-role', member, $event as TeamRole)"
        />
        <span v-else class="role-badge">{{ roleLabel(member.role) }}</span>
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

.role-badge {
  font-size: var(--dw-text-sm);
}

.detail-list__row :deep(.dw-select) {
  width: auto;
  min-width: 108px;
}
</style>
