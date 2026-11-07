<script setup lang="ts">
/**
 * Thin host wrapper — SoT `@datawise/overlays` ConfirmDialog.
 * Locale via `registerUiI18nHost` (`DW_UI_I18N` ← vue-i18n).
 */
import {ConfirmDialog as PackageConfirmDialog} from '@datawise/overlays'

withDefaults(
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

defineEmits<{
  'update:open': [value: boolean]
  confirm: []
}>()
</script>

<template>
  <PackageConfirmDialog
      :open="open"
      :title="title"
      :message="message"
      :confirm-label="confirmLabel"
      :confirm-loading="confirmLoading"
      :confirm-variant="confirmVariant"
      @update:open="$emit('update:open', $event)"
      @confirm="$emit('confirm')"
  />
</template>
