<script setup lang="ts">
import {useSqlEditorI18n} from '@sql-editor/composables/useSqlEditorI18n'
import type {HintShortcutItem} from '@sql-editor/types'

defineProps<{
  visible: boolean
  panelPos: { top: number; left: number; placement: 'above' | 'below' }
  uiTone: string
  restShortcuts: HintShortcutItem[]
}>()

const emit = defineEmits<{
  mouseenter: []
  mouseleave: []
}>()

const {t} = useSqlEditorI18n()
</script>

<template>
  <Teleport to="body">
    <Transition name="hint-shortcuts-pop">
      <div
          v-if="visible"
          class="hint-shortcuts-anchor"
          :class="`hint-shortcuts-anchor--${panelPos.placement}`"
          :data-tone="uiTone"
          :style="{ top: `${panelPos.top}px`, left: `${panelPos.left}px` }"
          @mouseenter="emit('mouseenter')"
          @mouseleave="emit('mouseleave')"
      >
        <div
            class="hint-shortcuts-panel"
            :class="`hint-shortcuts-panel--${panelPos.placement}`"
            role="tooltip"
            :aria-label="t('hintbar.shortcuts_title')"
        >
          <div class="hint-shortcuts-panel-head">
            {{ t('hintbar.shortcuts_more') }}
          </div>
          <ul class="hint-shortcuts-list">
            <li
                v-for="item in restShortcuts"
                :key="item.id"
                class="hint-shortcuts-row"
            >
              <kbd class="hint-shortcuts-key">{{ item.keys }}</kbd>
              <span class="hint-shortcuts-label">{{ item.label }}</span>
            </li>
          </ul>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.hint-shortcuts-anchor {
  position: fixed;
  z-index: 10000;
  pointer-events: auto;
}

.hint-shortcuts-anchor--below {
  transform: translate(-100%, 0);
}

.hint-shortcuts-anchor--below::after {
  content: '';
  position: absolute;
  top: -8px;
  left: 0;
  right: 0;
  height: 8px;
}

.hint-shortcuts-anchor--above {
  transform: translate(-100%, -100%);
}

.hint-shortcuts-anchor--above::after {
  content: '';
  position: absolute;
  bottom: -8px;
  left: 0;
  right: 0;
  height: 8px;
}

.hint-shortcuts-panel {
  --hs-bg: var(--dw-bg-panel, var(--dw-bg-subtle, #f6f8fa));
  --hs-border: var(--dw-border-light, rgba(0, 0, 0, 0.08));
  --hs-text: var(--dw-text, #333);
  --hs-text-muted: var(--dw-text-muted, #888);
  --hs-head: var(--dw-text-secondary, #666);
  --hs-key-bg: color-mix(in srgb, var(--hs-bg) 88%, var(--hs-text) 12%);
  --hs-key-border: var(--dw-border-light, rgba(0, 0, 0, 0.1));
  --hs-row-hover: color-mix(in srgb, var(--dw-accent, #0969da) 7%, transparent);
  --hs-shadow: var(--dw-menu-shadow, 0 4px 16px rgba(15, 23, 42, 0.1));

  position: relative;
  min-width: 220px;
  max-width: min(300px, 90vw);
  padding: 0 0 4px;
  border-radius: 8px;
  background: var(--hs-bg);
  border: 1px solid var(--hs-border);
  box-shadow: var(--hs-shadow);
  overflow: hidden;
}

.hint-shortcuts-anchor[data-tone='dark'] .hint-shortcuts-panel {
  --hs-bg: #2d2d30;
  --hs-border: #454545;
  --hs-text: #cccccc;
  --hs-text-muted: #9d9d9d;
  --hs-head: #858585;
  --hs-key-bg: #3c3c3c;
  --hs-key-border: #505050;
  --hs-row-hover: rgba(255, 255, 255, 0.05);
  --hs-shadow: 0 8px 22px rgba(0, 0, 0, 0.5);
}

.hint-shortcuts-panel-head {
  padding: 7px 10px 6px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--hs-head);
  background: color-mix(in srgb, var(--hs-bg) 92%, var(--hs-text) 8%);
  border-bottom: 1px solid var(--hs-border);
}

.hint-shortcuts-panel--below::before,
.hint-shortcuts-panel--above::before {
  content: '';
  position: absolute;
  right: 14px;
  width: 7px;
  height: 7px;
  background: var(--hs-bg);
  border: 1px solid var(--hs-border);
  transform: rotate(45deg);
  pointer-events: none;
}

.hint-shortcuts-panel--below::before {
  top: -4px;
  border-right: none;
  border-bottom: none;
}

.hint-shortcuts-panel--above::before {
  bottom: -4px;
  border-left: none;
  border-top: none;
}

.hint-shortcuts-list {
  list-style: none;
  margin: 0;
  padding: 4px 6px 6px;
  max-height: min(220px, 45vh);
  overflow-y: auto;
}

.hint-shortcuts-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 6px;
  border-radius: 5px;
}

.hint-shortcuts-row:hover {
  background: var(--hs-row-hover);
}

.hint-shortcuts-key {
  flex-shrink: 0;
  min-width: 88px;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9px;
  font-weight: 600;
  line-height: 1.35;
  text-align: center;
  white-space: nowrap;
  color: var(--hs-text);
  background: var(--hs-key-bg);
  border: 1px solid var(--hs-key-border);
}

.hint-shortcuts-label {
  flex: 1;
  min-width: 0;
  font-size: 10px;
  line-height: 1.35;
  color: var(--hs-text-muted);
}

.hint-shortcuts-pop-enter-active,
.hint-shortcuts-pop-leave-active {
  transition: opacity 0.14s ease;
}

.hint-shortcuts-pop-enter-active .hint-shortcuts-panel,
.hint-shortcuts-pop-leave-active .hint-shortcuts-panel {
  transition: transform 0.14s ease, opacity 0.14s ease;
}

.hint-shortcuts-pop-enter-from,
.hint-shortcuts-pop-leave-to {
  opacity: 0;
}

.hint-shortcuts-anchor--below.hint-shortcuts-pop-enter-from .hint-shortcuts-panel,
.hint-shortcuts-anchor--below.hint-shortcuts-pop-leave-to .hint-shortcuts-panel {
  transform: translateY(-4px);
  opacity: 0;
}

.hint-shortcuts-anchor--above.hint-shortcuts-pop-enter-from .hint-shortcuts-panel,
.hint-shortcuts-anchor--above.hint-shortcuts-pop-leave-to .hint-shortcuts-panel {
  transform: translateY(4px);
  opacity: 0;
}
</style>
