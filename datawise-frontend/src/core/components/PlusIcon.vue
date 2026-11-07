<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/ui` PlusIcon. */
import {PlusIcon as PackagePlusIcon} from '@datawise/ui'

withDefaults(
  defineProps<{
    size?: number
    strokeWidth?: number
  }>(),
  {size: 14, strokeWidth: 1.5},
)
</script>

<template>
  <PackagePlusIcon :size="size" :stroke-width="strokeWidth"/>
</template>
