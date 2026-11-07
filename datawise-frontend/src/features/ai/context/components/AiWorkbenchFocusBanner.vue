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
  <div v-if="visible" class="focus-banner" role="status">
    <span class="focus-banner__text">
      {{ t('ai.workbenchFocus.banner', {label}) }}
    </span>
    <div class="focus-banner__actions">
      <button type="button" class="focus-banner__btn" @click="emit('apply')">
        {{ t('ai.workbenchFocus.reapply') }}
      </button>
      <button type="button" class="focus-banner__btn focus-banner__btn--ghost" @click="emit('dismiss')">
        {{ t('common.close') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.focus-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  padding: 8px 12px;
  border-radius: var(--dw-radius-md, 8px);
  border: 1px solid color-mix(in srgb, var(--dw-accent, #3b82f6) 35%, var(--dw-border, #333));
  background: color-mix(in srgb, var(--dw-accent, #3b82f6) 12%, var(--dw-bg-panel, #1a1a1a));
  font-size: var(--dw-text-sm);
  line-height: 1.4;
}

.focus-banner__text {
  min-width: 0;
  color: var(--dw-text, #e8e8e8);
}

.focus-banner__actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.focus-banner__btn {
  border: 1px solid var(--dw-border, #444);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: var(--dw-text-xs);
  cursor: pointer;
  background: var(--dw-accent, #3b82f6);
  color: #fff;
  border-color: transparent;
}

.focus-banner__btn--ghost {
  background: transparent;
  color: inherit;
  border-color: var(--dw-border, #444);
}
</style>
