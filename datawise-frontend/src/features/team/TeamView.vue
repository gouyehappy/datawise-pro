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
import {DwButton, DwSplitPane, EmptyState, DwInlineAlert, ModulePageHeader, ModulePageRegions, DwInput, DwIcon} from '@/core/components'
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
type ComposerMode = 'create' | 'join'
type TeamTabItem = {key: TeamTab; label: string; manageOnly: boolean; group: 'work' | 'manage'}

const {t, locale} = useI18n()
const layout = useLayoutStore()
const shortcutPanel = useShortcutPanelStore()
const teamStore = useTeamStore()
const projectStore = useProjectStore()
const auth = useAuthStore()

const createName = ref('')
const joinCode = ref('')
const createError = ref('')
const joinError = ref('')
const composerMode = ref<ComposerMode | null>(null)
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

const activeInviteCode = computed(() => activeTeam.value?.inviteCode ?? null)

const canInvite = computed(() => canManage.value && Boolean(activeInviteCode.value))

const tabs = computed<TeamTabItem[]>(() => {
    const items: TeamTabItem[] = [
        {key: 'members', label: t('team.tabMembers'), manageOnly: false, group: 'work'},
        {key: 'sharedQueries', label: t('team.tabSharedQueries'), manageOnly: false, group: 'work'},
        {key: 'aiSessions', label: t('team.tabAiSessions'), manageOnly: false, group: 'work'},
        {key: 'invites', label: t('team.tabInvites'), manageOnly: true, group: 'manage'},
        {key: 'audit', label: t('team.tabAudit'), manageOnly: true, group: 'manage'},
        {key: 'sharing', label: t('team.tabSharing'), manageOnly: true, group: 'manage'},
    ]
    return items.filter((tab) => !tab.manageOnly || canManage.value)
})

const firstManageTabIndex = computed(() => tabs.value.findIndex((tab) => tab.group === 'manage'))

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
      // Ignore deep links to manage-only tabs for members without manage rights,
      // otherwise the content pane would render nothing.
      if (tabs.value.some((item) => item.key === tab)) {
          activeTab.value = tab
      }
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

function openComposer(mode: ComposerMode) {
    composerMode.value = mode
    createError.value = ''
    joinError.value = ''
}

function closeComposer() {
    composerMode.value = null
}

