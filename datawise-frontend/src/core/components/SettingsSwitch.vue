<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/ui` SettingsSwitch. */
import {SettingsSwitch as PackageSettingsSwitch} from '@datawise/ui'

const model = defineModel<boolean>({required: true})

withDefaults(
    defineProps<{
      label?: string
      hint?: string
      disabled?: boolean
      bare?: boolean
    }>(),
    {disabled: false, bare: false},
)
</script>

<template>
  <PackageSettingsSwitch
      v-model="model"
      :label="label"
      :hint="hint"
      :disabled="disabled"
      :bare="bare"
  />
</template>
