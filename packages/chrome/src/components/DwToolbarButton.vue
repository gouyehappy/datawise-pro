<script setup lang="ts">
import {computed} from 'vue'

const props = withDefaults(
  defineProps<{
    variant?: 'text' | 'icon' | 'toggle'
    size?: 'sm' | 'md'
    active?: boolean
    disabled?: boolean
    title?: string
  }>(),
  {
    variant: 'text',
    size: 'md',
    active: false,
    disabled: false,
  },
)

const classList = computed(() => [
  'dw-toolbar-btn',
  props.variant === 'icon' && 'dw-icon-btn',
  props.variant === 'text' && 'dw-text-btn',
  props.variant === 'toggle' && 'dw-toolbar-btn--toggle',
  props.size === 'sm' && (props.variant === 'icon' ? 'dw-icon-btn--sm' : 'dw-toolbar-btn--sm'),
  props.active && 'is-active',
])
</script>

<template>
  <button
    type="button"
    :class="classList"
    :title="title"
    :aria-pressed="variant === 'toggle' ? active : undefined"
    :disabled="disabled"
  >
    <slot/>
  </button>
</template>

<style scoped>
.dw-toolbar-btn--toggle.is-active {
  color: var(--dw-primary);
  background: color-mix(in srgb, var(--dw-primary) 12%, transparent);
}
.dw-toolbar-btn--sm {
  height: var(--dw-density-sm);
  padding-inline: var(--dw-space-3);
  font-size: var(--dw-text-sm);
}
</style>
