<script setup lang="ts">
defineProps<{
  label: string
  caption?: string
  active: boolean
}>()

const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <button
      class="layout-toggle"
      :class="{ active }"
      type="button"
      :aria-pressed="active"
      @click="emit('toggle')"
  >
    <span class="layout-toggle__text">
      <strong>{{ label }}</strong>
      <span v-if="caption" class="layout-toggle__caption">{{ caption }}</span>
    </span>
    <span class="layout-toggle__track" aria-hidden="true">
      <span class="layout-toggle__thumb"/>
    </span>
  </button>
</template>

<style scoped>
.layout-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-space-6);
  width: 100%;
  padding: var(--dw-pad-control-lg);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-panel);
  text-align: left;
  cursor: pointer;
  transition: var(--dw-transition-colors), box-shadow var(--dw-duration) var(--dw-ease),
  transform 0.12s ease;
}

.layout-toggle:hover {
  border-color: color-mix(in srgb, var(--dw-primary) 30%, var(--dw-border));
  background: var(--dw-bg-hover);
}

.layout-toggle.active {
  border-color: var(--dw-primary-border);
  background: var(--dw-primary-softer);
  box-shadow: inset 0 0 0 1px var(--dw-primary-ring);
}

.layout-toggle__text {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-1);
  min-width: 0;
}

.layout-toggle__text strong {
  font-size: var(--dw-text-md);
  font-weight: 600;
  color: var(--dw-text);
}

.layout-toggle__caption {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-snug);
}

.layout-toggle__track {
  position: relative;
  flex-shrink: 0;
  width: 36px;
  height: var(--dw-icon-size-xl);
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-text) 14%, transparent);
  transition: background var(--dw-duration) var(--dw-ease);
}

.layout-toggle.active .layout-toggle__track {
  background: var(--dw-primary);
}

.layout-toggle__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: var(--dw-icon-size-md);
  height: var(--dw-icon-size-md);
  border-radius: 50%;
  background: var(--dw-bg);
  box-shadow: var(--dw-shadow-md);
  transition: transform 0.18s ease;
}

.layout-toggle.active .layout-toggle__thumb {
  transform: translateX(16px);
}
</style>
