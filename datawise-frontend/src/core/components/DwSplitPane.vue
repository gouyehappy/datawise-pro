<script setup lang="ts">
/**
 * Thin host wrapper — SoT `@datawise/chrome` DwSplitPane.
 */
import {DwSplitPane as PackageDwSplitPane, type DwSplitRatio} from '@datawise/chrome'

withDefaults(
  defineProps<{
    storageKey?: string
    defaultWidth?: number
    defaultRatio?: DwSplitRatio
    minWidth?: number
    maxWidth?: number
    maxRatio?: number
    endMinWidth?: number
    stackBelow?: number | false
    startClass?: string | string[] | Record<string, boolean>
    endClass?: string | string[] | Record<string, boolean>
    handleVariant?: 'ghost' | 'line'
    handleClass?: string
    disabled?: boolean
  }>(),
  {
    defaultWidth: 280,
    defaultRatio: 'third',
    minWidth: 180,
    maxWidth: 960,
    maxRatio: 0.7,
    endMinWidth: 280,
    stackBelow: 900,
    handleVariant: 'ghost',
    disabled: false,
  },
)
</script>

<template>
  <PackageDwSplitPane
      :storage-key="storageKey"
      :default-width="defaultWidth"
      :default-ratio="defaultRatio"
      :min-width="minWidth"
      :max-width="maxWidth"
      :max-ratio="maxRatio"
      :end-min-width="endMinWidth"
      :stack-below="stackBelow"
      :start-class="startClass"
      :end-class="endClass"
      :handle-variant="handleVariant"
      :handle-class="handleClass"
      :disabled="disabled"
  >
    <template #start>
      <slot name="start"/>
    </template>
    <template #end>
      <slot name="end"/>
    </template>
  </PackageDwSplitPane>
</template>
