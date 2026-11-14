<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import type {TeamProductionApprovalDetail, TeamProductionApprovalSummary} from '@/core/types'
import StatusPill from '@/core/components/ui/StatusPill.vue'
import {AppModal, DwButton, DwInlineAlert, DwSelect, DwInput, FormField, ModalActions} from '@/core/components'
import type {SelectOption} from '@/core/components/select.types'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useTeamStore} from '@/features/team/stores/team-store'
import {
    filterProductionApprovalsByStatus,
    productionApprovalStatusLabelKey,
} from '@/features/team/services/production-approval-policy.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const props = defineProps<{
    teamId: string
    canManage: boolean
}>()

const {t} = useI18n()
const layout = useLayoutStore()
const teamStore = useTeamStore()

const loading = ref(false)
const items = ref<TeamProductionApprovalSummary[]>([])
const statusFilter = ref<string>('pending')
const statusFilterOptions = computed<SelectOption[]>(() => [
  {value: 'pending', label: t('team.productionApprovals.statusPending')},
  {value: '', label: t('team.productionApprovals.statusAll')},
  {value: 'executed', label: t('team.productionApprovals.statusExecuted')},
  {value: 'failed', label: t('team.productionApprovals.statusFailed')},
  {value: 'rejected', label: t('team.productionApprovals.statusRejected')},
])
const detailOpen = ref(false)
const detailLoading = ref(false)
const detail = ref<TeamProductionApprovalDetail | null>(null)
const detailError = ref('')
const actionId = ref<string | null>(null)
const rejectOpen = ref(false)
const rejectComment = ref('')
const rejectError = ref('')

const filteredItems = computed(() => filterProductionApprovalsByStatus(items.value, statusFilter.value))

async function reload() {
    loading.value = true
    try {
        items.value = await teamStore.fetchProductionApprovals(props.teamId)
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.productionApprovals.loadFailed')
        layout.showErrorToast(message)
        items.value = []
    } finally {
        loading.value = false
    }
}

async function openDetail(summary: TeamProductionApprovalSummary) {
    detailOpen.value = true
    detailLoading.value = true
    detail.value = null
    detailError.value = ''
    try {
        detail.value = await teamStore.getProductionApproval(props.teamId, summary.id)
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.productionApprovals.detailFailed')
        detailError.value = message
    } finally {
        detailLoading.value = false
    }
}

function closeDetail() {
    detailOpen.value = false
    detail.value = null
    detailError.value = ''
}

async function approve(approvalId: string) {
    if (actionId.value) return
    actionId.value = approvalId
    detailError.value = ''
    try {
        const result = await teamStore.approveProductionApproval(props.teamId, approvalId)
        closeDetail()
        if (result.status === 'executed') {
            layout.notifyQuiet({
              category: 'workspace',
              titleKey: 'approvalDone',
              bodyKey: 'approvalDone',
              params: {detail: t('team.productionApprovals.approveSuccess')},
            })
        } else {
            layout.showErrorToast(
                t('team.productionApprovals.approveFailed', {error: result.executionError ?? ''}),
            )
        }
        await reload()
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.productionApprovals.approveError')
        detailError.value = message
    } finally {
        actionId.value = null
    }
}

function openReject(approvalId: string) {
    rejectComment.value = ''
    rejectError.value = ''
    rejectOpen.value = true
    actionId.value = approvalId
}

function closeReject() {
    rejectOpen.value = false
    rejectError.value = ''
    actionId.value = null
}

async function confirmReject() {
    const approvalId = actionId.value
    if (!approvalId) return
    rejectError.value = ''
    try {
        await teamStore.rejectProductionApproval(props.teamId, approvalId, rejectComment.value.trim() || undefined)
        closeReject()
        closeDetail()
        layout.notifyQuiet({
          category: 'workspace',
          titleKey: 'approvalDone',
          bodyKey: 'approvalDone',
          params: {detail: t('team.productionApprovals.rejectSuccess')},
        })
        await reload()
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.productionApprovals.rejectError')
        rejectError.value = message
    } finally {
        actionId.value = null
    }
}

watch(
    () => props.teamId,
    () => {
        void reload()
    },
    {immediate: true},
)
</script>

