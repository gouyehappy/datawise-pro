<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import AiIcon from '@/core/components/AiIcon.vue'
import {DwIcon} from '@/core/icons'
import {
    appendAiTableMention,
    extractAiTableMentions,
} from '@/features/workspace/services/ai-table-mention.service'

const props = withDefaults(
    defineProps<{
      contextLabel?: string | null
      generating?: boolean
      quickActions?: { id: string; label: string }[]
    }>(),
    {generating: false, quickActions: () => []},
)

const prompt = defineModel<string>({required: true})

const emit = defineEmits<{
  submit: []
  close: []
  quickAction: [id: string]
}>()

const inputRef = ref<HTMLInputElement>()
const dropActive = ref(false)
const {t} = useI18n()

const mentionTables = computed(() => extractAiTableMentions(prompt.value))

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    if (!props.generating) emit('submit')
  }
  if (e.key === 'Escape') {
    emit('close')
  }
}

function focus() {
  inputRef.value?.focus()
}

function resolveDroppedTableName(dt: DataTransfer | null): string | null {
  if (!dt) return null
  const plain = dt.getData('text/plain')?.trim()
      || dt.getData('text/migration-table')?.trim()
  if (!plain) return null
  // Reject multi-line / path-like drops; keep simple table identifiers.
  if (plain.includes('\n') || plain.includes('/') || plain.includes('\\')) return null
  const token = plain.split(/\s+/).pop()?.trim() ?? ''
  if (!/^[A-Za-z_][\w.$]*$/.test(token)) return null
  return token
}

function onDragOver(event: DragEvent) {
  if (!resolveDroppedTableName(event.dataTransfer) && !event.dataTransfer?.types.includes('text/plain')) {
    return
  }
  event.preventDefault()
  dropActive.value = true
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function onDragLeave() {
  dropActive.value = false
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  dropActive.value = false
  const table = resolveDroppedTableName(event.dataTransfer)
  if (!table || props.generating) return
  prompt.value = appendAiTableMention(prompt.value, table)
  focus()
}

defineExpose({focus, inputRef})
</script>

<template>
  <div
      class="ai-prompt-wrap"
      :class="{ 'is-drop-target': dropActive }"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
  >
    <div
        class="ai-prompt-panel"
        :class="{ 'is-sending': props.generating, 'has-quick-actions': quickActions.length > 0 }"
    >
      <div v-if="quickActions.length" class="ai-quick-actions">
        <button
            v-for="action in quickActions"
            :key="action.id"
            class="ai-quick-action"
            type="button"
            :disabled="generating"
            @click="emit('quickAction', action.id)"
        >
          {{ action.label }}
        </button>
      </div>

      <div v-if="mentionTables.length" class="ai-mention-chips" aria-live="polite">
        <span
            v-for="table in mentionTables"
            :key="table"
            class="ai-mention-chip"
            :title="t('console.aiMentionChip', { name: table })"
        >
          @{{ table }}
        </span>
      </div>

      <div class="ai-prompt-bar">
        <AiIcon class="ai-prompt-icon" :size="14"/>

        <div class="ai-prompt-field">
          <input
              ref="inputRef"
              v-model="prompt"
              class="ai-prompt-input"
              :aria-label="t('console.aiPromptAria')"
              :disabled="props.generating"
              :aria-busy="props.generating"
              @keydown="onKeydown"
          >
          <span
              v-if="!prompt.trim() && !props.generating"
              class="ai-prompt-hint"
              aria-hidden="true"
          >
            <span class="ai-prompt-hint-lead">{{ t('console.aiPromptHintLead') }}</span>
            <span class="ai-prompt-hint-example">{{ t('console.aiPromptHintExample') }}</span>
          </span>
        </div>

        <template v-if="contextLabel">
          <span class="ai-prompt-divider" aria-hidden="true"/>
          <span
              class="ai-context-tag"
              :title="t('console.aiQueryScope', { name: contextLabel })"
          >
            <DwIcon name="database" size="xs"/>
            <span class="ai-context-text">{{ contextLabel }}</span>
          </span>
        </template>

        <button
            class="ai-prompt-send"
            type="button"
            :title="props.generating ? t('console.generating') : t('console.aiPromptSubmit')"
            :aria-label="props.generating ? t('console.generating') : t('console.aiPromptSubmit')"
            :disabled="props.generating || !prompt.trim()"
            @click="emit('submit')"
        >
          <span v-if="props.generating" class="ai-prompt-send-spinner" aria-hidden="true"/>
          <DwIcon v-else name="send" size="sm" :stroke-width="1.6"/>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-prompt-wrap {
  flex-shrink: 0;
}

.ai-prompt-wrap.is-drop-target .ai-prompt-panel {
  border-top-color: color-mix(in srgb, var(--dw-primary) 55%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-primary) 6%, var(--dw-bg-panel));
}

