<script setup lang="ts">
import {computed, ref} from 'vue'
import {QueryResultPane} from '@/features/workspace/components'
import TableDataChangeHistoryPanel from '@/features/workspace/components/TableDataChangeHistoryPanel.vue'
import GridSaveSqlPreviewDialog from '@/features/workspace/components/GridSaveSqlPreviewDialog.vue'
import type {GridPendingBatch} from '@/core/composables/useGridPendingEdit'
import type {WorkspaceTab} from '@/core/types'
import type {QueryResultItem} from '@/features/workspace/types'
import {useTableDataView} from '@/features/workspace/composables/useTableDataView'
import {useQueryResultAiSummary} from '@/features/workspace/composables/useQueryResultAiSummary'
import {buildTableAskPrompt, requestAiAsk} from '@/features/ai/shared/services/ai-ask.service'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {useFeaturePermission} from '@/features/auth/composables/useFeaturePermission'
import {FeaturePermission} from '@/features/auth/types/feature-permission.types'
import {isProductionEnvironment} from '@/features/connection/services/connection-environment.service'
import {useI18n} from 'vue-i18n'
import DwPanelState from '@/core/components/DwPanelState.vue'

const props = defineProps<{ tab: WorkspaceTab }>()
const {t} = useI18n()
const layout = useLayoutStore()
const explorer = useExplorerStore()
const appConfig = useAppConfigStore()
const workspace = useWorkspaceStore()
const pluginStore = usePluginStore()
const {can} = useFeaturePermission()

const aiResultSummaryEnabled = computed(
    () =>
        import.meta.env.VITE_DATAWISE_EDITION !== 'standard'
        && pluginStore.isEnabled('p-ai-result-summary')
        && can(FeaturePermission.WorkbenchResultAiSummary),
)

const showFakeDataAction = computed(
    () => pluginStore.isEnabled('p-fake-data') && Boolean(props.tab.tableName?.trim()),
)

/** P2-2：AI 全局入口在表数据页同样可用，不依赖结果摘要插件 */
const canAskAi = computed(
    () => import.meta.env.VITE_DATAWISE_EDITION !== 'standard' && layout.canAccessNavModule('ai'),
)

const dmlGenerateEnabled = computed(() => pluginStore.isSwitchEnabled('p-dml-generate'))

const connectionLabel = computed(
    () => explorer.findNode(props.tab.connectionId ?? '')?.label ?? t('common.unnamedConnection'),
)

function onGenerateFakeData() {
  workspace.requestFakeDataDialog(props.tab.id)
}

const {
  tableData,
  tableProperties,
  viewOptions,
  gridEditable,
  effectiveCanDelete,
  effectiveCanUpdate,
  editDisabledHint,
  primaryKeyColumns,
  submitChanges,
  tableHasMore,
  loading,
  cursorLoading,
  productionPerfActive,
  loadMore,
  refresh,
  databaseName,
  changeRevision,
  supportsDocumentFilter,
  documentFilterDraft,
  documentFilterError,
  appliedDocumentFilter,
  applyDocumentFilter,
  clearDocumentFilter,
} = useTableDataView(props.tab)

/** 首屏尚无列信息时整页占位，避免空工具栏挤在左上角 */
const showBootstrapLoading = computed(
    () => loading.value && tableData.value.columns.length === 0,
)

async function onAuditRestored() {
  await refresh()
}

/** T-GRID-1：保存前先预览 SQL，确认后再走现有 mutate */
const savePreviewOpen = ref(false)
const savePreviewBatch = ref<GridPendingBatch | null>(null)
const savePreviewConfirming = ref(false)
let savePreviewResolver: ((ok: boolean) => void) | null = null

async function onSubmitChanges(batch: GridPendingBatch) {
  savePreviewBatch.value = batch
  savePreviewOpen.value = true
  const confirmed = await new Promise<boolean>((resolve) => {
    savePreviewResolver = resolve
  })
  if (!confirmed) {
    savePreviewOpen.value = false
    savePreviewBatch.value = null
    return false
  }

  savePreviewConfirming.value = true
  try {
    const ok = await submitChanges(batch)
    if (!ok) {
      layout.showErrorToast(t('dataGrid.submitFailed'))
    }
    return ok
  } finally {
    savePreviewConfirming.value = false
    savePreviewOpen.value = false
    savePreviewBatch.value = null
  }
}

function onSavePreviewConfirm() {
  if (!savePreviewResolver || savePreviewConfirming.value) return
  const resolve = savePreviewResolver
  savePreviewResolver = null
  resolve(true)
}

