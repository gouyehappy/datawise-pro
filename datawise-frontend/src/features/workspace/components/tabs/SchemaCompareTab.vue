<script setup lang="ts">
import {computed, defineAsyncComponent, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import type {WorkspaceTab} from '@/core/types'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {extractConnectionsFromTree} from '@/features/explorer/utils/tree-targets'
import {compareSchemaScopes} from '@/features/schema-compare/services/schema-compare.service'
import {exportSchemaCompareMigration} from '@/features/schema-compare/services/schema-compare-export.service'
import {useSchemaCompareAiMigration} from '@/features/schema-compare/composables/useSchemaCompareAiMigration'
import SchemaCompareAiMigrationDialog from '@/features/schema-compare/components/SchemaCompareAiMigrationDialog.vue'
import {
    buildDefaultColumnSelection,
    buildDefaultTableSelection,
    buildSelectedSchemaMigrateDdl,
    countSelectedChanges,
    listConflictTableDiffs,
} from '@/features/schema-compare/services/schema-compare-selection.service'
import {scopesEqual} from '@/features/schema-compare/services/schema-scope.service'
import type {SchemaCompareResult, SchemaScope} from '@/features/schema-compare/types/schema-compare.types'
import {executeSchemaSyncSql} from '@/features/schema-compare/services/schema-sync-execute.service'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useTeamStore} from '@/features/team/stores/team-store'
import {canDdlConnection} from '@/features/team/services/connection-access.service'
import {
    isProductionEnvironment,
    normalizeConnectionEnvironment,
} from '@/features/connection/services/connection-environment.service'
import {resolveProductionApprovalTeams} from '@/features/team/services/production-approval-policy.service'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {
    isGovernancePreviewLimited,
    limitSchemaCompareTableDiffs,
} from '@/features/pack/services/governance-diff-preview'
import {exportSchemaCompareReport} from '@/features/pack/services/governance-compare-report'
import {
    buildDefaultMigrationFileName,
    normalizeMigrationFileName,
} from '@/features/workspace/services/migration-file-name.service'
import DwSelect from '@/core/components/DwSelect.vue'
import {DwButton, DwCheckbox, DwInlineAlert, EmptyState, PromptDialog, StatusPill} from '@/core/components'
import type {SelectOption} from '@/core/components/select.types'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {useProjectStore} from '@/features/project/stores/project'

const props = defineProps<{ tab: WorkspaceTab }>()
const {t} = useI18n()
const projectStore = useProjectStore()
const projectName = computed(() => projectStore.displayName)
const explorer = useExplorerStore()
const workspace = useWorkspaceStore()
const layout = useLayoutStore()
const auth = useAuthStore()
const entitlement = useEntitlementStore()
const appConfig = useAppConfigStore()
const teamStore = useTeamStore()

const SubmitProductionApprovalDialog = defineAsyncComponent(
    () => import('@/features/workspace/components/SubmitProductionApprovalDialog.vue'),
)

const leftScope = ref<SchemaScope | null>(props.tab.schemaCompareLeft ?? null)
const rightScope = ref<SchemaScope | null>(props.tab.schemaCompareRight ?? null)
const comparing = ref(false)
const result = ref<SchemaCompareResult | null>(null)
const selectedTable = ref<string | null>(null)
const tableFilter = ref('')
const selectedTables = ref<Set<string>>(new Set())
const selectedColumnsByTable = ref<Map<string, Set<string>>>(new Map())
const exportDialogOpen = ref(false)
const exporting = ref(false)
const syncExecuting = ref(false)
const syncConfirmArmed = ref(false)
const syncProductionApprovalDialogOpen = ref(false)
const syncProductionApprovalSubmitting = ref(false)
const syncProductionApprovalError = ref('')

const connections = computed(() => extractConnectionsFromTree(explorer.tree))

const leftConnectionId = computed({
  get: () => leftScope.value?.connectionId ?? '',
  set: (connectionId: string) => {
    const conn = connections.value.find((item) => item.id === connectionId)
    if (!conn) {
      leftScope.value = null
      return
    }
    const database = conn.databases[0]?.label ?? ''
    leftScope.value = {
      connectionId: conn.id,
      connectionLabel: conn.label,
      database,
      dbType: conn.dbType,
    }
  },
})

const rightConnectionId = computed({
  get: () => rightScope.value?.connectionId ?? '',
  set: (connectionId: string) => {
    const conn = connections.value.find((item) => item.id === connectionId)
    if (!conn) {
      rightScope.value = null
      return
    }
    const database = conn.databases[0]?.label ?? ''
    rightScope.value = {
      connectionId: conn.id,
      connectionLabel: conn.label,
      database,
      dbType: conn.dbType,
    }
  },
})

const leftDatabase = computed({
  get: () => leftScope.value?.database ?? '',
  set: (database: string) => {
    if (!leftScope.value) return
    leftScope.value = {...leftScope.value, database}
  },
})

