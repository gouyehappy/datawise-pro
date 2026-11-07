<script setup lang="ts">
import {computed, toRef} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwButton} from '@/core/components'
import {DwIcon} from '@/core/icons'
import {useModalFeedback} from '@/core/composables/useModalFeedback'

const props = defineProps<{
  open: boolean
  title: string
  subtitle?: string
  sql: string
  summaryBits?: string[]
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'open-console': []
}>()

const {t} = useI18n()
const {feedback, showSuccess, showError, clearFeedback} = useModalFeedback(toRef(props, 'open'))

const canApply = computed(() => Boolean(props.sql.trim()))

function close() {
  emit('update:open', false)
}

async function copySql() {
  const sql = props.sql.trim()
  if (!sql) return
  try {
    await navigator.clipboard.writeText(sql)
    showSuccess(t('workspace.tableDetail.alterColumn.copied'))
  } catch {
    showError(t('workspace.tableDetail.alterColumn.copyFailed'))
  }
}

function openInConsole() {
  if (!canApply.value) return
  emit('open-console')
  close()
}
</script>

<template>
  <AppModal
      :open="open"
      :title="title"
      :subtitle="subtitle || t('workspace.schemaEr.batchAlterDialogSubtitle')"
      width="720px"
      @close="close"
  >
    <div class="er-batch-alter-dialog">
      <ul v-if="summaryBits?.length" class="er-batch-alter-dialog__summary">
        <li v-for="(bit, index) in summaryBits" :key="index">
          <DwIcon name="check" size="xs" :stroke-width="1.6"/>
          <span>{{ bit }}</span>
        </li>
      </ul>
      <div class="modal-preview-section">
        <header class="modal-preview-section__head">
          <span>{{ t('workspace.schemaEr.batchAlterPreview') }}</span>
        </header>
        <pre class="modal-code-block modal-code-block--preview er-batch-alter-dialog__sql">{{ sql }}</pre>
      </div>
      <p class="er-batch-alter-dialog__hint">{{ t('workspace.schemaEr.batchAlterDialogHint') }}</p>
      <p v-if="feedback" class="er-batch-alter-dialog__feedback" :class="`is-${feedback.variant}`">
        {{ feedback.message }}
      </p>
    </div>

    <template #footer>
      <div class="modal-footer-row">
        <div class="modal-footer-row__end">
          <DwButton variant="ghost" type="button" @click="close">
            {{ t('common.cancel') }}
          </DwButton>
          <DwButton variant="ghost" type="button" :disabled="!canApply" @click="copySql">
            {{ t('workspace.tableDetail.alterColumn.copy') }}
          </DwButton>
          <DwButton
              variant="primary"
              type="button"
              :disabled="!canApply"
              @click="openInConsole"
          >
            {{ t('workspace.schemaEr.fkOpenConsole') }}
          </DwButton>
        </div>
      </div>
    </template>
  </AppModal>
</template>

<style scoped>
.er-batch-alter-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-5);
}

.er-batch-alter-dialog__summary {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
}

.er-batch-alter-dialog__summary li {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  font-size: var(--dw-text-sm);
  color: var(--dw-text-secondary);
}

.er-batch-alter-dialog__sql {
  margin: 0;
  min-height: 140px;
  max-height: 320px;
  overflow: auto;
}

.er-batch-alter-dialog__hint {
  margin: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  line-height: var(--dw-leading);
}

.er-batch-alter-dialog__feedback {
  margin: 0;
  font-size: var(--dw-text-xs);
  font-weight: 600;
}

.er-batch-alter-dialog__feedback.is-success {
  color: var(--dw-success);
}

.er-batch-alter-dialog__feedback.is-error {
  color: var(--dw-danger);
}
</style>
