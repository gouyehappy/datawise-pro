<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/ui` TableCellInput. */
import {TableCellInput as PackageTableCellInput} from '@datawise/ui'

withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    rows?: number
    type?: 'text' | 'search' | 'number'
    disabled?: boolean
  }>(),
  {
    type: 'text',
    rows: undefined,
    disabled: false,
  },
)

const model = defineModel<string>({required: true})
</script>

<template>
  <PackageTableCellInput
      v-model="model"
      :placeholder="placeholder"
      :rows="rows"
      :type="type"
      :disabled="disabled"
  />
</template>