const rightDatabase = computed({
  get: () => rightScope.value?.database ?? '',
  set: (database: string) => {
    if (!rightScope.value) return
    rightScope.value = {...rightScope.value, database}
  },
})

const leftDatabases = computed(() =>
    connections.value.find((item) => item.id === leftConnectionId.value)?.databases ?? [],
)

const rightDatabases = computed(() =>
    connections.value.find((item) => item.id === rightConnectionId.value)?.databases ?? [],
)

const connectionOptions = computed<SelectOption[]>(() => [
  {value: '', label: t('schemaCompare.selectConnection')},
  ...connections.value.map((conn) => ({
    value: conn.id,
    label: `${conn.groupLabel} / ${conn.label}`,
  })),
])

function databaseOptions(databases: { id: string; label: string }[], current?: string): SelectOption[] {
  const options = databases.map((db) => ({value: db.label, label: db.label}))
  if (current && current.trim() && !options.some((item) => item.value === current)) {
    options.unshift({value: current, label: current})
  }
  return [
    {value: '', label: t('schemaCompare.selectDatabase')},
    ...options,
  ]
}

const leftDatabaseOptions = computed(() =>
    databaseOptions(leftDatabases.value, leftScope.value?.database),
)
const rightDatabaseOptions = computed(() =>
    databaseOptions(rightDatabases.value, rightScope.value?.database),
)

async function ensureConnectionDatabases(connectionId: string) {
  if (!connectionId) return
  try {
    await explorer.ensureChildrenLoaded(connectionId)
  } catch {
    // tree may be offline; keep current scope labels
  }
}

const canCompare = computed(
    () =>
        !!leftScope.value?.connectionId
        && !!leftScope.value.database
        && !!rightScope.value?.connectionId
        && !!rightScope.value.database
        && !scopesEqual(leftScope.value, rightScope.value),
)

const governanceLimited = computed(() =>
    isGovernancePreviewLimited({
      mode: entitlement.mode,
      governanceUsable: entitlement.isPackUsable('pack.governance'),
    }),
)

const previewLimitedDiffs = computed(() =>
    limitSchemaCompareTableDiffs(result.value?.tableDiffs ?? [], governanceLimited.value),
)

const filteredTableDiffs = computed(() => {
  const diffs = previewLimitedDiffs.value.visible
  const query = tableFilter.value.trim().toLowerCase()
  if (!query) return diffs
  return diffs.filter((item) => item.tableName.toLowerCase().includes(query))
})

const selectedTableDiff = computed(() =>
    filteredTableDiffs.value.find((item) => item.tableName === selectedTable.value) ?? null,
)

const conflictTables = computed(() =>
    result.value ? listConflictTableDiffs(result.value.tableDiffs) : [],
)

const selectedDdl = computed(() => {
    if (!result.value || !rightScope.value) return ''
    return buildSelectedSchemaMigrateDdl(
        result.value,
        rightScope.value.dbType,
        rightScope.value.database,
        selectedTables.value,
        selectedColumnsByTable.value,
    )
})

const {
    dialogOpen: aiMigrationDialogOpen,
    loading: aiMigrationLoading,
    baselineDdl: aiMigrationBaseline,
    suggestion: aiMigrationSuggestion,
    appliedUpDdl,
    suggestMigration,
    applySuggestion,
    clearAppliedMigration,
} = useSchemaCompareAiMigration({
    getLeftScope: () => leftScope.value,
    getRightScope: () => rightScope.value,
    getResult: () => result.value,
    getBaselineDdl: () => selectedDdl.value,
    getSelectedTables: () => selectedTables.value,
    getSelectedColumnsByTable: () => selectedColumnsByTable.value,
    resolveAiPrefs: () => appConfig.aiPreferences,
})

const effectiveDdl = computed(() => appliedUpDdl.value ?? selectedDdl.value)

const selectedChangeCount = computed(() => {
    if (!result.value) return 0
    return countSelectedChanges(
        result.value.tableDiffs,
        selectedTables.value,
        selectedColumnsByTable.value,
    )
})

const canExportMigration = computed(() =>
    !governanceLimited.value
    && selectedChangeCount.value > 0
    && !!rightScope.value?.connectionId,
)

const targetConnectionNode = computed(() => {
    const connectionId = rightScope.value?.connectionId
    if (!connectionId) return undefined
    return explorer.findNode(connectionId)
})

const targetProductionEnv = computed(() =>
    isProductionEnvironment(targetConnectionNode.value?.env, targetConnectionNode.value?.envCustom),
)

const targetConnectionEnv = computed(() =>
    normalizeConnectionEnvironment(
        targetConnectionNode.value?.env,
        targetConnectionNode.value?.envCustom,
    ).env,
)

