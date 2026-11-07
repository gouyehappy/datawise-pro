<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import DbTypeIcon from '@/core/components/DbTypeIcon.vue'
import {DB_TYPE_ICON_SIZE} from '@/features/connection/constants/db-type-icon-sizes'
import {TagChip, AiIcon} from '@/core/components'
import {DwIcon} from '@/core/icons'
import {renderSafeMarkdown} from '@/core/markdown/safe-markdown'
import {
  buildAssistantRenderBlocks,
  extractDocumentFromContent,
  isAssistantSqlCodeBlock,
  parseMessageBlocks,
} from '@/features/ai/chat/services/ai-chat.service'
import {stripOpenThinkTail} from '@/features/ai/chat/utils/assistant-thinking'
import type {AiChatMessage} from '@/features/ai/types'
import type {AiAnalysisStepEvent} from '@/features/ai/types/analysis'
import AiWelcomeCard from '@/features/ai/shared/components/AiWelcomeCard.vue'
import AiAnalysisPanel from '@/features/ai/analysis/components/AiAnalysisPanel.vue'
import AiAnalysisProgress from '@/features/ai/analysis/components/AiAnalysisProgress.vue'
import AiAnalysisSqlConfirm from '@/features/ai/analysis/components/AiAnalysisSqlConfirm.vue'
import type {AiSqlConfirmPending} from '@/features/ai/types/chat'

const props = withDefaults(
    defineProps<{
      message: AiChatMessage
      userInitial: string
      capabilities: { title: string; desc: string }[]
      extractSql: (content: string) => string | null
      sessionId?: string | null
      /** Narrow assistant drawer density */
      compact?: boolean
      /** Active workbench tab is a local MD/text file that can be overwritten. */
      canApplyToDocument?: boolean
      /** One-step undo available for the last apply on the focused file. */
      canUndoApplyToDocument?: boolean
      /** SQL gate for THIS analysis turn — keeps confirm inside the same card. */
      sqlConfirm?: AiSqlConfirmPending | null
      resumingSql?: boolean
      /** Live pipeline steps from the stream (preferred over persisted message copy). */
      liveAnalysisSteps?: AiAnalysisStepEvent[] | null
    }>(),
    {
      compact: false,
      canApplyToDocument: false,
      canUndoApplyToDocument: false,
      sqlConfirm: null,
      resumingSql: false,
      liveAnalysisSteps: null,
    },
)

const emit = defineEmits<{
  openInConsole: [content: string]
  applyToDocument: [content: string]
  undoApplyToDocument: []
  confirmSql: []
  cancelSql: []
}>()

const {t} = useI18n()

