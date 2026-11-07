<script setup lang="ts">
/** Thin host wrapper ? SoT `@datawise/chrome` ModuleHeroSettingsMenu. */
import {
  ModuleHeroSettingsMenu as PackageModuleHeroSettingsMenu,
  type ModuleHeroMenuItem,
} from '@datawise/chrome'

export type {ModuleHeroMenuItem}

withDefaults(defineProps<{
  ariaLabel: string
  items: ModuleHeroMenuItem[]
  active?: boolean
  icon?: string
  placement?: 'down' | 'up' | 'auto'
}>(), {
  active: false,
  icon: 'settings',
  placement: 'auto',
})

defineEmits<{
  select: [id: string]
}>()
</script>

<template>
  <PackageModuleHeroSettingsMenu
      :ariaLabel="ariaLabel"
      :items="items"
      :active="active"
      :icon="icon"
      :placement="placement"
      @select="$emit('select', $event)"
  />
</template>