const syncProductionApprovalTeams = computed(() => {
    if (!effectiveDdl.value || !rightScope.value?.connectionId) return []
    return resolveProductionApprovalTeams({
        env: targetConnectionEnv.value,
        sql: effectiveDdl.value,
        connectionId: rightScope.value.connectionId,
        teams: teamStore.teams,
    })
})

const needsSyncProductionApproval = computed(() => syncProductionApprovalTeams.value.length > 0)

const syncExecuteActionLabel = computed(() => {
    if (syncExecuting.value) return t('schemaCompare.syncExecuting')
    if (syncConfirmArmed.value) {
        return needsSyncProductionApproval.value
            ? t('console.productionApproval.submitForApproval')
            : t('schemaCompare.syncConfirmAction')
    }
    return t('schemaCompare.syncExecuteAction')
})

const canExecuteSync = computed(() => {
    if (auth.isGuest) return false
    if (!rightScope.value?.connectionId) return false
    return canDdlConnection(rightScope.value.connectionId, teamStore.teams)
})

const syncExecuteDisabledHint = computed(() => {
    if (auth.isGuest) return t('schemaCompare.syncGuestDenied')
    if (!canExecuteSync.value) return t('schemaCompare.syncWriteDenied')
    return undefined
})

const workflowStep = computed(() => {
    if (!leftScope.value || !rightScope.value) return 1
    if (!result.value) return 1
    if (selectedChangeCount.value <= 0) return 2
    return 3
})

const dataMigrationTables = computed(() => {
    if (!result.value) return [] as string[]
    return [...selectedTables.value].filter((tableName) => {
        const diff = result.value?.tableDiffs.find((item) => item.tableName === tableName)
        return diff && diff.status !== 'removed'
    })
})

const canOpenDataMigration = computed(() =>
    dataMigrationTables.value.length > 0 && !!leftScope.value && !!rightScope.value,
)

const exportDialogDefault = computed(() =>
    buildDefaultMigrationFileName('schema_compare'),
)

function resetSelection(next: SchemaCompareResult) {
    selectedTables.value = buildDefaultTableSelection(next.tableDiffs)
    const columns = new Map<string, Set<string>>()
    for (const table of listConflictTableDiffs(next.tableDiffs)) {
        if (table.status === 'changed' && table.columnDiffs.length) {
            columns.set(table.tableName, buildDefaultColumnSelection(table))
        }
    }
    selectedColumnsByTable.value = columns
}

function isTableSelected(tableName: string): boolean {
    return selectedTables.value.has(tableName)
}

function toggleTable(tableName: string, checked: boolean) {
    const next = new Set(selectedTables.value)
    if (checked) next.add(tableName)
    else next.delete(tableName)
    selectedTables.value = next
}

function isColumnSelected(tableName: string, columnName: string): boolean {
    const set = selectedColumnsByTable.value.get(tableName)
    return set ? set.has(columnName) : true
}

function toggleColumn(tableName: string, columnName: string, checked: boolean) {
    const current = selectedColumnsByTable.value.get(tableName) ?? new Set<string>()
    const next = new Set(current)
    if (checked) next.add(columnName)
    else next.delete(columnName)
    const map = new Map(selectedColumnsByTable.value)
    map.set(tableName, next)
    selectedColumnsByTable.value = map
    if (next.size > 0) {
        const tables = new Set(selectedTables.value)
        tables.add(tableName)
        selectedTables.value = tables
    }
}

function selectAllConflicts() {
    if (!result.value) return
    resetSelection(result.value)
}

function clearAllConflicts() {
    selectedTables.value = new Set()
    selectedColumnsByTable.value = new Map()
}

watch([leftScope, rightScope], () => {
  result.value = null
  selectedTable.value = null
  selectedTables.value = new Set()
  selectedColumnsByTable.value = new Map()
  clearAppliedMigration()
})

watch(leftConnectionId, (connectionId) => {
  void ensureConnectionDatabases(connectionId)
}, {immediate: true})

watch(rightConnectionId, (connectionId) => {
  void ensureConnectionDatabases(connectionId)
}, {immediate: true})

watch(leftDatabases, (databases) => {
  if (!leftScope.value?.connectionId || databases.length === 0) return
  if (!databases.some((item) => item.label === leftScope.value?.database)) {
    leftScope.value = {...leftScope.value, database: databases[0]?.label ?? ''}
  }
})

watch(rightDatabases, (databases) => {
  if (!rightScope.value?.connectionId || databases.length === 0) return
  if (!databases.some((item) => item.label === rightScope.value?.database)) {
    rightScope.value = {...rightScope.value, database: databases[0]?.label ?? ''}
  }
})

watch([selectedTables, selectedColumnsByTable], () => {
  clearAppliedMigration()
  syncConfirmArmed.value = false
})

watch(effectiveDdl, () => {
  syncConfirmArmed.value = false
})

