<script setup lang="ts">
/**
 * Thin host wrapper — package API matches; keeps `@/core/components` import path stable.
 */
import {PromptDialog as PackagePromptDialog} from '@datawise/overlays'

defineProps<{
  open: boolean
  title: string
  subtitle?: string
  label: string
  defaultValue?: string
  placeholder?: string
  requiredMessage?: string
  /** 返回错误文案则留在对话框内；返回空则确认关闭 */
  validate?: (value: string) => string | null | undefined
  confirmLabel?: string
  cancelLabel?: string
}>()

defineEmits<{
  'update:open': [value: boolean]
  confirm: [value: string]
}>()
</script>

<template>
  <PackagePromptDialog
      :open="open"
      :title="title"
      :subtitle="subtitle"
      :label="label"
      :default-value="defaultValue"
      :placeholder="placeholder"
      :required-message="requiredMessage"
      :validate="validate"
      :confirm-label="confirmLabel"
      :cancel-label="cancelLabel"
      @update:open="$emit('update:open', $event)"
      @confirm="$emit('confirm', $event)"
  />
</template>