<template>
  <section class="production-approvals" data-testid="production-approvals">
    <header class="production-approvals__toolbar">
      <h3 class="production-approvals__title">{{ t('team.productionApprovals.title') }}</h3>
      <p class="production-approvals__desc">{{ t('team.productionApprovals.desc') }}</p>
      <label class="production-approvals__filter">
        <span>{{ t('team.productionApprovals.statusFilter') }}</span>
        <DwSelect
            v-model="statusFilter"
            :options="statusFilterOptions"
            :searchable="false"
        />
      </label>
    </header>

    <p v-if="loading" class="production-approvals__hint">{{ t('common.loading') }}</p>
    <p v-else-if="filteredItems.length === 0" class="production-approvals__hint">
      {{ t('team.productionApprovals.empty') }}
    </p>

    <ul v-else class="detail-list production-approvals__list">
      <li
          v-for="item in filteredItems"
          :key="item.id"
          class="detail-list__row production-approvals__row"
      >
        <button type="button" class="production-approvals__row-btn" @click="openDetail(item)">
          <div class="production-approvals__row-main">
            <strong>{{ item.connectionName || item.connectionId }}</strong>
            <span class="production-approvals__meta">
              {{ item.requestedByUserName }} · {{ item.requestedAt }}
            </span>
          </div>
          <StatusPill tone="warning">{{ t(productionApprovalStatusLabelKey(item.status)) }}</StatusPill>
        </button>
        <div v-if="canManage && item.status === 'pending'" class="production-approvals__row-actions">
          <DwButton
              size="sm"
              variant="primary"
              :disabled="actionId === item.id"
              data-testid="production-approval-approve"
              @click="approve(item.id)"
          >
            {{ t('team.productionApprovals.approveAction') }}
          </DwButton>
          <DwButton
              size="sm"
              :disabled="actionId === item.id"
              data-testid="production-approval-reject"
              @click="openReject(item.id)"
          >
            {{ t('team.productionApprovals.rejectAction') }}
          </DwButton>
        </div>
      </li>
    </ul>

    <AppModal
        :open="detailOpen"
        :title="t('team.productionApprovals.detailTitle')"
        width="640px"
        @close="closeDetail"
    >
      <p v-if="detailLoading" class="modal-empty-state">{{ t('common.loading') }}</p>
      <DwInlineAlert v-else-if="detailError" density="banner" :message="detailError"/>
      <div v-else-if="detail" class="modal-form">
        <p class="modal-meta-row">
          {{ detail.requestedByUserName }} · {{ detail.requestedAt }}
          <StatusPill tone="warning">{{ t(productionApprovalStatusLabelKey(detail.status)) }}</StatusPill>
        </p>
        <FormField :label="t('team.productionApprovals.connectionField')">
          <template #default="{ id }">
            <DwInput
                :id="id"
                type="text"
                readonly
                :model-value="[detail.connectionName, detail.database].filter(Boolean).join(' · ') || detail.connectionId"
            />
          </template>
        </FormField>
        <FormField :label="t('team.productionApprovals.sqlField')">
          <template #default="{ id }">
            <DwInput
                :id="id"
                class="modal-textarea"
                readonly
                :rows="10"
                :model-value="detail.sql"
                :spellcheck="false"
            />
          </template>
        </FormField>
        <p v-if="detail.reviewComment" class="modal-body-hint">
          {{ t('team.productionApprovals.reviewComment', {comment: detail.reviewComment}) }}
        </p>
        <DwInlineAlert :message="detail.executionError"/>
        <DwInlineAlert v-if="detailError" density="banner" :message="detailError"/>
      </div>

      <template v-if="detail && canManage && detail.status === 'pending'" #footer>
        <DwButton variant="ghost" type="button" @click="closeDetail">{{ t('common.close') }}</DwButton>
        <DwButton type="button" :disabled="actionId === detail.id" @click="openReject(detail.id)">
          {{ t('team.productionApprovals.rejectAction') }}
        </DwButton>
        <DwButton variant="primary" type="button" :disabled="actionId === detail.id" @click="approve(detail.id)">
          {{ t('team.productionApprovals.approveAction') }}
        </DwButton>
      </template>
    </AppModal>

    <AppModal
        :open="rejectOpen"
        :title="t('team.productionApprovals.rejectTitle')"
        width="480px"
        @close="closeReject"
    >
      <FormField :label="t('team.productionApprovals.rejectCommentField')">
        <template #default="{ id }">
          <DwInput
              :id="id"
              v-model="rejectComment"
              class="modal-textarea"
              :rows="4"
          />
        </template>
      </FormField>
      <DwInlineAlert v-if="rejectError" density="banner" :message="rejectError"/>

      <template #footer>
        <ModalActions
            :cancel-label="t('common.cancel')"
            :confirm-label="t('team.productionApprovals.rejectConfirm')"
            @cancel="closeReject"
            @confirm="confirmReject"
        />
      </template>
    </AppModal>
  </section>
</template>

<style scoped>
.production-approvals {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-6);
  margin-bottom: var(--dw-space-9);
  padding-bottom: var(--dw-space-9);
  border-bottom: 1px solid var(--dw-border-light);
}

.production-approvals__title {
  margin: 0;
  font-size: var(--dw-text-xl);
  font-weight: 600;
}

.production-approvals__desc {
  margin: var(--dw-space-2) 0 0;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
}

.production-approvals__toolbar {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
}

.production-approvals__filter {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
  font-size: var(--dw-text-sm);
}

.production-approvals__hint {
  margin: 0;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
}

.production-approvals__list {
  margin: 0;
}

.production-approvals__row {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
}

.production-approvals__row-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-space-6);
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.production-approvals__row-main {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-1);
}

.production-approvals__meta {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.production-approvals__row-actions {
  display: flex;
  gap: var(--dw-gap);
}
</style>
