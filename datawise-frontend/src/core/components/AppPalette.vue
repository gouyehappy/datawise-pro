<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/overlays` AppPalette. */
import {AppPalette as PackageAppPalette} from '@datawise/overlays'

withDefaults(
  defineProps<{
    open: boolean
    ariaLabel: string
    width?: string
    maxHeight?: string
    closeOnEscape?: boolean
  }>(),
  {
    width: 'min(640px, calc(100vw - 32px))',
    maxHeight: 'min(60vh, 560px)',
    closeOnEscape: true,
  },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  close: []
}>()

function onClose() {
  emit('close')
  emit('update:open', false)
}
</script>

<template>
  <PackageAppPalette
      :open="open"
      :ariaLabel="ariaLabel"
      :width="width"
      :maxHeight="maxHeight"
      :closeOnEscape="closeOnEscape"
      @close="onClose"
  >
    <slot/>
  </PackageAppPalette>
</template>
