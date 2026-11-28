<!--
  SQL 控制台编辑区：AI 层、参数面板、Monaco。
  通过 editorRefs 宿主对象回写父级 Ref，避免模板自动解包。
-->
<script setup lang="ts">
import type {Ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {defineEditionAsyncComponent} from '@/features/pack/define-edition-async-component'
import {SqlEditor} from '@datawise/sql-editor'
import type {SqlEditorExpose} from '@datawise/sql-editor'
import type {SqlSchemaProvider} from '@datawise/sql-editor/types'
import SqlParameterPanel from '@/features/workspace/components/SqlParameterPanel.vue'
import DwPanelState from '@/core/components/DwPanelState.vue'
import type {WorkspaceTab, DbType} from '@/core/types'

defineOptions({name: 'SqlConsoleEditorSection'})

export type SqlConsoleEditorRefs = {
  editor: Ref<SqlEditorExpose | undefined>
  aiLayer: Ref<any>
}

const SqlConsoleAiLayer = defineEditionAsyncComponent(
  () => import('@/features/workspace/components/tabs/SqlConsoleAiLayer.vue'),
  () => import('@/features/pack/stubs/AiConsoleLayerStub.vue'),
)

const props = defineProps<{
  tab: WorkspaceTab
  sql: string
  editorReady: boolean
  editorRefs: SqlConsoleEditorRefs
  parameterNames: string[]
  sqlParamValues: Record<string, string>
  aiSelectionSql: string
  connectionId: string
  databaseName?: string
  dbDialect?: DbType | string
  sourceLabel: string
  activeInstanceLabel: string | null
  schemaProvider: SqlSchemaProvider
  mountConsoleAiLayer: boolean
  consoleAiEnabled: boolean
  aiSqlFixEnabled: boolean
  indexSuggestEnabled: boolean
  aiResultSummaryEnabled: boolean
  aiExplainEnabled: boolean
  getSql: () => string
  setSql: (value: string) => void
  getEditor: () => SqlEditorExpose | undefined
  onEditorDragOver: (event: DragEvent) => void
  onEditorDrop: (event: DragEvent) => void
}>()

const emit = defineEmits<{
  'update:sql': [value: string]
  'update:sqlParamValues': [value: Record<string, string>]
  'update:aiSelectionSql': [value: string]
  contextmenu: [payload: {x: number; y: number; selectedText: string}]
  'selection-change': [payload: {selectedText: string; x: number; y: number} | null]
  'run-statement': [payload: {sql: string; anchorLine: number}]
  'open-table': [payload: {tableName: string; tableId?: string; catalog?: string}]
}>()

const {t} = useI18n()

function bindEditor(el: unknown) {
  props.editorRefs.editor.value = (el as SqlEditorExpose | null) ?? undefined
}

function bindAiLayer(el: unknown) {
  props.editorRefs.aiLayer.value = el
}
</script>

<template>
  <SqlConsoleAiLayer
      v-if="mountConsoleAiLayer"
      :ref="bindAiLayer"
      :selection-sql="aiSelectionSql"
      @update:selection-sql="emit('update:aiSelectionSql', $event)"
      :tab="tab"
      :get-sql="getSql"
      :set-sql="setSql"
      :connection-id="connectionId"
      :database-name="databaseName ?? ''"
      :db-dialect="dbDialect"
      :source-label="sourceLabel"
      :active-instance-label="activeInstanceLabel"
      :console-ai-enabled="consoleAiEnabled"
      :ai-sql-fix-enabled="aiSqlFixEnabled"
      :index-suggest-enabled="indexSuggestEnabled"
      :ai-result-summary-enabled="aiResultSummaryEnabled"
      :ai-explain-enabled="aiExplainEnabled"
      :get-editor="getEditor"
  />
  <SqlParameterPanel
      :parameter-names="parameterNames"
      :values="sqlParamValues"
      @update:values="emit('update:sqlParamValues', $event)"
  />
  <div
      class="editor-surface"
      @dragover.capture="onEditorDragOver"
      @drop.capture="onEditorDrop"
  >
    <SqlEditor
        v-if="editorReady"
        :ref="bindEditor"
        :model-value="sql"
        @update:model-value="emit('update:sql', $event)"
        :connection-id="connectionId"
        :database-name="databaseName"
        :schema-provider="schemaProvider"
        :dialect="dbDialect"
        @contextmenu="emit('contextmenu', $event)"
        @selection-change="emit('selection-change', $event)"
        @run-statement="emit('run-statement', $event)"
        @open-table="emit('open-table', $event)"
    />
    <DwPanelState
        v-else
        class="editor-surface__loading"
        status="loading"
        fill
        compact
        :message="t('common.editorLoading')"
    />
  </div>
</template>

<style scoped src="../../styles/sql-console-tab.css"></style>