async function submitCreate() {
    const name = createName.value.trim()
    createError.value = ''
    if (!name) {
        createError.value = t('team.nameRequired')
        return
    }
    try {
        await teamStore.createTeam(name)
        createName.value = ''
        closeComposer()
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
            // The store switches the active team on a successful join.
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
        closeComposer()
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

async function copyInviteCode() {
    const code = activeInviteCode.value
    if (!code) return
    try {
        await navigator.clipboard.writeText(code)
        layout.showToast(t('team.inviteCodeCopied'))
    } catch {
        layout.showErrorToast(t('team.copyFailed'))
    }
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
    if (Number.isNaN(date.getTime())) return value
    return new Intl.DateTimeFormat(locale.value, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date)
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
            <div class="team-actions">
              <DwButton variant="ghost" size="sm" @click="openWorkspace">
                {{ t('team.enterWorkspace') }}
                <DwIcon name="chevron-right" size="xs"/>
              </DwButton>
              <DwButton variant="secondary" size="sm" @click="openComposer('join')">
                <DwIcon name="key" size="xs"/>
                {{ t('team.joinAction') }}
              </DwButton>
              <DwButton variant="primary" size="sm" @click="openComposer('create')">
                <DwIcon name="plus" size="xs"/>
                {{ t('team.createAction') }}
              </DwButton>
            </div>
          </template>
        </ModulePageHeader>
      </template>

      <div class="team-page__body">
        <div v-if="composerMode" class="team-composer">
          <div class="team-composer__intro">
            <div class="team-composer__title">
              {{ composerMode === 'create' ? t('team.createTitle') : t('team.joinTitle') }}
            </div>
            <div class="team-composer__hint">
              {{ composerMode === 'create' ? t('team.composerCreateHint') : t('team.composerJoinHint') }}
            </div>
          </div>
          <div class="team-composer__form">
            <template v-if="composerMode === 'create'">
              <DwInput
                  v-model="createName"
                  :placeholder="t('team.createPlaceholder')"
                  aria-label="team name"
                  @keydown.enter="submitCreate"
              />
              <DwButton variant="primary" size="sm" @click="submitCreate">
                {{ t('team.createAction') }}
              </DwButton>
            </template>
            <template v-else>
              <DwInput
                  v-model="joinCode"
                  :placeholder="t('team.joinPlaceholder')"
                  aria-label="invite code"
                  @keydown.enter="submitJoin"
              />
              <DwButton variant="primary" size="sm" @click="submitJoin">
                {{ t('team.joinAction') }}
              </DwButton>
            </template>
            <DwButton variant="ghost" size="sm" @click="closeComposer">
              {{ t('team.cancel') }}
            </DwButton>
          </div>
          <DwInlineAlert :message="composerMode === 'create' ? createError : joinError"/>
          <ul v-if="composerMode === 'join' && myJoinRequests.length" class="join-request-list">
            <li v-for="request in myJoinRequests" :key="`${request.teamId}-${request.requestedAt}`">
              {{ t('team.myJoinRequestPending', {name: request.teamName, time: formatDate(request.requestedAt)}) }}
            </li>
          </ul>
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
            <header class="mp-panel__head team-sidebar__head">
              <span class="team-sidebar__heading">
                {{ t('team.myTeams') }}
                <span class="mp-panel__count">{{ teamStore.teams.length }}</span>
              </span>
              <button
                  type="button"
                  class="team-icon-btn"
                  :title="t('team.createAction')"
                  :aria-label="t('team.createAction')"
                  @click="openComposer('create')"
              >
                <DwIcon name="plus" size="sm"/>
              </button>
            </header>
            <div class="mp-panel__body mp-panel__body--scroll team-sidebar__body">
              <div v-if="!teamStore.teams.length" class="team-sidebar__empty">
                <DwIcon name="users" size="lg" muted/>
                <p class="team-sidebar__empty-text">{{ t('team.emptyTeams') }}</p>
                <p class="team-sidebar__empty-hint">{{ t('team.noTeamsHint') }}</p>
                <DwButton variant="primary" size="sm" @click="openComposer('create')">
                  {{ t('team.createAction') }}
                </DwButton>
                <button type="button" class="team-sidebar__empty-link" @click="openComposer('join')">
                  {{ t('team.joinAction') }}
                </button>
              </div>
              <ul v-else class="mp-list team-list">
                <li
                    v-for="team in teamStore.teams"
                    :key="team.id"
                    class="mp-list__row team-list__row"
                    :class="{ 'is-active': teamStore.activeTeamId === team.id }"
                    @click="selectTeam(team.id)"
                >
                  <div class="mp-list__main">
                    <span class="mp-avatar">{{ team.name.charAt(0) }}</span>
                    <div class="team-list__copy">
                      <div class="mp-list__name">{{ team.name }}</div>
                      <div class="mp-list__meta">
                        {{ t('team.memberCount', {count: team.memberCount}) }}
                        ·
                        {{ roleLabel(team.role) }}
                      </div>
                    </div>
                  </div>
                  <DwIcon
                      v-if="teamStore.activeTeamId === team.id"
                      name="check"
                      size="sm"
                      class="team-list__check"
                  />
                </li>
              </ul>
            </div>
          </template>

          <template #end>
            <template v-if="activeTeam">
              <header class="team-detail__head">
                <div class="mp-panel__head team-detail__head-row">
                  <div class="team-detail__identity">
                    <span class="mp-avatar team-detail__avatar">{{ activeTeam.name.charAt(0) }}</span>
                    <h2 class="team-detail__title">{{ activeTeam.name }}</h2>
                    <span class="team-detail__meta">
                      <span class="team-detail__role">{{ roleLabel(activeTeam.role) }}</span>
                      <span class="team-detail__dot">·</span>
                      <span>{{ t('team.memberCount', {count: activeTeam.memberCount}) }}</span>
                    </span>
                  </div>
                  <div
                      v-if="activeInviteCode && canManage"
                      class="team-invite"
                      :title="t('team.inviteHint')"
                  >
                    <span class="team-invite__label">
                      <DwIcon name="key" size="xs"/>
                      {{ t('team.inviteCodeLabel') }}
                    </span>
                    <code class="team-invite__code">{{ activeInviteCode }}</code>
                    <button type="button" class="team-invite__copy" @click="copyInviteCode">
                      <DwIcon name="copy" size="xs"/>
                      {{ t('team.inviteCodeCopy') }}
                    </button>
                  </div>
                </div>

                <nav class="team-tabs" role="tablist">
                  <template v-for="(tab, index) in tabs" :key="tab.key">
                    <span
                        v-if="index === firstManageTabIndex"
                        class="team-tabs__divider"
                        aria-hidden="true"
                    />
                    <button
                        type="button"
                        class="team-tab"
                        :class="{ 'is-active': activeTab === tab.key }"
                        role="tab"
                        :aria-selected="activeTab === tab.key"
                        :data-testid="`team-tab-${tab.key}`"
                        @click="activeTab = tab.key"
                    >
                      {{ tab.label }}
                      <span v-if="tab.key === 'invites' && showInviteBadge" class="team-tab__badge">
                        {{ pendingInviteCount }}
                      </span>
                    </button>
                  </template>
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
                    :current-user-id="currentUserId"
                    :can-invite="canInvite"
                    @update-role="updateMemberRole"
                    @invite="copyInviteCode"
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
                    :invite-code="activeInviteCode"
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

/* Compact hero: the shared ModulePageHeader is a card by default; team page
   uses it as a single toolbar row so the content area is not pushed down. */
.team-page :deep(.mp-hero.mp-hero--compact) {
  margin-bottom: 0;
  border-color: var(--dw-panel-outline, var(--dw-panel-border));
  border-radius: var(--dw-panel-radius);
  background: color-mix(in srgb, var(--dw-bg-panel) 78%, var(--dw-bg));
  box-shadow: none;
}

.team-page :deep(.mp-hero.mp-hero--compact .mp-hero__inner) {
  padding: var(--dw-space-3) var(--dw-space-5);
}

.team-page :deep(.mp-hero.mp-hero--compact .mp-hero__title) {
  font-size: var(--dw-text-xl);
  letter-spacing: 0;
}

.team-page :deep(.mp-hero.mp-hero--compact .mp-hero__sub) {
  margin-top: 1px;
  font-size: var(--dw-text-xs);
}

.team-page__body {
  display: flex;
  flex-direction: column;
  gap: var(--mp-gap);
  height: 100%;
  min-height: 0;
}

.team-actions {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
}

.team-actions :deep(button) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

/* ---- On-demand create / join composer ---- */

.team-composer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-space-3) var(--dw-space-5);
  flex-shrink: 0;
  padding: var(--dw-space-3) var(--dw-space-5);
  border: 1px solid color-mix(in srgb, var(--dw-primary) 28%, var(--dw-panel-border));
  border-radius: var(--dw-panel-radius);
  background: color-mix(in srgb, var(--dw-primary) 5%, var(--dw-bg-panel));
}

.team-composer__intro {
  flex: 1 1 220px;
  min-width: 0;
}

.team-composer__title {
  font-size: var(--dw-text-md);
  font-weight: 600;
}

.team-composer__hint {
  margin-top: 2px;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  line-height: 1.5;
}

.team-composer__form {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
  flex: 2 1 320px;
  min-width: 0;
}

.team-composer__form :deep(input.dw-input) {
  flex: 1 1 auto;
  min-width: 120px;
  margin: 0;
  height: var(--mp-input-h);
}

.team-composer__form :deep(button) {
  flex: 0 0 auto;
  white-space: nowrap;
}

.team-composer :deep(.dw-inline-alert) {
  flex-basis: 100%;
}

.join-request-list {
  flex-basis: 100%;
  margin: 0;
  padding-left: 18px;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-secondary);
}

