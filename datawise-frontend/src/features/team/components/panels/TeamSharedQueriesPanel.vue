<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import type {ShareTeamSharedQueryPayload, TeamMember, TeamSharedQuerySummary} from '@/core/types'
import StatusPill from '@/core/components/ui/StatusPill.vue'
import {ConfirmDialog, DwButton, DwPanelState} from '@/core/components'
import ShareTeamQueryDialog from '@/features/team/components/ShareTeamQueryDialog.vue'
import TeamSharedQueryDetailDrawer from '@/features/team/components/TeamSharedQueryDetailDrawer.vue'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useTeamStore} from '@/features/team/stores/team-store'
import {
    collectTeamSharedQueryTags,
    filterTeamSharedQueries,
} from '@/features/team/services/team-shared-query.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const props = defineProps<{
    teamId: string
    teamName: string
    members: TeamMember[]
    canManage: boolean
    currentUserId?: number
}>()

const {t} = useI18n()
const layout = useLayoutStore()
const teamStore = useTeamStore()

const loading = ref(false)
const loadError = ref(false)
const queries = ref<TeamSharedQuerySummary[]>([])
const search = ref('')
const activeTag = ref<string | null>(null)
const starredOnly = ref(false)
const dialogOpen = ref(false)
const dialogSaving = ref(false)
const dialogError = ref('')
const editing = ref<TeamSharedQuerySummary | null>(null)
const editingSql = ref('')
const drawerOpen = ref(false)
const drawerSummary = ref<TeamSharedQuerySummary | null>(null)
const favoriteTogglingId = ref<string | null>(null)
const deleteConfirmOpen = ref(false)
const pendingDeleteSummary = ref<TeamSharedQuerySummary | null>(null)
const deleting = ref(false)

const tagOptions = computed(() => collectTeamSharedQueryTags(queries.value))

const filteredQueries = computed(() =>
    filterTeamSharedQueries(queries.value, search.value, activeTag.value, starredOnly.value),
)

const deleteConfirmMessage = computed(() => {
    const summary = pendingDeleteSummary.value
    return summary ? t('team.sharedQueries.deleteConfirm', {title: summary.title}) : ''
})

async function reloadQueries() {
    loading.value = true
    loadError.value = false
    try {
        queries.value = await teamStore.fetchSharedQueries(props.teamId)
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.sharedQueries.loadFailed')
        layout.showErrorToast(message)
        loadError.value = true
        queries.value = []
    } finally {
        loading.value = false
    }
}

function canModify(query: TeamSharedQuerySummary): boolean {
    if (props.canManage) return true
    if (props.currentUserId == null) return false
    return query.sharedByUserId === props.currentUserId
}

function openQueryDrawer(summary: TeamSharedQuerySummary) {
    drawerSummary.value = summary
    drawerOpen.value = true
}

function onDrawerSummaryUpdated(patch: TeamSharedQuerySummary) {
    queries.value = queries.value.map((item) => (item.id === patch.id ? patch : item))
    if (drawerSummary.value?.id === patch.id) {
        drawerSummary.value = patch
    }
}

async function toggleFavorite(summary: TeamSharedQuerySummary, event: Event) {
    event.stopPropagation()
    if (favoriteTogglingId.value) return
    favoriteTogglingId.value = summary.id
    try {
        const updated = await teamStore.toggleSharedQueryFavorite(props.teamId, summary.id)
        onDrawerSummaryUpdated(updated)
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.sharedQueries.favoriteFailed')
        layout.showErrorToast(message)
    } finally {
        favoriteTogglingId.value = null
    }
}

function openCreateDialog() {
    editing.value = null
    editingSql.value = ''
    dialogError.value = ''
    dialogOpen.value = true
}

async function openEditDialog(summary: TeamSharedQuerySummary) {
    try {
        const detail = await teamStore.getSharedQuery(props.teamId, summary.id)
        editing.value = summary
        editingSql.value = detail.sql
        dialogError.value = ''
        dialogOpen.value = true
    } catch {
        layout.showErrorToast(t('team.sharedQueries.loadFailed'))
    }
}

