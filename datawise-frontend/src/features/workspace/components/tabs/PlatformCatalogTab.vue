<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import DwDataGrid from '@/core/components/DwDataGrid.vue'
import {AppModal, ConfirmDialog, DwInput, FormField, ModalActions, SettingsSwitch} from '@/core/components'
import DwSelect from '@/core/components/DwSelect.vue'
import {DwIcon} from '@/core/icons'
import type {DwDataGridLabels} from '@/core/components/dw-data-grid.types'
import type {SelectOption} from '@/core/components/select.types'
import type {WorkspaceTab} from '@/core/types'
import {platformApi} from '@/api'
import {buildPlatformCatalogColumns} from '@/features/platform/services/platform-catalog.service'
import {
    autoGeneratePlatformSemanticMetrics,
    deletePlatformCatalogItems,
    platformCatalogRowLabel,
} from '@/features/platform/services/platform-catalog-mutations.service'
import {
    buildDataQualityGateExportFilename,
    formatDataQualityGateExport,
    listDataQualityReferenceConnections,
    summarizeMultiEnvGate,
} from '@/features/platform/services/data-quality-multi-env-gate.service'
import AnalysisCanvasRerunDialog from '@/features/platform/components/AnalysisCanvasRerunDialog.vue'
import SchemaDriftReportDialog from '@/features/platform/components/SchemaDriftReportDialog.vue'
import type {DataQualityGateResult, SchemaDriftReport} from '@/features/platform/types/platform.types'
import {useLayoutStore} from '@/features/layout/stores/layout'
import DataQualitySharedTemplatesDialog from '@/features/platform/components/DataQualitySharedTemplatesDialog.vue'
import FederatedViewWizardDialog from '@/features/platform/components/FederatedViewWizardDialog.vue'
import PlatformCatalogFormDialog from '@/features/workspace/components/PlatformCatalogFormDialog.vue'
import {usePlatformCatalog} from '@/features/workspace/composables/usePlatformCatalog'
import ReleaseHighlightsCards from '@/features/layout/components/ReleaseHighlightsCards.vue'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {getTabParam, setTabParam} from '@/features/workspace/services/workspace-tab-params'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import type {ReleaseHighlightAction} from '@/features/layout/services/release-highlights.service'
import {
    FEDERATED_DEFAULT_MAX_ROWS,
    nextFederatedMaxRows,
    resolveFederatedMaxRows,
} from '@/features/platform/services/federated-max-rows.service'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {ApiError, resolveCaughtApiErrorMessage} from '@/shared/api'

const props = defineProps<{ tab: WorkspaceTab }>()
const {t} = useI18n()
const layout = useLayoutStore()
const workspace = useWorkspaceStore()
const explorer = useExplorerStore()
const entitlement = useEntitlementStore()

const {rows, loading, error, reload} = usePlatformCatalog(props.tab)
const selectedKeys = ref<string[]>([])
const formOpen = ref(false)
const federatedWizardOpen = ref(false)
const deleteConfirmOpen = ref(false)
const deleting = ref(false)
const autoGenerating = ref(false)
const runningAction = ref(false)
const canvasRerunOpen = ref(false)
const multiEnvOpen = ref(false)
const multiEnvConnectionId = ref('')
const multiEnvDatabase = ref('')
const multiEnvPairByName = ref(true)
const lastGateResult = ref<DataQualityGateResult | null>(null)
const canvasRerunId = ref<string | null>(null)
const driftReportOpen = ref(false)
const driftReport = ref<SchemaDriftReport | null>(null)
const federatedMaxRows = ref(FEDERATED_DEFAULT_MAX_ROWS)
const federatedSourceOffset = ref(0)
const federatedTruncated = ref(false)
const dqSharedTemplatesOpen = ref(false)

