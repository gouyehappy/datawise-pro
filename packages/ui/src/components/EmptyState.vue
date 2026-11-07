<script setup lang="ts">
withDefaults(defineProps<{
    title: string
    hint?: string
    compact?: boolean
    /** 卡片/列表内嵌空态，无最小高度 */
    embedded?: boolean
    /** 虚线边框（快捷面板等紧凑区域） */
    bordered?: boolean
    /** centered = default; inline = horizontal row; hero = taller showcase */
    layout?: 'centered' | 'inline' | 'hero'
}>(), {
    compact: false,
    embedded: false,
    bordered: false,
    layout: 'centered',
})
</script>

<template>
  <div
      class="dw-empty"
      :class="{
        'dw-empty--compact': compact,
        'dw-empty--embedded': embedded,
        'dw-empty--bordered': bordered,
        'dw-empty--inline': layout === 'inline',
        'dw-empty--hero': layout === 'hero',
      }"
  >
    <div v-if="$slots.icon" class="dw-empty__icon" aria-hidden="true">
      <slot name="icon"/>
    </div>
    <div class="dw-empty__body">
      <p>{{ title }}</p>
      <span v-if="hint || $slots.hint">
        <slot name="hint">{{ hint }}</slot>
      </span>
      <div v-if="$slots.actions" class="dw-empty__actions">
        <slot name="actions"/>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dw-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--dw-gap-sm);
    min-height: 180px;
    padding: var(--dw-space-10) var(--dw-space-8);
    text-align: center;
}

.dw-empty__body {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--dw-gap-sm);
    min-width: 0;
}

.dw-empty__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--dw-density-xl);
    height: var(--dw-density-xl);
    margin-bottom: var(--dw-space-2);
    border-radius: var(--dw-panel-radius);
    background: var(--dw-bg-muted);
    color: var(--dw-text-muted);
}

.dw-empty p {
    margin: 0;
    font-size: var(--dw-text-md);
    font-weight: 600;
    color: var(--dw-text-secondary);
}

.dw-empty span {
    max-width: 220px;
    color: var(--dw-text-muted);
    font-size: var(--dw-text-sm);
    line-height: var(--dw-leading-relaxed);
}

.dw-empty__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: var(--dw-gap-sm);
    margin-top: var(--dw-space-2);
    max-width: 280px;
}

.dw-empty--compact {
    min-height: 120px;
    padding: var(--dw-space-8) var(--dw-space-6);
}

.dw-empty--embedded {
    min-height: 0;
    padding: var(--dw-space-9) var(--dw-space-8);
    align-items: stretch;
}

.dw-empty--embedded .dw-empty__body {
    align-items: stretch;
}

.dw-empty--embedded p {
    font-weight: 400;
    color: var(--dw-text-muted);
}

.dw-empty--bordered {
    border: 1px dashed var(--dw-border-light);
    border-radius: var(--dw-panel-radius);
    padding: var(--dw-space-6);
    min-height: 0;
}

.dw-empty--bordered p {
    font-size: var(--dw-text-sm);
    font-weight: 400;
    color: var(--dw-text-muted);
}

.dw-empty--inline {
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: var(--dw-gap-md);
    min-height: 0;
    padding: var(--dw-space-5) var(--dw-space-6);
    text-align: left;
}

.dw-empty--inline .dw-empty__icon {
    margin-bottom: 0;
    width: var(--dw-density-lg);
    height: var(--dw-density-lg);
    flex-shrink: 0;
}

.dw-empty--inline .dw-empty__body {
    align-items: flex-start;
    flex: 1 1 auto;
}

.dw-empty--inline span {
    max-width: 36rem;
}

.dw-empty--inline .dw-empty__actions {
    justify-content: flex-start;
    max-width: none;
}

.dw-empty--hero {
    min-height: 260px;
    padding: var(--dw-space-12, var(--dw-space-10)) var(--dw-space-8);
    gap: var(--dw-gap-md);
}

.dw-empty--hero .dw-empty__icon {
    width: calc(var(--dw-density-xl) + 12px);
    height: calc(var(--dw-density-xl) + 12px);
    margin-bottom: var(--dw-space-3);
}

.dw-empty--hero p {
    font-size: var(--dw-text-lg, var(--dw-text-md));
}

.dw-empty--hero span {
    max-width: 28rem;
    font-size: var(--dw-text-md);
}
</style>
