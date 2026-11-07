<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/chrome` SidePanel. */
import {SidePanel as PackageSidePanel} from '@datawise/chrome'

withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    border?: 'left' | 'right' | 'none'
  }>(),
  {border: 'right'},
)
</script>

<template>
  <PackageSidePanel :title="title" :subtitle="subtitle" :border="border">
    <template v-if="$slots.head" #head>
      <slot name="head"/>
    </template>
    <template v-if="$slots.badge" #badge>
      <slot name="badge"/>
    </template>
    <template v-if="$slots.toolbar" #toolbar>
      <slot name="toolbar"/>
    </template>
    <slot/>
  </PackageSidePanel>
</template>
