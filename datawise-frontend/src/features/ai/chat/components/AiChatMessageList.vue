<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import AiMessageRow from '@/features/ai/chat/components/AiMessageRow.vue'
import AiChatLoading from '@/features/ai/chat/components/AiChatLoading.vue'
import AiAnalysisSqlConfirm from '@/features/ai/analysis/components/AiAnalysisSqlConfirm.vue'
import type {AiChatMessage} from '@/features/ai/types'
import type {AiAnalysisStepEvent} from '@/features/ai/types/analysis'
import type {AiSqlConfirmPending} from '@/features/ai/types/chat'

const props = withDefaults(
    defineProps<{
      messages: AiChatMessage[]
      sending: boolean
      showQuickPrompts: boolean
      quickPrompts: string[]
      userInitial: string
      capabilities: { title: string; desc: string }[]
      extractSql: (content: string) => string | null
      sessionId?: string | null
      analysisSteps?: AiAnalysisStepEvent[]
      analysisStreaming?: boolean
      /** Plain-chat token stream in progress (hide generic loading when bubbles paint). */
      chatStreaming?: boolean
      sqlConfirmPending?: AiSqlConfirmPending | null
      resumingSql?: boolean
      /** Narrow rail / drawer: denser padding, no Agent welcome marketing card */
      compact?: boolean
      canApplyToDocument?: boolean
      canUndoApplyToDocument?: boolean
      documentApplyTargetLabel?: string | null
    }>(),
    {compact: false, canApplyToDocument: false, canUndoApplyToDocument: false, chatStreaming: false},
)

const {t} = useI18n()

/** Hide dots once the in-turn assistant bubble already paints (thinking / analysis shell). */
const hideGenericLoading = computed(() => {
  const last = props.messages[props.messages.length - 1]
  if (!last || last.role !== 'assistant' || !last.streaming) return false
  return Boolean(
      last.content?.trim()
      || last.thinking?.trim()
      || last.thinkingSource === 'pipeline'
      || last.analysisSteps?.length
      || last.analysis,
  )
})

function isAnalysisTurnMessage(msg: AiChatMessage): boolean {
  return (
      msg.role === 'assistant'
      && msg.kind !== 'welcome'
      && (
          msg.thinkingSource === 'pipeline'
          || !!msg.analysisSteps?.length
          || !!msg.analysis
      )
  )
}

/** Latest analysis turn — owns live steps and (when needed) the SQL gate. */
const activeAnalysisMessageId = computed(() => {
  for (let i = props.messages.length - 1; i >= 0; i -= 1) {
    if (isAnalysisTurnMessage(props.messages[i])) return props.messages[i].id
  }
  return null
})

/**
 * Attach SQL confirm to the active analysis turn so progress + confirm share one card.
 * Never render a twin workflow row with a second progress header.
 */
const sqlConfirmMessageId = computed(() =>
    props.sqlConfirmPending ? activeAnalysisMessageId.value : null,
)

const emit = defineEmits<{
  openInConsole: [content: string]
  applyToDocument: [content: string]
  undoApplyToDocument: []
  quickPrompt: [prompt: string]
  confirmSql: []
  cancelSql: []
}>()

const scrollRef = ref<HTMLElement>()
defineExpose({
  getScrollEl: () => scrollRef.value,
})
</script>

