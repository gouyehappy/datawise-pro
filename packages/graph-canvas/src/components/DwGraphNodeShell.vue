<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
  badge?: string
  selected?: boolean
  accent?: boolean
  width?: number
}>()
</script>

<template>
  <div
      class="dw-graph-node-shell"
      :class="{ 'is-selected': selected, 'is-accent': accent }"
      :style="width ? {width: `${width}px`} : undefined"
  >
    <div v-if="badge || $slots.badge" class="dw-graph-node-shell__badge">
      <slot name="badge">{{ badge }}</slot>
    </div>
    <div class="dw-graph-node-shell__title">{{ title }}</div>
    <div v-if="subtitle" class="dw-graph-node-shell__subtitle">{{ subtitle }}</div>
    <div v-if="$slots.default" class="dw-graph-node-shell__body">
      <slot/>
    </div>
    <slot name="handles"/>
  </div>
</template>

<style scoped>
.dw-graph-node-shell {
  position: relative;
  box-sizing: border-box;
  min-width: 140px;
  padding: 8px 10px;
  border: 1.5px solid var(--dw-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-panel);
  color: var(--dw-text);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--dw-text) 8%, transparent);
}

.dw-graph-node-shell.is-accent {
  background: color-mix(in srgb, var(--dw-primary) 12%, var(--dw-bg-panel));
  border-color: color-mix(in srgb, var(--dw-primary) 45%, var(--dw-border));
}

.dw-graph-node-shell.is-selected {
  border-color: var(--dw-primary);
  border-width: 2px;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--dw-primary) 30%, transparent);
}

.dw-graph-node-shell__badge {
  margin-bottom: 2px;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-2xs);
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: none;
}

.dw-graph-node-shell__title {
  font-size: var(--dw-text-sm);
  font-weight: 700;
  line-height: 1.3;
  word-break: break-all;
}

.dw-graph-node-shell__subtitle {
  margin-top: 2px;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  line-height: 1.3;
}

.dw-graph-node-shell__body {
  margin-top: 6px;
}
</style>