const feature = computed(() => getTabParam(props.tab, 'platformFeature') ?? 'semantic_metrics')
const isSemanticMetrics = computed(() => feature.value === 'semantic_metrics')
const isAnalysisCanvas = computed(() => feature.value === 'analysis_canvas')
const isSchemaDrift = computed(() => feature.value === 'schema_drift')
const isScheduledTasks = computed(() => feature.value === 'scheduled_tasks')
const isDataQuality = computed(() => feature.value === 'data_quality')
const isFederatedViews = computed(() => feature.value === 'federated_views')

const singleSelectedId = computed(() =>
    selectedKeys.value.length === 1 ? selectedKeys.value[0] : null,
)

const canRunAction = computed(() => Boolean(singleSelectedId.value) && !runningAction.value)

const federatedRetryMaxRows = computed(() => {
  if (!federatedTruncated.value) return null
  return nextFederatedMaxRows(federatedMaxRows.value)
})

const canAutoGenerate = computed(() =>
    Boolean(props.tab.connectionId?.trim() && props.tab.database?.trim()),
)

const columns = computed(() => buildPlatformCatalogColumns(feature.value, t))

const gridLabels = computed<Partial<DwDataGridLabels>>(() => ({
  empty: t('workspace.platformCatalog.empty'),
  noMatch: t('workspace.platformCatalog.noMatch'),
  loading: t('workspace.tableDetail.loading'),
}))

const canDelete = computed(() => selectedKeys.value.length > 0)

const deleteConfirmMessage = computed(() => {
  const keys = selectedKeys.value
  if (keys.length === 1) {
    const row = rows.value.find((item) => item.id === keys[0])
    const name = row ? platformCatalogRowLabel(feature.value, row) : keys[0]
    return t('platform.common.confirmDelete', {name})
  }
  return t('workspace.platformCatalog.confirmDeleteBatch', {count: keys.length})
})

function openAdd() {
  if (isFederatedViews.value) {
    if (!entitlement.guardAiNav()) return
    federatedWizardOpen.value = true
    return
  }
  formOpen.value = true
}

function consumeOpenCreateDraft() {
  if (!getTabParam(props.tab, 'platformOpenCreateForm') && !getTabParam(props.tab, 'platformScheduleDraft')) return
  if (feature.value !== 'scheduled_tasks') return
  formOpen.value = true
  setTabParam(props.tab, 'platformOpenCreateForm', false)
}

onMounted(() => {
  consumeOpenCreateDraft()
})

watch(
  () => [props.tab.params?.platformOpenCreateForm, props.tab.params?.platformScheduleDraft] as const,
  () => {
    consumeOpenCreateDraft()
  },
)

function requestDelete() {
  if (!canDelete.value) return
  deleteConfirmOpen.value = true
}

async function confirmDelete() {
  if (!selectedKeys.value.length) return
  deleting.value = true
  try {
    await deletePlatformCatalogItems(feature.value, selectedKeys.value)
    selectedKeys.value = []
    await reload()
  } catch (err) {
    layout.showErrorToast(resolveCaughtApiErrorMessage(err, t, 'platform.common.runFailed'))
  } finally {
    deleting.value = false
    deleteConfirmOpen.value = false
  }
}

async function onSaved() {
  setTabParam(props.tab, 'platformScheduleDraft', undefined)
  setTabParam(props.tab, 'platformOpenCreateForm', false)
  await reload()
}

async function autoGenerateMetrics() {
  const connectionId = props.tab.connectionId?.trim()
  const database = props.tab.database?.trim()
  if (!connectionId || !database || autoGenerating.value) return
  if (!entitlement.guardAiNav()) return
  autoGenerating.value = true
  try {
    const count = await autoGeneratePlatformSemanticMetrics(connectionId, database)
    entitlement.noteAiCallConsumed()
    await reload()
  } catch (err) {
    // ApiError: global notifier already shows toast / paywall.
    if (err instanceof ApiError) return
    layout.showErrorToast(resolveCaughtApiErrorMessage(err, t, 'platform.common.runFailed'))
  } finally {
    autoGenerating.value = false
  }
}

