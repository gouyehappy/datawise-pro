<script setup lang="ts">
/**
 * Compact label + edit control (dbx-style split chip).
 * Left label is display-only; only the pencil segment is interactive.
 */
defineProps<{
  label: string
  editTitle?: string
  editAriaLabel?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  edit: [event: MouseEvent]
}>()
</script>

<template>
  <div class="dw-editable-chip" :class="{'is-disabled': disabled}">
    <div class="dw-editable-chip__main">
      <span v-if="$slots.leading" class="dw-editable-chip__leading">
        <slot name="leading"/>
      </span>
      <span class="dw-editable-chip__label" :title="label">{{ label }}</span>
    </div>
    <span class="dw-editable-chip__divider" aria-hidden="true"/>
    <button
        type="button"
        class="dw-editable-chip__edit"
        :disabled="disabled"
        :title="editTitle"
        :aria-label="editAriaLabel || editTitle || undefined"
        @click="emit('edit', $event)"
    >
      <slot name="edit-icon">
        <span class="dw-editable-chip__edit-glyph" aria-hidden="true"/>
      </slot>
    </button>
  </div>
</template>

<style scoped>
.dw-editable-chip {
  display: inline-flex;
  align-items: stretch;
  min-width: 0;
  max-width: min(100%, 16rem);
  height: var(--dw-btn-height-sm, 32px);
  min-height: var(--dw-btn-height-sm, 32px);
  border-radius: var(--dw-btn-radius, var(--dw-control-radius-sm, 6px));
  border: 1px solid var(--dw-border-subtle, var(--dw-border));
  background: color-mix(in srgb, var(--dw-text) 3.5%, var(--dw-surface));
  overflow: hidden;
  box-sizing: border-box;
}

.dw-editable-chip.is-disabled {
  opacity: 0.55;
  pointer-events: none;
}

.dw-editable-chip__main {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
  padding: 0 8px;
  color: var(--dw-text);
  /* Plain text — no button chrome / cursor */
  cursor: default;
  user-select: none;
}

.dw-editable-chip__leading {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
}

.dw-editable-chip__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--dw-font-size-btn-sm, var(--dw-text-sm));
  font-weight: 550;
  line-height: 1;
}

.dw-editable-chip__divider {
  width: 1px;
  margin: 5px 0;
  background: color-mix(in srgb, var(--dw-text) 14%, transparent);
  flex-shrink: 0;
}

.dw-editable-chip__edit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--dw-btn-height-sm, 32px);
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--dw-text-secondary);
  cursor: pointer;
}

.dw-editable-chip__edit:hover {
  color: var(--dw-text);
  background: color-mix(in srgb, var(--dw-text) 8%, transparent);
}

.dw-editable-chip__edit:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--dw-accent, #3b82f6) 55%, transparent);
  outline-offset: -2px;
}

.dw-editable-chip__edit-glyph {
  width: 13px;
  height: 13px;
  background: currentColor;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 20h9'/%3E%3Cpath d='M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z'/%3E%3C/svg%3E")
    center / contain no-repeat;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 20h9'/%3E%3Cpath d='M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z'/%3E%3C/svg%3E")
    center / contain no-repeat;
}
</style>
>
