<script setup lang="ts">
import {DwCheckbox} from '@/core/components'

const model = defineModel<boolean>({required: true})

defineProps<{
  label: string
  hint?: string
  disabled?: boolean
}>()
</script>

<template>
  <div class="conn-toggle-field">
    <DwCheckbox
        v-model="model"
        :disabled="disabled"
        :label="label"
    />
    <p v-if="hint" class="conn-toggle-field__hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.conn-toggle-field {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
  min-width: 0;
}

.conn-toggle-field__hint {
  margin: 0;
  padding-left: calc(var(--dw-space-3) + 1em);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
}
</style>
