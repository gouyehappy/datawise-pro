<script setup lang="ts">
import {computed, ref, useAttrs} from 'vue'

defineOptions({inheritAttrs: false})

const model = defineModel<string | number>()

const props = withDefaults(defineProps<{
  id?: string
  type?: 'text' | 'search' | 'number' | 'password' | 'email' | 'url'
  placeholder?: string
  disabled?: boolean
  readonly?: boolean
  autocomplete?: string
  spellcheck?: boolean | 'true' | 'false'
  min?: number | string
  max?: number | string
  step?: number | string
  /** 大于 1 时渲染 textarea；与 multiline 合用可强制多行 */
  rows?: number
  /**
   * 强制渲染 textarea（即使 rows=1）。
   * 用于 AI Composer 等需要单行起始、可自动增高的场景。
   */
  multiline?: boolean
  variant?: 'default' | 'sm' | 'cell' | 'mono'
}>(), {
  type: 'text',
  variant: 'default',
  disabled: false,
  readonly: false,
  multiline: false,
})

const attrs = useAttrs()
const rootEl = ref<HTMLTextAreaElement | HTMLInputElement | null>(null)

const useTextarea = computed(() => props.multiline || (props.rows != null && props.rows > 1))

const inputClass = computed(() => [
  'dw-input',
  props.variant !== 'default' && `dw-input--${props.variant}`,
  useTextarea.value && 'dw-textarea--cell',
])

function focus() {
  rootEl.value?.focus()
}

function getNativeElement() {
  return rootEl.value
}

defineExpose({
  focus,
  getNativeElement,
})
</script>

<template>
  <textarea
      v-if="useTextarea"
      :id="id"
      ref="rootEl"
      v-model="model"
      :class="inputClass"
      :rows="rows ?? 1"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :spellcheck="spellcheck"
      v-bind="attrs"
  />
  <input
      v-else
      :id="id"
      ref="rootEl"
      v-model="model"
      :class="inputClass"
      :type="type"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :autocomplete="autocomplete"
      :spellcheck="spellcheck"
      :min="min"
      :max="max"
      :step="step"
      v-bind="attrs"
  >
</template>
