<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import type {TeamInvite, TeamJoinRequest, TeamMember, TeamSharedAiSessionDetail, TeamSharedAiSessionSummary} from '@/core/types'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useShortcutPanelStore} from '@/features/layout/stores/shortcut-panel-store'
import {useTeamStore} from '@/features/team/stores/team-store'
import TeamMembersPanel from '@/features/team/components/panels/TeamMembersPanel.vue'
import TeamInvitesPanel from '@/features/team/components/panels/TeamInvitesPanel.vue'
import TeamAuditPanel from '@/features/team/components/panels/TeamAuditPanel.vue'
import TeamProductionApprovalsPanel from '@/features/team/components/panels/TeamProductionApprovalsPanel.vue'
import TeamSharingPanel from '@/features/team/components/panels/TeamSharingPanel.vue'
import TeamAiSessionsPanel from '@/features/team/components/panels/TeamAiSessionsPanel.vue'
import TeamSharedQueriesPanel from '@/features/team/components/panels/TeamSharedQueriesPanel.vue'
import {DwButton, DwSplitPane, EmptyState, DwInlineAlert, ModulePageHeader, ModulePageRegions, DwCard, DwInput} from '@/core/components'
import type {SelectOption} from '@/core/components/select.types'
import {
    buildConnectionAccessMap,
    toStoredConnectionAccess,
    type ConnectionAccessLevel,
} from '@/features/team/services/connection-access.service'
import {
    formatInviteStatusKey,
    resolvePendingInviteCount,
    shouldAutoOpenInvitesTab,
    shouldShowInviteApprovalBadge,
} from '@/features/team/services/team-invite.service'
import {parseDelimitedIds} from '@/features/team/services/team-sharing.service'
import {
    pruneOnCallConnectionIds,
    toggleOnCallConnectionId,
} from '@/features/team/services/team-on-call-pack.service'
import {
    ASSIGNABLE_TEAM_ROLES,
    canManageTeam,
    isTeamOwner,
    type TeamRole,
} from '@/features/team/services/team-role.service'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useProjectStore} from '@/features/project/stores/project'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

type TeamTab = 'members' | 'invites' | 'audit' | 'sharing' | 'aiSessions' | 'sharedQueries'

const {t} = useI18n()
const layout = useLayoutStore()
const shortcutPanel = useShortcutPanelStore()
const teamStore = useTeamStore()
const projectStore = useProjectStore()
const auth = useAuthStore()

const createName = ref('')
const joinCode = ref('')
const createError = ref('')
const joinError = ref('')
const activeTab = ref<TeamTab>('members')
const sharedConnectionsInput = ref('')
const sharedConnectionAccess = ref<Record<string, ConnectionAccessLevel>>({})
const sharedConsolesInput = ref('')
const shareSqlHistory = ref(false)
const onCallConnectionIds = ref<string[]>([])
const requireInviteApproval = ref(false)
const restrictVisibleProjects = ref(false)
const visibleProjectIds = ref<string[]>([])
const savingSharedConnections = ref(false)
const savingOnCallConnections = ref(false)
const savingSharedConsoles = ref(false)
const savingShareSqlHistory = ref(false)
const savingVisibleProjects = ref(false)
const savingSettings = ref(false)

const members = ref<TeamMember[]>([])
const invites = ref<TeamInvite[]>([])
const myJoinRequests = ref<TeamJoinRequest[]>([])
const sharedAiSessions = ref<TeamSharedAiSessionSummary[]>([])
const selectedSharedSession = ref<TeamSharedAiSessionDetail | null>(null)
const loadingMembers = ref(false)
const loadingInvites = ref(false)
const loadingSharedAiSessions = ref(false)
const loadingSharedSessionDetail = ref(false)
const roleUpdatingUserId = ref<number | null>(null)
const inviteActionId = ref<string | null>(null)
const lastPendingInviteCount = ref(0)

const activeTeam = computed(() =>
    teamStore.teams.find((team) => team.id === teamStore.activeTeamId) ?? null,
)

const pendingInviteCount = computed(() => resolvePendingInviteCount(activeTeam.value))

const showInviteBadge = computed(() => shouldShowInviteApprovalBadge(activeTeam.value))

const canManage = computed(() => canManageTeam(activeTeam.value?.role))

const isOwner = computed(() => isTeamOwner(activeTeam.value?.role))

const currentUserId = computed(() => auth.user?.userId ?? undefined)

