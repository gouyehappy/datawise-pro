<script setup lang="ts">
import {computed} from 'vue'
import {useHintShortcutsPopover} from '@sql-editor/composables/useHintShortcutsPopover'
import {useSqlEditorI18n} from '@sql-editor/composables/useSqlEditorI18n'
import {resolveEditorUiTone} from '@sql-editor/utils/editor-ui-tone'
import HintBarShortcutsPopover from './HintBarShortcutsPopover.vue'
import type {HintShortcutItem} from '@sql-editor/types'

const props = defineProps<{
  shortcutItems: HintShortcutItem[]
  theme?: string
}>()

const {t} = useSqlEditorI18n()
const uiTone = computed(() => resolveEditorUiTone(props.theme))

const INLINE_SHORT_LABEL_KEY: Record<string, string> = {
  format_selection: 'shortcut.format_selection_short',
  delete_line: 'shortcut.delete_line_short',
  toggle_comment: 'shortcut.toggle_comment_short',
}

const {
  shortcutsVisible,
  shortcutsRootRef,
  panelPos,
  inlineShortcuts,
  restShortcuts,
  restShortcutCount,
  openShortcuts,
  scheduleClose,
  keepShortcutsOpen,
} = useHintShortcutsPopover(() => props.shortcutItems)

function inlineShortcutLabel(item: HintShortcutItem): string {
  const key = INLINE_SHORT_LABEL_KEY[item.id]
  if (key) {
    const translated = t(key as Parameters<typeof t>[0])
    if (translated !== key) return translated
  }
  return item.label
}
</script>

<template>
  <div
      ref="shortcutsRootRef"
      class="hint-shortcuts-wrap"
      :class="{ 'is-active': shortcutsVisible, 'has-more': restShortcutCount() > 0 }"
      @mouseenter="openShortcuts"
      @mouseleave="scheduleClose"
  >
    <span class="hint-shortcuts-inline" :aria-label="t('hintbar.shortcuts_title')">
      <span
          v-for="item in inlineShortcuts()"
          :key="item.id"
          class="hint-shortcut-inline-item"
          :title="item.label"
      >
        <kbd class="hint-shortcut-inline-key">{{ item.keys }}</kbd>
        <span class="hint-shortcut-inline-label">{{ inlineShortcutLabel(item) }}</span>
      </span>
      <span
          v-if="restShortcutCount()"
          class="hint-shortcuts-more"
          :title="t('hintbar.shortcuts_more')"
      >+{{ restShortcutCount() }}</span>
    </span>
    <HintBarShortcutsPopover
        :visible="shortcutsVisible"
        :panel-pos="panelPos"
        :ui-tone="uiTone"
        :rest-shortcuts="restShortcuts()"
        @mouseenter="keepShortcutsOpen"
        @mouseleave="scheduleClose"
    />
  </div>
</template>

<style scoped>
.hint-shortcuts-wrap {
  position: relative;
  flex-shrink: 0;
}

.hint-shortcuts-wrap.has-more {
  cursor: help;
}

.hint-shortcuts-inline {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  max-width: min(420px, 42vw);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  cursor: default;
}

.hint-shortcuts-inline::-webkit-scrollbar {
  display: none;
}

.hint-shortcut-inline-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  box-sizing: border-box;
  height: 18px;
  padding: 0 6px 0 4px;
  border-radius: 4px;
  flex-shrink: 0;
  color: var(--dw-text-secondary, #555);
  background: var(--dw-bg-muted, rgba(0, 0, 0, 0.05));
  border: 1px solid var(--dw-border-light, rgba(0, 0, 0, 0.08));
  transition: color 0.12s ease, border-color 0.12s ease, background 0.12s ease;
}

.hint-shortcut-inline-key {
  display: inline-flex;
  align-items: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  color: inherit;
  background: transparent;
  border: none;
  padding: 0;
}

.hint-shortcut-inline-label {
  font-size: 9px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  color: var(--dw-text-muted, #777);
}

.hint-shortcuts-wrap:hover .hint-shortcut-inline-item,
.hint-shortcuts-wrap.is-active .hint-shortcut-inline-item {
  color: var(--dw-accent, #0969da);
  border-color: color-mix(in srgb, var(--dw-accent, #0969da) 28%, transparent);
  background: color-mix(in srgb, var(--dw-accent, #0969da) 8%, var(--dw-bg-muted, #f6f8fa));
}

.hint-shortcuts-wrap:hover .hint-shortcut-inline-label,
.hint-shortcuts-wrap.is-active .hint-shortcut-inline-label {
  color: color-mix(in srgb, var(--dw-accent, #0969da) 72%, var(--dw-text-muted, #777));
}

.hint-shortcuts-more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  color: var(--dw-text-muted, #888);
  background: var(--dw-bg-muted, rgba(0, 0, 0, 0.04));
  border: 1px dashed var(--dw-border-light, rgba(0, 0, 0, 0.12));
  flex-shrink: 0;
}

.hint-shortcuts-wrap:hover .hint-shortcuts-more,
.hint-shortcuts-wrap.is-active .hint-shortcuts-more {
  color: var(--dw-accent, #0969da);
  border-color: color-mix(in srgb, var(--dw-accent, #0969da) 35%, transparent);
}
</style>
