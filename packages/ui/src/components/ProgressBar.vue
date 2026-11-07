<script setup lang="ts">
import {computed} from 'vue'

const props = withDefaults(defineProps<{
    /** 0–100；省略时为不确定进度动画 */
    value?: number
    size?: 'sm' | 'md'
    ariaLabel?: string
}>(), {
    size: 'md',
})

const clampedValue = computed(() => {
    if (props.value == null) return undefined
    return Math.min(100, Math.max(0, props.value))
})

const isIndeterminate = computed(() => clampedValue.value == null)
</script>

<template>
  <div
      class="dw-progress"
      :class="{
        'dw-progress--sm': size === 'sm',
        'dw-progress--indeterminate': isIndeterminate,
      }"
      role="progressbar"
      :aria-label="ariaLabel"
      :aria-valuemin="isIndeterminate ? undefined : 0"
      :aria-valuemax="isIndeterminate ? undefined : 100"
      :aria-valuenow="isIndeterminate ? undefined : clampedValue"
  >
    <span
        class="dw-progress__bar"
        :style="isIndeterminate ? undefined : { width: `${clampedValue}%` }"
    />
  </div>
</template>
