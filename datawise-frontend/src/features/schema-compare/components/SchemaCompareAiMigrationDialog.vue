<script setup lang="ts">
import {AppModal, ModalActions} from '@/core/components'
import {useI18n} from 'vue-i18n'

defineProps<{
  open: boolean
  baselineDdl: string
  upDdl: string
  downDdl: string
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
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('schemaCompare.aiMigrationTitle')"
      :subtitle="t('schemaCompare.aiMigrationSubtitle')"
      width="980px"
      @close="close"
  >
    <div class="modal-code-split modal-code-split--tall">
      <section class="modal-code-pane">
        <h3 class="modal-code-label">{{ t('schemaCompare.aiMigrationBaseline') }}</h3>
        <pre class="modal-code-block">{{ baselineDdl }}</pre>
      </section>
      <section class="modal-code-pane modal-code-pane--stack">
        <div class="modal-code-stack-item">
          <h3 class="modal-code-label">{{ t('schemaCompare.aiMigrationUp') }}</h3>
          <pre v-if="loading" class="modal-code-block modal-code-block--muted">{{ t('schemaCompare.aiMigrationLoading') }}</pre>
          <pre v-else class="modal-code-block modal-code-block--accent">{{ upDdl || '—' }}</pre>
        </div>
        <div class="modal-code-stack-item">
          <h3 class="modal-code-label">{{ t('schemaCompare.aiMigrationDown') }}</h3>
          <pre v-if="!loading" class="modal-code-block">{{ downDdl || t('schemaCompare.aiMigrationDownEmpty') }}</pre>
        </div>
      </section>
    </div>
    <template #footer>
      <ModalActions
          :confirm-label="t('schemaCompare.aiMigrationApply')"
          :cancel-label="t('common.cancel')"
          :confirm-disabled="loading || !upDdl.trim()"
          @cancel="close"
          @confirm="apply"
      />
    </template>
  </AppModal>
</template>
