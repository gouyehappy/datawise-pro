<script setup lang="ts">
import type {UiSkin} from '@/core/ui-skin'

defineProps<{
  variant: UiSkin
  active?: boolean
  label: string
  hint: string
}>()

defineEmits<{ click: [] }>()
</script>

<template>
  <button
      class="skin-card"
      :class="{ active }"
      type="button"
      role="radio"
      :aria-checked="!!active"
      :aria-pressed="!!active"
      @click="$emit('click')"
  >
    <div class="preview-frame" :class="{ active, [`is-${variant}`]: true }">
      <div class="preview-chrome"/>
      <div class="preview-body">
        <div class="preview-rail"/>
        <div class="preview-panels">
          <div class="preview-panel side"/>
          <div class="preview-panel main">
            <div class="preview-tabs"/>
            <div class="preview-editor"/>
          </div>
        </div>
      </div>
    </div>
    <span class="card-label">{{ label }}</span>
    <span class="card-hint">{{ hint }}</span>
  </button>
</template>

<style scoped>
.skin-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--dw-gap-sm);
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: center;
}

.preview-frame {
  width: 160px;
  height: 96px;
  padding: 3px;
  border: 1.5px solid var(--dw-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg);
  overflow: hidden;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}

.preview-frame.active {
  border-color: var(--dw-primary-border);
  border-width: 2px;
  padding: 2px;
  box-shadow: var(--dw-focus-ring);
}

.preview-chrome {
  height: var(--dw-icon-size-xs);
  background: color-mix(in srgb, var(--dw-bg-chrome) 88%, var(--dw-border));
}

.preview-body {
  display: flex;
  height: calc(100% - 12px);
  background: color-mix(in srgb, var(--dw-bg) 70%, var(--dw-bg-chrome));
  gap: var(--dw-gap-xs);
  padding: 4px;
}

.preview-frame.is-ide .preview-body {
  gap: 0;
  padding: 0;
}

.preview-rail {
  width: var(--dw-icon-size-sm);
  flex-shrink: 0;
  background: color-mix(in srgb, var(--dw-bg-rail) 85%, var(--dw-border));
}

.preview-panels {
  display: flex;
  flex: 1;
  min-width: 0;
  gap: inherit;
}

.preview-panel {
  background: var(--dw-bg-panel);
  overflow: hidden;
}

.preview-frame.is-classic .preview-panel {
  border-radius: var(--dw-control-radius-sm);
  box-shadow: var(--dw-shadow-sm);
}

.preview-frame.is-ide .preview-panel.side {
  border-right: 1px solid var(--dw-border);
}

.preview-panel.side {
  width: 28%;
  background: color-mix(in srgb, var(--dw-bg-panel) 92%, var(--dw-bg));
}

.preview-panel.main {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.preview-tabs {
  height: var(--dw-icon-size-xs);
  background: color-mix(in srgb, var(--dw-bg-chrome) 80%, var(--dw-border));
  border-bottom: 1px solid var(--dw-border);
}

.preview-frame.is-ide .preview-tabs {
  height: var(--dw-icon-size-xs);
  background:
    linear-gradient(var(--dw-primary), var(--dw-primary)) 0 0 / 36% 2px no-repeat,
    linear-gradient(var(--dw-bg-panel), var(--dw-bg-panel)) 0 0 / 36% 100% no-repeat,
    color-mix(in srgb, var(--dw-bg-chrome) 80%, var(--dw-border));
  border-bottom: 1px solid var(--dw-border);
  box-shadow: none;
}

.preview-editor {
  flex: 1;
}

.card-label {
  font-size: var(--dw-text-md);
  color: var(--dw-text-secondary);
}

.skin-card.active .card-label {
  color: var(--dw-primary);
  font-weight: 600;
}

.card-hint {
  max-width: 160px;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-snug);
}
</style>
