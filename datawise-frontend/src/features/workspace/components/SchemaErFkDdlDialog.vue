<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwButton} from '@/core/components'
import {DwIcon} from '@/core/icons'

const props = defineProps<{
  open: boolean
  title: string
  subtitle?: string
  sql: string
  summaryBits?: string[]
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  apply: []
}>()

const {t} = useI18n()

const canApply = computed(() => Boolean(props.sql.trim()))

function close() {
  emit('update:open', false)
}

function apply() {
  if (!canApply.value) return
  emit('apply')
  close()
}
</script>

<template>
  <AppModal
      :open="open"
      :title="title"
      :subtitle="subtitle || t('workspace.schemaEr.fkDialogSubtitle')"
      width="720px"
      @close="close"
  >
    <div class="er-fk-dialog">
      <ul v-if="summaryBits?.length" class="er-fk-dialog__summary">
        <li v-for="(bit, index) in summaryBits" :key="index">
          <DwIcon name="check" size="xs" :stroke-width="1.6"/>
          <span>{{ bit }}</span>
        </li>
      </ul>
      <div class="modal-preview-section">
        <header class="modal-preview-section__head">
          <span>{{ t('workspace.schemaEr.fkPreview') }}</span>
        </header>
        <pre class="modal-code-block modal-code-block--preview er-fk-dialog__sql">{{ sql }}</pre>
      </div>
      <p class="er-fk-dialog__hint">{{ t('workspace.schemaEr.fkDialogHint') }}</p>
    </div>

    <template #footer>
      <div class="modal-footer-row">
        <div class="modal-footer-row__end">
          <DwButton variant="ghost" type="button" @click="close">
            {{ t('common.cancel') }}
          </DwButton>
          <DwButton
              variant="primary"
              type="button"
              :disabled="!canApply"
              @click="apply"
          >
            {{ t('workspace.schemaEr.fkOpenConsole') }}
          </DwButton>
        </div>
      </div>
    </template>
  </AppModal>
</template>

<style scoped>
.er-fk-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-5);
}

.er-fk-dialog__summary {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
}

.er-fk-dialog__summary li {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  font-size: var(--dw-text-sm);
  color: var(--dw-text-secondary);
}

.er-fk-dialog__sql {
  margin: 0;
  min-height: 140px;
  max-height: 280px;
  overflow: auto;
}

.er-fk-dialog__hint {
  margin: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  line-height: var(--dw-leading);
}
</style>
