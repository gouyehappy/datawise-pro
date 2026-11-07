<script setup lang="ts">
import {computed} from 'vue'

export interface RadioOption {
  value: string | number | boolean
  label: string
  /** 列表布局下的辅助说明（不改变选项值） */
  hint?: string
  disabled?: boolean
}

const model = defineModel<string | number | boolean>({required: true})

const props = withDefaults(defineProps<{
  options: RadioOption[]
  id?: string
  name?: string
  disabled?: boolean
  /**
   * segment：工具条胶囊（默认）
   * list：纵向单选列表（对话框说明型选项）
   */
  layout?: 'segment' | 'list'
}>(), {
  disabled: false,
  layout: 'segment',
})

const groupName = computed(() => props.name ?? props.id ?? 'dw-radio-group')

function select(value: string | number | boolean) {
  if (props.disabled) return
  model.value = value
}

function isChecked(value: string | number | boolean) {
  return model.value === value
}
</script>

<template>
  <div
      :id="id"
      class="dw-radio-group"
      :class="{ 'dw-radio-group--list': layout === 'list' }"
      role="radiogroup"
  >
    <label
        v-for="option in options"
        :key="String(option.value)"
        class="dw-radio-option"
        :class="{ 'is-disabled': disabled || option.disabled }"
    >
      <input
          type="radio"
          :name="groupName"
          :checked="isChecked(option.value)"
          :disabled="disabled || option.disabled"
          @change="select(option.value)"
      >
      <span class="dw-radio-option__body">
        <span class="dw-radio-option__label">{{ option.label }}</span>
        <span v-if="option.hint" class="dw-radio-option__hint">{{ option.hint }}</span>
      </span>
    </label>
  </div>
</template>