const displayContent = computed(() =>
    props.message.role === 'assistant'
        ? stripOpenThinkTail(props.message.content)
        : props.message.content,
)
const contentBlocks = computed(() => parseMessageBlocks(displayContent.value))
const assistantBlocks = computed(() =>
    props.message.role === 'assistant' ? buildAssistantRenderBlocks(displayContent.value) : [],
)
const assistantMarkdownHtml = computed(() =>
    props.message.role === 'assistant' ? renderSafeMarkdown(displayContent.value) : '',
)
/** Analysis shell from first pipeline frame through final report (same chrome). */
const isAnalysisTurn = computed(
    () =>
        props.message.role === 'assistant'
        && props.message.kind !== 'welcome'
        && (
            !!props.message.analysis
            || !!props.message.analysisSteps?.length
            || props.message.thinkingSource === 'pipeline'
        ),
)
const progressSteps = computed(
    () =>
        (props.liveAnalysisSteps?.length
            ? props.liveAnalysisSteps
            : props.message.analysisSteps) ?? [],
)
const showPipelineProgress = computed(
    () =>
        isAnalysisTurn.value
        && (
            progressSteps.value.length > 0
            || (!!props.message.streaming && props.message.thinkingSource === 'pipeline')
            || !!props.sqlConfirm
        ),
)
const progressLive = computed(
    () => !!props.message.streaming || (!!props.sqlConfirm && !!props.resumingSql),
)
/** Keep progress open while running or waiting on SQL — one continuous beat. */
const progressExpanded = computed(
    () => progressLive.value || !!props.sqlConfirm,
)
/** Progress phase key: avoid remount flicker while steps update. */
const progressPhase = computed(() => {
  if (props.message.streaming) return 'live'
  if (props.sqlConfirm) return props.resumingSql ? 'resume' : 'confirm'
  return 'done'
})
/** Real model reasoning only — never the synthesized pipeline transcript. */
const showModelThinking = computed(
    () =>
        props.message.role === 'assistant'
        && props.message.kind !== 'welcome'
        && props.message.thinkingSource !== 'pipeline'
        && !!props.message.thinking?.trim(),
)
const thinkingLabel = computed(() =>
    props.message.streaming ? t('ai.thinkingProcessLive') : t('ai.thinkingProcess'),
)
/** Force open while streaming; remount closed when done so expand stays user-controlled. */
const thinkingOpenAttr = computed(() => (props.message.streaming ? true : undefined))
const showReferences = computed(
    () =>
        props.message.role === 'assistant'
        && !props.message.streaming
        && !!props.message.references?.length,
)
const hasSqlCodeBlock = computed(() =>
    assistantBlocks.value.some((block) => block.type === 'code' && isAssistantSqlCodeBlock(block)),
)
const sqlSnippet = computed(() =>
    props.message.role === 'assistant' ? props.extractSql(displayContent.value) : null,
)
const documentSnippet = computed(() =>
    props.message.role === 'assistant'
    && props.message.kind !== 'welcome'
    && !props.message.analysis
        ? extractDocumentFromContent(displayContent.value)
        : null,
)
/** Single message-level apply only — never per-fence (avoids partial overwrite). */
const showApplyToDocument = computed(
    () =>
        props.message.role === 'assistant'
        && props.message.kind !== 'welcome'
        && !props.message.analysis
        && !!documentSnippet.value,
)
const showDocumentActions = computed(
    () => showApplyToDocument.value || props.canUndoApplyToDocument,
)

const hasSummaryText = computed(() =>
    Boolean(assistantMarkdownHtml.value.trim())
    || contentBlocks.value.some((block) =>
        block.type === 'text' ? block.text.trim().length > 0 : block.type === 'list',
    ),
)

/** Match CopilotDock: hide empty streaming shells until thinking/content arrives. */
const hasAssistantSurface = computed(() => {
  if (props.message.kind === 'welcome') return true
  if (isAnalysisTurn.value) return true
  if (showModelThinking.value) return true
  if (displayContent.value.trim()) return true
  if (showReferences.value) return true
  if (showDocumentActions.value) return true
  return false
})

const showRow = computed(
    () =>
        props.message.role === 'user'
        || props.message.kind === 'welcome'
        || hasAssistantSurface.value,
)

function codeLabel(lang: string) {
  const normalized = lang.trim().toLowerCase()
  if (!normalized) return t('ai.codeUntitled')
  if (normalized === 'sql') return t('ai.codeSql')
  return lang.toUpperCase()
}
</script>