const assignableRoles: readonly TeamRole[] = ASSIGNABLE_TEAM_ROLES

const roleOptions = computed<SelectOption[]>(() =>
    assignableRoles.map((role) => ({value: role, label: roleLabel(role)})),
)

const connectionAccessOptions = computed<SelectOption[]>(() => [
  {value: 'ddl', label: t('team.connectionAccessDdl')},
  {value: 'readwrite', label: t('team.connectionAccessReadWrite')},
  {value: 'readonly', label: t('team.connectionAccessReadonly')},
])

const sharedConnectionRows = computed(() =>
    parseDelimitedIds(sharedConnectionsInput.value).map((id) => ({
        id,
        access: sharedConnectionAccess.value[id] ?? 'ddl',
    })),
)

const projectOptions = computed(() =>
    projectStore.projects.map((p) => ({
        id: p.id,
        name: p.name,
        isDefault: p.isDefault,
    })),
)

function roleLabel(role: TeamRole | string) {
    switch (role) {
        case 'owner':
            return t('team.roleOwner')
        case 'admin':
            return t('team.roleAdmin')
        case 'viewer':
            return t('team.roleViewer')
        default:
            return t('team.roleMember')
    }
}

function inviteStatusLabel(status: string): string {
    return t(`team.inviteStatus.${formatInviteStatusKey(status)}`)
}

watch(
    activeTeam,
    (team) => {
        sharedConnectionsInput.value = (team?.sharedConnectionIds ?? []).join(', ')
        sharedConnectionAccess.value = buildConnectionAccessMap(
            team?.sharedConnectionIds ?? [],
            team?.sharedConnectionAccess,
        )
        sharedConsolesInput.value = (team?.sharedConsoleIds ?? []).join(', ')
        onCallConnectionIds.value = [...(team?.onCallConnectionIds ?? [])]
        shareSqlHistory.value = team?.shareSqlHistory ?? false
        requireInviteApproval.value = team?.requireInviteApproval ?? false
        const visible = [...(team?.visibleProjectIds ?? [])]
        visibleProjectIds.value = visible
        restrictVisibleProjects.value = visible.length > 0
        const nextCount = resolvePendingInviteCount(team)
        if (shouldAutoOpenInvitesTab(lastPendingInviteCount.value, nextCount, canManage.value)) {
            activeTab.value = 'invites'
        }
        lastPendingInviteCount.value = nextCount
        void reloadTeamDetails()
    },
    {immediate: true},
)

watch(activeTab, () => {
    void reloadTeamDetails()
})

watch(
    () => teamStore.requestedTab,
    (tab) => {
      if (!tab) return
      activeTab.value = tab
      teamStore.consumeRequestedTab()
    },
    {immediate: true},
)

async function reloadTeamDetails() {
    const team = activeTeam.value
    if (!team) {
        members.value = []
        invites.value = []
        sharedAiSessions.value = []
        selectedSharedSession.value = null
        return
    }
    if (activeTab.value === 'members' || activeTab.value === 'sharing' || activeTab.value === 'audit') {
        await loadMembers(team.id)
    }
    if (activeTab.value === 'sharing') {
        await projectStore.load().catch(() => undefined)
    }
    if (canManage.value) {
        await loadInvites(team.id)
    }
    if (activeTab.value === 'aiSessions') {
        await loadSharedAiSessions(team.id)
    }
}

async function loadMyJoinRequests() {
    myJoinRequests.value = await teamStore.loadJoinRequests()
}

async function loadMembers(teamId: string) {
    loadingMembers.value = true
    try {
        members.value = await teamStore.fetchMembers(teamId)
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.membersLoadFailed')
        layout.showErrorToast(message)
    } finally {
        loadingMembers.value = false
    }
}

async function loadInvites(teamId: string) {
    loadingInvites.value = true
    try {
        invites.value = await teamStore.fetchInvites(teamId)
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.invitesLoadFailed')
        layout.showErrorToast(message)
    } finally {
        loadingInvites.value = false
    }
}

async function loadSharedAiSessions(teamId: string) {
    loadingSharedAiSessions.value = true
    selectedSharedSession.value = null
    try {
        sharedAiSessions.value = await teamStore.fetchSharedAiSessions(teamId)
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.sharedAiSessions.loadFailed')
        layout.showErrorToast(message)
    } finally {
        loadingSharedAiSessions.value = false
    }
}

