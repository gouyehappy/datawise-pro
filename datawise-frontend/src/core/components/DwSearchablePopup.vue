<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/ui` DwSearchablePopup. */
import {
  DwSearchablePopup as PackageDwSearchablePopup,
  type DwSearchablePopupOption,
} from '@datawise/ui'

export type {DwSearchablePopupOption}

const model = defineModel<string>({required: true})

withDefaults(
  defineProps<{
    options: Array<string | DwSearchablePopupOption>
    placeholder?: string
    searchPlaceholder?: string
    emptyText?: string
    disabled?: boolean
    allowCustom?: boolean
    variant?: 'default' | 'cell'
    optionHelp?: (value: string) => string | undefined
    optionClass?: (value: string) => string | undefined
    displayValue?: (value: string) => string
    menuMinWidth?: number
    menuMaxHeight?: number
  }>(),
  {
    placeholder: '',
    disabled: false,
    allowCustom: true,
    variant: 'default',
    menuMinWidth: 200,
    menuMaxHeight: 260,
  },
)
</script>

<template>
  <PackageDwSearchablePopup
      v-model="model"
      :options="options"
      :placeholder="placeholder"
      :search-placeholder="searchPlaceholder"
      :empty-text="emptyText"
      :disabled="disabled"
      :allow-custom="allowCustom"
      :variant="variant"
      :option-help="optionHelp"
      :option-class="optionClass"
      :display-value="displayValue"
      :menu-min-width="menuMinWidth"
      :menu-max-height="menuMaxHeight"
  />
</template>
