<script setup lang="ts">
import {computed, onUnmounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {defineAsyncComponent} from 'vue'
import type {WorkspaceTab} from '@/core/types'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useTeamStore} from '@/features/team/stores/team-store'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {subscribeTeamSharedQueryStream, type TeamSharedQueryViewer} from '@/features/team/services/team-shared-query-stream'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {DwButton} from '@/core/components'

const TeamSharedQueryConflictDialog = defineAsyncComponent(
    () => import('@/features/team/components/TeamSharedQueryConflictDialog.vue'),
)

const props = defineProps<{
    tab: WorkspaceTab
    connectionId: string
    databaseName: string
    sourceLabel: string
}>()

const sql = defineModel<string>('sql', {required: true})

const {t} = useI18n()
const layout = useLayoutStore()
const teamStore = useTeamStore()
const authStore = useAuthStore()

const collabPulling = ref(false)
const collabPushing = ref(false)
const collabRemoteChanged = ref(false)
const collabLastRemoteUpdatedAt = ref<string | null>(null)
const collabStreamLive = ref(false)
const collabViewers = ref<TeamSharedQueryViewer[]>([])
const collabBaseSql = ref('')
const collabRemoteSqlPreview = ref<string | null>(null)
const collabConflictDialogOpen = ref(false)
const collabConflictLoading = ref(false)
let collabPollTimer: number | null = null
let collabStreamStop: (() => void) | null = null
let collabStreamReconnectTimer: number | null = null

const teamSharedQueryMeta = computed(() => props.tab.teamSharedQuery ?? null)
const teamCollabConflictHint = computed(() => {
    if (collabRemoteChanged.value) {
        return t('team.sharedQueries.collabConflictHint')
    }
    if (collabStreamLive.value) {
        return t('team.sharedQueries.collabLiveHint')
    }
    return t('team.sharedQueries.collabSyncedHint')
})

function collabViewerInitial(name: string) {
    const trimmed = name.trim()
    return (trimmed.charAt(0) || '?').toUpperCase()
}

const collabViewerTooltip = computed(() => {
    if (!collabViewers.value.length) return ''
    const names = collabViewers.value.map((viewer) => viewer.userName).join(', ')
    return t('team.sharedQueries.collabViewers', {names})
})

async function pullTeamSharedQuery() {
    const meta = teamSharedQueryMeta.value
    if (!meta || collabPulling.value) return
    if (collabRemoteChanged.value) {
        await openCollabConflictReview()
        return
    }
    collabPulling.value = true
    try {
        const detail = await teamStore.getSharedQuery(meta.teamId, meta.queryId)
        sql.value = detail.sql ?? ''
        collabLastRemoteUpdatedAt.value = detail.updatedAt || null
        collabBaseSql.value = detail.sql ?? ''
        collabRemoteChanged.value = false
        collabRemoteSqlPreview.value = null
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.sharedQueries.collabPullFailed')
        layout.showErrorToast(message)
    } finally {
        collabPulling.value = false
    }
}

async function prefetchCollabRemoteSql() {
    const meta = teamSharedQueryMeta.value
    if (!meta) return
    collabConflictLoading.value = true
    try {
        const detail = await teamStore.getSharedQuery(meta.teamId, meta.queryId)
        collabRemoteSqlPreview.value = detail.sql ?? ''
        if (!collabBaseSql.value) {
            collabBaseSql.value = sql.value
        }
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.sharedQueries.collabPullFailed')
        layout.showErrorToast(message)
    } finally {
        collabConflictLoading.value = false
    }
}

async function openCollabConflictReview() {
    if (!collabRemoteSqlPreview.value) {
        await prefetchCollabRemoteSql()
    }
    if (!collabBaseSql.value) {
        collabBaseSql.value = sql.value
    }
    if (collabRemoteSqlPreview.value != null) {
        collabConflictDialogOpen.value = true
    }
}

async function acceptCollabRemote() {
    const meta = teamSharedQueryMeta.value
    if (!meta || collabPulling.value) return
    collabPulling.value = true
    try {
        const detail = await teamStore.getSharedQuery(meta.teamId, meta.queryId)
        sql.value = detail.sql ?? ''
        collabLastRemoteUpdatedAt.value = detail.updatedAt || null
        collabBaseSql.value = detail.sql ?? ''
        collabRemoteChanged.value = false
        collabRemoteSqlPreview.value = null
        collabConflictDialogOpen.value = false
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.sharedQueries.collabPullFailed')
        layout.showErrorToast(message)
    } finally {
        collabPulling.value = false
    }
}

