<script setup lang="ts">
import {computed} from 'vue'
import {DwIcon} from '@datawise/icons'

const props = withDefaults(defineProps<{
  /** 主文案 */
  message: string
  /** 次要说明 */
  hint?: string | null
  /** warning 默认；危险操作用 danger */
  variant?: 'warning' | 'danger'
}>(), {
  hint: null,
  variant: 'warning',
})

const isDanger = computed(() => props.variant === 'danger')
</script>

<template>
  <div
      class="dw-confirm-alert"
      :class="{ 'dw-confirm-alert--danger': isDanger }"
      role="alert"
  >
    <div class="dw-confirm-alert__icon" aria-hidden="true">
      <slot name="icon">
        <DwIcon name="alert-triangle" size="rail" danger :stroke-width="1.6"/>
      </slot>
    </div>
    <div class="dw-confirm-alert__body">
      <p class="dw-confirm-alert__message">{{ message }}</p>
      <p v-if="hint?.trim()" class="dw-confirm-alert__hint">{{ hint }}</p>
      <slot/>
    </div>
  </div>
</template>

<style scoped>
.dw-confirm-alert {
  display: flex;
  gap: var(--dw-space-6);
  padding: var(--dw-space-6);
  border: 1px solid color-mix(in srgb, var(--dw-warning) 24%, var(--dw-border-light));
  border-radius: var(--dw-panel-radius);
  background: color-mix(in srgb, var(--dw-warning) 6%, var(--dw-bg));
}

.dw-confirm-alert--danger {
  border-color: color-mix(in srgb, var(--dw-danger) 24%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-danger) 6%, var(--dw-bg));
}

.dw-confirm-alert__icon {
  flex-shrink: 0;
  color: var(--dw-warning-fg);
}

.dw-confirm-alert--danger .dw-confirm-alert__icon {
  color: var(--dw-danger);
}

.dw-confirm-alert__body {
  min-width: 0;
}

.dw-confirm-alert__message {
  margin: 0;
  font-size: var(--dw-text-md);
  line-height: var(--dw-leading);
  color: var(--dw-text);
}

.dw-confirm-alert__hint {
  margin: var(--dw-space-3) 0 0;
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading);
  color: var(--dw-text-muted);
}
</style>
