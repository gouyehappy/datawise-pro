<script setup lang="ts">
/**
 * Thin alias over ResizeHandle for former SplitHandle call sites.
 * Prefer importing ResizeHandle with `direction` + `variant="line"` directly.
 */
import ResizeHandle from './ResizeHandle.vue'

const props = withDefaults(
    defineProps<{
      modelValue: number
      min?: number
      max?: number
      direction?: 'horizontal' | 'vertical'
    }>(),
    {min: 120, max: 800, direction: 'horizontal'},
)

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
</script>

<template>
  <ResizeHandle
      :model-value="props.modelValue"
      :min="props.min"
      :max="props.max"
      :direction="props.direction"
      variant="line"
      @update:model-value="emit('update:modelValue', $event)"
  />
</template>
