<script setup lang="ts">
import {useSqlEditorI18n} from '@sql-editor/composables/useSqlEditorI18n'

defineProps<{
  insetRight: string
}>()

const emit = defineEmits<{
  reveal: []
}>()

const {t} = useSqlEditorI18n()
</script>

<template>
  <div
      class="sql-editor-hint-reveal"
      :style="{ '--hint-reveal-inset': insetRight }"
  >
    <button
        type="button"
        class="sql-editor-hint-reveal__btn"
        :title="t('hintbar.show_bar')"
        :aria-label="t('hintbar.show_bar')"
        @click="emit('reveal')"
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d="M2.5 3.5h11" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
        <path d="M2.5 6.75h11" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
        <path d="M2.5 10h11" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
        <path d="M2.5 13.25h11" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
      </svg>
    </button>
  </div>
</template>

<style scoped>
.sql-editor-hint-reveal {
  position: absolute;
  top: 0;
  right: var(--hint-reveal-inset, 72px);
  z-index: 12;
  width: 48px;
  height: 40px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 6px 6px 0 0;
  pointer-events: auto;
}

.sql-editor-hint-reveal__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--dw-border-light, rgba(0, 0, 0, 0.08));
  border-radius: 7px;
  background: color-mix(in srgb, var(--dw-bg-panel, #fff) 92%, transparent);
  color: var(--dw-text-muted, #777);
  cursor: pointer;
  box-shadow: 0 1px 4px color-mix(in srgb, #000 8%, transparent);
  opacity: 1;
  transform: translateY(0);
  transition: color 0.12s ease, background 0.12s ease;
}

.sql-editor-hint-reveal__btn:hover {
  color: var(--dw-text, #333);
  background: var(--dw-bg-hover, rgba(0, 0, 0, 0.04));
}
</style>
