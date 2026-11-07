<script setup lang="ts">
import {DwIcon} from '@datawise/icons'

withDefaults(
  defineProps<{
    size?: number
    strokeWidth?: number
  }>(),
  {size: 14, strokeWidth: 1.5},
)
</script>

<template>
  <DwIcon name="plus" :size="size" :stroke-width="strokeWidth"/>
</template>