function keepCollabLocal() {
    collabConflictDialogOpen.value = false
}

async function pushTeamSharedQuery() {
    const meta = teamSharedQueryMeta.value
    if (!meta || collabPushing.value) return
    collabPushing.value = true
    try {
        const detail = await teamStore.getSharedQuery(meta.teamId, meta.queryId)
        const updated = await teamStore.updateSharedQuery(meta.teamId, meta.queryId, {
            title: detail.title,
            description: detail.description ?? undefined,
            connectionId: props.connectionId || detail.connectionId || undefined,
            connectionName: props.sourceLabel || detail.connectionName || undefined,
            database: props.databaseName || detail.database || undefined,
            sql: sql.value,
            tags: detail.tags ?? [],
            expectedUpdatedAt: collabLastRemoteUpdatedAt.value || detail.updatedAt || undefined,
        })
        collabLastRemoteUpdatedAt.value = updated.updatedAt || null
        collabBaseSql.value = sql.value
        collabRemoteChanged.value = false
    } catch (error) {
        const rawMessage = error instanceof Error ? error.message : ''
        const conflict = /SHARED_QUERY_CONFLICT|pull latest|updated by others/i.test(rawMessage)
        if (conflict) {
            collabRemoteChanged.value = true
        } else {
            layout.showErrorToast(resolveCaughtApiErrorMessage(error, t, 'team.sharedQueries.collabPushFailed'))
        }
    } finally {
        collabPushing.value = false
    }
}

async function pollTeamSharedQuery() {
    const meta = teamSharedQueryMeta.value
    if (!meta || collabPulling.value || collabPushing.value) return
    try {
        const detail = await teamStore.getSharedQuery(meta.teamId, meta.queryId)
        applyRemoteSharedQueryState(detail.updatedAt, detail.sql ?? '')
    } catch {
        // polling is best-effort
    }
}

function applyRemoteSharedQueryState(updatedAt: string | null | undefined, remoteSql: string) {
    if (!collabLastRemoteUpdatedAt.value) {
        collabLastRemoteUpdatedAt.value = updatedAt || null
        return
    }
    const remoteUpdated = (updatedAt || '').trim()
    const localSeen = (collabLastRemoteUpdatedAt.value || '').trim()
    if (remoteUpdated && remoteUpdated !== localSeen && remoteSql !== sql.value) {
        collabRemoteChanged.value = true
        collabRemoteSqlPreview.value = remoteSql
        if (!collabBaseSql.value) {
            collabBaseSql.value = sql.value
        }
    }
}

function handleRemoteSharedQueryUpdated(
    updatedAt: string | null | undefined,
    updatedByUserId?: number | null,
) {
    if (updatedByUserId != null && updatedByUserId === authStore.user?.userId) {
        collabLastRemoteUpdatedAt.value = updatedAt || collabLastRemoteUpdatedAt.value
        return
    }
    const remoteUpdated = (updatedAt || '').trim()
    const localSeen = (collabLastRemoteUpdatedAt.value || '').trim()
    if (!remoteUpdated || remoteUpdated === localSeen) {
        return
    }
    collabRemoteChanged.value = true
    void prefetchCollabRemoteSql()
}

function stopCollabStreamReconnect() {
    if (collabStreamReconnectTimer != null) {
        window.clearTimeout(collabStreamReconnectTimer)
        collabStreamReconnectTimer = null
    }
}

function stopCollabStream() {
    stopCollabStreamReconnect()
    if (collabStreamStop != null) {
        collabStreamStop()
        collabStreamStop = null
    }
    collabStreamLive.value = false
    collabViewers.value = []
}

function scheduleCollabStreamReconnect() {
    if (collabStreamReconnectTimer != null) return
    collabStreamReconnectTimer = window.setTimeout(() => {
        collabStreamReconnectTimer = null
        startCollabStream()
    }, 5000)
}

function startCollabStream() {
    stopCollabStream()
    const meta = teamSharedQueryMeta.value
    if (!meta) return
    collabStreamStop = subscribeTeamSharedQueryStream(meta.teamId, meta.queryId, {
        onConnected: (event) => {
            collabStreamLive.value = true
            if (!collabLastRemoteUpdatedAt.value && event.updatedAt) {
                collabLastRemoteUpdatedAt.value = event.updatedAt
            }
        },
        onUpdated: (event) => {
            handleRemoteSharedQueryUpdated(event.updatedAt, event.updatedByUserId)
        },
        onPresence: (event) => {
            collabViewers.value = event.viewers ?? []
        },
        onDisconnected: () => {
            collabStreamLive.value = false
            scheduleCollabStreamReconnect()
        },
    })
}

