<script setup lang="ts">
import {computed, defineAsyncComponent, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwButton, DwCheckbox, DwInlineAlert, ModalActions} from '@/core/components'
import type {ProductionApprovalTeamOption} from '@/features/team/services/production-approval-policy.service'
import type {RestoreWizardContext, RestoreWizardFileState} from '@/features/explorer/services/restore-wizard.service'
import {
    restoreNeedsDdlPermission,
    restoreNeedsWritePermission,
} from '@/features/explorer/services/restore-preflight.service'

const SubmitProductionApprovalDialog = defineAsyncComponent(
    () => import('@/features/workspace/components/SubmitProductionApprovalDialog.vue'),
)

const props = defineProps<{
    open: boolean
    context: RestoreWizardContext | null
    fileState: RestoreWizardFileState | null
    loadingFile?: boolean
    executing?: boolean
    canWrite?: boolean
    canDdl?: boolean
    productionApprovalTeams?: ProductionApprovalTeamOption[]
    productionApprovalError?: string
    productionApprovalSubmitting?: boolean
    actionError?: string
}>()

const emit = defineEmits<{
    'update:open': [value: boolean]
    pickFile: []
    execute: []
    submitApproval: [teamId: string]
}>()

const {t} = useI18n()

const confirmArmed = ref(false)
const productionAck = ref(false)
const approvalDialogOpen = ref(false)

const connectionLabel = computed(
    () => props.context?.connectionLabel ?? props.context?.connectionId ?? '—',
)

const needsApproval = computed(() => (props.productionApprovalTeams?.length ?? 0) > 0)

const permissionDenied = computed(() => {
    const summary = props.fileState?.preflight
    if (!summary || !props.context) return null
    if (restoreNeedsDdlPermission(summary) && !props.canDdl) {
        return t('explorer.restoreWizard.ddlDenied')
    }
    if (restoreNeedsWritePermission(summary) && !props.canWrite) {
        return t('explorer.restoreWizard.writeDenied')
    }
    return null
})

const riskAlertVariant = computed(() => {
    const level = props.fileState?.preflight.riskLevel
    if (level === 'high') return 'error' as const
    if (level === 'medium') return 'warning' as const
    return 'info' as const
})

const confirmLabel = computed(() => {
    if (props.executing) return t('explorer.restoreWizard.executing')
    if (!props.fileState) return t('explorer.restoreWizard.pickFile')
    if (props.context?.isProduction && !confirmArmed.value) {
        return t('explorer.restoreWizard.confirmArm')
    }
    if (needsApproval.value) return t('console.productionApproval.submitForApproval')
    return t('explorer.restoreWizard.execute')
})

const canConfirm = computed(() => {
    if (props.loadingFile || props.executing) return false
    if (!props.fileState) return true
    if (permissionDenied.value) return false
    if (props.context?.isProduction && !productionAck.value) return false
    if (props.context?.isProduction && !confirmArmed.value) return true
    return true
})

watch(
    () => props.open,
    (open) => {
        if (!open) return
        confirmArmed.value = false
        productionAck.value = false
        approvalDialogOpen.value = false
    },
)

watch(
    () => props.fileState?.fileName,
    () => {
        confirmArmed.value = false
        productionAck.value = false
    },
)

function close() {
    emit('update:open', false)
}

function onConfirm() {
    if (!props.fileState) {
        emit('pickFile')
        return
    }
    if (permissionDenied.value) return
    if (props.context?.isProduction && !productionAck.value) return
    if (props.context?.isProduction && !confirmArmed.value) {
        confirmArmed.value = true
        return
    }
    if (needsApproval.value) {
        approvalDialogOpen.value = true
        return
    }
    emit('execute')
}

