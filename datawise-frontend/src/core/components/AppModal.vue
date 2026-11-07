<script setup lang="ts">
/**
 * Thin host wrapper — SoT `@datawise/overlays` AppModal.
 * Locale via `registerUiI18nHost` (`DW_UI_I18N`).
 */
import {AppModal as PackageAppModal} from '@datawise/overlays'

withDefaults(
  defineProps<{
    open: boolean
    title: string
    subtitle?: string
    width?: string
    maxHeight?: string
    closeOnBackdrop?: boolean
    closeOnEscape?: boolean
    showClose?: boolean
    autoFocus?: 'body' | 'close'
    closeLabel?: string
  }>(),
  {
    width: '440px',
    closeOnBackdrop: false,
    closeOnEscape: true,
    showClose: true,
    autoFocus: 'body',
  },
)

defineEmits<{
  close: []
}>()
</script>

<template>
  <PackageAppModal
      :open="open"
      :title="title"
      :subtitle="subtitle"
      :width="width"
      :max-height="maxHeight"
      :close-on-backdrop="closeOnBackdrop"
      :close-on-escape="closeOnEscape"
      :show-close="showClose"
      :auto-focus="autoFocus"
      :close-label="closeLabel"
      @close="$emit('close')"
  >
    <template v-if="$slots['header-actions']" #header-actions>
      <slot name="header-actions"/>
    </template>
    <slot/>
    <template v-if="$slots.footer" #footer>
      <slot name="footer"/>
    </template>
  </PackageAppModal>
</template>
