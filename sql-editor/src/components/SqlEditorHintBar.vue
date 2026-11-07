<script setup lang="ts">
import {computed} from 'vue'
import HintBarContextBadges from '@sql-editor/components/hint-bar/HintBarContextBadges.vue'
import HintBarQuickChips from '@sql-editor/components/hint-bar/HintBarQuickChips.vue'
import HintBarAliases from '@sql-editor/components/hint-bar/HintBarAliases.vue'
import HintBarTrailing from '@sql-editor/components/hint-bar/HintBarTrailing.vue'
import type {SqlEditorContextInfo, SqlQuickAction} from '@sql-editor/types'

const props = withDefaults(
    defineProps<{
      contextInfo: SqlEditorContextInfo
      statementLabel: string
      dialectLabel?: string
      loading?: boolean
      theme?: string
      showSettings?: boolean
      showHide?: boolean
    }>(),
    {
      showSettings: true,
      showHide: true,
    },
)

const emit = defineEmits<{
  'alias-click': [alias: string]
  'quick-action': [action: SqlQuickAction]
  'open-settings': []
  'hide-hint-bar': []
}>()

const showCompletionDebug = import.meta.env.DEV

const debugLabel = computed(() => {
  const debug = props.contextInfo.completionDebug
  if (!debug) return ''
  return `${debug.stage}`
})

const debugTitle = computed(() => {
  const debug = props.contextInfo.completionDebug
  if (!debug) return ''
  return `${debug.stage} · ${debug.keywordSlot} · ${debug.keywordPhase}`
})
</script>

<template>
  <div class="sql-editor-hint-bar" role="status" aria-live="polite">
    <HintBarContextBadges
        :statement-label="statementLabel"
        :completion-slot="contextInfo.slot"
        :slot-label="contextInfo.slotLabel"
        :dialect-label="dialectLabel"
    />

    <span class="hint-text">{{ contextInfo.hint }}</span>
    <span
        v-if="showCompletionDebug && contextInfo.completionDebug"
        class="hint-debug"
        :title="debugTitle"
    >{{ debugLabel }}</span>

    <HintBarQuickChips
        v-if="contextInfo.quickActions.length"
        :actions="contextInfo.quickActions"
        @action="emit('quick-action', $event)"
    />

    <HintBarAliases
        v-if="contextInfo.aliases.length"
        :aliases="contextInfo.aliases"
        @alias-click="emit('alias-click', $event)"
    />

    <HintBarTrailing
        :table-count="contextInfo.tableCount"
        :column-count="contextInfo.columnCount"
        :loading="loading"
        :shortcut-items="contextInfo.shortcutItems"
        :show-settings="showSettings"
        :show-hide="showHide"
        :theme="theme"
        @open-settings="emit('open-settings')"
        @hide-hint-bar="emit('hide-hint-bar')"
    />
  </div>
</template>

<style scoped>
.sql-editor-hint-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap;
  height: 32px;
  min-height: 32px;
  max-height: 32px;
  padding: 0 12px;
  font-size: 11px;
  line-height: 1;
  color: var(--dw-text-muted, #7a7a8c);
  background: var(--dw-bg-editor, #ffffff);
  user-select: none;
  overflow: hidden;
}

.hint-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dw-text-secondary, #5c5c6e);
}

.hint-debug {
  flex-shrink: 0;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px 6px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--dw-bg-muted, #f1f5f9) 80%, transparent);
  color: var(--dw-text-muted, #7a7a8c);
  font-family: var(--dw-font-mono, ui-monospace, monospace);
  font-size: 10px;
  opacity: 0.85;
}
</style>
