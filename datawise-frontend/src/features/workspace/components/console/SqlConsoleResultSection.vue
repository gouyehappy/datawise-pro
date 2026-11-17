<!--
  SQL 控制台结果区：分割条、结果面板、收起态重开条。
-->
<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {QueryResultPane} from '@/features/workspace/components'
import ResizeHandle from '@/core/components/ResizeHandle.vue'
import {
  CONSOLE_EDITOR_HEIGHT_MAX,
  CONSOLE_EDITOR_HEIGHT_MIN,
} from '@/features/workspace/constants/defaults'
import type {QueryResultRefreshRequest} from '@/features/workspace/services/query-result-refresh.service'
import type {ExplainPlanNode} from '@/features/workspace/types/explain-plan'
import type {DbType} from '@/core/types'

defineOptions({name: 'SqlConsoleResultSection'})

defineProps<{
  showResultPanel: boolean
  isEditorFullscreen: boolean
  mountResultPane: boolean
  canReopenResultPanel: boolean
  editorHeight: number
  results: unknown[]
  activeView: number
  running: boolean
  runningElapsedMs: number
  dmlGenerateEnabled: boolean
  dmlConnectionId?: string
  dmlConnectionName?: string
  dmlDatabase?: string
  aiSqlFixEnabled: boolean
  aiFixLoading: boolean
  aiResultSummaryEnabled: boolean
  canAskAi: boolean
  aiSummaryLoading: boolean
  aiSummaryOpen: boolean
  aiSummaryText: string
  indexSuggestEnabled: boolean
  aiIndexSuggestLoading: boolean
  aiExplainEnabled: boolean
  aiExplainLoading: boolean
  aiExplainOpen: boolean
  aiExplainText: string
  crossEnvCompareEnabled: boolean
  dbType?: DbType
  exportSuggestMask: boolean
  productionPerfActive: boolean
  cursorLoading: boolean
}>()

const emit = defineEmits<{
  'update:editorHeight': [value: number]
  expand: []
  collapse: []
  'update:activeView': [value: number]
  'close-result': [index: number]
  'close-other-results': [index: number]
  'close-all-results': []
  'jump-to-error-line': [lineNumber: number]
  'request-ai-fix': [payload: {sql: string; errorMessage: string; errorLine?: number}]
  'request-ai-summary': []
  'request-ai-ask': []
  'close-ai-summary': []
  'request-ai-explain': []
  'close-ai-explain': []
  'request-index-suggest': [payload: {sql: string; explainPlan?: ExplainPlanNode[]; table?: string}]
  'request-ai-index-suggest': [payload: {sql: string; explainPlan?: ExplainPlanNode[]}]
  'open-cross-env-compare': [index: number]
  refresh: [payload?: QueryResultRefreshRequest]
  'load-more': [index: number]
  'raise-max-rows': [maxRows: number]
  'insert-order-by': [payload: {column: string; direction: 'asc' | 'desc'}]
  'insert-where': [payload: {column: string; value: unknown}]
  'insert-where-in': [payload: {column: string; clause: string}]
  'rewrite-where': [payload: {column: string; value: unknown}]
  'rewrite-order-by': [payload: {column: string; direction: 'asc' | 'desc'}]
}>()

const {t} = useI18n()
</script>

<template>
  <div
      v-if="!isEditorFullscreen && showResultPanel"
      class="split__gap"
      aria-hidden="true"
  >
    <ResizeHandle
        :model-value="editorHeight"
        @update:model-value="emit('update:editorHeight', $event)"
        direction="horizontal"
        variant="ghost"
        :min="CONSOLE_EDITOR_HEIGHT_MIN"
        :max="CONSOLE_EDITOR_HEIGHT_MAX"
    />
  </div>
  <QueryResultPane
      v-if="mountResultPane"
      class="result-pane"
      collapsible
      :results="results as any"
      :active-view="activeView"
      always-show-overview
      :running="running"
      :running-elapsed-ms="runningElapsedMs"
      closable-results
      :enable-dml-generate="dmlGenerateEnabled"
      :dml-connection-id="dmlConnectionId"
      :dml-connection-name="dmlConnectionName"
      :dml-database="dmlDatabase"
      :enable-ai-fix="aiSqlFixEnabled"
      :ai-fix-loading="aiFixLoading"
      :enable-ai-summary="aiResultSummaryEnabled"
      :show-ai-ask="canAskAi"
      :ai-summary-loading="aiSummaryLoading"
      :ai-summary-open="aiSummaryOpen"
      :ai-summary-text="aiSummaryText"
      :enable-ai-index-suggest="indexSuggestEnabled"
      :ai-index-suggest-loading="aiIndexSuggestLoading"
      :enable-ai-explain="aiExplainEnabled"
      :ai-explain-loading="aiExplainLoading"
      :ai-explain-open="aiExplainOpen"
      :ai-explain-text="aiExplainText"
      :enable-cross-env-compare="crossEnvCompareEnabled"
      :db-type="dbType"
      :export-suggest-mask="exportSuggestMask"
      :production-perf-active="productionPerfActive"
      :cursor-loading="cursorLoading"
      enable-sql-fill
      @collapse="emit('collapse')"
      @update:active-view="emit('update:activeView', $event)"
      @close-result="emit('close-result', $event)"
      @close-other-results="emit('close-other-results', $event)"
      @close-all-results="emit('close-all-results')"
      @jump-to-error-line="emit('jump-to-error-line', $event)"
      @request-ai-fix="emit('request-ai-fix', $event)"
      @request-ai-summary="emit('request-ai-summary')"
      @request-ai-ask="emit('request-ai-ask')"
      @close-ai-summary="emit('close-ai-summary')"
      @request-ai-explain="emit('request-ai-explain')"
      @close-ai-explain="emit('close-ai-explain')"
      @request-index-suggest="emit('request-index-suggest', $event)"
      @request-ai-index-suggest="emit('request-ai-index-suggest', $event)"
      @open-cross-env-compare="emit('open-cross-env-compare', $event)"
      @refresh="emit('refresh', $event)"
      @load-more="emit('load-more', $event)"
      @raise-max-rows="emit('raise-max-rows', $event)"
      @insert-order-by="emit('insert-order-by', $event)"
      @insert-where="emit('insert-where', $event)"
      @insert-where-in="emit('insert-where-in', $event)"
      @rewrite-where="emit('rewrite-where', $event)"
      @rewrite-order-by="emit('rewrite-order-by', $event)"
  />
  <button
      v-if="!isEditorFullscreen && !showResultPanel && canReopenResultPanel"
      type="button"
      class="result-collapsed-bar"
      :title="t('queryResult.expandPanel')"
      @click="emit('expand')"
  >
    <span class="result-collapsed-bar__label">{{ t('queryResult.panelTitle') }}</span>
  </button>
</template>

<style scoped src="../../styles/sql-console-tab.css"></style>
