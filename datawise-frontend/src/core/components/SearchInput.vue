<script setup lang="ts">
/**
 * Thin host wrapper — SoT `@datawise/ui` SearchInput.
 * Locale via `registerUiI18nHost` (`DW_UI_I18N`).
 */
import {SearchInput as PackageSearchInput} from '@datawise/ui'

const model = defineModel<string>({required: true})

withDefaults(
  defineProps<{
    placeholder?: string
    id?: string
    size?: 'default' | 'sm'
    disabled?: boolean
    clearable?: boolean
    ariaLabel?: string
    clearLabel?: string
  }>(),
  {size: 'default', disabled: false, clearable: true},
)
</script>

<template>
  <PackageSearchInput
      v-model="model"
      :placeholder="placeholder"
      :id="id"
      :size="size"
      :disabled="disabled"
      :clearable="clearable"
      :aria-label="ariaLabel"
      :clear-label="clearLabel"
  >
    <template v-if="$slots.suffix" #suffix>
      <slot name="suffix"/>
    </template>
  </PackageSearchInput>
</template>
