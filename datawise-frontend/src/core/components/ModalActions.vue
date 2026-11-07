<script setup lang="ts">
/**
 * Thin host wrapper — SoT `@datawise/overlays` ModalActions.
 * Locale via `registerUiI18nHost` (`DW_UI_I18N`).
 */
import {ModalActions as PackageModalActions} from '@datawise/overlays'

withDefaults(
  defineProps<{
    cancelLabel?: string
    confirmLabel?: string
    confirmDisabled?: boolean
    confirmLoading?: boolean
    confirmVariant?: 'primary' | 'danger'
    showCancel?: boolean
  }>(),
  {confirmDisabled: false, confirmLoading: false, confirmVariant: 'primary', showCancel: true},
)

defineEmits<{
  cancel: []
  confirm: []
}>()
</script>

<template>
  <PackageModalActions
      :cancel-label="cancelLabel"
      :confirm-label="confirmLabel"
      :confirm-disabled="confirmDisabled"
      :confirm-loading="confirmLoading"
      :confirm-variant="confirmVariant"
      :show-cancel="showCancel"
      @cancel="$emit('cancel')"
      @confirm="$emit('confirm')"
  />
</template>
