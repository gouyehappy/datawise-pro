<script setup lang="ts">
import DwSelect from './DwSelect.vue'
import type {SelectOption} from './select.types'

export type {SelectOption}

withDefaults(
  defineProps<{
    options: SelectOption[]
    id?: string
    useOptionFont?: boolean
    /** default settings = Cursor compact select */
    size?: 'default' | 'sm' | 'settings'
    disabled?: boolean
    placeholder?: string
    searchable?: boolean
    /** Form cells: menu width matches trigger, opens start-aligned */
    matchTrigger?: boolean
    side?: 'top' | 'bottom'
  }>(),
  {size: 'settings', side: 'bottom', searchable: undefined, matchTrigger: false},
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
      :match-trigger="matchTrigger"
      :side="side"
  />
</template>
