<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import type {TeamSharedQueryDetail, TeamSharedQuerySummary} from '@/core/types'
import {AppDrawer, ConfirmDialog, DwButton, DwInput, EmptyState, ModalActions} from '@/core/components'
import StatusPill from '@/core/components/ui/StatusPill.vue'
import ToolWindowShell from '@/features/layout/components/ToolWindowShell.vue'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useTeamStore} from '@/features/team/stores/team-store'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {
    canDeleteTeamSharedQueryComment,
    mergeSharedQuerySummary,
    openTeamSharedQueryInConsole,
} from '@/features/team/services/team-shared-query.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const props = defineProps<{
    open: boolean
    teamId: string
    summary: TeamSharedQuerySummary | null
    canManage: boolean
    currentUserId?: number
}>()

const emit = defineEmits<{
    'update:open': [value: boolean]
    summaryUpdated: [summary: TeamSharedQuerySummary]
}>()

const {t} = useI18n()
const layout = useLayoutStore()
const teamStore = useTeamStore()
const workspace = useWorkspaceStore()

const loading = ref(false)
const detail = ref<TeamSharedQueryDetail | null>(null)
const commentDraft = ref('')
const commentSaving = ref(false)
const favoriteSaving = ref(false)
const openingConsole = ref(false)
const deleteCommentConfirmOpen = ref(false)
const pendingCommentId = ref<string | null>(null)

const subtitle = computed(() => {
    if (!detail.value) return ''
    const parts = [
        detail.value.connectionName || t('team.sharedQueries.noConnection'),
        detail.value.database,
    ].filter(Boolean)
    return parts.join(' · ')
})

function closeDrawer() {
    emit('update:open', false)
}

async function loadDetail() {
    const summary = props.summary
    if (!summary || !props.teamId) {
        detail.value = null
        return
    }
    loading.value = true
    commentDraft.value = ''
    try {
        detail.value = await teamStore.getSharedQuery(props.teamId, summary.id)
    } catch {
        detail.value = null
        layout.showErrorToast(t('team.sharedQueries.loadFailed'))
        closeDrawer()
    } finally {
        loading.value = false
    }
}

async function toggleFavorite() {
    const summary = props.summary
    if (!summary || favoriteSaving.value) return
    favoriteSaving.value = true
    try {
        const updated = await teamStore.toggleSharedQueryFavorite(props.teamId, summary.id)
        emit('summaryUpdated', updated)
        if (detail.value) {
            detail.value = {
                ...detail.value,
                starredByCurrentUser: updated.starredByCurrentUser,
                favoriteCount: updated.favoriteCount,
            }
        }
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.sharedQueries.favoriteFailed')
        layout.showErrorToast(message)
    } finally {
        favoriteSaving.value = false
    }
}

async function openInConsole() {
    const summary = props.summary
    if (!summary || !detail.value || openingConsole.value) return
    openingConsole.value = true
    try {
        await openTeamSharedQueryInConsole(props.teamId, summary, {
            getDetail: async () => detail.value!,
            openConsole: (options) => workspace.openConsole(options),
            setModule: (module) => layout.setModule(module),
        })
        closeDrawer()
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.sharedQueries.openFailed')
        layout.showErrorToast(message)
    } finally {
        openingConsole.value = false
    }
}

async function submitComment() {
    const summary = props.summary
    const content = commentDraft.value.trim()
    if (!summary || !content || commentSaving.value) return
    commentSaving.value = true
    try {
        const created = await teamStore.addSharedQueryComment(props.teamId, summary.id, content)
        if (detail.value) {
            detail.value = {
                ...detail.value,
                comments: [...detail.value.comments, created],
                commentCount: detail.value.commentCount + 1,
            }
        }
        emit('summaryUpdated', mergeSharedQuerySummary(summary, {
            commentCount: summary.commentCount + 1,
        }))
        commentDraft.value = ''
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.sharedQueries.commentFailed')
        layout.showErrorToast(message)
    } finally {
        commentSaving.value = false
    }
}

async function removeComment(commentId: string) {
    pendingCommentId.value = commentId
    deleteCommentConfirmOpen.value = true
}

async function confirmRemoveComment() {
    const summary = props.summary
    const commentId = pendingCommentId.value
    if (!summary || !commentId || !detail.value) return
    try {
        await teamStore.deleteSharedQueryComment(props.teamId, summary.id, commentId)
        detail.value = {
            ...detail.value,
            comments: detail.value.comments.filter((item) => item.id !== commentId),
            commentCount: Math.max(0, detail.value.commentCount - 1),
        }
        emit('summaryUpdated', mergeSharedQuerySummary(summary, {
            commentCount: Math.max(0, summary.commentCount - 1),
        }))
        deleteCommentConfirmOpen.value = false
        pendingCommentId.value = null
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.sharedQueries.commentDeleteFailed')
        layout.showErrorToast(message)
    }
}