function stopCollabPolling() {
    if (collabPollTimer != null) {
        window.clearInterval(collabPollTimer)
        collabPollTimer = null
    }
}

function startCollabPolling() {
    stopCollabPolling()
    collabPollTimer = window.setInterval(() => {
        void pollTeamSharedQuery()
    }, collabStreamLive.value ? 60000 : 15000)
}

watch(collabStreamLive, () => {
    startCollabPolling()
})

watch(teamSharedQueryMeta, (meta) => {
    if (!meta?.teamId || !meta?.queryId) {
        collabRemoteChanged.value = false
        collabLastRemoteUpdatedAt.value = null
        collabViewers.value = []
        collabBaseSql.value = ''
        collabRemoteSqlPreview.value = null
        collabConflictDialogOpen.value = false
        stopCollabPolling()
        stopCollabStream()
        return
    }
    void pollTeamSharedQuery()
    startCollabStream()
    startCollabPolling()
}, {immediate: true})

onUnmounted(() => {
    stopCollabPolling()
    stopCollabStream()
})
</script>

<template>
  <div class="team-collab-banner">
    <span class="team-collab-banner__text">
      {{ t('team.sharedQueries.collabBanner', { title: teamSharedQueryMeta?.title || tab.title }) }}
    </span>
    <div
        v-if="collabViewers.length"
        class="team-collab-banner__viewers"
        :title="collabViewerTooltip"
    >
      <span
          v-for="viewer in collabViewers"
          :key="viewer.userId"
          class="team-collab-banner__avatar"
          :class="{'is-self': viewer.userId === authStore.user?.userId}"
      >
        {{ collabViewerInitial(viewer.userName) }}
      </span>
    </div>
    <span class="team-collab-banner__hint" :class="{ 'is-warning': collabRemoteChanged }">
      {{ teamCollabConflictHint }}
    </span>
    <div class="team-collab-banner__actions">
      <DwButton
          v-if="collabRemoteChanged"
          type="button"
          variant="ghost"
          :disabled="collabPulling || collabPushing || collabConflictLoading"
          @click="openCollabConflictReview"
      >
        {{ collabConflictLoading ? t('common.loading') : t('team.sharedQueries.reviewChanges') }}
      </DwButton>
      <DwButton type="button" variant="ghost" :disabled="collabPulling || collabPushing" @click="pullTeamSharedQuery">
        {{ collabPulling ? t('common.loading') : t('team.sharedQueries.pullLatest') }}
      </DwButton>
      <DwButton type="button" variant="primary" :disabled="collabPulling || collabPushing" @click="pushTeamSharedQuery">
        {{ collabPushing ? t('common.saving') : t('team.sharedQueries.pushCurrent') }}
      </DwButton>
    </div>
  </div>

  <TeamSharedQueryConflictDialog
      v-model:open="collabConflictDialogOpen"
      :base-sql="collabBaseSql"
      :local-sql="sql"
      :remote-sql="collabRemoteSqlPreview ?? ''"
      :loading="collabConflictLoading"
      :applying="collabPulling"
      @accept-remote="acceptCollabRemote"
      @keep-local="keepCollabLocal"
  />
</template>

<style scoped>
.team-collab-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-space-4) var(--dw-space-6);
  padding: var(--dw-space-4) var(--dw-space-6);
  border-bottom: 1px solid var(--dw-border);
  background: color-mix(in srgb, var(--dw-accent) 6%, var(--dw-bg));
  font-size: var(--dw-text-sm);
}

.team-collab-banner__text {
  font-weight: 600;
}

.team-collab-banner__viewers {
  display: inline-flex;
  gap: var(--dw-gap-xs);
}

.team-collab-banner__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dw-control-h-xs);
  height: var(--dw-control-h-xs);
  border-radius: var(--dw-radius-pill);
  background: var(--dw-bg-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
}

.team-collab-banner__avatar.is-self {
  outline: 2px solid var(--dw-accent);
}

.team-collab-banner__hint {
  color: var(--dw-text-muted);
}

.team-collab-banner__hint.is-warning {
  color: var(--mp-tone-amber);
}

.team-collab-banner__actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-sm);
  margin-left: auto;
}
</style>