async function runCompare() {
  if (!canCompare.value || !leftScope.value || !rightScope.value) return
  comparing.value = true
  try {
    result.value = await compareSchemaScopes(leftScope.value, rightScope.value)
    resetSelection(result.value)
    selectedTable.value = result.value.tableDiffs.find((item) => item.status !== 'unchanged')?.tableName
        ?? result.value.tableDiffs[0]?.tableName
        ?? null
    layout.showSuccessToast(t('schemaCompare.compareDone'))
  } catch (error) {
    const message = resolveCaughtApiErrorMessage(error, t, 'schemaCompare.compareFailed')
    layout.showErrorToast(message)
  } finally {
    comparing.value = false
  }
}

async function copyDdl() {
  if (!effectiveDdl.value) return
  if (governanceLimited.value) {
    entitlement.guardPack('pack.governance', 'gov.schema.export')
    return
  }
  try {
    await navigator.clipboard.writeText(effectiveDdl.value)
    layout.showSuccessToast(t('schemaCompare.ddlCopied'))
  } catch {
    layout.showErrorToast(t('schemaCompare.ddlCopyFailed'))
  }
}

function openExportDialog() {
  if (auth.isGuest) return
  if (governanceLimited.value) {
    entitlement.guardPack('pack.governance', 'gov.schema.export')
    return
  }
  if (!canExportMigration.value) return
  exportDialogOpen.value = true
}

function exportFullReport() {
  if (!result.value) return
  if (!entitlement.guardPack('pack.governance', 'gov.schema.report')) return
  try {
    const {fileName, printOpened} = exportSchemaCompareReport({
      left: leftScope.value,
      right: rightScope.value,
      result: result.value,
      ddl: effectiveDdl.value || null,
      title: t('schemaCompare.reportTitle'),
      watermarkFooter: entitlement.watermarkFooter,
    })
    layout.showSuccessToast(
        t(printOpened ? 'schemaCompare.exportReportDonePrint' : 'schemaCompare.exportReportDone', {
            path: fileName,
        }),
    )
  } catch (error) {
    const message = resolveCaughtApiErrorMessage(error, t, 'schemaCompare.exportReportFailed')
    layout.showErrorToast(message)
  }
}

function validateExportFileName(fileName: string) {
  return normalizeMigrationFileName(fileName) ? null : t('schemaCompare.exportInvalidName')
}

async function confirmExportMigration(fileName: string) {
  if (!result.value || !rightScope.value) return
  const normalized = normalizeMigrationFileName(fileName)
  if (!normalized) return
  exporting.value = true
  try {
    const relativePath = await exportSchemaCompareMigration({
      scope: rightScope.value,
      fileName: normalized,
      ddl: effectiveDdl.value,
    })
    layout.showSuccessToast(t('schemaCompare.exportDone', {path: relativePath}))
  } catch (error) {
    const message = resolveCaughtApiErrorMessage(error, t, 'schemaCompare.exportFailed')
    layout.showErrorToast(message)
  } finally {
    exporting.value = false
  }
}

function statusLabel(status: string) {
  const key = `schemaCompare.status.${status}`
  const label = t(key)
  return label === key ? status : label
}

function openSyncInConsole() {
  if (!effectiveDdl.value || !rightScope.value) return
  void workspace.openConsole({
    connectionId: rightScope.value.connectionId,
    connectionName: rightScope.value.connectionLabel,
    database: rightScope.value.database,
    sql: effectiveDdl.value,
  })
}

function openDataMigrationWizard() {
  if (!leftScope.value || !rightScope.value || !canOpenDataMigration.value) return
  workspace.openTableMigration({
    source: leftScope.value,
    preselectedTables: dataMigrationTables.value,
    initialTarget: rightScope.value,
  })
}

async function executeSync() {
  if (!effectiveDdl.value || !rightScope.value || syncExecuting.value) return
  if (!canExecuteSync.value) {
    layout.showErrorToast(syncExecuteDisabledHint.value ?? t('schemaCompare.syncWriteDenied'))
    return
  }
  if (!syncConfirmArmed.value) {
    syncConfirmArmed.value = true
    return
  }
  if (needsSyncProductionApproval.value) {
    syncProductionApprovalError.value = ''
    syncProductionApprovalDialogOpen.value = true
    return
  }
  syncExecuting.value = true
  try {
    const outcome = await executeSchemaSyncSql(effectiveDdl.value, {
      connectionId: rightScope.value.connectionId,
      database: rightScope.value.database,
      dbType: rightScope.value.dbType,
    })
    if (!outcome.ok) {
      layout.showErrorToast(t('schemaCompare.syncFailedWithDetail', {message: outcome.message}))
      return
    }
    layout.showSuccessToast(t('schemaCompare.syncSuccess', {count: outcome.statementCount}))
    syncConfirmArmed.value = false
    await runCompare()
  } catch (error) {
    const message = resolveCaughtApiErrorMessage(error, t, 'schemaCompare.syncFailed')
    layout.showErrorToast(message)
  } finally {
    syncExecuting.value = false
  }
}

