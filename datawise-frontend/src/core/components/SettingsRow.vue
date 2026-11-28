<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/ui` SettingsRow. */
import {SettingsRow as PackageSettingsRow} from '@datawise/ui'

withDefaults(
    defineProps<{
      label: string
      hint?: string
      disabled?: boolean
    }>(),
    {disabled: false},
)
</script>

<template>
  <PackageSettingsRow :label="label" :hint="hint" :disabled="disabled">
    <slot/>
  </PackageSettingsRow>
</template>