.ai-prompt-panel {
  border-top: 1px solid color-mix(in srgb, var(--dw-border-light) 55%, transparent);
  background: color-mix(in srgb, var(--dw-bg-panel) 94%, var(--dw-bg-editor));
}

.ai-prompt-panel:focus-within {
  border-top-color: color-mix(in srgb, var(--dw-primary) 35%, var(--dw-border-light));
}

.ai-prompt-panel.is-sending {
  opacity: 0.88;
}

.ai-quick-actions {
  display: flex;
  flex-wrap: nowrap;
  gap: var(--dw-gap-xs);
  overflow-x: auto;
  padding: var(--dw-space-1) var(--dw-space-4);
  border-bottom: 1px solid color-mix(in srgb, var(--dw-border-light) 55%, transparent);
}

.ai-quick-action {
  flex-shrink: 0;
  padding: 1px var(--dw-space-4);
  border: none;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  cursor: pointer;
}

.ai-quick-action:hover:not(:disabled) {
  color: var(--dw-text);
  background: color-mix(in srgb, var(--dw-bg-muted) 40%, transparent);
}

.ai-quick-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ai-mention-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-xs);
  padding: var(--dw-space-1) var(--dw-space-4) 0;
}

.ai-mention-chip {
  padding: 0 var(--dw-space-2);
  border-radius: var(--dw-control-radius-sm);
  background: color-mix(in srgb, var(--dw-primary) 10%, transparent);
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  font-family: var(--dw-mono);
}

.ai-prompt-bar {
  display: flex;
  align-items: center;
  gap: 0;
  height: var(--dw-control-h-sm);
}

.ai-prompt-icon {
  flex-shrink: 0;
  margin-left: var(--dw-space-4);
  color: var(--dw-text-muted);
}

.ai-prompt-panel:focus-within .ai-prompt-icon {
  color: var(--dw-primary);
}

.ai-prompt-field {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: center;
}

.ai-prompt-input {
  width: 100%;
  height: 100%;
  padding: 0 var(--dw-space-3);
  margin: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--dw-text-primary);
  font-size: var(--dw-text-sm);
  font-family: inherit;
}

.ai-prompt-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  gap: var(--dw-gap-xs);
  padding: 0 var(--dw-space-3);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  pointer-events: none;
}

.ai-prompt-hint-lead {
  flex-shrink: 0;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
}

.ai-prompt-hint-example {
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--dw-text-dim);
  font-size: var(--dw-text-sm);
}

.ai-prompt-input:disabled {
  cursor: not-allowed;
  opacity: 0.72;
}

.ai-prompt-divider {
  flex-shrink: 0;
  width: 1px;
  height: var(--dw-icon-size-md);
  margin: 0 var(--dw-space-3);
  background: color-mix(in srgb, var(--dw-border-light) 70%, transparent);
}

.ai-context-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-xs);
  max-width: 140px;
  flex-shrink: 0;
  padding-right: var(--dw-space-1);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  font-family: var(--dw-mono);
}

.ai-context-tag svg {
  flex-shrink: 0;
  color: var(--dw-text-muted);
}

.ai-context-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-prompt-send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--dw-control-h-xs);
  height: var(--dw-control-h-xs);
  margin-right: var(--dw-space-2);
  padding: 0;
  border: none;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-text-muted);
  cursor: pointer;
}

.ai-prompt-send:not(:disabled):hover {
  color: var(--dw-primary);
  background: color-mix(in srgb, var(--dw-bg-muted) 40%, transparent);
}

.ai-prompt-send:disabled {
  opacity: 0.35;
  cursor: default;
}

.ai-prompt-send-spinner {
  width: var(--dw-icon-size-xs);
  height: var(--dw-icon-size-xs);
  border: 2px solid color-mix(in srgb, var(--dw-text-muted) 28%, transparent);
  border-top-color: var(--dw-primary);
  border-radius: 50%;
  animation: ai-prompt-spin 0.7s linear infinite;
}

@keyframes ai-prompt-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
