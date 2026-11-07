<script setup lang="ts">
import {presentSnippet} from '@sql-editor/completion/snippet-presentation'
import {useSqlEditorI18n} from '@sql-editor/composables/useSqlEditorI18n'
import type {SqlQuickAction} from '@sql-editor/types'

defineProps<{
  actions: SqlQuickAction[]
}>()

const emit = defineEmits<{
  action: [action: SqlQuickAction]
}>()

const {t, locale} = useSqlEditorI18n()

function chipClass(action: SqlQuickAction): string {
  if (action.aiAction) return 'chip-ai'
  if (action.kind === 'keyword') return 'chip-keyword'
  if (action.snippet) return 'chip-snippet'
  return 'chip-text'
}

function chipTitle(action: SqlQuickAction): string {
  if (action.snippet) {
    return presentSnippet(
        {label: action.label, insertText: action.insertText},
        locale.value,
        '',
    ).tooltip
  }
  if (action.titleKey) {
    const key = action.titleKey as Parameters<typeof t>[0]
    const translated = t(key)
    if (translated !== key) return translated
  }
  return action.label
}
</script>

<template>
  <div class="hint-quick">
    <span class="hint-quick-label">{{ t('hintbar.quick') }}</span>
    <button
        v-for="action in actions"
        :key="action.id"
        type="button"
        class="hint-chip"
        :class="chipClass(action)"
        :title="chipTitle(action)"
        @click="emit('action', action)"
    >{{ action.label }}
    </button>
  </div>
</template>

<style scoped>
.hint-quick {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  max-width: min(240px, 28vw);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.hint-quick::-webkit-scrollbar {
  display: none;
}

.hint-quick-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.65;
}

.hint-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 28px;
  height: 20px;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
  white-space: nowrap;
  flex-shrink: 0;
}

.chip-keyword {
  color: #c2410c;
  background: color-mix(in srgb, #ea580c 10%, transparent);
  border-color: color-mix(in srgb, #ea580c 22%, transparent);
}

.chip-snippet {
  color: #1d4ed8;
  background: color-mix(in srgb, #2563eb 10%, transparent);
  border-color: color-mix(in srgb, #2563eb 20%, transparent);
}

.chip-text {
  color: var(--dw-text-secondary, #555);
  background: var(--dw-bg-muted, rgba(0, 0, 0, 0.04));
  border-color: var(--dw-border-light, rgba(0, 0, 0, 0.08));
}

.chip-ai {
  color: #6d28d9;
  background: color-mix(in srgb, #7c3aed 10%, transparent);
  border-color: color-mix(in srgb, #7c3aed 24%, transparent);
}

.hint-chip:hover {
  filter: brightness(0.96);
}
</style>
