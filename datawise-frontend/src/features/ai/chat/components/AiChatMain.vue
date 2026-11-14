<!--
  AI 对话主区域（布局参照 WorkspaceArea 中间工作区）
-->
<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
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
  /** 未选表且未进入通用问答模式：拦截发送并给出选表入口 */
  needsScope?: boolean
  /** 用户显式选择的「通用问答」 */
  generalMode?: boolean
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
  openScope: []
  toggleGeneral: []
  scopeBlocked: []
  pinConclusion: [messageId: string]
  archiveConclusion: [messageId: string]
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
  focusInput: () => composerRef.value?.focus(),
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
      <template v-if="$slots.binding" #extra>
        <slot name="binding"/>
      </template>
    </ModuleHeader>

    <!-- 表范围只在输入框旁展示；此处仅保留「将写回本地文件」提示，避免三处重复连接路径 -->
    <div v-if="documentApplyTargetLabel" class="ai-workspace__scope">
      <TagChip class="ai-workspace__doc-target">
        <template #icon>
          <DwIcon name="file" size="sm" :stroke-width="1.5"/>
        </template>
        {{ t('ai.documentApplyTarget', {name: documentApplyTargetLabel}) }}
      </TagChip>
    </div>

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
            @pin-conclusion="emit('pinConclusion', $event)"
            @archive-conclusion="emit('archiveConclusion', $event)"
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
          :needs-scope="!!needsScope"
          :general-mode="!!generalMode"
          @send="emit('send', $event)"
          @stop="emit('stop')"
          @remove-target="emit('removeTarget', $event)"
          @keydown="emit('keydown', $event)"
          @open-scope="emit('openScope')"
          @toggle-general="emit('toggleGeneral')"
          @scope-blocked="emit('scopeBlocked')"
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
  padding: var(--dw-space-3) var(--dw-space-9);
  border-bottom: 1px solid var(--dw-border-light);
}

.ai-workspace :deep(.dw-page-head__extra) {
  margin-top: var(--dw-space-4);
  min-height: 0;
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
