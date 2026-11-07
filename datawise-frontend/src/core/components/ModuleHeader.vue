<script setup lang="ts">
/** Thin host wrapper ¡ª SoT `@datawise/chrome` ModuleHeader. */
import {ModuleHeader as PackageModuleHeader} from '@datawise/chrome'

defineProps<{
  title: string
  subtitle?: string
  badge?: string
  hint?: string
}>()
</script>

<template>
  <PackageModuleHeader :title="title" :subtitle="subtitle" :badge="badge" :hint="hint">
    <template v-if="$slots.icon" #icon>
      <slot name="icon"/>
    </template>
    <template v-if="$slots.extra" #extra>
      <slot name="extra"/>
    </template>
  </PackageModuleHeader>
</template>
