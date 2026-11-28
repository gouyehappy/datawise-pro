<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    hint?: string
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)
</script>

<template>
  <div class="settings-row" :class="{'is-disabled': disabled}">
    <div class="settings-row__copy">
      <div class="settings-row__label">{{ label }}</div>
      <div v-if="hint" class="settings-row__hint">{{ hint }}</div>
    </div>
    <div class="settings-row__control">
      <slot/>
    </div>
  </div>
</template>

<style scoped>
.settings-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: var(--dw-gap-lg);
  min-height: 0;
  padding: var(--dw-space-3) 0;
}

.settings-row__copy {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-1);
  min-width: 0;
}

.settings-row__label {
  font-size: var(--dw-text-md);
  font-weight: 600;
  color: var(--dw-text);
  line-height: var(--dw-leading-snug);
}

.settings-row__hint {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  line-height: var(--dw-leading-relaxed);
}

.settings-row__control {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  max-width: 100%;
}

.settings-row.is-disabled {
  opacity: 0.72;
  pointer-events: none;
}

@media (max-width: 640px) {
  .settings-row {
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
    row-gap: var(--dw-space-3);
  }

  .settings-row__control {
    justify-content: flex-start;
  }
}
</style>
