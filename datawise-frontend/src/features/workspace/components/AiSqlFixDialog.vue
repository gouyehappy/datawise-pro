<script setup lang="ts">
import {AppModal, ModalActions} from '@/core/components'
import {useI18n} from 'vue-i18n'

defineProps<{
  open: boolean
  originalSql: string
  suggestedSql: string
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  apply: []
}>()

const {t} = useI18n()

function close() {
  emit('update:open', false)
}

function apply() {
  emit('apply')
  close()
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('queryResult.aiFixTitle')"
      :subtitle="t('queryResult.aiFixSubtitle')"
      width="960px"
      @close="close"
  >
    <div class="modal-code-split">
      <section class="modal-code-pane">
        <h3 class="modal-code-label">{{ t('queryResult.aiFixOriginal') }}</h3>
        <pre class="modal-code-block">{{ originalSql }}</pre>
      </section>
      <section class="modal-code-pane">
        <h3 class="modal-code-label">{{ t('queryResult.aiFixSuggested') }}</h3>
        <pre class="modal-code-block modal-code-block--accent">{{ suggestedSql }}</pre>
      </section>
    </div>
    <template #footer>
      <ModalActions
          :confirm-label="t('queryResult.aiFixApply')"
          :cancel-label="t('common.cancel')"
          :confirm-disabled="loading || !suggestedSql.trim()"
          @cancel="close"
          @confirm="apply"
      />
    </template>
  </AppModal>
</template>
