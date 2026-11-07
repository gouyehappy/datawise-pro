<script setup lang="ts">
import DwSelect from './DwSelect.vue'
import type {SelectOption} from './select.types'

export type {SelectOption}

withDefaults(
    defineProps<{
      options: SelectOption[]
      id?: string
      useOptionFont?: boolean
      size?: 'default' | 'sm'
      disabled?: boolean
      placeholder?: string
      searchable?: boolean
      side?: 'top' | 'bottom'
    }>(),
    {size: 'default', side: 'bottom'},
)

const model = defineModel<string>({required: true})
</script>

<template>
  <DwSelect
      :id="id"
      v-model="model"
      :options="options"
      :use-option-font="useOptionFont"
      :size="size"
      :disabled="disabled"
      :placeholder="placeholder"
      :searchable="searchable"
      :side="side"
  />
</template>