function openCanvasRerun() {
  const id = singleSelectedId.value
  if (!id) return
  if (!entitlement.guardAiNav()) return
  canvasRerunId.value = id
  canvasRerunOpen.value = true
}

async function runSchemaDriftMonitor() {
  const id = singleSelectedId.value
  if (!id || runningAction.value) return
  runningAction.value = true
  try {
    driftReport.value = await platformApi.runSchemaDriftMonitor(id)
    driftReportOpen.value = true
    await reload()
  } catch (err) {
    layout.showErrorToast(resolveCaughtApiErrorMessage(err, t, 'platform.common.runFailed'))
  } finally {
    runningAction.value = false
  }
}

async function runScheduledTask() {
  const id = singleSelectedId.value
  if (!id || runningAction.value) return
  runningAction.value = true
  try {
    await platformApi.runScheduledTask(id)
    await reload()
  } catch (err) {
    layout.showErrorToast(resolveCaughtApiErrorMessage(err, t, 'platform.common.runFailed'))
  } finally {
    runningAction.value = false
  }
}

const selectedIsHttpTrigger = computed(() => {
  const id = singleSelectedId.value
  if (!id) return false
  const row = rows.value.find((item) => item.id === id)
  return row?.type === 'http_trigger'
})

async function pollOrchestrationStatus() {
  const id = singleSelectedId.value
  if (!id || runningAction.value || !selectedIsHttpTrigger.value) return
  runningAction.value = true
  try {
    await platformApi.pollOrchestrationStatus(id)
    await reload()
  } catch (err) {
    layout.showErrorToast(resolveCaughtApiErrorMessage(err, t, 'platform.common.runFailed'))
  } finally {
    runningAction.value = false
  }
}

async function runDataQualityGate() {
  if (runningAction.value) return
  const connectionId = props.tab.connectionId?.trim()
  const database = props.tab.database?.trim()
  runningAction.value = true
  try {
    const selected = selectedKeys.value.filter(Boolean)
    const result = await platformApi.evaluateDataQualityGate({
      ruleIds: selected.length ? selected : undefined,
      connectionId,
      database,
      // when nothing selected, default blocking-only suite for this scope
      blockingOnly: selected.length ? false : true,
    })
    if (!result.passed) {
      layout.showErrorToast(
        t('platform.dq.gateFailed', {failed: result.failed, total: result.total}),
      )
    }
    lastGateResult.value = result
    await reload()
  } catch (err) {
    layout.showErrorToast(resolveCaughtApiErrorMessage(err, t, 'platform.common.runFailed'))
  } finally {
    runningAction.value = false
  }
}

const multiEnvConnectionOptions = computed<SelectOption[]>(() =>
  listDataQualityReferenceConnections(explorer.tree, props.tab.connectionId, t).map((item) => ({
    value: item.value,
    label: item.label,
  })),
)

function openMultiEnvGateDialog() {
  multiEnvConnectionId.value = multiEnvConnectionOptions.value[0]?.value ?? ''
  multiEnvDatabase.value = props.tab.database?.trim() ?? ''
  multiEnvPairByName.value = true
  multiEnvOpen.value = true
}

function openDqSharedTemplatesDialog() {
  dqSharedTemplatesOpen.value = true
}

function onDqSharedTemplateDeleted() {
}

