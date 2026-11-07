<script setup lang="ts">
/** Thin host shim — SoT `@datawise/ui` IconButton (deep-import stable). */
import {IconButton as PackageIconButton} from '@datawise/ui'

defineProps<{
  title?: string
  active?: boolean
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'accent' | 'nav'
  navTone?: 'default' | 'database'
}>()
</script>

<template>
  <PackageIconButton
      :title="title"
      :active="active"
      :disabled="disabled"
      :size="size"
      :variant="variant"
      :nav-tone="navTone"
  >
    <slot/>
  </PackageIconButton>
</template>