async function openSharedSession(sessionId: string) {
    const team = activeTeam.value
    if (!team) return
    loadingSharedSessionDetail.value = true
    try {
        selectedSharedSession.value = await teamStore.getSharedAiSession(team.id, sessionId)
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.sharedAiSessions.detailFailed')
        layout.showErrorToast(message)
    } finally {
        loadingSharedSessionDetail.value = false
    }
}

async function submitCreate() {
    const name = createName.value.trim()
    createError.value = ''
    if (!name) {
        createError.value = t('team.nameRequired')
        return
    }
    try {
        const team = await teamStore.createTeam(name)
        createName.value = ''
    } catch (error) {
        createError.value = resolveCaughtApiErrorMessage(error, t, 'team.createFailed')
    }
}

async function submitJoin() {
    const code = joinCode.value.trim()
    joinError.value = ''
    if (!code) {
        joinError.value = t('team.codeRequired')
        return
    }
    try {
        const result = await teamStore.joinTeam(code)
        if (result.status === 'joined' && result.team) {
        } else if (result.status === 'pending') {
            layout.showToast(result.message || t('team.joinPending'))
            await loadMyJoinRequests()
        } else if (result.status === 'already_member' && result.team) {
            teamStore.activeTeamId = result.team.id
        } else {
            joinError.value = result.message || t('team.joinFailed')
            return
        }
        joinCode.value = ''
    } catch (error) {
        joinError.value = resolveCaughtApiErrorMessage(error, t, 'team.joinFailed')
    }
}

function selectTeam(teamId: string) {
    teamStore.activeTeamId = teamId
}

async function saveSharedConnections() {
    const team = activeTeam.value
    if (!team) {
        layout.showErrorToast(t('team.selectTeamFirst'))
        return
    }
    savingSharedConnections.value = true
    try {
        const connectionIds = parseDelimitedIds(sharedConnectionsInput.value)
        const connectionAccess = buildConnectionAccessMap(connectionIds, sharedConnectionAccess.value)
        sharedConnectionAccess.value = connectionAccess
        onCallConnectionIds.value = pruneOnCallConnectionIds(
            onCallConnectionIds.value,
            connectionIds,
        )
        await teamStore.updateSharedConnections(
            team.id,
            connectionIds,
            toStoredConnectionAccess(connectionAccess),
        )
        await shortcutPanel.load()
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.sharedConnectionsSaveFailed')
        layout.showErrorToast(message)
    } finally {
        savingSharedConnections.value = false
    }
}

function onRestrictVisibleProjects(next: boolean) {
    restrictVisibleProjects.value = next
    if (!next) {
        visibleProjectIds.value = []
    } else if (!visibleProjectIds.value.length && projectOptions.value.length) {
        visibleProjectIds.value = projectOptions.value.map((p) => p.id)
    }
}

function toggleVisibleProject(projectId: string) {
    const set = new Set(visibleProjectIds.value)
    if (set.has(projectId)) set.delete(projectId)
    else set.add(projectId)
    visibleProjectIds.value = [...set]
}

async function saveVisibleProjects() {
    const team = activeTeam.value
    if (!team) {
        layout.showErrorToast(t('team.selectTeamFirst'))
        return
    }
    if (restrictVisibleProjects.value && !visibleProjectIds.value.length) {
        layout.showErrorToast(t('team.visibleProjectsNeedSelection'))
        return
    }
    savingVisibleProjects.value = true
    try {
        const ids = restrictVisibleProjects.value ? [...visibleProjectIds.value] : []
        await teamStore.updateVisibleProjects(team.id, ids)
    } catch (error) {
        layout.showErrorToast(resolveCaughtApiErrorMessage(error, t, 'team.visibleProjectsSaveFailed'))
    } finally {
        savingVisibleProjects.value = false
    }
}

function setSharedConnectionAccess(connectionId: string, access: ConnectionAccessLevel) {
    sharedConnectionAccess.value = {
        ...sharedConnectionAccess.value,
        [connectionId]: access,
    }
}

function toggleOnCallConnection(connectionId: string) {
    onCallConnectionIds.value = toggleOnCallConnectionId(onCallConnectionIds.value, connectionId)
}