async function confirmMultiEnvGate() {
  if (runningAction.value) return
  const connectionId = props.tab.connectionId?.trim()
  const database = props.tab.database?.trim()
  const referenceConnectionId = multiEnvConnectionId.value.trim()
  if (!referenceConnectionId) {
    layout.showWarningToast(t('platform.dq.multiEnvNeedReference'))
    return
  }
  multiEnvOpen.value = false
  runningAction.value = true
  try {
    const selected = selectedKeys.value.filter(Boolean)
    const result = await platformApi.evaluateDataQualityGate({
      ruleIds: selected.length ? selected : undefined,
      connectionId,
      database,
      blockingOnly: selected.length ? false : true,
      referenceConnectionId,
      referenceDatabase: multiEnvDatabase.value.trim() || database,
      pairByName: multiEnvPairByName.value,
    })
    const summary = summarizeMultiEnvGate(result, (scope, index) => {
      const fallback = index === 0
        ? t('platform.dq.multiEnvPrimary')
        : t('platform.dq.multiEnvReferenceScope')
      const node = scope.connectionId ? explorer.findNode(scope.connectionId) : null
      return node?.label || scope.connectionId || fallback
    })
    const detailParts = [...summary.summaryParts]
    if (summary.unpaired > 0) {
      detailParts.push(t('platform.dq.multiEnvUnpaired', {count: summary.unpaired}))
    }
    const detail = detailParts.join(' · ')
    if (summary.passed) {
    } else {
      layout.showErrorToast(t('platform.dq.multiEnvFailed', {detail}))
    }
    lastGateResult.value = result
    await reload()
  } catch (err) {
    layout.showErrorToast(resolveCaughtApiErrorMessage(err, t, 'platform.common.runFailed'))
  } finally {
    runningAction.value = false
  }
}

async function copyLastGateResult() {
  const result = lastGateResult.value
  if (!result) return
  try {
    await navigator.clipboard.writeText(formatDataQualityGateExport(result))
  } catch (err) {
    layout.showErrorToast(resolveCaughtApiErrorMessage(err, t, 'platform.common.runFailed'))
  }
}

function downloadLastGateResult() {
  const result = lastGateResult.value
  if (!result) return
  const blob = new Blob([formatDataQualityGateExport(result)], {type: 'application/json'})
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = buildDataQualityGateExportFilename(result)
  anchor.click()
  URL.revokeObjectURL(url)
  layout.notifyQuiet({
    category: 'export',
    titleKey: 'exportDone',
    bodyKey: 'exportDone',
    params: {name: t('platform.dq.gateExportDownloaded')},
  })
}

async function executeFederatedView(overrideMaxRows?: number, options?: {nextBatch?: boolean}) {
  const id = singleSelectedId.value
  if (!id || runningAction.value) return
  runningAction.value = true
  const maxRows = resolveFederatedMaxRows(overrideMaxRows ?? federatedMaxRows.value)
  federatedMaxRows.value = maxRows
  const nextBatch = options?.nextBatch === true
  if (!nextBatch) {
    federatedSourceOffset.value = 0
    federatedTruncated.value = false
  }
  const offset = nextBatch ? federatedSourceOffset.value + maxRows : 0
  try {
    const result = await platformApi.executeFederatedView({viewId: id, maxRows, offset})
    federatedSourceOffset.value = result.pageOffset ?? offset
    const rows = result.rowCount ?? 0
    if (result.hasMore) {
      federatedTruncated.value = true
      const next = nextFederatedMaxRows(maxRows)
      if (next != null) {
        layout.showWarningToast(t('platform.federated.executeTruncatedRaise', {rows, limit: maxRows, next}))
      } else {
        layout.showWarningToast(t('platform.federated.executeTruncated', {rows, limit: maxRows}))
      }
    } else {
      federatedTruncated.value = false
    }
  } catch (err) {
    layout.showErrorToast(resolveCaughtApiErrorMessage(err, t, 'platform.common.runFailed'))
  } finally {
    runningAction.value = false
  }
}

function retryFederatedAtNextLimit() {
  const next = federatedRetryMaxRows.value
  if (next != null) void executeFederatedView(next)
}

function executeFederatedNextBatch() {
  if (!federatedTruncated.value) return
  void executeFederatedView(undefined, {nextBatch: true})
}

function runReleaseAction(action: ReleaseHighlightAction) {
  if (action === 'open_federated_wizard') {
    if (!entitlement.guardAiNav()) return
    federatedWizardOpen.value = true
    return
  }
  if (action === 'open_sql_console') {
    layout.setModule('database')
    workspace.openConsole()
    return
  }
  if (action === 'open_ai') {
    if (!entitlement.guardAiNav()) return
    layout.setModule('ai')
  }
}
</script>