function onApprovalSubmit(teamId: string) {
    emit('submitApproval', teamId)
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('explorer.restoreWizard.title')"
      :subtitle="t('explorer.restoreWizard.subtitle')"
      width="560px"
      @close="close"
  >
    <div class="modal-form modal-form--compact">
      <section class="modal-summary-box">
        <div class="modal-summary-row">
          <span class="modal-summary-row__label">{{ t('explorer.restoreWizard.connection') }}</span>
          <span class="modal-summary-row__value">{{ connectionLabel }}</span>
        </div>
        <div class="modal-summary-row">
          <span class="modal-summary-row__label">{{ t('explorer.restoreWizard.database') }}</span>
          <span class="modal-summary-row__value">{{ context?.database ?? '—' }}</span>
        </div>
      </section>

      <DwInlineAlert
          v-if="context?.isProduction"
          :message="t('explorer.restoreWizard.productionHint')"
          variant="warning"
          density="banner"
      />

      <template v-if="fileState">
        <section class="modal-summary-box">
          <div class="modal-summary-row">
            <span class="modal-summary-row__label">{{ t('explorer.restoreWizard.file') }}</span>
            <span class="modal-summary-row__value">{{ fileState.fileName }}</span>
          </div>
          <div class="modal-summary-row">
            <span class="modal-summary-row__label">{{ t('explorer.restoreWizard.statements') }}</span>
            <span class="modal-summary-row__value">{{ fileState.preflight.statementCount }}</span>
          </div>
          <div class="modal-summary-row">
            <span class="modal-summary-row__label">{{ t('explorer.restoreWizard.writes') }}</span>
            <span class="modal-summary-row__value">{{ fileState.preflight.writeCount }}</span>
          </div>
          <div class="modal-summary-row">
            <span class="modal-summary-row__label">{{ t('explorer.restoreWizard.ddl') }}</span>
            <span class="modal-summary-row__value">{{ fileState.preflight.ddlCount }}</span>
          </div>
          <div class="modal-summary-row">
            <span class="modal-summary-row__label">{{ t('explorer.restoreWizard.drops') }}</span>
            <span class="modal-summary-row__value">{{ fileState.preflight.dropCount }}</span>
          </div>
        </section>

        <DwInlineAlert
            :message="t(`explorer.restoreWizard.risk.${fileState.preflight.riskLevel}`)"
            :variant="riskAlertVariant"
            density="banner"
        />

        <ul class="restore-wizard-hints">
          <li v-for="key in fileState.preflight.hintKeys" :key="key">
            {{ t(`explorer.restoreWizard.hints.${key}`) }}
          </li>
        </ul>

        <DwInlineAlert v-if="permissionDenied" :message="permissionDenied" density="banner"/>

        <DwCheckbox
            v-if="context?.isProduction"
            v-model="productionAck"
            class="modal-checkbox-option"
        >
          {{ t('explorer.restoreWizard.productionAck') }}
        </DwCheckbox>

        <DwInlineAlert
            v-if="confirmArmed && context?.isProduction"
            :message="needsApproval
              ? t('explorer.restoreWizard.approvalArmedHint')
              : t('explorer.restoreWizard.confirmArmedHint')"
            variant="warning"
            density="banner"
        />

        <DwButton variant="ghost" :disabled="loadingFile || executing" @click="emit('pickFile')">
          {{ t('explorer.restoreWizard.changeFile') }}
        </DwButton>
      </template>

      <p v-else class="modal-hint">{{ t('explorer.restoreWizard.pickFileHint') }}</p>

      <DwInlineAlert
          v-if="actionError"
          :message="actionError"
          density="banner"
      />
    </div>

    <template #footer>
      <ModalActions
          :confirm-label="confirmLabel"
          :confirm-disabled="!canConfirm"
          @cancel="close"
          @confirm="onConfirm"
      />
    </template>
  </AppModal>

  <SubmitProductionApprovalDialog
      v-if="fileState && context"
      v-model:open="approvalDialogOpen"
      :saving="productionApprovalSubmitting"
      :error="productionApprovalError"
      :sql="fileState.sql"
      :connection-name="context.connectionLabel"
      :database="context.database"
      :teams="productionApprovalTeams ?? []"
      @submit="onApprovalSubmit"
  />
</template>

<style scoped>
.restore-wizard-hints {
  margin: 0;
  padding-left: var(--dw-space-6);
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
  line-height: var(--dw-leading-snug);
}

.modal-checkbox-option {
  display: flex;
  align-items: flex-start;
  gap: var(--dw-space-3);
  font-size: var(--dw-text-sm);
  color: var(--dw-text);
  cursor: pointer;
}
</style>
