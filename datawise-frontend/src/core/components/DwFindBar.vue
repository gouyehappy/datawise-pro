<script setup lang="ts">
/**
 * Thin host wrapper around `@datawise/code` `DwFindBar`.
 * Rarely used outside DwLogViewer (which embeds the package FindBar itself);
 * kept so `@/core/components` exports stay stable.
 */
import {DwFindBar as PackageDwFindBar} from '@datawise/code'

withDefaults(
  defineProps<{
    open: boolean
    modelValue: string
    /** 1-based active match index; `0` when idle / no match. */
    resultIndex?: number
    resultCount?: number
    matchState?: 'idle' | 'match' | 'no-match'
    placeholder?: string
    ariaLabel?: string
    dark?: boolean
  }>(),
  {
    resultIndex: 0,
    resultCount: 0,
    matchState: 'idle',
    dark: true,
  },
)

defineEmits<{
  'update:open': [value: boolean]
  'update:modelValue': [value: string]
  'find-next': []
  'find-previous': []
  close: []
}>()
</script>

<template>
  <PackageDwFindBar
      :open="open"
      :model-value="modelValue"
      :result-index="resultIndex"
      :result-count="resultCount"
      :match-state="matchState"
      :placeholder="placeholder"
      :aria-label="ariaLabel"
      :dark="dark"
      @update:open="$emit('update:open', $event)"
      @update:model-value="$emit('update:modelValue', $event)"
      @find-next="$emit('find-next')"
      @find-previous="$emit('find-previous')"
      @close="$emit('close')"
  />
</template>