<template>
  <article
      v-if="showRow"
      class="msg-row"
      :class="[
        message.role,
        {
          'msg-row--welcome': message.kind === 'welcome',
          'msg-row--compact': compact,
          'msg-row--streaming': message.streaming,
        },
      ]"
  >
    <div v-if="message.role === 'assistant' && message.kind !== 'welcome'" class="avatar avatar-ai" aria-hidden="true">
      <AiIcon :size="compact ? 14 : 16"/>
    </div>
    <div v-else-if="message.role === 'user'" class="avatar avatar-user" aria-hidden="true">{{ userInitial }}</div>

    <div
        class="msg-body"
        :class="{
          'msg-body--analysis': isAnalysisTurn,
          'msg-body--welcome': message.kind === 'welcome',
        }"
    >
      <AiWelcomeCard v-if="message.kind === 'welcome'" :capabilities="capabilities"/>

      <template v-else>
        <div v-if="message.databases?.length" class="msg-databases">
          <TagChip v-for="db in message.databases" :key="db.id">
            <template #icon>
              <DbTypeIcon :db-type="db.dbType" :size="DB_TYPE_ICON_SIZE.chip"/>
            </template>
            {{ db.connectionLabel }}
            <template v-if="db.databaseLabel !== db.connectionLabel"> / {{ db.databaseLabel }}</template>
          </TagChip>
        </div>

        <div
            class="bubble"
            :class="[
              message.role,
              {
                'bubble--analysis': isAnalysisTurn,
                'bubble--analysis-live': isAnalysisTurn && (message.streaming || !!sqlConfirm) && !message.analysis,
                'bubble--flat': message.role === 'assistant' && !isAnalysisTurn,
              },
            ]"
        >
          <!-- One shell: process → SQL gate → report. Never a second twin card. -->
          <template v-if="isAnalysisTurn">
            <details
                v-if="showModelThinking"
                :key="`${message.id}-think-${message.streaming ? 'live' : 'done'}`"
                class="msg-thinking msg-thinking--in-analysis"
                :open="thinkingOpenAttr"
            >
              <summary class="msg-thinking__summary">
                <DwIcon name="chevron-right" size="sm" class="msg-thinking__chevron" aria-hidden="true"/>
                <span
                    class="msg-thinking__label"
                    :data-live="message.streaming ? 'true' : undefined"
                >{{ thinkingLabel }}</span>
              </summary>
              <div class="msg-thinking__panel">
                <pre class="msg-thinking__body">{{ message.thinking }}</pre>
              </div>
            </details>

            <AiAnalysisProgress
                v-if="showPipelineProgress"
                :key="`${message.id}-progress-${progressPhase}`"
                :steps="progressSteps"
                :live="progressLive"
                :readonly="!progressLive"
                :default-expanded="progressExpanded"
                :compact="compact"
            />

            <AiAnalysisSqlConfirm
                v-if="sqlConfirm"
                :sql="sqlConfirm.sql"
                :busy="resumingSql"
                :compact="compact"
                @confirm="emit('confirmSql')"
                @cancel="emit('cancelSql')"
            />

            <template v-if="message.analysis">
              <!-- Drawer already has progress chrome; skip a second "report" title band. -->
              <header
                  v-if="!compact || !showPipelineProgress"
                  class="analysis-reply-header"
              >
                <div class="analysis-reply-badge">
                  <span class="analysis-reply-badge__dot" aria-hidden="true"/>
                  {{ t('ai.analysis.reportBadge') }}
                </div>
                <span v-if="message.analysis.rows.length" class="analysis-reply-stat">
                  {{ t('ai.analysis.rowCount', {count: message.analysis.rows.length}) }}
                </span>
              </header>

              <div class="analysis-reply-body">
                <section v-if="hasSummaryText" class="analysis-summary">
                  <h4 class="analysis-summary__label">{{ t('ai.analysis.summaryLabel') }}</h4>
                  <div
                      v-if="assistantMarkdownHtml"
                      class="ai-md"
                      v-html="assistantMarkdownHtml"
                  />
                </section>

                <AiAnalysisPanel
                    :analysis="message.analysis"
                    :federated-target-count="message.databases?.length ?? 0"
                    :summary-text="message.content"
                    :targets-json="message.databases?.length ? JSON.stringify(message.databases) : undefined"
                    :session-id="sessionId"
                    :compact="compact"
                    @open-in-console="emit('openInConsole', $event)"
                />
              </div>

              <div v-if="showReferences" class="msg-refs msg-refs--analysis">
                <span class="msg-refs__label">{{ t('ai.references') }}</span>
                <div class="msg-refs__chips">
                  <a
                      v-for="refItem in message.references"
                      :key="refItem.url"
                      class="msg-refs__chip"
                      :href="refItem.url"
                      target="_blank"
                      rel="noopener noreferrer"
                      :title="refItem.url"
                  >
                    <DwIcon name="open-external" size="sm" class="msg-refs__icon" aria-hidden="true"/>
                    <span class="msg-refs__text">{{ refItem.title || refItem.url }}</span>
                  </a>
                </div>
              </div>
            </template>

            <!-- Failed / cancelled analysis: keep progress + plain error text in the same shell. -->
            <div
                v-else-if="!message.streaming && !sqlConfirm && displayContent.trim()"
                class="analysis-reply-body analysis-reply-body--plain"
            >
              <div class="ai-md" v-html="assistantMarkdownHtml"/>
            </div>
          </template>

          <template v-else-if="message.role === 'assistant'">
            <details
                v-if="showModelThinking"
                :key="`${message.id}-think-${message.streaming ? 'live' : 'done'}`"
                class="msg-thinking"
                :open="thinkingOpenAttr"
            >
              <summary class="msg-thinking__summary">
                <DwIcon name="chevron-right" size="sm" class="msg-thinking__chevron" aria-hidden="true"/>
                <span
                    class="msg-thinking__label"
                    :data-live="message.streaming ? 'true' : undefined"
                >{{ thinkingLabel }}</span>
              </summary>
              <div class="msg-thinking__panel">
                <pre class="msg-thinking__body">{{ message.thinking }}</pre>
              </div>
            </details>

            <div
                v-if="assistantBlocks.length"
                class="msg-assistant-body"
                :class="{ 'msg-assistant-body--streaming': message.streaming }"
            >
              <template v-for="(block, index) in assistantBlocks" :key="index">
                <div
                    v-if="block.type === 'md'"
                    class="ai-md"
                    :class="{
                      'ai-md--stream-tail':
                        message.streaming && index === assistantBlocks.length - 1,
                    }"
                    v-html="block.html"
                />
                <div
                    v-else
                    class="code-block ai-code-surface"
                    :class="{
                      'ai-code-surface--stream-tail':
                        message.streaming && index === assistantBlocks.length - 1,
                    }"
                >
                  <div class="code-head ai-code-surface__head">
                    <span class="ai-code-surface__label">
                      <span class="ai-code-surface__label-dot" aria-hidden="true"/>
                      {{ codeLabel(block.lang) }}
                    </span>
                    <div class="code-head__actions">
                      <button
                          v-if="isAssistantSqlCodeBlock(block)"
                          class="ai-text-action"
                          type="button"
                          @click="emit('openInConsole', block.code)"
                      >
                        {{ t('ai.openInConsole') }}
                      </button>
                    </div>
                  </div>
                  <pre><code>{{ block.code }}</code></pre>
                </div>
              </template>
            </div>

            <div v-if="showReferences" class="msg-refs">
              <span class="msg-refs__label">{{ t('ai.references') }}</span>
              <div class="msg-refs__chips">
                <a
                    v-for="refItem in message.references"
                    :key="refItem.url"
                    class="msg-refs__chip"
                    :href="refItem.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    :title="refItem.url"
                >
                  <DwIcon name="open-external" size="sm" class="msg-refs__icon" aria-hidden="true"/>
                  <span class="msg-refs__text">{{ refItem.title || refItem.url }}</span>
                </a>
              </div>
            </div>

            <div v-if="(sqlSnippet && !hasSqlCodeBlock) || showDocumentActions" class="msg-actions">
              <button
                  v-if="sqlSnippet && !hasSqlCodeBlock"
                  class="open-btn ai-text-action"
                  type="button"
                  @click="emit('openInConsole', displayContent)"
              >
                {{ t('ai.openInConsole') }}
              </button>
              <button
                  v-if="showApplyToDocument"
                  class="open-btn ai-text-action"
                  type="button"
                  :disabled="!canApplyToDocument"
                  :title="canApplyToDocument ? t('ai.applyToDocument') : t('ai.noLocalDocumentFocus')"
                  @click="emit('applyToDocument', documentSnippet || displayContent)"
              >
                {{ t('ai.applyToDocument') }}
              </button>
              <button
                  v-if="canUndoApplyToDocument"
                  class="open-btn ai-text-action ai-text-action--muted"
                  type="button"
                  @click="emit('undoApplyToDocument')"
              >
                {{ t('ai.undoApplyToDocument') }}
              </button>
            </div>
          </template>

          <template v-else>
            <template v-for="(block, index) in contentBlocks" :key="index">
              <p v-if="block.type === 'text'" class="text-block">{{ block.text }}</p>
              <ul v-else-if="block.type === 'list'" class="list-block">
                <li v-for="item in block.items" :key="item">{{ item }}</li>
              </ul>
              <div v-else class="code-block ai-code-surface">
                <div class="code-head ai-code-surface__head">
                  <span class="ai-code-surface__label">
                    <span class="ai-code-surface__label-dot" aria-hidden="true"/>
                    {{ t('ai.codeSql') }}
                  </span>
                </div>
                <pre><code>{{ block.code }}</code></pre>
              </div>
            </template>
          </template>
        </div>
      </template>

      <time v-if="message.kind !== 'welcome'">{{ message.time }}</time>
    </div>
  </article>