async function onSubmitSyncProductionApproval(teamId: string) {
  if (!effectiveDdl.value || !rightScope.value) return

  syncProductionApprovalSubmitting.value = true
  syncProductionApprovalError.value = ''
  try {
    await teamStore.submitProductionApproval(teamId, {
      connectionId: rightScope.value.connectionId,
      connectionName: rightScope.value.connectionLabel,
      database: rightScope.value.database,
      sql: effectiveDdl.value,
    })
    syncProductionApprovalDialogOpen.value = false
    syncConfirmArmed.value = false
    layout.showSuccessToast(t('console.productionApproval.submitted'))
  } catch (error) {
    syncProductionApprovalError.value =
        resolveCaughtApiErrorMessage(error, t, 'console.productionApproval.submitFailed')
  } finally {
    syncProductionApprovalSubmitting.value = false
  }
}
</script>

<template>
  <div class="schema-compare dw-workbench-page" data-wb-recipe="wb-extension">
    <header class="schema-compare__head">
      <div>
        <h2>{{ t('schemaCompare.title') }}</h2>
        <p>{{ t('schemaCompare.subtitle') }}</p>
      </div>
      <DwButton variant="primary" :disabled="!canCompare || comparing" :loading="comparing" @click="runCompare">
        {{ comparing ? t('schemaCompare.comparing') : t('schemaCompare.compareAction') }}
      </DwButton>
    </header>

    <section class="schema-compare__scopes">
      <div class="scope-card">
        <h3>{{ t('schemaCompare.leftTitle') }}</h3>
        <label class="scope-field">
          <span>{{ t('schemaCompare.connection') }}</span>
          <DwSelect v-model="leftConnectionId" size="sm" :options="connectionOptions"/>
        </label>
        <label class="scope-field">
          <span>{{ t('schemaCompare.database') }}</span>
          <DwSelect
              v-model="leftDatabase"
              size="sm"
              :options="leftDatabaseOptions"
              :disabled="!leftConnectionId"
          />
        </label>
        <p v-if="leftScope" class="scope-summary">{{ leftScope.connectionLabel }} / {{ leftScope.database }}</p>
      </div>

      <div class="scope-card">
        <h3>{{ t('schemaCompare.rightTitle') }}</h3>
        <label class="scope-field">
          <span>{{ t('schemaCompare.connection') }}</span>
          <DwSelect v-model="rightConnectionId" size="sm" :options="connectionOptions"/>
        </label>
        <label class="scope-field">
          <span>{{ t('schemaCompare.database') }}</span>
          <DwSelect
              v-model="rightDatabase"
              size="sm"
              :options="rightDatabaseOptions"
              :disabled="!rightConnectionId"
          />
        </label>
        <p v-if="rightScope" class="scope-summary">{{ rightScope.connectionLabel }} / {{ rightScope.database }}</p>
      </div>
    </section>

    <ol v-if="leftScope && rightScope" class="schema-compare__workflow">
      <li :class="{ 'is-active': workflowStep >= 1, 'is-current': workflowStep === 1 }">
        <span class="schema-compare__workflow-index">1</span>
        <span>{{ t('schemaCompare.workflow.compare') }}</span>
      </li>
      <li :class="{ 'is-active': workflowStep >= 2, 'is-current': workflowStep === 2 }">
        <span class="schema-compare__workflow-index">2</span>
        <span>{{ t('schemaCompare.workflow.select') }}</span>
      </li>
      <li :class="{ 'is-active': workflowStep >= 3, 'is-current': workflowStep === 3 }">
        <span class="schema-compare__workflow-index">3</span>
        <span>{{ t('schemaCompare.workflow.sync') }}</span>
      </li>
    </ol>

    <section v-if="result" class="schema-compare__summary">
      <StatusPill chip status="added" domain="schema">
        {{ t('schemaCompare.summaryAdded', {count: result.summary.added}) }}
      </StatusPill>
      <StatusPill chip status="removed" domain="schema">
        {{ t('schemaCompare.summaryRemoved', {count: result.summary.removed}) }}
      </StatusPill>
      <StatusPill chip status="changed" domain="schema">
        {{ t('schemaCompare.summaryChanged', {count: result.summary.changed}) }}
      </StatusPill>
      <StatusPill chip status="unchanged" domain="schema">
        {{ t('schemaCompare.summaryUnchanged', {count: result.summary.unchanged}) }}
      </StatusPill>
      <DwButton
          variant="secondary"
          size="sm"
          type="button"
          class="schema-compare__report-btn"
          @click="exportFullReport"
      >
        {{ t('schemaCompare.exportReport') }}
      </DwButton>
    </section>

    <div
        v-if="result && governanceLimited"
        class="schema-compare__preview-banner"
    >
      <DwInlineAlert
          :message="previewLimitedDiffs.hiddenConflictCount > 0
            ? t('schemaCompare.previewHidden', {hidden: previewLimitedDiffs.hiddenConflictCount})
            : t('schemaCompare.previewLimited')"
      />
      <DwButton
          variant="secondary"
          size="sm"
          type="button"
          @click="entitlement.guardPack('pack.governance', 'gov.schema.export')"
      >
        {{ t('schemaCompare.unlockFullCompare') }}
      </DwButton>
    </div>

    <div v-if="result" class="schema-compare__body">
      <aside class="table-list">
        <div class="table-list__toolbar">
          <input v-model="tableFilter" class="table-list__search" :placeholder="t('schemaCompare.filterTables')"/>
          <div class="table-list__bulk">
            <button type="button" class="dw-link-btn" @click="selectAllConflicts">{{ t('schemaCompare.selectAll') }}</button>
            <button type="button" class="dw-link-btn" @click="clearAllConflicts">{{ t('schemaCompare.selectNone') }}</button>
          </div>
        </div>
        <ul>
          <li v-for="item in filteredTableDiffs" :key="item.tableName">
            <div
                class="table-list__item"
                :class="{ 'is-active': selectedTable === item.tableName, [`is-${item.status}`]: true }"
            >
              <DwCheckbox
                  v-if="item.status !== 'unchanged'"
                  class="table-list__check"
                  :model-value="isTableSelected(item.tableName)"
                  @update:model-value="toggleTable(item.tableName, $event)"
              />
              <button
                  class="table-list__label"
                  type="button"
                  @click="selectedTable = item.tableName"
              >
                <span>{{ item.tableName }}</span>
                <StatusPill :status="item.status" domain="schema">{{ statusLabel(item.status) }}</StatusPill>
              </button>
            </div>
          </li>
        </ul>
        <p v-if="conflictTables.length" class="table-list__hint">
          {{ t('schemaCompare.selectedCount', {count: selectedChangeCount}) }}
        </p>
      </aside>

      <section class="table-detail">
        <template v-if="selectedTableDiff">
          <h3>{{ selectedTableDiff.tableName }}</h3>
          <EmptyState
              v-if="!selectedTableDiff.columnDiffs.length"
              embedded
              :title="t('schemaCompare.noColumnDiffs')"
          />
          <table v-else class="diff-grid">
            <thead>
            <tr>
              <th v-if="selectedTableDiff.status === 'changed'" class="col-check">{{ t('schemaCompare.include') }}</th>
              <th>{{ t('schemaCompare.column') }}</th>
              <th>{{ t('schemaCompare.change') }}</th>
              <th>{{ t('schemaCompare.leftValue') }}</th>
              <th>{{ t('schemaCompare.rightValue') }}</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="column in selectedTableDiff.columnDiffs" :key="column.name">
              <td v-if="selectedTableDiff.status === 'changed'" class="col-check">
                <DwCheckbox
                    :model-value="isColumnSelected(selectedTableDiff.tableName, column.name)"
                    @update:model-value="toggleColumn(selectedTableDiff.tableName, column.name, $event)"
                />
              </td>
              <td class="mono">{{ column.name }}</td>
              <td>
                <StatusPill inline :status="column.status" domain="schema">{{ statusLabel(column.status) }}</StatusPill>
              </td>
              <td class="mono">{{ column.left?.dataType ?? '—' }}</td>
              <td class="mono">{{ column.right?.dataType ?? '—' }}</td>
            </tr>
            </tbody>
          </table>
        </template>
        <EmptyState v-else embedded :title="t('schemaCompare.selectTableHint')"/>
      </section>

      <section class="ddl-panel">
        <header>
          <div>
            <h3>{{ t('schemaCompare.ddlTitle') }}</h3>
            <p class="ddl-panel__subtitle">{{ t('schemaCompare.syncSubtitle') }}</p>
          </div>
        </header>

        <div class="ddl-panel__groups">
          <div class="ddl-panel__group">
            <span class="ddl-panel__group-label">{{ t('schemaCompare.syncPreview') }}</span>
            <div class="ddl-panel__actions">
              <DwButton variant="secondary" size="sm" type="button" :disabled="!effectiveDdl" @click="copyDdl">
                {{ t('schemaCompare.copyDdl') }}
              </DwButton>
              <DwButton
                  variant="primary"
                  size="sm"
                  type="button"
                  :disabled="!canExportMigration || exporting"
                  :loading="exporting"
                  @click="openExportDialog"
              >
                {{ t('schemaCompare.exportMigration') }}
              </DwButton>
              <DwButton
                  variant="ghost"
                  size="sm"
                  type="button"
                  :disabled="!selectedDdl || aiMigrationLoading"
                  :loading="aiMigrationLoading"
                  @click="suggestMigration"
              >
                {{ aiMigrationLoading ? t('schemaCompare.aiMigrationLoading') : t('schemaCompare.aiMigration') }}
              </DwButton>
            </div>
          </div>

          <div class="ddl-panel__group">
            <span class="ddl-panel__group-label">{{ t('schemaCompare.syncExecute') }}</span>
            <div class="ddl-panel__actions">
              <DwButton
                  variant="ghost"
                  size="sm"
                  type="button"
                  :disabled="!effectiveDdl"
                  @click="openSyncInConsole"
              >
                {{ t('schemaCompare.openConsole') }}
              </DwButton>
              <DwButton
                  variant="primary"
                  size="sm"
                  type="button"
                  :disabled="!canExportMigration || syncExecuting || !canExecuteSync"
                  :loading="syncExecuting"
                  @click="executeSync"
              >
                {{
                  syncExecuteActionLabel
                }}
              </DwButton>
              <DwButton
                  variant="secondary"
                  size="sm"
                  type="button"
                  :disabled="!canOpenDataMigration"
                  @click="openDataMigrationWizard"
              >
                {{ t('schemaCompare.openDataMigration') }}
              </DwButton>
            </div>
          </div>
        </div>

        <p v-if="syncExecuteDisabledHint && !canExecuteSync" class="ddl-panel__hint">{{ syncExecuteDisabledHint }}</p>
        <p v-else-if="syncConfirmArmed" class="ddl-panel__hint ddl-panel__hint--warn">
          {{
            needsSyncProductionApproval
              ? t('schemaCompare.syncSubmitForApproval')
              : (targetProductionEnv
                ? t('schemaCompare.syncConfirmProd', {project: projectName})
                : t('schemaCompare.syncConfirmHint'))
          }}
        </p>
        <p v-if="appliedUpDdl" class="ddl-panel__ai-note">{{ t('schemaCompare.aiMigrationApplied') }}</p>
        <pre class="ddl-panel__code">{{ effectiveDdl || t('schemaCompare.noSelectionDdl') }}</pre>
      </section>
    </div>

    <EmptyState v-else embedded :title="t('schemaCompare.empty')"/>

    <PromptDialog
        v-model:open="exportDialogOpen"
        :title="t('schemaCompare.exportTitle')"
        :subtitle="t('schemaCompare.exportHint')"
        :label="t('schemaCompare.exportFileName')"
        :default-value="exportDialogDefault"
        :required-message="t('schemaCompare.exportInvalidName')"
        :validate="validateExportFileName"
        :confirm-label="t('schemaCompare.exportAction')"
        :cancel-label="t('common.cancel')"
        @confirm="confirmExportMigration"
    />

    <SchemaCompareAiMigrationDialog
        v-model:open="aiMigrationDialogOpen"
        :baseline-ddl="aiMigrationBaseline"
        :up-ddl="aiMigrationSuggestion?.up ?? ''"
        :down-ddl="aiMigrationSuggestion?.down ?? ''"
        :loading="aiMigrationLoading"
        @apply="applySuggestion"
    />

    <SubmitProductionApprovalDialog
        v-model:open="syncProductionApprovalDialogOpen"
        :saving="syncProductionApprovalSubmitting"
        :error="syncProductionApprovalError"
        :sql="effectiveDdl"
        :connection-name="rightScope?.connectionLabel"
        :database="rightScope?.database"
        :teams="syncProductionApprovalTeams"
        @submit="onSubmitSyncProductionApproval"
    />
  </div>