function canDeleteComment(comment: TeamSharedQueryDetail['comments'][number]) {
    if (!detail.value) return false
    return canDeleteTeamSharedQueryComment({
        comment,
        queryOwnerUserId: detail.value.sharedByUserId,
        currentUserId: props.currentUserId,
        canManage: props.canManage,
    })
}

function formatDate(value: string) {
    if (!value) return '—'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

watch(
    () => [props.open, props.summary?.id] as const,
    ([isOpen]) => {
        if (isOpen) void loadDetail()
    },
    {immediate: true},
)
</script>

<template>
  <AppDrawer
      :open="open && !!summary"
      :ariaLabel="summary?.title ?? t('team.sharedQueries.detailTitle')"
      width="min(520px, 100vw)"
      @close="closeDrawer"
  >
    <ToolWindowShell
        v-if="summary"
        :title="summary.title"
        :subtitle="subtitle"
        @collapse="closeDrawer"
    >
      <div class="modal-drawer-body">
        <div class="modal-drawer-actions">
          <DwButton
              variant="secondary"
              size="sm"
              :disabled="favoriteSaving"
              @click="toggleFavorite"
          >
            {{
              detail?.starredByCurrentUser
                  ? t('team.sharedQueries.unfavoriteAction')
                  : t('team.sharedQueries.favoriteAction')
            }}
            <span v-if="detail?.favoriteCount">({{ detail.favoriteCount }})</span>
          </DwButton>
          <DwButton
              variant="primary"
              size="sm"
              :disabled="loading || openingConsole"
              @click="openInConsole"
          >
            {{ t('team.sharedQueries.openInConsole') }}
          </DwButton>
        </div>

        <p v-if="detail?.description" class="modal-message">{{ detail.description }}</p>

        <div v-if="detail?.tags?.length" class="modal-tag-row">
          <StatusPill v-for="tag in detail.tags" :key="tag" variant="neutral" inline>{{ tag }}</StatusPill>
        </div>

        <p v-if="detail" class="modal-meta-row">
          {{ detail.sharedByUserName }} · {{ formatDate(detail.updatedAt || detail.sharedAt) }}
        </p>

        <section>
          <h4 class="modal-section-title">{{ t('team.sharedQueries.sqlPreview') }}</h4>
          <pre v-if="detail" class="modal-code-block modal-code-block--compact">{{ detail.sql }}</pre>
          <p v-else-if="loading" class="modal-empty-state">{{ t('team.loading') }}</p>
        </section>

        <section>
          <h4 class="modal-section-title">
            {{ t('team.sharedQueries.commentsTitle', {count: detail?.commentCount ?? 0}) }}
          </h4>
          <EmptyState
              v-if="!loading && detail && !detail.comments.length"
              :title="t('team.sharedQueries.commentsEmpty')"
          />
          <ul v-else-if="detail" class="modal-comment-list">
            <li v-for="comment in detail.comments" :key="comment.id">
              <div class="modal-comment-head">
                <strong>{{ comment.userName }}</strong>
                <span>{{ formatDate(comment.createdAt) }}</span>
                <DwButton
                    v-if="canDeleteComment(comment)"
                    variant="secondary"
                    size="sm"
                    @click="removeComment(comment.id)"
                >
                  {{ t('team.sharedQueries.deleteCommentAction') }}
                </DwButton>
              </div>
              <p>{{ comment.content }}</p>
            </li>
          </ul>
          <DwInput
              v-model="commentDraft"
              class="modal-textarea"
              :rows="3"
              :placeholder="t('team.sharedQueries.commentPlaceholder')"
          />
          <ModalActions
              :confirm-label="t('team.sharedQueries.addCommentAction')"
              :confirm-disabled="!commentDraft.trim() || commentSaving"
              :confirm-loading="commentSaving"
              @confirm="submitComment"
              @cancel="commentDraft = ''"
          />
        </section>
      </div>
    </ToolWindowShell>
  </AppDrawer>

  <ConfirmDialog
      v-model:open="deleteCommentConfirmOpen"
      :title="t('team.sharedQueries.deleteCommentAction')"
      :message="t('team.sharedQueries.deleteCommentConfirm')"
      :confirm-label="t('team.sharedQueries.deleteCommentAction')"
      confirm-variant="danger"
      @confirm="confirmRemoveComment"
  />
</template>
