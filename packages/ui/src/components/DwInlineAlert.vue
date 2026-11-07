<script setup lang="ts">
import {computed, useSlots} from 'vue'

const props = withDefaults(defineProps<{
  /** Copy; or use default slot. Hidden when both empty. */
  message?: string | null
  variant?: 'error' | 'warning' | 'info' | 'success'
  /** text ≈ beside field; banner ≈ dialog/panel strip */
  density?: 'text' | 'banner'
}>(), {
  message: null,
  variant: 'error',
  density: 'text',
})

const slots = useSlots()

const visible = computed(() => {
  const text = props.message?.trim()
  return Boolean(text) || Boolean(slots.default)
})

const role = computed(() =>
  props.variant === 'error' || props.variant === 'warning' ? 'alert' : 'status',
)
</script>

<template>
  <p
      v-if="visible"
      class="dw-inline-alert"
      :class="[
        `dw-inline-alert--${variant}`,
        `dw-inline-alert--${density}`,
      ]"
      :role="role"
  >
    <slot>{{ message }}</slot>
  </p>
</template>

<style scoped>
.dw-inline-alert {
  margin: 0;
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-snug);
}

.dw-inline-alert--text {
  color: var(--dw-danger);
}

.dw-inline-alert--text.dw-inline-alert--warning {
  color: var(--dw-warning);
}

.dw-inline-alert--text.dw-inline-alert--info {
  color: var(--dw-text-muted);
}

.dw-inline-alert--text.dw-inline-alert--success {
  color: var(--dw-success);
}

.dw-inline-alert--banner {
  margin-top: var(--dw-space-4);
  padding: var(--dw-space-3) var(--dw-space-4);
  border-radius: var(--dw-control-radius-sm);
  border: 1px solid color-mix(in srgb, var(--dw-danger) 28%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-danger-soft) 55%, var(--dw-bg-panel));
  color: var(--dw-danger-fg);
}

.dw-inline-alert--banner.dw-inline-alert--warning {
  border-color: color-mix(in srgb, var(--dw-warning) 28%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-warning) 12%, var(--dw-bg-panel));
  color: var(--dw-warning);
}

.dw-inline-alert--banner.dw-inline-alert--info {
  border-color: var(--dw-border-light);
  background: color-mix(in srgb, var(--dw-bg-muted) 70%, var(--dw-bg-panel));
  color: var(--dw-text-muted);
}

.dw-inline-alert--banner.dw-inline-alert--success {
  border-color: color-mix(in srgb, var(--dw-success) 28%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-success) 12%, var(--dw-bg-panel));
  color: var(--dw-success);
}
</style>
