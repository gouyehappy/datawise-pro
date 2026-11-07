<script setup lang="ts">
import {AppModal, ModalActions} from '@/core/components'
import {useI18n} from 'vue-i18n'

defineProps<{
  open: boolean
  querySql: string
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
      :title="t('queryResult.indexSuggestTitle')"
      :subtitle="t('queryResult.indexSuggestSubtitle')"
      width="960px"
      @close="close"
  >
    <div class="modal-code-split">
      <section class="modal-code-pane">
        <h3 class="modal-code-label">{{ t('queryResult.indexSuggestQuery') }}</h3>
        <pre class="modal-code-block">{{ querySql }}</pre>
      </section>
      <section class="modal-code-pane">
        <h3 class="modal-code-label">{{ t('queryResult.indexSuggestDraft') }}</h3>
        <pre class="modal-code-block modal-code-block--accent">{{ suggestedSql }}</pre>
      </section>
    </div>
    <template #footer>
      <ModalActions
          :confirm-label="t('queryResult.indexSuggestApply')"
          :cancel-label="t('common.cancel')"
          :confirm-disabled="loading || !suggestedSql.trim()"
          @cancel="close"
          @confirm="apply"
      />
    </template>
  </AppModal>
</template>