<template>
  <div ref="scrollRef" class="chat-scroll" :class="{ 'chat-scroll--compact': compact }">
    <slot name="empty"/>

    <p
        v-if="compact && documentApplyTargetLabel"
        class="chat-scroll__doc-target"
    >
      <DwIcon name="file" size="sm" :stroke-width="1.5"/>
      {{ t('ai.documentApplyTarget', {name: documentApplyTargetLabel}) }}
    </p>

    <AiMessageRow
        v-for="msg in messages"
        :key="msg.id"
        :message="msg"
        :user-initial="userInitial"
        :capabilities="capabilities"
        :extract-sql="extractSql"
        :session-id="sessionId"
        :compact="compact"
        :can-apply-to-document="canApplyToDocument"
        :can-undo-apply-to-document="canUndoApplyToDocument"
        :sql-confirm="msg.id === sqlConfirmMessageId ? sqlConfirmPending : null"
        :resuming-sql="msg.id === sqlConfirmMessageId ? resumingSql : false"
        :live-analysis-steps="msg.id === activeAnalysisMessageId ? analysisSteps : null"
        @open-in-console="emit('openInConsole', $event)"
        @apply-to-document="emit('applyToDocument', $event)"
        @undo-apply-to-document="emit('undoApplyToDocument')"
        @confirm-sql="emit('confirmSql')"
        @cancel-sql="emit('cancelSql')"
    />

    <!-- Fallback only when no analysis turn exists to host the gate. -->
    <div
        v-if="sqlConfirmPending && !sqlConfirmMessageId"
        class="chat-busy-wrap"
        :class="{ 'chat-busy-wrap--compact': compact }"
    >
      <AiAnalysisSqlConfirm
          :sql="sqlConfirmPending.sql"
          :busy="resumingSql"
          :compact="compact"
          @confirm="emit('confirmSql')"
          @cancel="emit('cancelSql')"
      />
    </div>

    <div
        v-else-if="sending && !hideGenericLoading && (chatStreaming || analysisStreaming || compact)"
        class="chat-busy-wrap"
        :class="{ 'chat-busy-wrap--compact': compact }"
    >
      <AiChatLoading compact/>
    </div>
    <div
        v-else-if="sending && !hideGenericLoading"
        class="chat-busy-wrap"
    >
      <AiChatLoading/>
    </div>

    <div v-if="showQuickPrompts" class="quick-prompts" :class="{ 'quick-prompts--compact': compact }">
      <span class="quick-label">{{ $t(compact ? 'assistant.tryPrompts' : 'ai.tryPrompts') }}</span>
      <div class="quick-grid">
        <button
            v-for="prompt in quickPrompts"
            :key="prompt"
            class="quick-chip"
            type="button"
            @click="emit('quickPrompt', prompt)"
        >
          {{ prompt }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--dw-space-8) var(--dw-space-11) var(--dw-space-9);
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-8);
  background: var(--dw-bg);
}

.chat-scroll--compact {
  padding: var(--dw-space-4) var(--dw-space-4) var(--dw-space-5);
  gap: var(--dw-space-5);
  background: transparent;
}

.chat-scroll__doc-target {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-2);
  margin: 0;
  padding: var(--dw-space-2) var(--dw-space-3);
  border-radius: var(--dw-control-radius-sm);
  background: color-mix(in srgb, var(--dw-primary) 10%, transparent);
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-snug);
}

.quick-prompts {
  padding-left: 44px;
}

.quick-prompts--compact {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-left: 0;
  margin-top: 4px;
  text-align: center;
}

.quick-label {
  display: block;
  margin-bottom: var(--dw-space-5);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
}

.quick-prompts--compact .quick-label {
  margin-bottom: var(--dw-space-3);
  font-size: var(--dw-text-xs);
}

.quick-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap);
}

.quick-chip {
  padding: var(--dw-space-4) var(--dw-space-7);
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-radius-pill);
  background: var(--dw-bg-panel);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-snug);
  cursor: pointer;
  transition: var(--dw-transition-colors),
  color 0.15s ease,
  transform 0.12s ease;
}

.quick-prompts--compact .quick-chip {
  width: auto;
  max-width: 100%;
  text-align: left;
  padding: 6px 12px;
  border-radius: 999px;
  border-color: color-mix(in srgb, var(--dw-border) 80%, transparent);
  background: color-mix(in srgb, var(--dw-bg-panel) 40%, transparent);
  font-size: var(--dw-text-xs);
  color: color-mix(in srgb, var(--dw-text) 88%, var(--dw-text-secondary));
}

.quick-prompts--compact .quick-grid {
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  max-width: 28em;
}

.quick-prompts--compact .quick-chip:hover {
  border-color: color-mix(in srgb, var(--dw-text) 18%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-bg-panel) 70%, transparent);
  color: var(--dw-text);
}

.quick-chip:hover {
  border-color: var(--dw-primary-border);
  background: var(--dw-primary-soft);
  color: var(--dw-primary);
}

/* Align with assistant avatar column (CopilotDock busy row). */
.chat-busy-wrap {
  padding-left: 44px;
}

.chat-busy-wrap--compact {
  padding-left: 34px;
}
</style>
