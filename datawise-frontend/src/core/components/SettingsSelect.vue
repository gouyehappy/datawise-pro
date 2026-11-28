<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/ui` SettingsSelect. */
import {SettingsSelect as PackageSettingsSelect, type SelectOption} from '@datawise/ui'

export type {SelectOption}

const model = defineModel<string>({required: true})

withDefaults(
  defineProps<{
    options: SelectOption[]
    id?: string
    useOptionFont?: boolean
    size?: 'default' | 'sm' | 'settings'
    disabled?: boolean
    placeholder?: string
    searchable?: boolean
    matchTrigger?: boolean
    side?: 'top' | 'bottom'
  }>(),
  {size: 'settings', side: 'bottom', searchable: undefined, matchTrigger: false},
)
</script>

<template>
  <PackageSettingsSelect
      v-model="model"
      :options="options"
      :id="id"
      :use-option-font="useOptionFont"
      :size="size"
      :disabled="disabled"
      :placeholder="placeholder"
      :searchable="searchable"
      :match-trigger="matchTrigger"
      :side="side"
  />
</template>