async function saveOnCallConnections() {
    const team = activeTeam.value
    if (!team) {
        layout.showErrorToast(t('team.selectTeamFirst'))
        return
    }
    savingOnCallConnections.value = true
    try {
        const sharedIds = parseDelimitedIds(sharedConnectionsInput.value)
        const payload = pruneOnCallConnectionIds(onCallConnectionIds.value, sharedIds)
        onCallConnectionIds.value = payload
        await teamStore.updateOnCallConnections(team.id, payload)
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.onCallConnectionsSaveFailed')
        layout.showErrorToast(message)
    } finally {
        savingOnCallConnections.value = false
    }
}

async function saveSharedConsoles() {
    const team = activeTeam.value
    if (!team) {
        layout.showErrorToast(t('team.selectTeamFirst'))
        return
    }
    savingSharedConsoles.value = true
    try {
        await teamStore.updateSharedConsoles(team.id, parseDelimitedIds(sharedConsolesInput.value))
        await shortcutPanel.load()
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.sharedConsolesSaveFailed')
        layout.showErrorToast(message)
    } finally {
        savingSharedConsoles.value = false
    }
}

async function saveShareSqlHistory() {
    const team = activeTeam.value
    if (!team) {
        layout.showErrorToast(t('team.selectTeamFirst'))
        return
    }
    savingShareSqlHistory.value = true
    try {
        await teamStore.updateShareSqlHistory(team.id, shareSqlHistory.value)
        await shortcutPanel.load()
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.shareSqlHistorySaveFailed')
        layout.showErrorToast(message)
    } finally {
        savingShareSqlHistory.value = false
    }
}

async function saveTeamSettings() {
    const team = activeTeam.value
    if (!team) {
        layout.showErrorToast(t('team.selectTeamFirst'))
        return
    }
    savingSettings.value = true
    try {
        await teamStore.updateSettings(team.id, requireInviteApproval.value)
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.settingsSaveFailed')
        layout.showErrorToast(message)
    } finally {
        savingSettings.value = false
    }
}

async function updateMemberRole(member: TeamMember, role: TeamRole) {
    const team = activeTeam.value
    if (!team || member.role === role) return
    roleUpdatingUserId.value = member.userId
    try {
        await teamStore.updateMemberRole(team.id, member.userId, role)
        await loadMembers(team.id)
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.roleUpdateFailed')
        layout.showErrorToast(message)
    } finally {
        roleUpdatingUserId.value = null
    }
}

async function approveInvite(invite: TeamInvite) {
    const team = activeTeam.value
    if (!team) return
    inviteActionId.value = invite.id
    try {
        await teamStore.approveInvite(team.id, invite.id)
        await Promise.all([loadInvites(team.id), loadMembers(team.id)])
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.inviteActionFailed')
        layout.showErrorToast(message)
    } finally {
        inviteActionId.value = null
    }
}

async function rejectInvite(invite: TeamInvite) {
    const team = activeTeam.value
    if (!team) return
    inviteActionId.value = invite.id
    try {
        await teamStore.rejectInvite(team.id, invite.id)
        await Promise.all([loadInvites(team.id), teamStore.load()])
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.inviteActionFailed')
        layout.showErrorToast(message)
    } finally {
        inviteActionId.value = null
    }
}

function copyInviteCode() {
    const code = activeTeam.value?.inviteCode
    if (!code) return
    void navigator.clipboard.writeText(code).then(() => {
    })
}

function openInvitesTab() {
    activeTab.value = 'invites'
}

function openWorkspace() {
    layout.setModule('database')
}