</template>

<style src="../../styles/ai-reply.css"></style>

<style scoped>
.msg-row {
  display: flex;
  gap: var(--dw-space-6);
  align-items: flex-start;
}

.msg-row.user {
  flex-direction: row-reverse;
}

.msg-row--welcome {
  gap: 0;
}

.msg-row--compact {
  gap: var(--dw-space-3);
}

.msg-body--welcome {
  max-width: 100%;
  width: 100%;
}

.avatar {
  flex-shrink: 0;
  width: 34px;
  height: var(--dw-control-h);
  border-radius: var(--dw-control-radius);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--dw-text-sm);
  font-weight: 600;
}

.msg-row--compact .avatar {
  width: 26px;
  height: 26px;
  font-size: var(--dw-text-xs);
}

.avatar-ai {
  background: color-mix(in srgb, var(--dw-primary) 12%, var(--dw-bg-panel));
  border: 1px solid color-mix(in srgb, var(--dw-primary) 28%, var(--dw-border));
  color: var(--dw-primary);
  box-shadow: none;
}

.avatar-user {
  background: var(--dw-bg-panel);
  border: 1px solid var(--dw-border);
  color: var(--dw-text-secondary);
}

.msg-body {
  min-width: 0;
  max-width: min(720px, 88%);
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-sm);
}