</template>

<style scoped>
.schema-compare {
  gap: var(--dw-space-7);
  min-height: 0;
  min-width: 0;
  padding: var(--dw-wb-content-pad-y) var(--dw-wb-content-pad-x);
  overflow: auto;
}

.schema-compare__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--dw-space-6);
}

.schema-compare__head h2 {
  margin: 0 0 var(--dw-space-2);
  font-size: var(--dw-text-display-sm);
}

.schema-compare__head p {
  margin: 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-md);
}

.schema-compare__scopes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--dw-space-6);
}

.scope-card {
  padding: var(--dw-space-6) var(--dw-space-7);
  border: 1px solid var(--dw-wb-card-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-wb-card-bg);
}

.scope-card h3 {
  margin: 0 0 var(--dw-space-5);
  font-size: var(--dw-text-md);
}

.scope-field {
  display: grid;
  gap: var(--dw-gap-xs);
  margin-bottom: var(--dw-space-4);
  font-size: var(--dw-text-sm);
}

.scope-field :deep(.dw-select) {
  width: 100%;
}

.scope-summary {
  margin: var(--dw-space-2) 0 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.schema-compare__summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-gap);
}

.schema-compare__report-btn {
  margin-left: auto;
}

.schema-compare__preview-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-gap);
}

