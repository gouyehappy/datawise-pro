<script setup lang="ts">
/**
 * Thin host wrapper — SoT `@datawise/ui` DwSelect.
 * Locale via `registerUiI18nHost` (`DW_UI_I18N`).
 */
import {DwSelect as PackageDwSelect, type SelectOption} from '@datawise/ui'

export type {SelectOption}

const model = defineModel<string>({required: true})

withDefaults(
  defineProps<{
    options: SelectOption[]
    id?: string
    placeholder?: string
    disabled?: boolean
    useOptionFont?: boolean
    size?: 'default' | 'sm' | 'pill' | 'compact' | 'inline'
    menuMinWidth?: string
    menuMaxWidth?: string
    searchable?: boolean
    searchPlaceholder?: string
    clearable?: boolean
    side?: 'top' | 'bottom'
  }>(),
  {size: 'default', side: 'bottom'},
)
</script>

<template>
  <PackageDwSelect
      v-model="model"
      :options="options"
      :id="id"
      :placeholder="placeholder"
      :disabled="disabled"
      :use-option-font="useOptionFont"
      :size="size"
      :menu-min-width="menuMinWidth"
      :menu-max-width="menuMaxWidth"
      :searchable="searchable"
      :search-placeholder="searchPlaceholder"
      :clearable="clearable"
      :side="side"
  />
</template>