.msg-row--compact .msg-body {
  max-width: 100%;
  flex: 1;
}

.msg-body--analysis {
  max-width: min(920px, 96%);
}

.msg-row--compact .msg-body--analysis {
  max-width: 100%;
}

.msg-row--compact .bubble--analysis {
  border-radius: var(--dw-control-radius);
}

.msg-row--compact .analysis-reply-header {
  padding: var(--dw-space-3) var(--dw-space-4);
}

.msg-row--compact .analysis-reply-badge {
  font-size: var(--dw-text-sm);
}

.msg-row--compact .analysis-reply-body {
  gap: var(--dw-space-4);
  padding: var(--dw-space-4);
}

.msg-row.user .msg-body {
  align-items: flex-end;
}

.msg-body time {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  padding: 0 var(--dw-space-1);
}

.msg-databases {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-sm);
}

.bubble {
  padding: var(--dw-space-6) var(--dw-space-8);
  border-radius: var(--dw-panel-radius);
  border: 1px solid var(--dw-border-light);
  background: var(--dw-bg);
  box-shadow: 0 1px 0 color-mix(in srgb, var(--dw-text) 4%, transparent);
}

.msg-row--compact .bubble {
  padding: var(--dw-space-3) var(--dw-space-4);
  box-shadow: none;
}

