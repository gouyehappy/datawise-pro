<!--
  AI 对话主区域（布局参照 WorkspaceArea 中间工作区）
-->
<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import DbTypeIcon from '@/core/components/DbTypeIcon.vue'
import {DB_TYPE_ICON_SIZE} from '@/features/connection/constants/db-type-icon-sizes'
import {DwInlineAlert, ModuleHeader, TagChip, AiIcon} from '@/core/components'
import {DwIcon} from '@/core/icons'
import type {TenantAiUsage} from '@/shared/api/types'
import AiAnalysisTemplateBar from '@/features/ai/analysis/components/AiAnalysisTemplateBar.vue'
import AiFederatedScopeBanner from '@/features/ai/analysis/components/AiFederatedScopeBanner.vue'
import AiChatComposer from '@/features/ai/chat/components/AiChatComposer.vue'
import AiChatMessageList from '@/features/ai/chat/components/AiChatMessageList.vue'
import AiQuotaUsageMeter from '@/features/ai/shared/components/AiQuotaUsageMeter.vue'
import type {AiChatMessage} from '@/features/ai/types'
import type {AiAnalysisMode, AiAnalysisStepEvent} from '@/features/ai/types/analysis'
import type {AiAnalysisTemplate} from '@/features/ai/analysis/types/analysis-template.types'
import type {AiSqlConfirmPending} from '@/features/ai/types/chat'
import type {AiDatabaseTarget} from '@/features/ai/shared/utils/database-targets'

const props = defineProps<{
  messages: AiChatMessage[]
  sending: boolean
  showQuickPrompts: boolean
  quickPrompts: string[]
  userInitial: string
  capabilities: { title: string; desc: string }[]
  selectedTargets: AiDatabaseTarget[]
  formatTargetLabel: (target: AiDatabaseTarget) => string
  extractSql: (content: string) => string | null
  sessionId?: string | null
  analysisSteps?: AiAnalysisStepEvent[]
  analysisStreaming?: boolean
  chatStreaming?: boolean
  sqlConfirmPending?: AiSqlConfirmPending | null
  resumingSql?: boolean
  badge?: string
  selectedTargetIds?: string[]
  analysisMode?: AiAnalysisMode
  tenantAiUsage?: TenantAiUsage | null
  tenantAiNearLimit?: boolean
  tenantAiExhausted?: boolean
  canApplyToDocument?: boolean
  canUndoApplyToDocument?: boolean
  /** Basename of the local file AI will overwrite when applying a reply. */
  documentApplyTargetLabel?: string | null
}>()

const input = defineModel<string>('input', {required: true})

const emit = defineEmits<{
  send: [prompt: string]
  removeTarget: [id: string]
  openInConsole: [content: string]
  applyToDocument: [content: string]
  undoApplyToDocument: []
  quickPrompt: [prompt: string]
  confirmSql: []
  cancelSql: []
  stop: []
  applyTemplate: [template: AiAnalysisTemplate]
  keydown: [event: KeyboardEvent]
}>()

const {t} = useI18n()

const listRef = ref<{ getScrollEl?: () => HTMLElement | undefined }>()
const composerRef = ref<InstanceType<typeof AiChatComposer>>()

defineExpose({
  getScrollEl: () => listRef.value?.getScrollEl?.(),
  getAttachments: () => composerRef.value?.getAttachments() ?? [],
  buildSendPayload: (prompt: string) =>
      composerRef.value?.buildSendPayload(prompt) ?? Promise.resolve(prompt),
  clearAttachments: () => composerRef.value?.clearAttachments(),
})

const composerBusy = computed(
    () => props.sending || !!props.sqlConfirmPending || !!props.resumingSql,
)

const quotaNearLimitMessage = computed(() => {
  const usage = props.tenantAiUsage
  if (!props.tenantAiNearLimit || !usage || usage.unlimited) return null
  return t('ai.quota.nearLimit', {
    remaining: usage.remaining,
    calls: usage.calls,
    limit: usage.limit,
  })
})

const quotaExhaustedMessage = computed(() => {
  const usage = props.tenantAiUsage
  if (!props.tenantAiExhausted || !usage || usage.unlimited) return null
  return t('ai.quota.exhausted', {limit: usage.limit})
})
</script>

