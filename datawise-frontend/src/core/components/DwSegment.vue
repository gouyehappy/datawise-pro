<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/ui` DwSegment. */
import {DwSegment as PackageDwSegment, type DwSegmentTab} from '@datawise/ui'

export type {DwSegmentTab}

withDefaults(
  defineProps<{
    tabs: DwSegmentTab[]
    modelValue: string
    ariaLabel?: string
    size?: 'md' | 'sm'
    stretch?: boolean
    wrap?: boolean
    role?: 'tablist' | 'radiogroup' | 'group'
    look?: 'pill' | 'underline'
  }>(),
  {
    size: 'md',
    stretch: false,
    wrap: false,
    role: 'tablist',
    look: 'pill',
  },
)

const emit = defineEmits<{
  'update:modelValue': [id: string]
}>()
</script>

<template>
  <PackageDwSegment
      :tabs="tabs"
      :model-value="modelValue"
      :aria-label="ariaLabel"
      :size="size"
      :stretch="stretch"
      :wrap="wrap"
      :role="role"
      :look="look"
      @update:model-value="emit('update:modelValue', $event)"
  />
</template>