/* Cursor/CopilotDock-like: flat assistant surface, no chat-card chrome. */
.bubble--flat {
  padding: var(--dw-space-1) 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  border-radius: 0;
}

.msg-row--compact .bubble--flat {
  padding: 0;
}

.bubble.assistant:not(.bubble--flat) {
  border-top-left-radius: var(--dw-control-radius-sm);
}

.bubble.user {
  background: color-mix(in srgb, var(--dw-primary) 8%, var(--dw-bg));
  border-color: color-mix(in srgb, var(--dw-primary) 20%, var(--dw-border-light));
  border-top-right-radius: var(--dw-control-radius-sm);
}

.msg-row--compact .bubble.user {
  border-radius: 14px;
  border-color: transparent;
  background: color-mix(in srgb, var(--dw-bg-panel) 72%, var(--dw-bg));
  padding: 8px 12px;
  font-size: var(--dw-text-sm);
  line-height: 1.5;
  white-space: pre-wrap;
}

.bubble--analysis {
  padding: 0;
  overflow: hidden;
  border-color: color-mix(in srgb, var(--dw-primary) 20%, var(--dw-border-light));
  background: var(--dw-bg-panel);
  box-shadow: none;
}

.bubble--analysis::before {
  content: '';
  display: block;
  height: 3px;
  background: var(--dw-primary);
}

/* Live analysis uses the same card; soft pulse instead of a different chat-thinking look. */
.bubble--analysis-live {
  border-color: color-mix(in srgb, var(--dw-primary) 28%, var(--dw-border-light));
}

.msg-row--compact .bubble--analysis {
  border-radius: var(--dw-control-radius);
}

.msg-thinking--in-analysis {
  margin: var(--dw-space-3) var(--dw-space-4) 0;
}

.msg-row--compact .msg-thinking--in-analysis {
  margin: var(--dw-space-2) var(--dw-space-3) 0;
}

.analysis-reply-body--plain {
  padding-top: var(--dw-space-4);
}

.msg-refs--analysis {
  padding: 0 var(--dw-space-4) var(--dw-space-4);
}

.analysis-reply-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-space-6);
  padding: var(--dw-space-7) var(--dw-space-8);
  border-bottom: 1px solid var(--dw-border-light);
  background: color-mix(in srgb, var(--dw-primary) 4%, var(--dw-bg-panel));
}

.analysis-reply-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-md);
  font-size: var(--dw-text-xl);
  font-weight: 600;
  color: var(--dw-text);
  letter-spacing: 0.01em;
}

.analysis-reply-badge__dot {
  width: var(--dw-icon-size-xs);
  height: var(--dw-icon-size-xs);
  border-radius: 50%;
  background: var(--dw-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dw-primary) 18%, transparent);
}

.analysis-reply-stat {
  padding: var(--dw-space-2) 11px;
  border-radius: var(--dw-radius-pill);
  border: 1px solid color-mix(in srgb, var(--dw-primary) 18%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-bg) 80%, var(--dw-primary-soft));
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.analysis-reply-body {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-8);
  padding: var(--dw-space-8) var(--dw-space-8) var(--dw-space-8);
  background: var(--dw-bg);
}

.analysis-summary {
  padding: var(--dw-space-7) var(--dw-space-8);
  border-radius: var(--dw-panel-radius);
  border: 1px solid var(--dw-border-light);
  background: var(--dw-bg-panel);
  border-left: 3px solid var(--dw-primary);
  box-shadow: none;
}

.analysis-summary__label {
  margin: 0 0 var(--dw-space-4);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dw-text-muted);
}

.text-block {
  margin: 0 0 var(--dw-space-4);
  white-space: pre-wrap;
  font-size: var(--dw-text-md);
  line-height: var(--dw-leading-loose);
  color: var(--dw-text);
}

.text-block:last-child {
  margin-bottom: 0;
}

.list-block {
  margin: 0 0 var(--dw-space-4);
  padding-left: 18px;
  font-size: var(--dw-text-md);
  line-height: var(--dw-leading-loose);
}

