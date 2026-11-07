<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/ui` DwMultiSelect. */
import {DwMultiSelect as PackageDwMultiSelect, type SelectOption} from '@datawise/ui'

export type {SelectOption}

const model = defineModel<string[]>({default: () => []})

withDefaults(
  defineProps<{
    options: SelectOption[]
    id?: string
    placeholder?: string
    disabled?: boolean
    size?: 'default' | 'sm' | 'pill' | 'compact' | 'inline'
    menuMinWidth?: string
  }>(),
  {size: 'default'},
)
</script>

<template>
  <PackageDwMultiSelect
      v-model="model"
      :options="options"
      :id="id"
      :placeholder="placeholder"
      :disabled="disabled"
      :size="size"
      :menu-min-width="menuMinWidth"
  />
</template>
