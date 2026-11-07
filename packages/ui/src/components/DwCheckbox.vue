<script setup lang="ts">
defineOptions({inheritAttrs: false})

const model = defineModel<boolean>({required: true})

withDefaults(defineProps<{
  id?: string
  label?: string
  disabled?: boolean
  /** 块级布局（标题 + 说明），用于设置页开关类场景 */
  block?: boolean
  /** 半选态（如表头全选）；与原生 input.indeterminate 对齐 */
  indeterminate?: boolean
}>(), {
  disabled: false,
  block: false,
  indeterminate: false,
})
</script>

<template>
  <label
      class="dw-checkbox"
      :class="{ 'dw-checkbox--block': block }"
      v-bind="$attrs"
  >
    <input
        :id="id"
        v-model="model"
        class="dw-checkbox__control"
        type="checkbox"
        :disabled="disabled"
        :indeterminate.prop="indeterminate"
    >
    <span v-if="label || $slots.default" class="dw-checkbox__label">
      <slot>{{ label }}</slot>
    </span>
  </label>
</template>
