<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/ui` CollapseButton. */
import {CollapseButton as PackageCollapseButton} from '@datawise/ui'

withDefaults(
  defineProps<{
    label?: string
    size?: 'sm' | 'md' | 'lg'
    disabled?: boolean
  }>(),
  {},
)

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <PackageCollapseButton
      :label="label"
      :size="size"
      :disabled="disabled"
      @click="emit('click')"
  />
</template>