function formatDate(value: string) {
    if (!value) return '—'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

onMounted(() => {
    void loadMyJoinRequests()
})
</script>

<template>
  <div class="module-page team-page" data-testid="team-page" data-onboarding="team-module">
    <ModulePageRegions content-class="team-page__regions">
      <template #header>
        <ModulePageHeader
            variant="compact"
            :title="t('team.title')"
            :subtitle="t('team.subtitle')"
        >
          <template #actions>
            <DwButton variant="secondary" @click="openWorkspace">
              {{ t('team.enterWorkspace') }}
            </DwButton>
          </template>
        </ModulePageHeader>
      </template>

      <div class="team-page__body">
    <div class="team-onboarding mp-grid-2">
      <DwCard
          class="team-onboarding__card"
          :title="t('team.createTitle')"
          :description="t('team.createDesc')"
      >
        <div class="team-onboarding__row">
          <DwInput
              v-model="createName"
              :placeholder="t('team.createPlaceholder')"
              @keydown.enter="submitCreate"
          />
          <DwButton variant="primary" class="team-onboarding__action" @click="submitCreate">
            {{ t('team.createAction') }}
          </DwButton>
        </div>
        <DwInlineAlert :message="createError"/>
      </DwCard>

      <DwCard
          class="team-onboarding__card"
          :title="t('team.joinTitle')"
          :description="t('team.joinDesc')"
      >
        <div class="team-onboarding__row">
          <DwInput
              v-model="joinCode"
              :placeholder="t('team.joinPlaceholder')"
              @keydown.enter="submitJoin"
          />
          <DwButton variant="secondary" class="team-onboarding__action" @click="submitJoin">
            {{ t('team.joinAction') }}
          </DwButton>
        </div>
        <DwInlineAlert :message="joinError"/>
        <ul v-if="myJoinRequests.length" class="join-request-list">
          <li v-for="request in myJoinRequests" :key="`${request.teamId}-${request.requestedAt}`">
            {{ t('team.myJoinRequestPending', {name: request.teamName, time: formatDate(request.requestedAt)}) }}
          </li>
        </ul>
      </DwCard>
    </div>

    <DwSplitPane
        class="team-main"
        storage-key="dw.split.team-main"
        default-ratio="third"
        :default-width="260"
        :min-width="220"
        :max-width="480"
        :stack-below="900"
        start-class="mp-panel team-sidebar"
        end-class="mp-panel team-detail"
    >
      <template #start>
        <header class="mp-panel__head">
          <span>{{ t('team.myTeams') }}</span>
          <span class="mp-panel__count">{{ teamStore.teams.length }}</span>
        </header>
        <div class="mp-panel__body mp-panel__body--scroll team-sidebar__body">
          <EmptyState
              v-if="!teamStore.teams.length"
              embedded
              compact
              class="mp-empty"
              :title="t('team.emptyTeams')"
          />
          <ul v-else class="mp-list team-list">
            <li
                v-for="team in teamStore.teams"
                :key="team.id"
                class="mp-list__row"
                :class="{ 'is-active': teamStore.activeTeamId === team.id }"
                @click="selectTeam(team.id)"
            >
              <div class="mp-list__main">
                <span class="mp-avatar">{{ team.name.charAt(0) }}</span>
                <div>
                  <div class="mp-list__name">{{ team.name }}</div>
                  <div class="mp-list__meta">
                    {{ t('team.memberCount', {count: team.memberCount}) }}
                    ·
                    {{ roleLabel(team.role) }}
                  </div>
                </div>
              </div>
              <span v-if="teamStore.activeTeamId === team.id" class="mp-list__mark">✓</span>
            </li>
          </ul>
        </div>
      </template>

      <template #end>
        <template v-if="activeTeam">
          <header class="mp-panel__head team-detail__head">
            <span class="team-detail__title">{{ activeTeam.name }}</span>
            <nav class="team-tabs" role="tablist">
              <button
                  type="button"
                  class="team-tab"
                  :class="{ 'is-active': activeTab === 'members' }"
                  data-testid="team-tab-members"
                  @click="activeTab = 'members'"
              >
                {{ t('team.tabMembers') }}
              </button>
              <button
                  v-if="canManage"
                  type="button"
                  class="team-tab"
                  :class="{ 'is-active': activeTab === 'invites' }"
                  data-testid="team-tab-invites"
                  @click="activeTab = 'invites'"
              >
                {{ t('team.tabInvites') }}
                <span v-if="showInviteBadge" class="team-tab__badge">{{ pendingInviteCount }}</span>
              </button>
              <button
                  v-if="canManage"
                  type="button"
                  class="team-tab"
                  :class="{ 'is-active': activeTab === 'audit' }"
                  data-testid="team-tab-audit"
                  @click="activeTab = 'audit'"
              >
                {{ t('team.tabAudit') }}
              </button>
              <button
                  v-if="canManage"
                  type="button"
                  class="team-tab"
                  :class="{ 'is-active': activeTab === 'sharing' }"
                  data-testid="team-tab-sharing"
                  @click="activeTab = 'sharing'"
              >
                {{ t('team.tabSharing') }}
              </button>
              <button
                  type="button"
                  class="team-tab"
                  :class="{ 'is-active': activeTab === 'sharedQueries' }"
                  @click="activeTab = 'sharedQueries'"
              >
                {{ t('team.tabSharedQueries') }}
              </button>
              <button
                  type="button"
                  class="team-tab"
                  :class="{ 'is-active': activeTab === 'aiSessions' }"
                  @click="activeTab = 'aiSessions'"
              >
                {{ t('team.tabAiSessions') }}
              </button>
            </nav>
          </header>

          <div class="mp-panel__body mp-panel__body--scroll team-detail__body">
        <TeamMembersPanel
            v-if="activeTab === 'members'"
            :loading="loadingMembers"
            :members="members"
            :is-owner="isOwner"
            :role-options="roleOptions"
            :role-updating-user-id="roleUpdatingUserId"
            :role-label="roleLabel"
            :format-date="formatDate"
            @update-role="updateMemberRole"
        />

        <TeamInvitesPanel
            v-else-if="activeTab === 'invites' && canManage"
            :loading="loadingInvites"
            :invites="invites"
            :invite-action-id="inviteActionId"
            :invite-status-label="inviteStatusLabel"
            :format-date="formatDate"
            @approve="approveInvite"
            @reject="rejectInvite"
        />

        <div v-else-if="activeTab === 'audit' && canManage" class="audit-tab-stack">
          <TeamProductionApprovalsPanel
              :team-id="activeTeam.id"
              :can-manage="canManage"
          />
          <TeamAuditPanel
              :team-id="activeTeam.id"
              :team-name="activeTeam.name"
              :members="members"
          />
        </div>

        <TeamSharedQueriesPanel
            v-else-if="activeTab === 'sharedQueries'"
            :team-id="activeTeam.id"
            :team-name="activeTeam.name"
            :members="members"
            :can-manage="canManage"
            :current-user-id="currentUserId"
        />

        <TeamAiSessionsPanel
            v-else-if="activeTab === 'aiSessions'"
            :loading-list="loadingSharedAiSessions"
            :loading-detail="loadingSharedSessionDetail"
            :sessions="sharedAiSessions"
            :selected-session="selectedSharedSession"
            :format-date="formatDate"
            @select="openSharedSession"
        />

        <TeamSharingPanel
            v-else-if="activeTab === 'sharing' && canManage"
            :invite-code="activeTeam.inviteCode ?? null"
            v-model:require-invite-approval="requireInviteApproval"
            v-model:shared-connections-input="sharedConnectionsInput"
            v-model:shared-consoles-input="sharedConsolesInput"
            v-model:share-sql-history="shareSqlHistory"
            :restrict-visible-projects="restrictVisibleProjects"
            :visible-project-ids="visibleProjectIds"
            :project-options="projectOptions"
            :show-invite-badge="showInviteBadge"
            :pending-invite-count="pendingInviteCount"
            :shared-connection-rows="sharedConnectionRows"
            :on-call-connection-ids="onCallConnectionIds"
            :connection-access-options="connectionAccessOptions"
            :saving-settings="savingSettings"
            :saving-shared-connections="savingSharedConnections"
            :saving-on-call-connections="savingOnCallConnections"
            :saving-shared-consoles="savingSharedConsoles"
            :saving-share-sql-history="savingShareSqlHistory"
            :saving-visible-projects="savingVisibleProjects"
            @copy-invite-code="copyInviteCode"
            @open-invites-tab="openInvitesTab"
            @save-settings="saveTeamSettings"
            @update-connection-access="setSharedConnectionAccess"
            @save-shared-connections="saveSharedConnections"
            @toggle-on-call-connection="toggleOnCallConnection"
            @save-on-call-connections="saveOnCallConnections"
            @save-shared-consoles="saveSharedConsoles"
            @save-share-sql-history="saveShareSqlHistory"
            @update:restrict-visible-projects="onRestrictVisibleProjects"
            @toggle-visible-project="toggleVisibleProject"
            @save-visible-projects="saveVisibleProjects"
        />
        </div>
        </template>

        <EmptyState
            v-else
            class="team-detail__placeholder"
            :title="t('team.selectTeamHint')"
            :hint="t('team.selectTeamHintDesc')"
        />
      </template>
    </DwSplitPane>
      </div>
    </ModulePageRegions>
  </div>
</template>

<style scoped>
.team-page {
  height: 100%;
  padding: var(--mp-pad);
  overflow: hidden;
}

.team-page__regions {
  height: 100%;
  min-height: 0;
}

.team-page__body {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--mp-gap);
  height: 100%;
  min-height: 0;
}

