<script setup lang="ts">
import {useSqlEditorI18n} from '@sql-editor/composables/useSqlEditorI18n'
import HintBarShortcuts from '@sql-editor/components/hint-bar/HintBarShortcuts.vue'
import type {HintShortcutItem} from '@sql-editor/types'

defineProps<{
  tableCount?: number
  columnCount?: number
  loading?: boolean
  shortcutItems: HintShortcutItem[]
  showSettings?: boolean
  showHide?: boolean
  theme?: string
}>()

const emit = defineEmits<{
  'open-settings': []
  'hide-hint-bar': []
}>()

const {t} = useSqlEditorI18n()
</script>

<template>
  <div class="hint-trailing">
    <span v-if="tableCount || columnCount" class="hint-meta">
      <template v-if="tableCount">{{ t('hintbar.tables', {count: tableCount}) }}</template>
      <template v-if="tableCount && columnCount"> · </template>
      <template v-if="columnCount">{{ t('hintbar.cols', {count: columnCount}) }}</template>
    </span>
    <span v-if="loading" class="hint-loading">{{ t('hintbar.schema_loading') }}</span>
    <HintBarShortcuts
        v-if="shortcutItems.length"
        :shortcut-items="shortcutItems"
        :theme="theme"
    />
    <button
        v-if="showHide"
        type="button"
        class="hint-settings-btn hint-settings-btn--raised"
        :title="t('hintbar.hide_bar')"
        :aria-label="t('hintbar.hide_bar')"
        @click.stop="emit('hide-hint-bar')"
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d="M4 10.5 8 6.5 12 10.5" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <button
        v-if="showSettings"
        type="button"
        class="hint-settings-btn hint-settings-btn--raised"
        :title="t('hintbar.open_settings')"
        :aria-label="t('hintbar.open_settings')"
        @click.stop="emit('open-settings')"
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
            fill="currentColor"
            d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"
        />
        <path
            fill="currentColor"
            d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319z"
        />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.hint-trailing {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-left: auto;
}

.hint-settings-btn {
  position: relative;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--dw-border-light, rgba(0, 0, 0, 0.08));
  border-radius: 5px;
  background: var(--dw-bg-muted, rgba(0, 0, 0, 0.04));
  color: var(--dw-text-muted, #777);
  cursor: pointer;
  flex-shrink: 0;
  transition: color 0.12s, background 0.12s, border-color 0.12s;
}

.hint-settings-btn:hover {
  color: var(--dw-accent, #0969da);
  background: color-mix(in srgb, var(--dw-accent, #0969da) 10%, transparent);
  border-color: color-mix(in srgb, var(--dw-accent, #0969da) 22%, transparent);
}

.hint-loading {
  color: var(--dw-accent, #0969da);
}

.hint-meta,
.hint-loading {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.9;
  max-width: 88px;
}

@media (max-width: 1100px) {
  .hint-meta {
    display: none;
  }
}
</style>
