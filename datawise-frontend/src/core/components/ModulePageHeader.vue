<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/chrome` ModulePageHeader. */
import {ModulePageHeader as PackageModulePageHeader} from '@datawise/chrome'

withDefaults(
  defineProps<{
    variant?: 'hero' | 'compact'
    title: string
    subtitle?: string
    eyebrow?: string
    hint?: string
    contentClass?: string
  }>(),
  {variant: 'hero'},
)
</script>

<template>
  <PackageModulePageHeader
      :variant="variant"
      :title="title"
      :subtitle="subtitle"
      :eyebrow="eyebrow"
      :hint="hint"
      :content-class="contentClass"
  >
    <template v-if="$slots.settings" #settings>
      <slot name="settings"/>
    </template>
    <template v-if="$slots.actions" #actions>
      <slot name="actions"/>
    </template>
    <template v-if="$slots.aside" #aside>
      <slot name="aside"/>
    </template>
  </PackageModulePageHeader>
</template>
