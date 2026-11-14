<script setup lang="ts">
import {DwSegment, type DwSegmentTab} from '@/core/components'

export type SettingsSegmentTab = DwSegmentTab

withDefaults(
    defineProps<{
      tabs: SettingsSegmentTab[]
      modelValue: string
      ariaLabel?: string
      stretch?: boolean
      variant?: 'bar' | 'inline'
    }>(),
    {
      stretch: false,
      variant: 'bar',
    },
)

const emit = defineEmits<{
  'update:modelValue': [id: string]
}>()
</script>

<template>
  <DwSegment
      class="settings-segment-tabs"
      :class="{'settings-segment-tabs--inline': variant === 'inline'}"
      :tabs="tabs"
      :model-value="modelValue"
      :aria-label="ariaLabel"
      :stretch="stretch"
      :size="variant === 'inline' ? 'sm' : 'md'"
      role="tablist"
      @update:model-value="emit('update:modelValue', $event)"
  />
</template>
