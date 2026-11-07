<script setup lang="ts">
defineProps<{
  label: string
  hint?: string
  disabled?: boolean
}>()

const model = defineModel<boolean>({required: true})
</script>

<template>
  <label class="settings-switch">
    <input v-model="model" type="checkbox" :disabled="disabled"/>
    <span class="settings-switch__body">
      <span class="settings-switch__label">{{ label }}</span>
      <span v-if="hint" class="settings-switch__hint">{{ hint }}</span>
    </span>
  </label>
</template>

<style scoped>
.settings-switch {
  display: flex;
  align-items: flex-start;
  gap: var(--dw-gap-md);
  padding: var(--dw-space-5) 0;
  cursor: pointer;
}

.settings-switch input {
  flex-shrink: 0;
  margin-top: var(--dw-space-1);
  accent-color: var(--dw-primary);
}

.settings-switch__body {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-1);
}

.settings-switch__label {
  font-size: var(--dw-text-md);
  color: var(--dw-text);
}

.settings-switch input:disabled {
  cursor: not-allowed;
}

.settings-switch:has(input:disabled) {
  cursor: not-allowed;
  opacity: 0.72;
}
</style>
