<script setup lang="ts">
import {DwIcon, type DwIconName} from '@/core/icons'

withDefaults(
    defineProps<{
      title: string
      hint: string
      icon: DwIconName
      disabled?: boolean
      meta?: string
      actionLabel?: string
    }>(),
    {
      disabled: false,
    },
)

defineEmits<{
  click: []
}>()
</script>

<template>
  <button
      type="button"
      class="config-hub-card"
      :disabled="disabled"
      @click="$emit('click')"
  >
    <span class="config-hub-card__icon" aria-hidden="true">
      <DwIcon :name="icon" size="lg" :stroke-width="1.7"/>
    </span>
    <span class="config-hub-card__copy">
      <strong class="config-hub-card__title">{{ title }}</strong>
      <span class="config-hub-card__hint">{{ hint }}</span>
      <span v-if="meta" class="config-hub-card__meta">{{ meta }}</span>
    </span>
    <span class="config-hub-card__action">
      {{ actionLabel }}
      <DwIcon name="chevron-right" size="sm" :stroke-width="2"/>
    </span>
  </button>
</template>

<style scoped>
.config-hub-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--dw-space-4);
  align-items: center;
  width: 100%;
  padding: var(--dw-space-4) var(--dw-space-5);
  border: 1px solid color-mix(in srgb, var(--dw-text) 10%, transparent);
  border-radius: var(--dw-panel-radius);
  background: color-mix(in srgb, var(--dw-text) 3.5%, var(--dw-bg));
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: var(--dw-transition-colors), border-color var(--dw-duration-fast) var(--dw-ease);
}

.config-hub-card:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--dw-primary) 35%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-primary) 6%, var(--dw-bg-panel));
}

.config-hub-card:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.config-hub-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--dw-control-radius);
  background: color-mix(in srgb, var(--dw-text) 8%, transparent);
  color: var(--dw-text-secondary);
}

.config-hub-card:hover:not(:disabled) .config-hub-card__icon {
  color: var(--dw-primary);
  background: color-mix(in srgb, var(--dw-primary) 12%, transparent);
}

.config-hub-card__copy {
  display: grid;
  gap: var(--dw-space-1);
  min-width: 0;
}

.config-hub-card__title {
  font-size: var(--dw-text-md);
  font-weight: 650;
  color: var(--dw-text);
  line-height: var(--dw-leading-snug);
}

.config-hub-card__hint,
.config-hub-card__meta {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  line-height: var(--dw-leading-relaxed);
}

.config-hub-card__meta {
  font-family: var(--dw-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.config-hub-card__action {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-1);
  flex-shrink: 0;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
  font-weight: 500;
}
</style>
