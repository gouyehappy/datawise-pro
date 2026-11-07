<script setup lang="ts">
import {computed} from 'vue'
import {DwIcon} from '@datawise/icons'
import {useDwI18n} from '../i18n/useDwI18n'

const model = defineModel<string>({required: true})

const props = withDefaults(
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

const t = useDwI18n()
const hasValue = computed(() => Boolean(model.value))
const resolvedClear = computed(() => props.clearLabel ?? t('common.clear'))

function clear() {
  model.value = ''
}
</script>

<template>
  <label
    class="dw-search"
    :class="{ 'dw-search--sm': props.size === 'sm', 'is-disabled': props.disabled }"
  >
    <DwIcon
      class="dw-search__icon"
      name="search"
      muted
      :size="props.size === 'sm' ? 'sm' : 'md'"
      :stroke-width="1.5"
    />
    <input
      :id="id"
      v-model="model"
      type="search"
      :placeholder="placeholder"
      :aria-label="ariaLabel || placeholder"
      :disabled="props.disabled"
      autocomplete="off"
      spellcheck="false"
    >
    <button
      v-if="clearable && hasValue && !props.disabled"
      class="dw-search__clear"
      type="button"
      :title="resolvedClear"
      :aria-label="resolvedClear"
      @click.prevent.stop="clear"
    >
      <DwIcon name="x" size="sm" :stroke-width="1.8" aria-hidden="true"/>
    </button>
    <span v-if="$slots.suffix" class="dw-search__suffix">
      <slot name="suffix"/>
    </span>
  </label>
</template>
