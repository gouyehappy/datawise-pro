<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/chrome` ModulePageRegions. */
import {ModulePageRegions as PackageModulePageRegions} from '@datawise/chrome'

defineProps<{
  contentClass?: string
}>()
</script>

<template>
  <PackageModulePageRegions :content-class="contentClass">
    <template #header>
      <slot name="header"/>
    </template>
    <template v-if="$slots.journey" #journey>
      <slot name="journey"/>
    </template>
    <template v-if="$slots.status" #status>
      <slot name="status"/>
    </template>
    <template v-if="$slots.toolbar" #toolbar>
      <slot name="toolbar"/>
    </template>
    <template #default>
      <slot/>
    </template>
    <template v-if="$slots.footer" #footer>
      <slot name="footer"/>
    </template>
  </PackageModulePageRegions>
</template>
