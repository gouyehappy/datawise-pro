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
  border-color: color-mix(in srgb, var(--dw-text) 26%, var(--dw-border));
  background: var(--dw-bg-hover);
}

.layout-toggle.active {
  border-color: var(--dw-border-strong, var(--dw-text-secondary));
  background: var(--dw-bg-hover);
  box-shadow: none;
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

/* 30×18 / travel 12；中性轨道，靠滑块位置区分状态 */
.layout-toggle__track {
  position: relative;
  flex-shrink: 0;
  width: 30px;
  height: 18px;
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-text) 16%, transparent);
  transition: background 0.14s ease;
}

.layout-toggle.active .layout-toggle__track {
  background: color-mix(in srgb, var(--dw-text) 62%, var(--dw-bg-panel));
}

.layout-toggle__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--dw-bg-panel);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--dw-text) 22%, transparent);
  transition: transform 0.14s ease;
}

.layout-toggle.active .layout-toggle__thumb {
  transform: translateX(12px);
}
</style>
