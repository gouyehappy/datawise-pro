<script setup lang="ts">
import {computed} from 'vue'
import {useDwI18n} from '@datawise/ui'
import AppModal from './AppModal.vue'
import ModalActions from './ModalActions.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    message: string
    confirmLabel?: string
    confirmLoading?: boolean
    confirmVariant?: 'primary' | 'danger'
  }>(),
  {confirmVariant: 'primary'},
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
}>()

const t = useDwI18n()

const resolvedConfirmLabel = computed(
  () => props.confirmLabel ?? t('common.confirm'),
)

function close() {
  emit('update:open', false)
}

function onConfirm() {
  emit('confirm')
}
</script>

<template>
  <AppModal :open="open" :title="title" width="420px" @close="close">
    <p class="modal-message confirm-dialog__message">{{ message }}</p>
    <template #footer>
      <ModalActions
        :confirm-label="resolvedConfirmLabel"
        :confirm-loading="confirmLoading"
        :confirm-variant="confirmVariant"
        @cancel="close"
        @confirm="onConfirm"
      />
    </template>
  </AppModal>
</template>

<style scoped>
.confirm-dialog__message {
  white-space: pre-line;
}
</style>