.team-onboarding {
  align-items: stretch;
}

.team-onboarding__card {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
  height: 100%;
}

.team-onboarding__card .mp-card__desc {
  margin-bottom: 0;
}

.team-onboarding__row {
  display: flex;
  align-items: stretch;
  gap: var(--dw-gap);
  margin-top: auto;
}

.team-onboarding__row :deep(input.dw-input) {
  flex: 1;
  min-width: 0;
  margin: 0;
  height: var(--mp-input-h);
}

.team-onboarding__action {
  flex: 0 0 auto;
  width: auto;
  min-width: 96px;
  margin: 0;
  height: var(--mp-input-h);
  padding-inline: clamp(12px, 1.4vmin, 16px);
  align-self: stretch;
}

.team-main.dw-split-pane {
  gap: var(--mp-gap);
  min-height: 0;
}

.team-sidebar__body,
.team-detail__body {
  padding: var(--dw-space-4);
}

.team-list {
  align-content: start;
}

.mp-list__row {
  cursor: pointer;
}

.mp-list__row.is-active {
  background: color-mix(in srgb, var(--dw-primary) 8%, var(--dw-bg-panel));
}

.team-detail__head {
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap-md);
  min-height: var(--mp-head-h);
  height: auto;
  padding-block: 8px;
}