/* ---- Split layout ---- */

.team-main.dw-split-pane {
  flex: 1;
  gap: 0;
  min-height: 0;
}

/* Panels sit flush with the splitter (system default); each pane controls
   its own inner padding, so there is no double gutter around lists. */
.team-sidebar__body {
  padding: var(--dw-space-3);
}

.team-detail__body {
  padding: 0;
}

.team-sidebar__body .mp-list {
  border: 0;
  border-radius: 0;
  background: transparent;
}

.team-sidebar__body .mp-list__row {
  gap: var(--dw-gap);
  padding: var(--dw-space-3) var(--dw-space-4);
  border-radius: var(--dw-control-radius-sm);
}

.team-sidebar__body .mp-list__row + .mp-list__row {
  border-top: 0;
}

.team-sidebar__body .mp-list__main {
  gap: var(--dw-space-4);
}

.team-sidebar__body .mp-avatar {
  width: var(--dw-density-sm);
  height: var(--dw-density-sm);
  font-size: var(--dw-text-xs);
}

.team-sidebar__head {
  height: var(--mp-head-h);
}

.team-sidebar__heading {
  display: inline-flex;
  align-items: baseline;
  gap: var(--dw-space-3);
}

.team-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dw-density-sm);
  height: var(--dw-density-sm);
  padding: 0;
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-text-secondary);
  cursor: pointer;
}