async function onSave(payload: ShareTeamSharedQueryPayload) {
    dialogSaving.value = true
    dialogError.value = ''
    try {
        if (editing.value) {
            await teamStore.updateSharedQuery(props.teamId, editing.value.id, payload)
        } else {
            await teamStore.shareQuery(props.teamId, payload)
        }
        dialogOpen.value = false
        editing.value = null
        await reloadQueries()
    } catch (error) {
        dialogError.value = resolveCaughtApiErrorMessage(error, t, 'team.sharedQueries.saveFailed')
    } finally {
        dialogSaving.value = false
    }
}

async function onDelete(summary: TeamSharedQuerySummary) {
    pendingDeleteSummary.value = summary
    deleteConfirmOpen.value = true
}

async function confirmDelete() {
    const summary = pendingDeleteSummary.value
    if (!summary) return
    deleting.value = true
    try {
        await teamStore.deleteSharedQuery(props.teamId, summary.id)
        deleteConfirmOpen.value = false
        pendingDeleteSummary.value = null
        await reloadQueries()
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.sharedQueries.deleteFailed')
        layout.showErrorToast(message)
    } finally {
        deleting.value = false
    }
}

function formatDate(value: string) {
    if (!value) return '—'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

watch(
    () => props.teamId,
    () => {
        if (!props.teamId) return
        search.value = ''
        activeTag.value = null
        starredOnly.value = false
        void reloadQueries()
    },
    {immediate: true},
)
</script>

<template>
  <div class="tab-panel shared-queries-panel">
    <header class="shared-queries-toolbar">
      <input
          v-model="search"
          class="shared-queries-search"
          type="search"
          :placeholder="t('team.sharedQueries.searchPlaceholder')"
      />
      <div v-if="tagOptions.length" class="shared-queries-tags">
        <button
            type="button"
            class="tag-chip"
            :class="{ 'is-active': !activeTag }"
            @click="activeTag = null"
        >
          {{ t('team.sharedQueries.allTags') }}
        </button>
        <button
            v-for="tag in tagOptions"
            :key="tag"
            type="button"
            class="tag-chip"
            :class="{ 'is-active': activeTag === tag }"
            @click="activeTag = tag"
        >
          {{ tag }}
        </button>
      </div>
      <button
          type="button"
          class="tag-chip"
          :class="{ 'is-active': starredOnly }"
          @click="starredOnly = !starredOnly"
      >
        {{ t('team.sharedQueries.starredOnly') }}
      </button>
      <DwButton variant="primary" size="sm" @click="openCreateDialog">
        {{ t('team.sharedQueries.addAction') }}
      </DwButton>
    </header>

    <DwPanelState
        v-if="loading"
        status="loading"
        :message="t('team.loading')"
    />
    <DwPanelState
        v-else-if="loadError"
        status="error"
        :message="t('team.sharedQueries.loadFailed')"
    />
    <DwPanelState
        v-else-if="!filteredQueries.length"
        status="empty"
        :message="t('team.sharedQueries.empty')"
    />

    <div v-else class="shared-query-cards">
      <article
          v-for="query in filteredQueries"
          :key="query.id"
          class="shared-query-card"
      >
        <button
            class="shared-query-card__main"
            type="button"
            @click="openQueryDrawer(query)"
        >
          <div class="shared-query-card__title-row">
            <h3>{{ query.title }}</h3>
            <button
                type="button"
                class="shared-query-card__star"
                :class="{ 'is-active': query.starredByCurrentUser }"
                :disabled="favoriteTogglingId === query.id"
                :title="query.starredByCurrentUser
                    ? t('team.sharedQueries.unfavoriteAction')
                    : t('team.sharedQueries.favoriteAction')"
                @click="toggleFavorite(query, $event)"
            >
              ★
            </button>
          </div>
          <p v-if="query.description" class="shared-query-card__desc">{{ query.description }}</p>
          <p class="shared-query-card__meta">
            {{ query.connectionName || t('team.sharedQueries.noConnection') }}
            <span v-if="query.database"> · {{ query.database }}</span>
          </p>
          <div v-if="query.tags?.length" class="shared-query-card__tags">
            <StatusPill v-for="tag in query.tags" :key="tag" variant="neutral" inline>{{ tag }}</StatusPill>
          </div>
          <p class="shared-query-card__foot">
            {{ query.sharedByUserName }} · {{ formatDate(query.updatedAt || query.sharedAt) }}
            <span v-if="query.commentCount"> · {{ t('team.sharedQueries.commentCount', {count: query.commentCount}) }}</span>
          </p>
        </button>
        <div v-if="canModify(query)" class="shared-query-card__actions">
          <DwButton variant="secondary" size="sm" @click="openEditDialog(query)">
            {{ t('team.sharedQueries.editAction') }}
          </DwButton>
          <DwButton variant="secondary" size="sm" @click="onDelete(query)">
            {{ t('team.sharedQueries.deleteAction') }}
          </DwButton>
        </div>
      </article>
    </div>

    <ShareTeamQueryDialog
        v-model:open="dialogOpen"
        :saving="dialogSaving"
        :error="dialogError"
        :editing="editing"
        :default-sql="editingSql"
        @save="onSave"
    />

    <TeamSharedQueryDetailDrawer
        v-model:open="drawerOpen"
        :team-id="teamId"
        :summary="drawerSummary"
        :can-manage="canManage"
        :current-user-id="currentUserId"
        @summary-updated="onDrawerSummaryUpdated"
    />

    <ConfirmDialog
        v-model:open="deleteConfirmOpen"
        :title="t('team.sharedQueries.deleteAction')"
        :message="deleteConfirmMessage"
        :confirm-label="t('team.sharedQueries.deleteAction')"
        :confirm-loading="deleting"
        confirm-variant="danger"
        @confirm="confirmDelete"
    />
  </div>
</template>

<style scoped>
.shared-queries-panel {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-6);
}

