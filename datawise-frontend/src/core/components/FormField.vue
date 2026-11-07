<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/ui` FormField. */
import {FormField as PackageFormField} from '@datawise/ui'

withDefaults(defineProps<{
  label: string
  inputId?: string
  error?: string
  hint?: string
  group?: boolean
}>(), {
  group: false,
})
</script>

<template>
  <PackageFormField
      :label="label"
      :input-id="inputId"
      :error="error"
      :hint="hint"
      :group="group"
  >
    <template #default="slotProps">
      <slot v-bind="slotProps"/>
    </template>
  </PackageFormField>
</template>