.team-icon-btn:hover {
  border-color: var(--dw-primary-border);
  color: var(--dw-primary);
  background: var(--dw-primary-soft);
}

.team-sidebar__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--dw-space-2);
  margin: auto;
  padding: var(--dw-space-6) var(--dw-space-4);
  text-align: center;
}

.team-sidebar__empty-text {
  margin: 0;
  font-size: var(--dw-text-sm);
  font-weight: 500;
}

.team-sidebar__empty-hint {
  margin: 0 0 var(--dw-space-3);
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  line-height: 1.5;
}

.team-sidebar__empty-link {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  cursor: pointer;
}

.team-sidebar__empty-link:hover {
  text-decoration: underline;
}

.team-list {
  align-content: start;
}

.team-list__row {
  position: relative;
  cursor: pointer;
}

.team-list__row:hover {
  background: var(--dw-bg-muted);
}

.team-list__row.is-active {
  background: color-mix(in srgb, var(--dw-primary) 10%, var(--dw-bg-panel));
  box-shadow: inset 2px 0 0 var(--dw-primary);
}

.team-list__copy {
  min-width: 0;
}

.team-list__check {
  flex-shrink: 0;
  color: var(--dw-primary);
}

/* ---- Detail header: one system-standard panel head + one tab strip ---- */

.team-detail__head {
  flex-shrink: 0;
  border-bottom: 1px solid var(--dw-border-light);
  background: transparent;
}

.team-detail__head-row {
  height: var(--mp-head-h);
  gap: var(--dw-gap);
  padding: 0 var(--dw-space-5);
  font-size: var(--dw-text-sm);
  font-weight: 400;
}

.team-detail__identity {
  display: flex;
  align-items: center;
  gap: var(--dw-space-3);
  min-width: 0;
}

.team-detail__avatar {
  width: var(--dw-density-xs);
  height: var(--dw-density-xs);
  border-radius: 50%;
  font-size: var(--dw-text-2xs);
}

.team-detail__title {
  margin: 0;
  font-size: var(--dw-text-md);
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.team-detail__meta {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-2);
  flex-shrink: 0;
  font-size: var(--dw-text-xs);
  font-weight: 400;
  color: var(--dw-text-muted);
}

.team-detail__role {
  color: var(--dw-primary);
  font-weight: 500;
}

.team-detail__dot {
  opacity: 0.6;
}

