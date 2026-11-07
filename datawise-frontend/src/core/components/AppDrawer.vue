<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/overlays` AppDrawer. */
import {AppDrawer as PackageAppDrawer} from '@datawise/overlays'

withDefaults(
  defineProps<{
    open: boolean
    ariaLabel: string
    width?: string
    closeOnEscape?: boolean
  }>(),
  {
    width: 'min(520px, 100vw)',
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
  <PackageAppDrawer
      :open="open"
      :ariaLabel="ariaLabel"
      :width="width"
      :closeOnEscape="closeOnEscape"
      @close="onClose"
  >
    <slot/>
  </PackageAppDrawer>
</template>
