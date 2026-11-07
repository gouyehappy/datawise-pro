<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {defineAsyncComponent} from 'vue'
import {AiPromptBar} from '@/features/workspace/components'
import type {WorkspaceTab, DbType} from '@/core/types'
import type {SqlEditorExpose} from '@datawise/sql-editor'
import type {QueryResultItem} from '@/features/workspace/types'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useAiPromptPanel} from '@/features/workspace/composables/useAiPromptPanel'
import {useAiSqlFix} from '@/features/workspace/composables/useAiSqlFix'
import {useAiIndexSuggest} from '@/features/workspace/composables/useAiIndexSuggest'
import {useQueryResultAiSummary} from '@/features/workspace/composables/useQueryResultAiSummary'
import {useExplainPlanAiInterpret} from '@/features/workspace/composables/useExplainPlanAiInterpret'
import {appendConsoleAiSql} from '@/features/workspace/services/console-ai-sql.service'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {requiresWriteAccess} from '@/features/team/services/connection-access.service'
import {isDangerousSql} from '@/features/workspace/services/dangerous-sql-preview.service'

const AiSqlFixDialog = defineAsyncComponent(
    () => import('@/features/workspace/components/AiSqlFixDialog.vue'),
)
const IndexSuggestDialog = defineAsyncComponent(
    () => import('@/features/workspace/components/IndexSuggestDialog.vue'),
)

const props = defineProps<{
    tab: WorkspaceTab
    connectionId: string
    databaseName: string
    dbDialect: DbType | undefined
    sourceLabel: string
    activeInstanceLabel: string | null
    consoleAiEnabled: boolean
    aiSqlFixEnabled: boolean
    indexSuggestEnabled: boolean
    aiResultSummaryEnabled: boolean
    aiExplainEnabled: boolean
    getEditor: () => SqlEditorExpose | undefined
    getSql: () => string
    setSql: (value: string) => void
}>()

const selectionSql = defineModel<string>('selectionSql', {default: ''})

const {t} = useI18n()
const appConfig = useAppConfigStore()
const workspace = useWorkspaceStore()
const toast = useAppToast()

async function resolveAiSqlRequest() {
    const connId = props.connectionId || props.tab.connectionId
    const db = props.databaseName
    if (!connId || !db) return undefined

    return {
        connectionId: connId,
        database: db,
        prefs: appConfig.aiPreferences,
    }
}

const {
    visible: showAiInput,
    prompt: aiPrompt,
    generating: aiGenerating,
    panelRef: aiPanelRef,
    open: openAiInput,
    toggle: toggleAiInput,
    close: closeAiInput,
    submit: submitAiPrompt,
} = useAiPromptPanel(({prompt, sql: generated}) => {
    const {text, focusLine} = appendConsoleAiSql(props.getSql(), prompt, generated)
    props.setSql(text)
    if (requiresWriteAccess(generated) || isDangerousSql(generated)) {
        workspace.setStatus(t('console.aiGovernanceHint'))
        toast.warning(t('console.aiGovernanceHint'))
    }
    void nextTick(() => {
        requestAnimationFrame(() => {
            props.getEditor()?.goToLine(focusLine, false)
            props.getEditor()?.layout()
        })
    })
}, {resolveRequest: resolveAiSqlRequest})

const {
    fixDialogOpen,
    fixOriginal,
    fixSuggested,
    fixing: aiFixLoading,
    requestFix: requestAiSqlFix,
    applyFix,
} = useAiSqlFix({
    getSql: () => props.getSql(),
    setSql: (value) => {
        props.setSql(value)
    },
    focusEditorLine: (line) => {
        void nextTick(() => {
            requestAnimationFrame(() => {
                props.getEditor()?.goToLine(line, false)
                props.getEditor()?.layout()
            })
        })
    },
    getConnectionId: () => props.connectionId || props.tab.connectionId,
    getDatabase: () => props.databaseName,
    getDbType: () => props.dbDialect,
    getConnectionLabel: () => props.sourceLabel || t('common.unnamedConnection'),
    getSelection: () => props.getEditor()?.getSelectedText()?.trim() || selectionSql.value || undefined,
    resolveAiPrefs: () => appConfig.aiPreferences,
})

const {
    dialogOpen: indexSuggestDialogOpen,
    originalSql: indexSuggestQuery,
    suggestedSql: indexSuggestDraft,
    loading: aiIndexSuggestLoading,
    requestSuggest: requestAiIndexSuggest,
    applySuggest: applyIndexSuggest,
} = useAiIndexSuggest({
    getConnectionId: () => props.connectionId || props.tab.connectionId,
    getDatabase: () => props.databaseName,
    getDbType: () => props.dbDialect,
    getConnectionLabel: () => props.sourceLabel || t('common.unnamedConnection'),
    resolveAiPrefs: () => appConfig.aiPreferences,
    openConsole: (options) => workspace.openConsole(options),
    buildConsoleTitle: () => t('queryResult.indexSuggestConsoleTitle'),
})

