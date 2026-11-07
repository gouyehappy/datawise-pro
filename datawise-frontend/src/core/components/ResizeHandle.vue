<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/chrome` ResizeHandle. */
import {ResizeHandle as PackageResizeHandle} from '@datawise/chrome'

const model = defineModel<number>({required: true})

withDefaults(
  defineProps<{
    min?: number
    max?: number
    axis?: 'horizontal' | 'vertical'
    direction?: 'horizontal' | 'vertical'
    invert?: boolean
    variant?: 'ghost' | 'line'
  }>(),
  {axis: 'horizontal', invert: false, variant: 'ghost', min: 200, max: 480},
)
</script>

<template>
  <PackageResizeHandle
      v-model="model"
      :min="min"
      :max="max"
      :axis="axis"
      :direction="direction"
      :invert="invert"
      :variant="variant"
  />
</template>