.code-block {
  margin-top: var(--dw-space-2);
}

.msg-row--compact .code-block {
  margin-top: var(--dw-space-2);
}

.msg-row--compact .ai-code-surface__head {
  padding: var(--dw-space-2) var(--dw-space-3);
}

.msg-row--compact .ai-code-surface pre {
  padding: var(--dw-space-3);
}

.code-head__actions {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-sm);
}

.msg-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-sm);
  margin-top: var(--dw-space-5);
}

.msg-row--compact .msg-actions {
  margin-top: var(--dw-space-3);
}

.open-btn {
  margin-top: 0;
}

.ai-md {
  font-size: var(--dw-text-md);
  line-height: var(--dw-leading-loose);
  color: var(--dw-text);
  word-break: break-word;
}

.msg-row--compact .ai-md {
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-relaxed);
}

.ai-md + .ai-md,
.ai-md + .code-block,
.code-block + .ai-md,
.code-block + .code-block {
  margin-top: var(--dw-space-3);
}

.ai-md :deep(.lf-md__p) {
  margin: 0 0 var(--dw-space-4);
}

.ai-md :deep(.lf-md__p:last-child) {
  margin-bottom: 0;
}

.ai-md :deep(.lf-md__h) {
  margin: var(--dw-space-5) 0 var(--dw-space-3);
  font-weight: 600;
  line-height: var(--dw-leading-snug);
  color: var(--dw-text);
}

.ai-md :deep(h1.lf-md__h) { font-size: var(--dw-text-xl); }
.ai-md :deep(h2.lf-md__h) { font-size: var(--dw-text-lg); }
.ai-md :deep(h3.lf-md__h),
.ai-md :deep(h4.lf-md__h),
.ai-md :deep(h5.lf-md__h),
.ai-md :deep(h6.lf-md__h) { font-size: var(--dw-text-md); }

.ai-md :deep(.lf-md__h:first-child) {
  margin-top: 0;
}

.ai-md :deep(.lf-md__list) {
  margin: 0 0 var(--dw-space-4);
  padding-left: 1.25em;
}

.ai-md :deep(.lf-md__list:last-child) {
  margin-bottom: 0;
}

.ai-md :deep(.lf-md__quote) {
  margin: 0 0 var(--dw-space-4);
  padding: var(--dw-space-2) var(--dw-space-4);
  border-left: 3px solid var(--dw-border);
  color: var(--dw-text-secondary);
}

.ai-md :deep(.lf-md__hr) {
  margin: var(--dw-space-5) 0;
  border: 0;
  border-top: 1px solid var(--dw-border-light);
}

.ai-md :deep(.lf-md__code) {
  margin: var(--dw-space-3) 0;
  padding: var(--dw-space-3) var(--dw-space-4);
  border-radius: var(--dw-control-radius);
  border: 1px solid var(--dw-border-light);
  background: color-mix(in srgb, var(--dw-bg-panel) 70%, var(--dw-bg));
  overflow-x: auto;
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-relaxed);
}

.ai-md :deep(.lf-md__code:last-child) {
  margin-bottom: 0;
}