<template>
  <div class="platform-catalog-tab dw-workbench-page" data-wb-recipe="wb-extension">
    <ReleaseHighlightsCards scope="platform" @action="runReleaseAction"/>

    <DwDataGrid
        v-model:selected-keys="selectedKeys"
        :rows="rows"
        :columns="columns"
        row-key="id"
        :loading="loading"
        :error="error"
        :labels="gridLabels"
        :show-search="false"
        :column-filter="false"
    >
      <template #toolbar-actions>
        <button type="button" :disabled="loading" @click="openAdd">
          <DwIcon name="plus" size="sm" :stroke-width="1.35"/>
          {{ t('workspace.platformCatalog.add') }}
        </button>
        <button type="button" :disabled="loading || deleting || !canDelete" @click="requestDelete">
          <DwIcon name="delete" size="sm" :stroke-width="1.35"/>
          {{ t('workspace.platformCatalog.delete') }}
        </button>
        <button
            v-if="isAnalysisCanvas"
            type="button"
            :disabled="loading || !canRunAction"
            @click="openCanvasRerun"
        >
          <DwIcon name="run" size="sm" :stroke-width="1.35"/>
          {{ t('platform.canvas.rerun') }}
        </button>
        <button
            v-if="isSchemaDrift"
            type="button"
            :disabled="loading || !canRunAction"
            @click="runSchemaDriftMonitor"
        >
          <DwIcon name="run" size="sm" :stroke-width="1.35"/>
          {{ t('platform.common.run') }}
        </button>
        <button
            v-if="isScheduledTasks || isDataQuality"
            type="button"
            :disabled="loading || !canRunAction"
            @click="runScheduledTask"
        >
          <DwIcon name="run" size="sm" :stroke-width="1.35"/>
          {{ t('platform.common.run') }}
        </button>
        <button
            v-if="isScheduledTasks && selectedIsHttpTrigger"
            type="button"
            :disabled="loading || !canRunAction"
            @click="pollOrchestrationStatus"
        >
          <DwIcon name="refresh" size="sm" :stroke-width="1.35"/>
          {{ t('platform.tasks.orchestrationStatus') }}
        </button>
        <button
            v-if="isDataQuality"
            type="button"
            :disabled="loading"
            @click="openDqSharedTemplatesDialog"
        >
          <DwIcon name="settings" size="sm" :stroke-width="1.35"/>
          {{ t('platform.dq.manageSharedTemplates') }}
        </button>
        <button
            v-if="isDataQuality"
            type="button"
            :disabled="loading || runningAction"
            @click="runDataQualityGate"
        >
          <DwIcon name="run" size="sm" :stroke-width="1.35"/>
          {{ t('platform.dq.runGate') }}
        </button>
        <button
            v-if="isDataQuality"
            type="button"
            :disabled="loading || runningAction || !multiEnvConnectionOptions.length"
            @click="openMultiEnvGateDialog"
        >
          <DwIcon name="tab-cross-env-compare" size="sm" :stroke-width="1.35"/>
          {{ t('platform.dq.runMultiEnvGate') }}
        </button>
        <button
            v-if="isDataQuality"
            type="button"
            :disabled="!lastGateResult"
            @click="copyLastGateResult"
        >
          <DwIcon name="copy" size="sm" :stroke-width="1.35"/>
          {{ t('platform.dq.copyGateResult') }}
        </button>
        <button
            v-if="isDataQuality"
            type="button"
            :disabled="!lastGateResult"
            @click="downloadLastGateResult"
        >
          <DwIcon name="export" size="sm" :stroke-width="1.35"/>
          {{ t('platform.dq.downloadGateResult') }}
        </button>
        <button
            v-if="isFederatedViews"
            type="button"
            :disabled="loading || !canRunAction"
            @click="executeFederatedView()"
        >
          <DwIcon name="run" size="sm" :stroke-width="1.35"/>
          {{ t('platform.federated.execute') }}
        </button>
        <button
            v-if="isFederatedViews && federatedRetryMaxRows"
            type="button"
            :disabled="loading || runningAction"
            @click="retryFederatedAtNextLimit"
        >
          <DwIcon name="run" size="sm" :stroke-width="1.35"/>
          {{ t('platform.federated.retryAtLimit', {limit: federatedRetryMaxRows}) }}
        </button>
        <button
            v-if="isFederatedViews && federatedTruncated"
            type="button"
            :disabled="loading || runningAction"
            @click="executeFederatedNextBatch"
        >
          <DwIcon name="run" size="sm" :stroke-width="1.35"/>
          {{ t('platform.federated.nextBatch', {offset: federatedSourceOffset + federatedMaxRows}) }}
        </button>
        <button
            v-if="isSemanticMetrics"
            type="button"
            :disabled="loading || autoGenerating || !canAutoGenerate"
            @click="autoGenerateMetrics"
        >
          <DwIcon name="ai" size="sm" :stroke-width="1.35"/>
          {{ t('platform.metrics.autoGenerate') }}
        </button>
      </template>
    </DwDataGrid>

    <PlatformCatalogFormDialog
        v-if="!isFederatedViews"
        v-model:open="formOpen"
        :feature="feature"
        :tab="tab"
        @saved="onSaved"
    />

    <FederatedViewWizardDialog
        v-model:open="federatedWizardOpen"
        :tab="tab"
        @saved="onSaved"
    />

    <ConfirmDialog
        v-model:open="deleteConfirmOpen"
        :title="t('workspace.platformCatalog.delete')"
        :message="deleteConfirmMessage"
        :confirm-label="t('workspace.platformCatalog.delete')"
        :confirm-loading="deleting"
        confirm-variant="danger"
        @confirm="confirmDelete"
    />

    <AnalysisCanvasRerunDialog
        v-model:open="canvasRerunOpen"
        :canvas-id="canvasRerunId"
    />

    <SchemaDriftReportDialog
        v-model:open="driftReportOpen"
        :report="driftReport"
    />

    <DataQualitySharedTemplatesDialog
        v-model:open="dqSharedTemplatesOpen"
        @deleted="onDqSharedTemplateDeleted"
    />

    <AppModal
        :open="multiEnvOpen"
        :title="t('platform.dq.multiEnvTitle')"
        width="440px"
        @close="multiEnvOpen = false"
    >
      <p class="modal-hint">{{ t('platform.dq.multiEnvHint') }}</p>
      <label class="modal-field">
        <span>{{ t('platform.dq.multiEnvReference') }}</span>
        <DwSelect
            v-model="multiEnvConnectionId"
            size="sm"
            :options="multiEnvConnectionOptions"
            :disabled="!multiEnvConnectionOptions.length"
        />
      </label>
      <FormField :label="t('platform.dq.multiEnvDatabase')">
        <template #default="{ id }">
          <DwInput
              :id="id"
              v-model="multiEnvDatabase"
              type="text"
              :placeholder="t('platform.dq.multiEnvDatabaseHint')"
          />
        </template>
      </FormField>
      <p class="modal-hint">{{ t('platform.dq.multiEnvDatabaseHint') }}</p>
      <SettingsSwitch
          v-model="multiEnvPairByName"
          :label="t('platform.dq.multiEnvPairByName')"
      />
      <p class="modal-hint">{{ t('platform.dq.multiEnvPairByNameHint') }}</p>
      <template #footer>
        <ModalActions
            :cancel-label="t('common.cancel')"
            :confirm-label="t('platform.dq.runMultiEnvGate')"
            :confirm-disabled="!multiEnvConnectionId || runningAction"
            @cancel="multiEnvOpen = false"
            @confirm="confirmMultiEnvGate"
        />
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
.platform-catalog-tab {
  min-width: 0;
}

.platform-catalog-tab :deep(.dw-data-grid) {
  flex: 1;
  min-height: 0;
}
</style>
