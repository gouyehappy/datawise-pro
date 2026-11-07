<script setup lang="ts">
import type {ThemeAppearance} from '@/features/settings/constants/theme-presets'

defineProps<{
  variant: ThemeAppearance
  active?: boolean
  label: string
}>()

defineEmits<{ click: [] }>()
</script>

<template>
  <button
      class="appearance-card"
      :class="{ active }"
      type="button"
      role="radio"
      :aria-checked="!!active"
      :aria-pressed="!!active"
      @click="$emit('click')"
  >
    <div class="preview-frame" :class="{ active }">
      <div v-if="variant === 'system'" class="preview-shell preview-shell--system">
        <div class="preview-half preview-half--light">
          <div class="preview-rail"/>
          <div class="preview-main">
            <div class="preview-line"/>
            <div class="preview-line short"/>
          </div>
        </div>
        <div class="preview-half preview-half--dark">
          <div class="preview-rail"/>
          <div class="preview-main">
            <div class="preview-line"/>
            <div class="preview-line short"/>
          </div>
        </div>
      </div>
      <div v-else class="preview-shell" :class="`preview-shell--${variant}`">
        <div class="preview-rail"/>
        <div class="preview-main">
          <div class="preview-line"/>
          <div class="preview-line short"/>
          <div class="preview-block"/>
        </div>
      </div>
    </div>
    <span class="card-label">{{ label }}</span>
  </button>
</template>

<style scoped>
.appearance-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--dw-gap-md);
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.preview-frame {
  width: 148px;
  height: 92px;
  padding: var(--dw-space-1);
  border: 1.5px solid var(--dw-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg);
  transition: var(--dw-transition-shadow);
}

.preview-frame.active {
  border-color: var(--dw-primary-border);
  border-width: 2px;
  padding: var(--dw-space-1);
  box-shadow: var(--dw-focus-ring), var(--dw-panel-shadow);
}

.card-label {
  font-size: var(--dw-text-md);
  color: var(--dw-text-secondary);
  transition: color var(--dw-duration-fast) var(--dw-ease);
}

.appearance-card.active .card-label {
  color: var(--dw-primary);
  font-weight: 600;
}

.preview-shell {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: var(--dw-control-radius-sm);
  border: 1px solid var(--dw-panel-border);
}

.preview-shell--light .preview-rail {
  background: var(--dw-bg-chrome);
}

.preview-shell--light .preview-main {
  background: var(--dw-bg);
}

.preview-shell--light .preview-line {
  background: var(--dw-bg-hover);
}

.preview-shell--light .preview-block {
  background: var(--dw-bg-hover);
}

.preview-shell--dark .preview-rail {
  background: var(--dw-bg-hover);
}

.preview-shell--dark .preview-main {
  background: var(--dw-bg-rail);
}

.preview-shell--dark .preview-line {
  background: var(--dw-border);
}

.preview-shell--dark .preview-block {
  background: var(--dw-bg-panel);
}

.preview-shell--system {
  position: relative;
}

.preview-half {
  position: absolute;
  inset: 0;
  display: flex;
}

.preview-half--light {
  clip-path: polygon(0 0, 100% 0, 0 100%);
}

.preview-half--light .preview-rail {
  background: var(--dw-bg-chrome);
}

.preview-half--light .preview-main {
  background: var(--dw-bg);
}

.preview-half--light .preview-line {
  background: var(--dw-bg-hover);
}

.preview-half--dark {
  clip-path: polygon(100% 0, 100% 100%, 0 100%);
}

.preview-half--dark .preview-rail {
  background: var(--dw-bg-hover);
}

.preview-half--dark .preview-main {
  background: var(--dw-bg-rail);
}

.preview-half--dark .preview-line {
  background: var(--dw-border);
}

.preview-rail {
  width: 22%;
  flex-shrink: 0;
}

.preview-main {
  flex: 1;
  padding: var(--dw-space-5) var(--dw-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
}

.preview-line {
  height: 5px;
  border-radius: var(--dw-radius-xs);
}

.preview-line.short {
  width: 62%;
}

.preview-block {
  flex: 1;
  margin-top: var(--dw-space-2);
  border-radius: var(--dw-control-radius-sm);
}
</style>
