<script setup lang="ts">
import DwInput from './DwInput.vue'

withDefaults(defineProps<{
    modelValue: string
    placeholder?: string
    /** 大于 1 时渲染 textarea */
    rows?: number
    type?: 'text' | 'search' | 'number'
    disabled?: boolean
}>(), {
    type: 'text',
    rows: undefined,
    disabled: false,
})

const model = defineModel<string>({required: true})
</script>

<template>
  <DwInput
      v-model="model"
      variant="cell"
      :type="type"
      :rows="rows"
      :placeholder="placeholder"
      :disabled="disabled"
  />
</template>
