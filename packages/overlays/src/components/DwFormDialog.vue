<script setup lang="ts">
/**
 * Form dialog recipe: AppModal + optional alert slot + ModalActions footer.
 */
import AppModal from './AppModal.vue'
import ModalActions from './ModalActions.vue'

withDefaults(
  defineProps<{
    open: boolean
    title: string
    subtitle?: string
    width?: string
    maxHeight?: string
    confirmLabel?: string
    cancelLabel?: string
    confirmDisabled?: boolean
    confirmLoading?: boolean
    confirmVariant?: 'primary' | 'danger'
    showCancel?: boolean
    showClose?: boolean
  }>(),
  {
    width: '480px',
    confirmVariant: 'primary',
    showCancel: true,
    showClose: true,
    confirmDisabled: false,
    confirmLoading: false,
  },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
  cancel: []
}>()

function close() {
  emit('update:open', false)
  emit('cancel')
}

function onConfirm() {
  emit('confirm')
}
</script>

<template>
  <AppModal
    :open="open"
    :title="title"
    :subtitle="subtitle"
    :width="width"
    :max-height="maxHeight"
    :show-close="showClose"
    @close="close"
  >
    <div v-if="$slots.alert" class="dw-form-dialog__alert">
      <slot name="alert"/>
    </div>
    <slot/>
    <template #footer>
      <slot name="actions">
        <ModalActions
          :confirm-label="confirmLabel"
          :cancel-label="cancelLabel"
          :confirm-disabled="confirmDisabled"
          :confirm-loading="confirmLoading"
          :confirm-variant="confirmVariant"
          :show-cancel="showCancel"
          @cancel="close"
          @confirm="onConfirm"
        />
      </slot>
    </template>
  </AppModal>
</template>

<style scoped>
.dw-form-dialog__alert {
  margin-bottom: var(--dw-space-4);
}
</style>
