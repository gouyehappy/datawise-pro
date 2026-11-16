<script setup lang="ts">
import type {TeamMember} from '@/core/types'
import type {SelectOption} from '@/core/components/select.types'
import DwSelect from '@/core/components/DwSelect.vue'
import {DwButton, DwIcon} from '@/core/components'
import {isTeamOwner, type TeamRole} from '@/features/team/services/team-role.service'

defineProps<{
  loading: boolean
  members: TeamMember[]
  isOwner: boolean
  roleOptions: SelectOption[]
  roleUpdatingUserId: number | null
  roleLabel: (role: TeamRole | string) => string
  formatDate: (value: string) => string
  currentUserId?: number
  canInvite?: boolean
}>()

const emit = defineEmits<{
  'update-role': [member: TeamMember, role: TeamRole]
  invite: []
}>()

function initials(name: string): string {
  return (name || '?').trim().charAt(0).toUpperCase()
}
</script>

<template>
  <div class="tab-panel team-members" data-testid="team-members">
    <div class="team-members__bar">
      <div class="team-members__bar-copy">
        <span class="team-members__count">{{ members.length }}</span>
        <span>{{ $t('team.membersHint') }}</span>
      </div>
      <DwButton v-if="canInvite" variant="primary" size="sm" @click="emit('invite')">
        <DwIcon name="user" size="xs"/>
        {{ $t('team.inviteMembers') }}
      </DwButton>
    </div>

    <p v-if="loading" class="mp-empty">{{ $t('team.loading') }}</p>
    <p v-else-if="!members.length" class="mp-empty">{{ $t('team.emptyMembers') }}</p>
    <div v-else class="team-members__table">
      <div class="team-members__head">
        <span>{{ $t('team.memberColumn') }}</span>
        <span>{{ $t('team.joinedColumn') }}</span>
        <span>{{ $t('team.roleColumn') }}</span>
      </div>
      <ul class="team-members__list" data-testid="team-members-list">
        <li
            v-for="member in members"
            :key="member.userId"
            class="team-members__row"
            data-testid="team-member-row"
        >
          <div class="team-members__person">
            <span class="mp-avatar team-members__avatar">{{ initials(member.userName) }}</span>
            <span class="team-members__name">
              {{ member.userName }}
              <span v-if="member.userId === currentUserId" class="team-members__you">{{ $t('team.you') }}</span>
            </span>
          </div>
          <span class="team-members__joined">{{ formatDate(member.joinedAt) }}</span>
          <div class="team-members__role">
            <DwSelect
                v-if="isOwner && !isTeamOwner(member.role)"
                :model-value="member.role"
                size="sm"
                :options="roleOptions"
                :disabled="roleUpdatingUserId === member.userId"
                @update:model-value="emit('update-role', member, $event as TeamRole)"
            />
            <span v-else class="team-members__badge">{{ roleLabel(member.role) }}</span>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.team-members {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-3);
  min-height: 0;
}

.team-members__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
  min-height: var(--mp-head-h);
  flex-shrink: 0;
}

.team-members__bar-copy {
  display: flex;
  align-items: center;
  gap: var(--dw-space-3);
  min-width: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.team-members__count {
  font-size: var(--dw-text-md);
  font-weight: 600;
  line-height: 1;
  color: var(--dw-text);
  font-variant-numeric: tabular-nums;
}

.team-members__bar :deep(button) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.team-members__table {
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-panel);
  overflow: hidden;
}

.team-members__head,
.team-members__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 160px 120px;
  align-items: center;
  gap: var(--dw-space-4);
  padding: 0 var(--dw-space-5);
}

.team-members__head {
  height: var(--dw-density-sm);
  background: var(--dw-bg-muted);
  border-bottom: 1px solid var(--dw-border-light);
  font-size: var(--dw-text-2xs);
  color: var(--dw-text-muted);
}

.team-members__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.team-members__row {
  min-height: var(--dw-density-lg);
}

.team-members__row + .team-members__row {
  border-top: 1px solid var(--dw-border-light);
}

.team-members__person {
  display: flex;
  align-items: center;
  gap: var(--dw-space-3);
  min-width: 0;
}

.team-members__avatar {
  width: var(--dw-density-sm);
  height: var(--dw-density-sm);
  border-radius: 50%;
  font-size: var(--dw-text-2xs);
}

.team-members__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--dw-text-sm);
  font-weight: 500;
}

.team-members__you {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: var(--dw-radius-pill);
  background: var(--dw-bg-muted);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-2xs);
  font-weight: 400;
}

.team-members__joined {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.team-members__role {
  display: flex;
  justify-content: flex-end;
  min-width: 0;
}

.team-members__badge {
  padding: 2px 8px;
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-primary) 12%, transparent);
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  white-space: nowrap;
}

.team-members__role :deep(.dw-select) {
  width: 100%;
  max-width: 130px;
}

@media (max-width: 760px) {
  .team-members__head,
  .team-members__row {
    grid-template-columns: minmax(0, 1fr) 120px;
  }

  .team-members__head span:nth-child(2),
  .team-members__joined {
    display: none;
  }
}
</style>
