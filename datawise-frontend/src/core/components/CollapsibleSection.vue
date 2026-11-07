<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/chrome` CollapsibleSection. */
import {CollapsibleSection as PackageCollapsibleSection} from '@datawise/chrome'

withDefaults(
  defineProps<{
    title: string
    description?: string
    defaultOpen?: boolean
    joined?: 'top' | 'middle' | 'bottom' | 'single' | 'none'
  }>(),
  {defaultOpen: false, joined: 'none'},
)
</script>

<template>
  <PackageCollapsibleSection
      :title="title"
      :description="description"
      :default-open="defaultOpen"
      :joined="joined"
  >
    <template v-if="$slots.icon" #icon>
      <slot name="icon"/>
    </template>
    <slot/>
  </PackageCollapsibleSection>
</template>