/* Invite code is an inline chip in the head, not a stacked card. */
.team-invite {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-3);
  flex-shrink: 0;
  padding: 0 var(--dw-space-3);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-panel);
}

.team-invite__label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--dw-text-2xs);
  font-weight: 400;
  color: var(--dw-text-muted);
}

.team-invite__code {
  font-family: var(--dw-mono);
  font-size: var(--dw-text-sm);
  letter-spacing: 0.04em;
  color: var(--dw-text);
  user-select: all;
}

.team-invite__copy {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px var(--dw-space-2);
  border: 1px solid transparent;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  cursor: pointer;
}

.team-invite__copy:hover {
  border-color: var(--dw-primary-border);
  background: var(--dw-primary-soft);
}

.team-tabs {
  display: flex;
  align-items: stretch;
  gap: 0;
  padding: 0 var(--dw-space-4);
  overflow-x: auto;
  scrollbar-width: thin;
}

.team-tabs__divider {
  flex: 0 0 1px;
  width: 1px;
  margin: 6px var(--dw-space-3);
  background: var(--dw-border-light);
}

.team-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-2);
  flex: 0 0 auto;
  height: var(--mp-head-h);
  padding: 0 var(--dw-space-4);
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--dw-text-secondary);
  font-size: var(--dw-font-size-tab);
  white-space: nowrap;
  cursor: pointer;
}

.team-tab:hover {
  color: var(--dw-text);
  background: color-mix(in srgb, var(--dw-text) 4%, transparent);
}

.team-tab.is-active {
  border-bottom-color: var(--dw-primary);
  color: var(--dw-primary);
  font-weight: 500;
}

.team-tab__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--dw-radius-pill);
  background: var(--dw-danger);
  color: var(--dw-on-accent);
  font-size: var(--dw-text-2xs);
  font-weight: 600;
}

.team-detail__placeholder {
  flex: 1;
  min-height: 200px;
}

.audit-tab-stack {
  display: flex;
  flex-direction: column;
  gap: var(--mp-gap);
}

@media (max-width: 900px) {
  :deep(.team-sidebar) {
    max-height: 220px;
  }

  .team-detail__head-row {
    flex-wrap: wrap;
    height: auto;
    min-height: var(--mp-head-h);
    gap: var(--dw-space-2);
    padding: var(--dw-space-2) var(--dw-space-5);
  }
}
</style>

<style>
/*
 * Team tab panes share one compact baseline.
 * 系统内容区统一是「贴边 + 发丝线 + --mp-gap」(mp-panel / mp-list)；
 * 这里把历史子面板的「独立卡片 + 大间距」收敛到同一密度。
 * 所有规则以 .team-page 前缀限定，不会泄漏到其他模块。
 */
.team-page .team-detail__body > .tab-panel,
.team-page .team-detail__body > .audit-tab-stack {
  flex: 1 0 auto;
  min-height: 0;
  padding: var(--dw-space-4) var(--dw-space-5);
}

.team-page .team-detail__body > .tab-panel,
.team-page .team-detail__body > .audit-tab-stack,
.team-page .team-detail__body .sharing-panel,
.team-page .team-detail__body .audit-panel,
.team-page .team-detail__body .shared-queries-panel,
.team-page .team-detail__body .ai-sessions-panel,
.team-page .team-detail__body .production-approvals {
  gap: var(--mp-gap);
}

.team-page .team-detail__body > .audit-tab-stack > .tab-panel {
  padding: 0;
}

.team-page .team-detail__body .production-approvals {
  margin-bottom: var(--mp-gap);
  padding-bottom: var(--mp-gap);
}

/* 连续列表 + 发丝线，取代一张张独立卡片 */
.team-page .team-detail__body .detail-list {
  gap: 0;
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-panel);
  overflow: hidden;
}

.team-page .team-detail__body .detail-list__row {
  gap: var(--dw-space-4);
  min-height: var(--dw-density-md);
  padding: var(--dw-space-3) var(--dw-space-5);
  border: 0;
  border-radius: 0;
  background: transparent;
}

