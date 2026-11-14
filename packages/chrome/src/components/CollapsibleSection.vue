<script setup lang="ts">
import {ref} from 'vue'
import {DwIcon} from '@datawise/icons'

const props = withDefaults(
  defineProps<{
    title: string
    description?: string
    defaultOpen?: boolean
    joined?: 'top' | 'middle' | 'bottom' | 'single' | 'none'
  }>(),
  {defaultOpen: false, joined: 'none'},
)

const expanded = ref(props.defaultOpen)

function toggle() {
  expanded.value = !expanded.value
}
</script>

<template>
  <section
    class="collapse-section"
    :class="[
      joined !== 'none' ? `join-${joined}` : 'join-standalone',
      { expanded },
    ]"
  >
    <button class="collapse-head" type="button" @click="toggle">
      <span v-if="$slots.icon" class="collapse-icon">
        <slot name="icon"/>
      </span>

      <span class="collapse-title">
        <span class="collapse-title__main">{{ title }}</span>
        <span v-if="description" class="collapse-title__desc">{{ description }}</span>
      </span>

      <span v-if="$slots.badge" class="collapse-badge">
        <slot name="badge"/>
      </span>

      <DwIcon class="collapse-chevron" name="chevron-right" size="sm" :stroke-width="2.25"/>
    </button>

    <div class="collapse-body-wrap" :class="{ open: expanded }">
      <div class="collapse-body">
        <slot/>
      </div>
    </div>
  </section>
</template>

<style scoped>
.collapse-section.join-standalone {
  border: 1px solid var(--dw-panel-outline, var(--dw-border-light));
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg);
  box-shadow: var(--dw-shadow-xs);
  overflow: hidden;
  transition: var(--dw-transition-shadow);
}

.collapse-section.join-standalone.expanded {
  border-color: color-mix(in srgb, var(--dw-primary) 18%, var(--dw-panel-outline, var(--dw-border-light)));
  box-shadow: var(--dw-shadow-md);
}

.collapse-section.join-top,
.collapse-section.join-middle,
.collapse-section.join-bottom,
.collapse-section.join-single {
  border: 1px solid var(--dw-panel-outline, var(--dw-border-light));
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg);
  overflow: hidden;
}

.collapse-section.join-top {
  border-radius: var(--dw-panel-radius) var(--dw-panel-radius) 0 0;
}

.collapse-section.join-middle {
  border-radius: 0;
  border-top: none;
}

.collapse-section.join-bottom {
  border-radius: 0 0 var(--dw-panel-radius) var(--dw-panel-radius);
  border-top: none;
}

.collapse-head {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-md);
  width: 100%;
  min-height: var(--dw-density-lg);
  padding: var(--dw-space-4) var(--dw-space-6);
  border: none;
  background: transparent;
  color: var(--dw-text);
  text-align: left;
  cursor: pointer;
  transition: background var(--dw-duration-fast) var(--dw-ease);
}

.collapse-head:hover {
  background: var(--dw-bg-hover);
}

.collapse-section.expanded .collapse-head {
  background: var(--dw-bg-panel);
}

.collapse-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 30px;
  height: var(--dw-control-h-sm);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-muted);
  color: var(--dw-text-secondary);
  transition: background var(--dw-duration) var(--dw-ease), color var(--dw-duration) var(--dw-ease);
}

.collapse-section.expanded .collapse-icon {
  background: var(--dw-primary-soft);
  color: var(--dw-primary);
}

.collapse-title {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--dw-space-1);
  min-width: 0;
}

.collapse-title__main {
  font-size: var(--dw-text-md);
  font-weight: 600;
  line-height: var(--dw-leading-tight);
}

.collapse-title__desc {
  font-size: var(--dw-text-xs);
  font-weight: 400;
  color: var(--dw-text-muted);
  line-height: var(--dw-leading-snug);
}

.collapse-badge {
  flex-shrink: 0;
}

.collapse-chevron {
  flex-shrink: 0;
  color: var(--dw-text-secondary);
  opacity: 0.9;
  transition: transform var(--dw-duration-slow) var(--dw-ease), opacity 0.15s ease, color 0.15s ease;
}

.collapse-section.expanded .collapse-chevron {
  transform: rotate(90deg);
  opacity: 1;
  color: var(--dw-primary);
}

.collapse-body-wrap {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}

.collapse-body-wrap.open {
  grid-template-rows: 1fr;
}

.collapse-body {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-md);
  min-height: 0;
  overflow: hidden;
  padding: 0 var(--dw-space-6);
  transition: padding 0.22s ease;
}

.collapse-body-wrap.open .collapse-body {
  padding: var(--dw-space-5) var(--dw-space-6) var(--dw-space-6);
  border-top: 1px solid var(--dw-panel-outline, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-bg-muted) 55%, var(--dw-bg));
}
</style>