function onSavePreviewCancel() {
  if (savePreviewConfirming.value) return
  if (!savePreviewResolver) {
    savePreviewOpen.value = false
    savePreviewBatch.value = null
    return
  }
  const resolve = savePreviewResolver
  savePreviewResolver = null
  resolve(false)
}

function onSavePreviewOpenChange(open: boolean) {
  if (!open) onSavePreviewCancel()
}

const gridStateScope = computed(() => {
  const tab = props.tab
  if (!tab.connectionId || !tab.tableName) return undefined
  const database = tab.database ?? tab.instanceId ?? ''
  return `table:${tab.connectionId}:${database}:${tab.tableName}`
})

const exportSuggestMask = computed(() => {
  const connId = props.tab.connectionId
  if (!connId) return false
  const node = explorer.findNode(connId)
  return isProductionEnvironment(node?.env, node?.envCustom)
})

const {
  summaryOpen: aiSummaryOpen,
  summaryText: aiSummaryText,
  loading: aiSummaryLoading,
  summarize: summarizeActiveResult,
  closeSummary: closeAiSummary,
} = useQueryResultAiSummary({
  getConnectionId: () => props.tab.connectionId,
  getDatabase: () => props.tab.database ?? props.tab.instanceId ?? undefined,
  getDbType: () => explorer.findNode(props.tab.connectionId ?? '')?.dbType,
  getConnectionLabel: () =>
      explorer.findNode(props.tab.connectionId ?? '')?.label ?? t('common.unnamedConnection'),
  resolveAiPrefs: () => appConfig.aiPreferences,
})

const tableResultSnapshot = computed<QueryResultItem>(() => ({
  id: 'table-data',
  label: props.tab.tableName ?? 'Result 1',
  sql: `SELECT * FROM ${props.tab.tableName ?? 'table'}`,
  columns: tableData.value.columns,
  rows: tableData.value.rows,
  total: tableData.value.rows.length,
  where: viewOptions.value.where,
  orderBy: viewOptions.value.orderBy,
  durationMs: 0,
  status: 'success',
}))

function onRequestAiSummary() {
  void summarizeActiveResult(tableResultSnapshot.value)
}

/** P2-2：这张表的浏览结果也能直接交给 AI 工作台，表顺手进 AI 数据范围 */
function onRequestAiAsk() {
  const table = props.tab.tableName?.trim()
  const connectionId = props.tab.connectionId
  const database = databaseName.value
  if (!table || !connectionId || !database) return
  layout.setModule('ai')
  void requestAiAsk({
    prompt: buildTableAskPrompt(table),
    scope: {connectionId, database, tables: [table]},
  })
}
</script>

