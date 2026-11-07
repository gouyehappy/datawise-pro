<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/ui` DwInputAction. */
import {DwInputAction as PackageDwInputAction} from '@datawise/ui'
import type {DwIconName} from '@datawise/icons'

const model = defineModel<string | number>()

withDefaults(defineProps<{
  id?: string
  type?: 'text' | 'search' | 'number' | 'password' | 'email' | 'url'
  placeholder?: string
  disabled?: boolean
  readonly?: boolean
  autocomplete?: string
  min?: number | string
  max?: number | string
  step?: number | string
  variant?: 'default' | 'sm' | 'mono'
  actionLabel: string
  actionIcon?: DwIconName
  actionDisabled?: boolean
  actionLoading?: boolean
}>(), {
  type: 'text',
  disabled: false,
  readonly: false,
  variant: 'default',
  actionIcon: 'refresh',
  actionDisabled: false,
  actionLoading: false,
})

defineEmits<{
  action: []
}>()
</script>

<template>
  <PackageDwInputAction
      v-model="model"
      :id="id"
      :type="type"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :autocomplete="autocomplete"
      :min="min"
      :max="max"
      :step="step"
      :variant="variant"
      :action-label="actionLabel"
      :action-icon="actionIcon"
      :action-disabled="actionDisabled"
      :action-loading="actionLoading"
      @action="$emit('action')"
  />
</template>
