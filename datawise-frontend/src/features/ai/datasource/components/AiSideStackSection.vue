<!--
  AI 侧栏的可折叠分段：两段各自独立展开/收起，不再互斥。
  理由：选完范围想回头看历史是高频动作，互斥切换会把它变成两次点击。
-->
<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'

const props = defineProps<{
  title: string
  subtitle?: string
  position: 'top' | 'bottom'
  expanded: boolean
  icon: 'history' | 'database'
}>()

const emit = defineEmits<{ toggle: [] }>()

const {t} = useI18n()

const actionLabel = computed(() =>
    props.expanded
        ? t('ai.sidePanel.collapse', {title: props.title})
        : t('ai.sidePanel.expand', {title: props.title}),
)
</script>

<template>
  <section
      class="stack-section"
      :class="[
      `stack-section--${position}`,
      { 'is-expanded': expanded, 'is-collapsed': !expanded },
    ]"
  >
    <button
        class="stack-section__head"
        type="button"
        :aria-expanded="expanded"
        :title="actionLabel"
        @click="emit('toggle')"
    >
      <span class="stack-section__icon" aria-hidden="true">
        <DwIcon :name="icon" size="sm" :stroke-width="1.7"/>
      </span>

      <span class="stack-section__titles">
        <span class="stack-section__title">{{ title }}</span>
        <span v-if="subtitle && expanded" class="stack-section__subtitle">{{ subtitle }}</span>
      </span>

      <span v-if="$slots.badge" class="stack-section__badge">
        <slot name="badge"/>
      </span>

      <DwIcon class="stack-section__chevron" name="chevron-down" size="sm" :stroke-width="1.5"/>
    </button>

    <div v-show="expanded" class="stack-section__body">
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

.stack-section.is-collapsed {
  flex: 0 0 auto;
}

.stack-section.is-expanded {
  flex: 1 1 0;
  min-height: 0;
}

.stack-section__head {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
  flex-shrink: 0;
  width: 100%;
  min-height: 42px;
  padding: var(--dw-space-3) var(--dw-space-5);
  border: none;
  border-bottom: 1px solid var(--dw-border-light);
  background: var(--dw-bg-panel);
  color: var(--dw-text);
  text-align: left;
  cursor: pointer;
  transition: background var(--dw-duration-fast) var(--dw-ease);
}

.stack-section__head:hover {
  background: var(--dw-bg-hover);
}

.stack-section.is-collapsed .stack-section__head {
  border-bottom-color: transparent;
}

.stack-section__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  color: var(--dw-text-muted);
  transition: color var(--dw-duration-fast) var(--dw-ease);
}

.stack-section.is-expanded .stack-section__icon {
  color: var(--dw-primary);
}

.stack-section__titles {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
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
