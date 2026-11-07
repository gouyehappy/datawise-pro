<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/chrome` SplitHandle. */
import {SplitHandle as PackageSplitHandle} from '@datawise/chrome'

withDefaults(
  defineProps<{
    modelValue: number
    min?: number
    max?: number
    direction?: 'horizontal' | 'vertical'
  }>(),
  {min: 120, max: 800, direction: 'horizontal'},
)

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()
</script>

<template>
  <PackageSplitHandle
      :model-value="modelValue"
      :min="min"
      :max="max"
      :direction="direction"
      @update:model-value="emit('update:modelValue', $event)"
  />
</template>