.schema-compare__workflow {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--dw-space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.schema-compare__workflow li {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  padding: var(--dw-space-4) var(--dw-space-5);
  border: 1px solid var(--dw-wb-card-border);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-muted);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
}

.schema-compare__workflow li.is-active {
  color: var(--dw-text);
  border-color: color-mix(in srgb, var(--dw-primary) 20%, var(--dw-border-light));
}

.schema-compare__workflow li.is-current {
  background: var(--dw-primary-softer);
  border-color: color-mix(in srgb, var(--dw-primary) 28%, var(--dw-border-light));
  color: var(--dw-primary);
  font-weight: 600;
}

.schema-compare__workflow-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dw-icon-size-xl);
  height: var(--dw-icon-size-xl);
  border-radius: var(--dw-radius-pill);
  background: var(--dw-bg);
  font-size: var(--dw-text-xs);
  font-weight: 700;
}

.schema-compare__workflow li.is-current .schema-compare__workflow-index {
  background: var(--dw-primary-soft);
}

.schema-compare__body {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  grid-template-rows: minmax(220px, 1fr) auto;
  gap: var(--dw-space-6);
  min-height: 360px;
}

.table-list {
  grid-row: 1 / span 2;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--dw-wb-card-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-wb-card-bg);
}

.table-list__search {
  width: 100%;
  padding: var(--dw-pad-tight);
  border: 1px solid var(--dw-wb-card-border);
  border-radius: var(--dw-control-radius-sm);
  font-size: var(--dw-text-sm);
}

