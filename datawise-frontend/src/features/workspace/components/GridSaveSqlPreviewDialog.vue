<script setup lang="ts">
/**
 * T-GRID-1：表数据保存前的 SQL 预览确认。
 */
import {computed, toRef} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwButton, DwInlineAlert} from '@/core/components'
import type {TableColumn} from '@/core/types'
import type {GridPendingBatch} from '@/core/composables/useGridPendingEdit'
import {
  buildGridPendingSqlPreview,
  summarizeGridPendingBatch,
} from '@/features/workspace/services/grid-pending-sql-preview.service'
import {useModalFeedback} from '@/core/composables/useModalFeedback'

const props = defineProps<{
  open: boolean
  batch: GridPendingBatch | null
  tableName: string
  columns: TableColumn[]
  pkColumns: string[]
  confirming?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
  cancel: []
}>()

const {t} = useI18n()
const {feedback, clearFeedback} = useModalFeedback(toRef(props, 'open'))

const summary = computed(() =>
  props.batch
    ? summarizeGridPendingBatch(props.batch)
    : {deleteCount: 0, updateCount: 0, insertCount: 0, total: 0},
)

const preview = computed(() => {
  if (!props.batch) {
    return {sql: '', statementCount: 0}
  }
  return buildGridPendingSqlPreview({
    batch: props.batch,
    tableName: props.tableName,
    columns: props.columns,
    pkColumns: props.pkColumns,
  })
})

const canConfirm = computed(
  () => Boolean(props.batch && summary.value.total > 0 && !props.confirming),
)

function close() {
  emit('update:open', false)
  emit('cancel')
  clearFeedback()
}

function onConfirm() {
  if (!canConfirm.value) return
  emit('confirm')
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('dataGrid.savePreview.title')"
      :subtitle="t('dataGrid.savePreview.subtitle', {
        deletes: summary.deleteCount,
        updates: summary.updateCount,
        inserts: summary.insertCount,
      })"
      width="720px"
      @close="close"
  >
    <div class="modal-form">
      <p class="modal-body-hint">{{ t('dataGrid.savePreview.hint') }}</p>
      <p class="modal-body-hint modal-body-hint--muted">
        {{ t('dataGrid.savePreview.approximateHint') }}
      </p>

      <section class="modal-preview-section">
        <header class="modal-preview-section__head">
          <span>{{ t('dataGrid.savePreview.preview') }}</span>
          <span class="modal-preview-section__meta">
            {{ t('dataGrid.savePreview.statementCount', {count: preview.statementCount}) }}
          </span>
        </header>
        <pre class="modal-code-block modal-code-block--preview">{{ preview.sql }}</pre>
      </section>

      <DwInlineAlert
          v-if="feedback"
          density="banner"
          :variant="feedback.variant"
          :message="feedback.message"
      />
    </div>

    <template #footer>
      <DwButton variant="ghost" type="button" :disabled="confirming" @click="close">
        {{ t('common.cancel') }}
      </DwButton>
      <DwButton
          variant="primary"
          type="button"
          :disabled="!canConfirm"
          :loading="confirming"
          @click="onConfirm"
      >
        {{ confirming ? t('dataGrid.savePreview.executing') : t('dataGrid.savePreview.confirm') }}
      </DwButton>
    </template>
  </AppModal>
</template>