.shared-queries-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-gap-md);
}

.shared-queries-search {
  flex: 1;
  min-width: 180px;
  padding: var(--dw-pad-control);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg);
  color: var(--dw-text);
  font: inherit;
}

.shared-queries-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-sm);
}

.tag-chip {
  padding: var(--dw-space-2) var(--dw-space-5);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-radius-pill);
  background: var(--dw-bg-panel);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
  cursor: pointer;
}

.tag-chip.is-active {
  border-color: color-mix(in srgb, var(--dw-primary) 40%, var(--dw-border));
  color: var(--dw-text);
  background: color-mix(in srgb, var(--dw-primary) 8%, var(--dw-bg-panel));
}

.shared-query-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--dw-space-6);
}

.shared-query-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-panel);
  overflow: hidden;
}

.shared-query-card__main {
  flex: 1;
  padding: var(--dw-space-7);
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.shared-query-card__main:disabled {
  opacity: 0.7;
  cursor: wait;
}

.shared-query-card__title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--dw-gap);
}

.shared-query-card__title-row h3 {
  margin: 0 0 var(--dw-space-3);
  font-size: var(--dw-text-lg);
}

.shared-query-card__star {
  border: none;
  background: transparent;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xl);
  line-height: 1;
  cursor: pointer;
  padding: 0 var(--dw-space-1);
}

.shared-query-card__star.is-active {
  color: var(--dw-warning);
}

.shared-query-card__star:disabled {
  opacity: 0.6;
  cursor: wait;
}

.shared-query-card__main h3 {
  margin: 0 0 var(--dw-space-3);
  font-size: var(--dw-text-lg);
}

.shared-query-card__desc {
  margin: 0 0 var(--dw-space-4);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-md);
  line-height: var(--dw-leading);
}

.shared-query-card__meta {
  margin: 0 0 var(--dw-space-4);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
}

.shared-query-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-sm);
  margin-bottom: var(--dw-space-4);
}

.shared-query-card__foot {
  margin: 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.shared-query-card__actions {
  display: flex;
  gap: var(--dw-gap);
  padding: 0 var(--dw-space-7) var(--dw-space-7);
}
</style>