const {
    summaryOpen: aiSummaryOpen,
    summaryText: aiSummaryText,
    loading: aiSummaryLoading,
    summarize: summarizeActiveResult,
    closeSummary: closeAiSummary,
} = useQueryResultAiSummary({
    getConnectionId: () => props.connectionId || props.tab.connectionId,
    getDatabase: () => props.databaseName,
    getDbType: () => props.dbDialect,
    getConnectionLabel: () => props.sourceLabel || t('common.unnamedConnection'),
    resolveAiPrefs: () => appConfig.aiPreferences,
})

const {
    interpretOpen: aiExplainOpen,
    interpretText: aiExplainText,
    loading: aiExplainLoading,
    interpret: interpretActiveExplainPlan,
    closeInterpret: closeAiExplain,
} = useExplainPlanAiInterpret({
    getConnectionId: () => props.connectionId || props.tab.connectionId,
    getDatabase: () => props.databaseName,
    getDbType: () => props.dbDialect,
    getConnectionLabel: () => props.sourceLabel || t('common.unnamedConnection'),
    resolveAiPrefs: () => appConfig.aiPreferences,
})

const aiContextLabel = computed(
    () => props.activeInstanceLabel ?? props.sourceLabel ?? null,
)

const aiQuickActions = computed(() => {
    if (!selectionSql.value.trim()) return []
    const actions = [
        {id: 'explain', label: t('console.editorMenu.explain')},
        {id: 'optimize', label: t('console.editorMenu.optimize')},
        {id: 'rewrite', label: t('console.editorMenu.rewrite')},
        {id: 'generate-insert', label: t('console.editorMenu.generateInsert')},
    ]
    if (props.indexSuggestEnabled) {
        actions.push({id: 'suggest-index', label: t('console.editorMenu.suggestIndex')})
    }
    return actions
})

function applyConsoleAiQuickAction(actionId: string) {
    const selected = selectionSql.value.trim()
    if (!selected) return
    if (actionId === 'suggest-index') {
        void requestAiIndexSuggest({sql: selected})
        return
    }
    const promptByAction: Record<string, string> = {
        explain: t('console.explainPrompt', {sql: selected}),
        optimize: t('console.optimizePrompt', {sql: selected}),
        rewrite: t('console.rewritePrompt', {sql: selected}),
        'generate-insert': t('console.generateInsertPrompt', {sql: selected}),
    }
    const prompt = promptByAction[actionId]
    if (!prompt) return
    aiPrompt.value = prompt
    void submitAiPrompt()
}

function onRequestAiSummary(result: QueryResultItem) {
  void summarizeActiveResult(result)
}

function onRequestAiExplain(result: QueryResultItem) {
    if (!result.explainPlan?.length || !result.sql?.trim()) return
    void interpretActiveExplainPlan({
        sql: result.sql,
        explainPlan: result.explainPlan,
        explainMode: result.explainMode,
    })
}

watch(showAiInput, async (visible) => {
    if (visible) {
        selectionSql.value = props.getEditor()?.getSelectedText()?.trim() ?? ''
    }
    await nextTick()
    props.getEditor()?.layout()
})

defineExpose({
    showAiInput,
    openAiInput,
    toggleAiInput,
    closeAiInput,
    requestAiSqlFix,
    requestAiIndexSuggest,
    onRequestAiSummary,
    onRequestAiExplain,
    closeAiSummary,
    closeAiExplain,
    aiFixLoading,
    aiSummaryLoading,
    aiSummaryOpen,
    aiSummaryText,
    aiIndexSuggestLoading,
    aiExplainLoading,
    aiExplainOpen,
    aiExplainText,
    fixDialogOpen,
    fixOriginal,
    fixSuggested,
    applyFix,
    indexSuggestDialogOpen,
    indexSuggestQuery,
    indexSuggestDraft,
    applyIndexSuggest,
})
</script>

<template>
  <AiPromptBar
      v-if="showAiInput && consoleAiEnabled"
      ref="aiPanelRef"
      v-model="aiPrompt"
      :generating="aiGenerating"
      :context-label="aiContextLabel"
      :quick-actions="aiQuickActions"
      @submit="submitAiPrompt"
      @close="closeAiInput"
      @quick-action="applyConsoleAiQuickAction"
  />
  <AiSqlFixDialog
      v-if="aiSqlFixEnabled"
      v-model:open="fixDialogOpen"
      :original-sql="fixOriginal"
      :suggested-sql="fixSuggested"
      :loading="aiFixLoading"
      @apply="applyFix"
  />
  <IndexSuggestDialog
      v-if="indexSuggestEnabled"
      v-model:open="indexSuggestDialogOpen"
      :query-sql="indexSuggestQuery"
      :suggested-sql="indexSuggestDraft"
      :loading="aiIndexSuggestLoading"
      @apply="applyIndexSuggest"
  />
</template>