.team-page .team-detail__body .detail-list__row + .detail-list__row {
  border-top: 1px solid var(--dw-border-light);
}

.team-page .team-detail__body .detail-list__name {
  font-size: var(--dw-text-sm);
  font-weight: 500;
}

.team-page .team-detail__body .detail-list__meta {
  margin-top: 1px;
  font-size: var(--dw-text-xs);
}

.team-page .team-detail__body .ai-sessions-list__row.is-active {
  background: color-mix(in srgb, var(--dw-primary) 10%, var(--dw-bg-panel));
  box-shadow: inset 2px 0 0 var(--dw-primary);
}

/* 工具行 / 设置分区：与 settings 的 setting-block 同族 */
.team-page .team-detail__body .audit-toolbar {
  gap: var(--dw-space-4);
  padding: var(--dw-space-4) var(--dw-space-5);
}

.team-page .team-detail__body .sharing-block {
  padding: var(--dw-space-4) var(--dw-space-5);
  border: 1px solid var(--dw-panel-outline, var(--dw-panel-border));
  border-radius: var(--dw-panel-radius);
  background: color-mix(in srgb, var(--dw-bg-panel) 78%, var(--dw-bg));
}

.team-page .team-detail__body .sharing-block__title {
  margin-bottom: var(--dw-space-1);
  font-size: var(--dw-text-md);
}

.team-page .team-detail__body .sharing-block__desc {
  margin-bottom: var(--dw-space-4);
  font-size: var(--dw-text-xs);
}

.team-page .team-detail__body .sharing-block__hint {
  margin-top: var(--dw-space-3);
  font-size: var(--dw-text-xs);
}

.team-page .team-detail__body .shared-input {
  min-height: 64px;
  margin-bottom: var(--dw-space-4);
}

.team-page .team-detail__body .share-toggle {
  margin-bottom: var(--dw-space-4);
}

.team-page .team-detail__body .invite-row {
  gap: var(--dw-gap);
}

.team-page .team-detail__body .invite-code {
  padding: var(--dw-space-2) var(--dw-space-4);
  font-size: var(--dw-text-md);
}

.team-page .team-detail__body .shared-access-list,
.team-page .team-detail__body .on-call-list {
  gap: 0;
  margin-bottom: var(--dw-space-4);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  overflow: hidden;
}

.team-page .team-detail__body .shared-access-row,
.team-page .team-detail__body .on-call-row {
  gap: var(--dw-space-4);
  padding: var(--dw-space-2) var(--dw-space-4);
  border: 0;
  border-radius: 0;
  background: transparent;
  font-size: var(--dw-text-sm);
}

.team-page .team-detail__body .shared-access-row + .shared-access-row,
.team-page .team-detail__body .on-call-row + .on-call-row {
  border-top: 1px solid var(--dw-border-light);
}

.team-page .team-detail__body .shared-access-list__hint {
  padding: var(--dw-space-2) var(--dw-space-4);
  border-bottom: 1px solid var(--dw-border-light);
  background: var(--dw-bg-muted);
  font-size: var(--dw-text-xs);
}

/* 卡片 / 双栏：只收紧间距，结构保持各自语义 */
.team-page .team-detail__body .shared-query-cards {
  gap: var(--mp-gap);
}

.team-page .team-detail__body .shared-query-card__main {
  padding: var(--dw-space-4) var(--dw-space-5);
}

.team-page .team-detail__body .shared-query-card__actions {
  padding: 0 var(--dw-space-5) var(--dw-space-5);
}

.team-page .team-detail__body .ai-sessions-layout {
  gap: var(--mp-gap);
  min-height: 280px;
}

/* The session list keeps its own scroll; the shared baseline uses hidden. */
.team-page .team-detail__body .ai-sessions-list {
  overflow: auto;
}

.team-page .team-detail__body .ai-sessions-detail {
  padding: var(--dw-space-4);
}
</style>
