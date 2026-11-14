<script setup lang="ts">
import {useI18n} from 'vue-i18n'

defineProps<{
  label: string
  visible: boolean
}>()

const emit = defineEmits<{
  dismiss: []
  apply: []
}>()

const {t} = useI18n()
</script>

<template>
  <div v-if="visible" class="focus-hint" role="status">
    <span class="focus-hint__text">
      {{ t('ai.workbenchFocus.banner', {label}) }}
    </span>
    <div class="focus-hint__actions">
      <button type="button" class="focus-hint__link" @click="emit('apply')">
        {{ t('ai.workbenchFocus.reapply') }}
      </button>
      <button
          type="button"
          class="focus-hint__dismiss"
          :aria-label="t('common.close')"
          @click="emit('dismiss')"
      >
        ×
      </button>
    </div>
  </div>
</template>

<style scoped>
.focus-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  padding: 4px 4px 4px 12px;
  font-size: var(--dw-text-xs);
  line-height: 1.4;
  color: var(--dw-text-muted);
}

.focus-hint__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.focus-hint__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.focus-hint__link {
  border: 0;
  background: transparent;
  color: var(--dw-link, var(--dw-primary));
  cursor: pointer;
  font-size: inherit;
  padding: 2px 6px;
}

.focus-hint__link:hover {
  text-decoration: underline;
}

.focus-hint__dismiss {
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dw-text-muted);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}

.focus-hint__dismiss:hover {
  background: color-mix(in srgb, var(--dw-text) 8%, transparent);
  color: var(--dw-text);
}
</style>
