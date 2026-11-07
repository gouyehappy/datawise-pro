<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'

const props = defineProps<{
  title: string
  subtitle?: string
  position: 'top' | 'bottom'
  active: boolean
  icon: 'history' | 'database'
}>()

const emit = defineEmits<{ activate: [] }>()

const {t} = useI18n()

const actionLabel = computed(() =>
    props.active ? t('ai.sidePanel.current') : t('ai.sidePanel.switchTo', {title: props.title}),
)
</script>

<template>
  <section
      class="stack-section"
      :class="[
      `stack-section--${position}`,
      { 'is-active': active, 'is-collapsed': !active },
    ]"
  >
    <button
        class="stack-section__head"
        type="button"
        :aria-expanded="active"
        :aria-current="active ? 'true' : undefined"
        :title="actionLabel"
        @click="emit('activate')"
    >
      <span class="stack-section__accent" aria-hidden="true"/>
      <span class="stack-section__icon" aria-hidden="true">
        <DwIcon v-if="icon === 'history'" name="history" size="sm" :stroke-width="1.6"/>
        <DwIcon v-else name="database" size="sm" :stroke-width="1.6"/>
      </span>

      <span class="stack-section__titles">
        <span class="stack-section__label">{{ t('ai.sidePanel.sectionLabel') }}</span>
        <span class="stack-section__title">{{ title }}</span>
        <span v-if="subtitle && active" class="stack-section__subtitle">{{ subtitle }}</span>
      </span>

      <span v-if="$slots.badge" class="stack-section__badge">
        <slot name="badge"/>
      </span>

      <DwIcon class="stack-section__chevron" name="chevron-down" size="sm" :stroke-width="1.5"/>
    </button>

    <div v-show="active" class="stack-section__body">
      <slot/>
    </div>
  </section>
</template>

<style scoped>
.stack-section {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.stack-section--top.is-collapsed {
  flex: 0 0 auto;
}

.stack-section--top.is-active {
  flex: 1 1 0;
  min-height: 0;
}

.stack-section--bottom.is-collapsed {
  flex: 0 0 auto;
}

.stack-section--bottom.is-active {
  flex: 1 1 0;
  min-height: 0;
}

.stack-section__head {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
  flex-shrink: 0;
  width: 100%;
  min-height: var(--dw-density-lg);
  padding: var(--dw-space-4) var(--dw-space-5) var(--dw-space-4) var(--dw-space-6);
  border: none;
  border-bottom: 1px solid var(--dw-border-light);
  background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--dw-bg-panel) 92%, var(--dw-bg)) 0%,
      color-mix(in srgb, var(--dw-bg-panel) 78%, var(--dw-bg-muted)) 100%
  );
  color: var(--dw-text);
  text-align: left;
  cursor: pointer;
  transition: var(--dw-transition-colors),
  box-shadow 0.15s ease;
}

.stack-section.is-active .stack-section__head {
  border-bottom-color: color-mix(in srgb, var(--dw-primary) 22%, var(--dw-border-light));
  background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--dw-primary-soft) 70%, var(--dw-bg-panel)) 0%,
      color-mix(in srgb, var(--dw-primary-soft) 35%, var(--dw-bg-panel)) 100%
  );
  box-shadow: var(--dw-surface-inset-highlight);
}

.stack-section.is-collapsed .stack-section__head {
  border-bottom-color: transparent;
}

.stack-section.is-collapsed .stack-section__head:hover {
  background: var(--dw-bg-hover);
}

.stack-section__accent {
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 0 var(--dw-control-radius-sm) var(--dw-control-radius-sm) 0;
  background: color-mix(in srgb, var(--dw-text-muted) 35%, transparent);
  transition: background var(--dw-duration) var(--dw-ease) ease, box-shadow 0.15s ease;
}

.stack-section.is-active .stack-section__accent {
  background: var(--dw-primary);
  box-shadow: 0 0 8px color-mix(in srgb, var(--dw-primary) 45%, transparent);
}

.stack-section__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: var(--dw-btn-height);
  border-radius: var(--dw-control-radius);
  border: 1px solid var(--dw-border-light);
  background: var(--dw-bg);
  color: var(--dw-text-secondary);
  transition: var(--dw-transition-colors),
  color 0.15s ease;
}

.stack-section.is-active .stack-section__icon {
  border-color: color-mix(in srgb, var(--dw-primary) 30%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-primary-soft) 80%, var(--dw-on-accent));
  color: var(--dw-primary);
}

.stack-section__titles {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.stack-section__label {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  line-height: var(--dw-leading-tight);
}

.stack-section__title {
  font-size: var(--dw-text-sm);
  font-weight: 600;
  line-height: var(--dw-leading-tight);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stack-section__subtitle {
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-snug);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stack-section__badge {
  flex-shrink: 0;
}

.stack-section__chevron {
  flex-shrink: 0;
  color: var(--dw-text-muted);
  transition: transform 0.18s ease, color 0.12s ease;
}

.stack-section.is-active .stack-section__chevron {
  color: var(--dw-primary);
}

.stack-section.is-collapsed .stack-section__chevron {
  transform: rotate(-90deg);
}

.stack-section__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.stack-section__body :deep(.dw-side-panel) {
  flex: 1;
  min-height: 0;
}
</style>