<template>
  <div class="table-data-tab">
    <DwPanelState
        v-if="showBootstrapLoading"
        class="table-data-tab__boot"
        status="loading"
        fill
        :message="t('workspace.tableDetail.loading')"
    />
    <template v-else>
    <div
        v-if="supportsDocumentFilter"
        class="mongo-filter-bar"
        :class="{
          'is-active': Boolean(appliedDocumentFilter),
          'is-error': Boolean(documentFilterError),
        }"
    >
      <div class="mongo-filter-bar__label-field">
        <label class="mongo-filter-bar__label" for="mongo-document-filter">
          {{ t('dataGrid.documentFilter.label') }}
        </label>
      </div>
      <div class="mongo-filter-bar__query-field">
        <input
            id="mongo-document-filter"
            v-model="documentFilterDraft"
            class="mongo-filter-bar__input"
            type="text"
            spellcheck="false"
            autocomplete="off"
            :placeholder="t('dataGrid.documentFilter.placeholder')"
            :title="appliedDocumentFilter
              ? t('dataGrid.documentFilter.active')
              : `${t('dataGrid.documentFilter.hint')} · ${t('dataGrid.documentView.openHint')}`"
            @keydown.enter.prevent="applyDocumentFilter"
        />
        <button
            class="dw-text-btn dw-text-btn--accent"
            type="button"
            @click="applyDocumentFilter"
        >
          {{ t('dataGrid.documentFilter.apply') }}
        </button>
        <button
            class="dw-text-btn"
            type="button"
            :disabled="!documentFilterDraft && !appliedDocumentFilter"
            @click="clearDocumentFilter"
        >
          {{ t('dataGrid.documentFilter.clear') }}
        </button>
      </div>
      <p v-if="documentFilterError" class="mongo-filter-bar__error">{{ documentFilterError }}</p>
    </div>
    <QueryResultPane
        :enable-ai-summary="aiResultSummaryEnabled"
        :enable-fake-data="showFakeDataAction"
        :enable-dml-generate="dmlGenerateEnabled"
        :dml-connection-id="tab.connectionId"
        :dml-connection-name="connectionLabel"
        :dml-database="databaseName"
        :ai-summary-loading="aiSummaryLoading"
        :ai-summary-open="aiSummaryOpen"
        :ai-summary-text="aiSummaryText"
        :grid-state-scope="gridStateScope"
        :editable="gridEditable"
        :read-only-hint="editDisabledHint"
        :can-delete="effectiveCanDelete"
        :can-update="effectiveCanUpdate"
        :column-details="tableProperties.columns"
        :pk-columns="primaryKeyColumns"
        :table-auto-increment="tableProperties.autoIncrement"
        :columns="tableData.columns"
        :rows="tableData.rows"
        :total="tableData.rows.length"
        :show-filter="viewOptions.showFilter"
        :where="viewOptions.where"
        :order-by="viewOptions.orderBy"
        :result-label="tab.tableName ?? 'Result 1'"
        :export-name="`${tab.tableName ?? 'table'}.csv`"
        :export-suggest-mask="exportSuggestMask"
        :on-submit-changes="onSubmitChanges"
        :result-has-more="tableHasMore"
        :loading="loading"
        :cursor-loading="cursorLoading"
        :cursor-trimmed-rows="tableData.cursorTrimmedRows"
        :production-perf-active="productionPerfActive"
        :enable-row-document-view="supportsDocumentFilter"
        :show-ai-ask="canAskAi"
        @refresh="refresh"
        @load-more="loadMore"
        @request-ai-summary="onRequestAiSummary"
        @request-ai-ask="onRequestAiAsk"
        @close-ai-summary="closeAiSummary"
        @generate-fake-data="onGenerateFakeData"
    />
    <TableDataChangeHistoryPanel
        :table-name="tab.tableName"
        :connection-id="tab.connectionId"
        :database="databaseName"
        :can-restore="gridEditable"
        :refresh-token="changeRevision"
        @restored="onAuditRestored"
    />
    <GridSaveSqlPreviewDialog
        :open="savePreviewOpen"
        :batch="savePreviewBatch"
        :table-name="tab.tableName ?? 'table'"
        :columns="tableData.columns"
        :pk-columns="primaryKeyColumns"
        :confirming="savePreviewConfirming"
        @update:open="onSavePreviewOpenChange"
        @confirm="onSavePreviewConfirm"
        @cancel="onSavePreviewCancel"
    />
    </template>
  </div>
</template>

<style scoped>
.table-data-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.table-data-tab__boot {
  flex: 1;
  min-height: 0;
}

.mongo-filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  flex-shrink: 0;
  min-height: var(--dw-tab-height);
  border-bottom: 1px solid color-mix(in srgb, var(--dw-border-light) 55%, transparent);
  background: color-mix(in srgb, var(--dw-bg-panel) 94%, var(--dw-bg-editor));
}

.mongo-filter-bar.is-active {
  border-bottom-color: color-mix(in srgb, var(--dw-primary) 35%, var(--dw-border-light));
}

.mongo-filter-bar.is-error {
  border-bottom-color: color-mix(in srgb, var(--dw-danger) 40%, var(--dw-border-light));
}

.mongo-filter-bar__label-field {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  padding: 0 var(--dw-space-5);
  border-right: 1px solid color-mix(in srgb, var(--dw-border-light) 55%, transparent);
  background: color-mix(in srgb, var(--dw-bg-muted) 22%, transparent);
}

.mongo-filter-bar__label {
  color: var(--dw-text-primary);
  font-size: var(--dw-text-sm);
  font-weight: 500;
  font-family: var(--dw-mono);
  white-space: nowrap;
  cursor: pointer;
}

.mongo-filter-bar.is-active .mongo-filter-bar__label {
  color: var(--dw-primary);
}

.mongo-filter-bar__query-field {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  gap: var(--dw-gap-sm);
  min-width: 0;
  padding: 0 var(--dw-space-4);
}

.mongo-filter-bar__input {
  flex: 1 1 auto;
  min-width: 0;
  height: var(--dw-tab-height);
  padding: 0;
  border: none;
  background: transparent;
  color: var(--dw-text-primary);
  font-family: var(--dw-mono);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-tab-height);
}

.mongo-filter-bar__input::placeholder {
  color: var(--dw-text-muted);
}

.mongo-filter-bar__input:focus {
  outline: none;
}

.mongo-filter-bar__error {
  flex: 1 0 100%;
  margin: 0;
  padding: var(--dw-space-2) var(--dw-space-5) var(--dw-space-3);
  border-top: 1px solid color-mix(in srgb, var(--dw-danger) 20%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-danger) 6%, var(--dw-bg-panel));
  color: var(--dw-danger);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-snug);
}
</style>