<template>
  <main class="ai-workspace">
    <ModuleHeader
        :title="t('ai.title')"
        :subtitle="t('ai.subtitle')"
        :badge="props.badge"
    >
      <template #icon>
        <AiIcon :size="18"/>
      </template>
    </ModuleHeader>

    <div v-if="selectedTargets.length || documentApplyTargetLabel" class="ai-workspace__scope">
      <TagChip v-for="target in selectedTargets" :key="target.id">
        <template #icon>
          <DbTypeIcon :db-type="target.dbType" :size="DB_TYPE_ICON_SIZE.compact"/>
        </template>
        {{ formatTargetLabel(target) }}
      </TagChip>
      <TagChip v-if="documentApplyTargetLabel" class="ai-workspace__doc-target">
        <template #icon>
          <DwIcon name="file" size="sm" :stroke-width="1.5"/>
        </template>
        {{ t('ai.documentApplyTarget', {name: documentApplyTargetLabel}) }}
      </TagChip>
    </div>
    <p v-else class="ai-workspace__scope-hint">
      {{ t('ai.noDatabaseSelected') }}
      <span class="ai-workspace__scope-sep">·</span>
      {{ t('ai.documentApplyTargetHint') }}
    </p>

    <div class="ai-workspace__body">
      <AiFederatedScopeBanner :target-count="selectedTargets.length"/>
      <div class="ai-workspace__messages">
        <AiChatMessageList
            ref="listRef"
            :messages="messages"
            :sending="sending"
            :show-quick-prompts="showQuickPrompts"
            :quick-prompts="quickPrompts"
            :user-initial="userInitial"
            :capabilities="capabilities"
            :extract-sql="extractSql"
            :session-id="sessionId"
            :analysis-steps="analysisSteps"
            :analysis-streaming="analysisStreaming"
            :chat-streaming="chatStreaming"
            :sql-confirm-pending="sqlConfirmPending"
            :resuming-sql="resumingSql"
            :can-apply-to-document="canApplyToDocument"
            :can-undo-apply-to-document="canUndoApplyToDocument"
            @open-in-console="emit('openInConsole', $event)"
            @apply-to-document="emit('applyToDocument', $event)"
            @undo-apply-to-document="emit('undoApplyToDocument')"
            @quick-prompt="emit('quickPrompt', $event)"
            @confirm-sql="emit('confirmSql')"
            @cancel-sql="emit('cancelSql')"
        />
      </div>
    </div>

    <footer class="ai-workspace__footer">
      <AiQuotaUsageMeter
          class="ai-workspace__quota-meter"
          :usage="tenantAiUsage"
          :near-limit="!!tenantAiNearLimit"
      />
      <DwInlineAlert
          v-if="quotaExhaustedMessage"
          class="ai-workspace__quota-alert"
          variant="error"
          density="banner"
          :message="quotaExhaustedMessage"
      />
      <DwInlineAlert
          v-else-if="quotaNearLimitMessage"
          class="ai-workspace__quota-alert"
          variant="warning"
          density="banner"
          :message="quotaNearLimitMessage"
      />

      <AiAnalysisTemplateBar
          v-if="selectedTargetIds && analysisMode"
          :prompt="input"
          :selected-target-ids="selectedTargetIds"
          :analysis-mode="analysisMode"
          @apply="emit('applyTemplate', $event)"
      />

      <AiChatComposer
          ref="composerRef"
          v-model="input"
          :sending="composerBusy"
          :quota-exhausted="!!tenantAiExhausted"
          :selected-targets="selectedTargets"
          :format-target-label="formatTargetLabel"
          @send="emit('send', $event)"
          @stop="emit('stop')"
          @remove-target="emit('removeTarget', $event)"
          @keydown="emit('keydown', $event)"
      />
    </footer>
  </main>
</template>

<style scoped>
.ai-workspace {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--dw-panel-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-editor);
  box-shadow: var(--dw-panel-shadow);
  overflow: hidden;
}

.ai-workspace__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--dw-bg-editor);
}

.ai-workspace__messages {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ai-workspace__scope {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-sm);
  padding: var(--dw-space-5) var(--dw-space-9);
  border-bottom: 1px solid var(--dw-border-light);
  background: color-mix(in srgb, var(--dw-bg-panel) 70%, var(--dw-bg-editor));
}

.ai-workspace__scope-hint {
  margin: 0;
  padding: var(--dw-space-5) var(--dw-space-9);
  border-bottom: 1px solid var(--dw-border-light);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
  background: color-mix(in srgb, var(--dw-bg-panel) 70%, var(--dw-bg-editor));
}

.ai-workspace__scope-sep {
  margin: 0 var(--dw-space-2);
  opacity: 0.55;
}

.ai-workspace__footer {
  flex-shrink: 0;
  border-top: 1px solid var(--dw-border-light);
  background: var(--dw-bg-panel);
}

.ai-workspace__quota-meter {
  margin: var(--dw-space-5) var(--dw-space-10) 0;
}

.ai-workspace__quota-alert {
  margin: var(--dw-space-5) var(--dw-space-10) 0;
}
</style>