.ai-md :deep(code) {
  font-family: var(--dw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 0.92em;
}

.ai-md :deep(:not(pre) > code) {
  padding: 0.1em 0.35em;
  border-radius: var(--dw-control-radius-sm);
  background: color-mix(in srgb, var(--dw-text) 8%, transparent);
}

.ai-md :deep(a) {
  color: var(--dw-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.ai-md :deep(.lf-md__table-wrap) {
  margin: var(--dw-space-3) 0;
  overflow-x: auto;
}

.ai-md :deep(.lf-md__table) {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--dw-text-sm);
}

.ai-md :deep(.lf-md__table th),
.ai-md :deep(.lf-md__table td) {
  padding: var(--dw-space-2) var(--dw-space-3);
  border: 1px solid var(--dw-border-light);
  text-align: left;
}

.ai-md :deep(.lf-md__table th) {
  background: color-mix(in srgb, var(--dw-bg-panel) 80%, var(--dw-bg));
  font-weight: 600;
}

.ai-md :deep(strong) {
  font-weight: 600;
}

/* Cursor-like thought disclosure: quiet label + left rail, no card fill. */
.msg-thinking {
  margin: 0 0 var(--dw-space-3);
  border: 0;
  background: transparent;
  padding: 0;
}

.msg-thinking__summary {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
  max-width: 100%;
  padding: 2px 0;
  cursor: pointer;
  list-style: none;
  user-select: none;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  font-weight: 500;
  line-height: 1.3;
}

.msg-thinking__summary::-webkit-details-marker {
  display: none;
}

.msg-thinking__chevron {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  opacity: 0.75;
  transition: transform 0.14s ease;
}

.msg-thinking[open] > .msg-thinking__summary .msg-thinking__chevron {
  transform: rotate(90deg);
}

.msg-thinking__label[data-live='true'] {
  background: linear-gradient(
    90deg,
    var(--dw-text-secondary) 0%,
    color-mix(in srgb, var(--dw-text) 55%, var(--dw-text-secondary)) 45%,
    var(--dw-text-secondary) 90%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: ai-think-shimmer 1.6s ease-in-out infinite;
}

.msg-thinking__panel {
  margin: 4px 0 2px;
  padding: 0 0 0 10px;
  border-left: 2px solid color-mix(in srgb, var(--dw-border) 85%, transparent);
}

.msg-thinking__body {
  margin: 0;
  max-height: 220px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: var(--dw-text-xs);
  font-weight: 400;
  line-height: 1.55;
  color: var(--dw-text-secondary);
}

.msg-assistant-body {
  min-width: 0;
}

/* Caret only on the true stream tail — never on earlier markdown sections. */
.msg-assistant-body--streaming .ai-md--stream-tail :deep(p:last-child)::after,
.msg-assistant-body--streaming .ai-md--stream-tail:not(:has(p))::after,
.msg-assistant-body--streaming .ai-code-surface--stream-tail::after {
  content: '';
  display: inline-block;
  width: 0.45em;
  height: 1em;
  margin-left: 1px;
  vertical-align: text-bottom;
  background: color-mix(in srgb, var(--dw-text) 55%, transparent);
  animation: ai-caret-blink 1s steps(1) infinite;
}

.msg-assistant-body--streaming .ai-code-surface--stream-tail {
  position: relative;
}

.msg-assistant-body--streaming .ai-code-surface--stream-tail::after {
  position: absolute;
  right: 10px;
  bottom: 10px;
}

.msg-refs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-top: var(--dw-space-2);
  padding-top: 2px;
}

.msg-refs__label {
  font-size: var(--dw-text-xs);
  font-weight: 500;
  color: var(--dw-text-muted, var(--dw-text-secondary));
}

.msg-refs__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.msg-refs__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 160px;
  padding: 3px 8px 3px 6px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--dw-border) 75%, transparent);
  background: color-mix(in srgb, var(--dw-bg-panel) 55%, transparent);
  color: color-mix(in srgb, var(--dw-text) 78%, var(--dw-text-secondary));
  font-size: var(--dw-text-xs);
  line-height: 1.3;
  text-decoration: none;
  transition: border-color 0.12s ease, background-color 0.12s ease, color 0.12s ease;
}

.msg-refs__chip:hover {
  border-color: color-mix(in srgb, var(--dw-text) 18%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-bg-panel) 80%, transparent);
  color: var(--dw-text);
}

.msg-refs__icon {
  width: 11px;
  height: 11px;
  flex: 0 0 auto;
  opacity: 0.7;
}

.msg-refs__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.msg-row--compact .msg-thinking {
  margin-bottom: var(--dw-space-2);
}

@keyframes ai-think-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}

@keyframes ai-caret-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
</style>
