<script setup lang="ts">
/**
 * Thin host wrapper — SoT `@datawise/ui` DwSecretInput.
 * Locale: `secret.show`/`secret.hide` aliased to `auth.*` in registerUiI18nHost.
 */
import {DwSecretInput as PackageDwSecretInput} from '@datawise/ui'

const model = defineModel<string>({default: ''})

withDefaults(defineProps<{
  id?: string
  placeholder?: string
  disabled?: boolean
  readonly?: boolean
  autocomplete?: string
  variant?: 'default' | 'sm' | 'mono'
  showLabel?: string
  hideLabel?: string
}>(), {
  disabled: false,
  readonly: false,
  autocomplete: 'off',
  variant: 'default',
})
</script>

<template>
  <PackageDwSecretInput
      v-model="model"
      :id="id"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :autocomplete="autocomplete"
      :variant="variant"
      :show-label="showLabel"
      :hide-label="hideLabel"
  />
</template>