.table-list__toolbar {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-sm);
  margin: var(--dw-space-4);
}

.table-list__bulk {
  display: flex;
  gap: var(--dw-gap-md);
}

.link-btn {
  padding: 0;
  border: none;
  background: none;
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  cursor: pointer;
}

.table-list__hint {
  margin: 0;
  padding: 0 var(--dw-space-5) var(--dw-space-4);
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.table-list ul {
  list-style: none;
  margin: 0;
  padding: 0 var(--dw-space-3) var(--dw-space-4);
  overflow: auto;
}

.table-list__item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  padding: var(--dw-space-2) var(--dw-space-3);
  border-radius: var(--dw-control-radius-sm);
}

.table-list__check {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.table-list__label {
  flex: 1;
  display: flex;
  justify-content: space-between;
  gap: var(--dw-gap);
  padding: var(--dw-space-1) var(--dw-space-2);
  border: none;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  text-align: left;
  cursor: pointer;
  font-size: var(--dw-text-sm);
}

.table-list__item.is-active,
.table-list__label:hover {
  background: var(--dw-bg-muted);
}

.table-detail,
.ddl-panel {
  border: 1px solid var(--dw-wb-card-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-wb-card-bg);
  padding: var(--dw-space-6);
  min-height: 0;
  overflow: auto;
}

.ddl-panel {
  grid-column: 2;
}

.ddl-panel header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--dw-gap);
  margin-bottom: var(--dw-space-4);
}

.ddl-panel__subtitle {
  margin: var(--dw-space-2) 0 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.ddl-panel__groups {
  display: grid;
  gap: var(--dw-space-4);
  margin-bottom: var(--dw-space-4);
}

.ddl-panel__group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
  padding: var(--dw-space-4) var(--dw-space-5);
  border: 1px solid var(--dw-wb-card-border);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-muted);
}

.ddl-panel__group-label {
  font-size: var(--dw-text-xs);
  font-weight: 600;
  color: var(--dw-text-secondary);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.ddl-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap);
}

.ddl-panel__hint {
  margin: 0 0 var(--dw-space-4);
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.ddl-panel__hint--warn {
  color: var(--dw-warning-fg);
}

.ddl-panel__ai-note {
  margin: 0 0 var(--dw-space-4);
  font-size: var(--dw-text-xs);
  color: var(--dw-primary);
}

.ddl-panel header h3,
.table-detail h3 {
  margin: 0;
  font-size: var(--dw-text-md);
}

.ddl-panel__code {
  margin: 0;
  padding: var(--dw-space-5);
  border-radius: var(--dw-wb-card-radius);
  box-shadow: var(--dw-wb-card-shadow);
  background: color-mix(in srgb, var(--dw-bg) 90%, var(--dw-ink-deep));
  font-family: var(--dw-mono);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-relaxed);
  white-space: pre-wrap;
}

.diff-grid {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--dw-text-sm);
}

.diff-grid th,
.diff-grid td {
  padding: var(--dw-pad-control);
  border-bottom: 1px solid var(--dw-border-light);
  text-align: left;
}

.mono {
  font-family: var(--dw-mono);
}

.col-check {
  width: 36px;
  text-align: center;
}

@media (max-width: 960px) {
  .schema-compare__scopes,
  .schema-compare__body {
    grid-template-columns: 1fr;
  }

  .table-list {
    grid-row: auto;
    max-height: 220px;
  }

  .ddl-panel {
    grid-column: 1;
  }
}
</style>
