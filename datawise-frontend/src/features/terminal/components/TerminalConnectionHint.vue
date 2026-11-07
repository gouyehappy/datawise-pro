<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {useTerminalConnectionHint} from '@/features/terminal/composables/useTerminalConnectionHint'

const {t} = useI18n()
const {snippet, connectionLabel, visible, copyCommand} = useTerminalConnectionHint()
</script>

<template>
  <button
      v-if="snippet"
      type="button"
      class="terminal-context-hint"
      :class="{ 'is-visible': visible }"
      :title="t('terminal.contextCopyTitle')"
      @click="copyCommand"
  >
    <span class="terminal-context-hint__label">
      {{ t('terminal.contextHint', { tool: snippet.tool, name: connectionLabel }) }}
    </span>
    <code class="terminal-context-hint__cmd">{{ snippet.command }}</code>
  </button>
</template>

<style scoped>
.terminal-context-hint {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
  width: 100%;
  margin: 0;
  padding: var(--dw-space-3) var(--dw-space-5);
  border: none;
  border-top: 1px solid var(--dw-terminal-border);
  background: color-mix(in srgb, var(--dw-success) 10%, var(--dw-terminal-input-bg));
  color: color-mix(in srgb, var(--dw-success) 55%, var(--dw-terminal-fg));
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-snug);
  text-align: left;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.35s ease;
}

.terminal-context-hint.is-visible {
  opacity: 1;
}

.terminal-context-hint:hover {
  background: color-mix(in srgb, var(--dw-success) 16%, var(--dw-terminal-input-bg));
}

.terminal-context-hint__label {
  flex-shrink: 0;
  color: var(--dw-success);
  font-weight: 600;
  white-space: nowrap;
}

.terminal-context-hint__cmd {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: color-mix(in srgb, var(--dw-success) 35%, var(--dw-terminal-fg));
  font-family: var(--dw-mono);
}
</style>