.team-detail__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.team-detail__placeholder {
  flex: 1;
  min-height: 200px;
}

.team-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-tab-gap);
  padding: 0 var(--dw-space-2);
  background: var(--dw-tab-bar-bg);
  border-bottom: 1px solid var(--dw-tab-bar-border);
}

.team-tab {
  height: var(--mp-btn-h);
  padding: 0 var(--dw-space-6);
  border-radius: var(--dw-tab-pill-radius);
  font-size: var(--dw-text-xs);
  cursor: pointer;
}

.team-tab.is-active {
  font-weight: 600;
}

.team-tab__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--dw-icon-size-lg);
  height: var(--dw-icon-size-lg);
  margin-left: var(--dw-space-3);
  padding: 0 var(--dw-space-2);
  border-radius: var(--dw-radius-pill);
  background: var(--dw-danger);
  color: var(--dw-on-accent);
  font-size: var(--dw-text-xs);
  font-weight: 700;
}

.join-request-list {
  margin: var(--dw-space-5) 0 0;
  padding-left: 18px;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-secondary);
}

.sharing-block__hint {
  margin-top: var(--dw-space-5);
  font-size: var(--dw-text-sm);
  color: var(--dw-text-secondary);
}

.link-btn {
  margin-left: var(--dw-space-2);
  padding: 0;
  border: none;
  background: transparent;
  color: var(--dw-primary);
  font-size: inherit;
  cursor: pointer;
  text-decoration: underline;
}

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

.invite-actions {
  display: flex;
  gap: var(--dw-gap);
  flex-shrink: 0;
}

.audit-tab-stack {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.audit-list__row {
  align-items: flex-start;
}

.audit-detail {
  margin-top: var(--dw-space-2);
  font-size: var(--dw-text-sm);
  color: var(--dw-text-secondary);
}

.sharing-panel {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-8);
}

.sharing-block__title {
  margin: 0 0 var(--dw-space-2);
  font-size: var(--dw-text-xl);
  font-weight: 600;
}

.sharing-block__desc {
  margin: 0 0 var(--dw-space-5);
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
}

.shared-input {
  width: 100%;
  min-height: 84px;
  resize: vertical;
  margin-bottom: var(--dw-space-6);
}

.shared-access-list {
  display: grid;
  gap: var(--dw-gap);
  margin-bottom: var(--dw-space-6);
}

.shared-access-list__hint {
  margin: 0;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
}

.shared-access-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-space-6);
  padding: var(--dw-pad-control);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-panel);
}

.shared-access-row__id {
  font-size: var(--dw-text-sm);
}

.shared-access-row :deep(.dw-select) {
  min-width: 120px;
  width: auto;
}

.invite-row {
  display: flex;
  align-items: center;
  gap: var(--dw-space-6);
  flex-wrap: wrap;
}

.invite-code {
  padding: var(--dw-space-4) var(--dw-space-6);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-muted);
  font-family: var(--dw-mono);
  font-size: var(--dw-text-lg);
  letter-spacing: 0.08em;
}

.share-toggle {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
  margin-bottom: var(--dw-space-6);
  font-size: var(--dw-text-md);
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
  :deep(.team-sidebar) {
    max-height: 220px;
  }
}
</style>
