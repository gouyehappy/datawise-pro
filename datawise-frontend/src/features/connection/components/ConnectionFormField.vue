<script setup lang="ts">
import {provide} from 'vue'

defineProps<{
  label?: string
  hint?: string
  /** Field-level validation message; shown instead of hint when set. */
  error?: string
  inputId?: string
  wide?: boolean
  required?: boolean
}>()

/** SettingsSelect menus inside connection fields match the trigger (no left overhang). */
provide('dw-select-match-trigger', true)
</script>

<template>
  <div class="conn-form-field" :class="{ 'conn-form-field--wide': wide, 'conn-form-field--error': !!error }">
    <label v-if="label" :for="inputId">
      {{ label }}<span v-if="required" class="conn-form-field__req" aria-hidden="true">*</span>
    </label>
    <div class="conn-form-field__control">
      <slot/>
    </div>
    <p v-if="error" class="conn-form-field__error" role="alert">{{ error }}</p>
    <p v-else-if="hint" class="conn-form-field__hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.conn-form-field {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-sm);
  min-width: 0;
}

.conn-form-field label {
  font-size: var(--dw-text-sm);
  font-weight: 600;
  color: var(--dw-text);
  line-height: var(--dw-leading-tight);
}

.conn-form-field__req {
  margin-left: 2px;
  color: var(--dw-danger);
  font-weight: 700;
}

.conn-form-field__control {
  width: 100%;
  min-width: 0;
}

/*
 * SettingsSelect defaults to size=settings (hug content). Inside connection
 * fields stretch to the grid cell so env/storage and host/port stay aligned.
 */
.conn-form-field__control :deep(.dw-select-host),
.conn-form-field__control :deep(.dw-select) {
  width: 100%;
  max-width: none;
}

.conn-form-field__control :deep(.dw-select__trigger) {
  width: 100%;
  box-sizing: border-box;
}

.conn-form-field__control :deep(.dw-select__value) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conn-form-field__hint {
  margin: 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
}

.conn-form-field__error {
  margin: 0;
  color: var(--dw-danger, #c62828);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
}

.conn-form-field--wide {
  grid-column: 1 / -1;
}
</style>
