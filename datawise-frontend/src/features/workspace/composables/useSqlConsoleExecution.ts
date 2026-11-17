import {type Ref} from 'vue'
import {useI18n} from 'vue-i18n'
import type {SqlEditorExpose} from '@datawise/sql-editor'
import {getActiveSqlEditorRuntime} from '@datawise/sql-editor/runtime/sql-editor-runtime'
import {sqlApi} from '@/api'
import {DANGEROUS_SQL_PREVIEW_ROWS} from '@/features/workspace/constants/query-result-limits'
import {useDangerousSqlPending} from '@/features/workspace/composables/useDangerousSqlPending'
import {useConsoleDangerousSqlGate} from '@/features/workspace/composables/useConsoleDangerousSqlGate'
import {useSqlEditorActions, type SqlRunOptions} from '@/features/workspace/composables/useSqlEditorActions'
import {shouldConfirmDangerousSql} from '@/features/workspace/services/dangerous-sql-confirm-policy.service'
import type {DangerousSqlPreferences} from '@/shared/config/app-config.types'
import {applySqlParameters} from '@/features/workspace/services/sql-parameters.service'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import type {DbType} from '@/core/types'
import type {ConnectionEnvironment} from '@/features/connection/services/connection-environment.service'

export type SqlConsoleExecutionDeps = {
  tabId: () => string
  tabConnectionId: () => string | undefined
  tabInstanceId: () => string | null | undefined
  tabSqlFile: () => string | undefined
  sql: Ref<string>
  sqlParamValues: Ref<Record<string, string>>
  connectionId: Ref<string>
  instanceId: Ref<string | null>
  databaseName: Ref<string | undefined>
  connectionLabel: () => string | undefined
  connectionEnvironment: Ref<ConnectionEnvironment>
  dbDialect: Ref<DbType | undefined>
  productionPerfActive: Ref<boolean>
  editorRef: Ref<SqlEditorExpose | undefined>
  isEditorFullscreen: () => boolean
  exitEditorFullscreen: () => void
  onExecuteComplete: () => void
}

/**
 * Dangerous-SQL pending + production gate + editor run/save/format actions.
 * Late-binds runSql ↔ gate the same way SqlConsoleTab historically did.
 */
export function useSqlConsoleExecution(deps: SqlConsoleExecutionDeps) {
  const {t} = useI18n()
  const appConfig = useAppConfigStore()
  const explorer = useExplorerStore()

  const {
    pending: dangerousSqlPending,
    pendingSql: dangerousSqlPendingSql,
    preview: dangerousSqlPreview,
    loading: dangerousSqlLoading,
    affectedCount: dangerousSqlAffectedCount,
    sampleRows: dangerousSqlSampleRows,
    sampleColumns: dangerousSqlSampleColumns,
    errorMessage: dangerousSqlErrorMessage,
    productionForced: dangerousSqlProductionForced,
    risk: dangerousSqlRisk,
    autoApprovedRows: dangerousSqlAutoApprovedRows,
    requiresConfirmation: requiresDangerousSqlConfirmation,
    armPending: armDangerousSqlPending,
    disarm: disarmDangerousSqlPending,
  } = useDangerousSqlPending(async (previewSql) => {
    const connId = deps.connectionId.value || deps.tabConnectionId()
    if (!connId) {
      throw new Error(t('console.connectionRequired'))
    }
    const result = await sqlApi.execute(previewSql, {
      connectionId: connId,
      database: deps.databaseName.value,
      sessionKey: deps.tabId(),
      pageSize: DANGEROUS_SQL_PREVIEW_ROWS,
      maxRows: DANGEROUS_SQL_PREVIEW_ROWS,
    })
    return {
      rows: result.rows ?? [],
      columns: result.columns ?? [],
    }
  }, {
    shouldConfirm: (_sql, preview) => shouldConfirmDangerousSql(preview, {
      env: deps.connectionEnvironment.value,
      preferences: appConfig.dangerousSqlPreferences as DangerousSqlPreferences,
    }),
    productionForced: () => deps.connectionEnvironment.value === 'prod',
  })

  let boundRunSql: (executableOverride?: unknown, runOptions?: SqlRunOptions) => void = () => {}

  const gate = useConsoleDangerousSqlGate({
    pending: dangerousSqlPending,
    pendingSql: dangerousSqlPendingSql,
    autoApprovedRows: dangerousSqlAutoApprovedRows,
    requiresConfirmation: requiresDangerousSqlConfirmation,
    armPending: armDangerousSqlPending,
    disarm: disarmDangerousSqlPending,
    runSql: (executableOverride, runOptions) => boundRunSql(executableOverride, runOptions),
    getConnectionId: () => deps.connectionId.value || deps.tabConnectionId(),
    getDatabase: () => deps.databaseName.value,
    getEnvironment: () => deps.connectionEnvironment.value,
    getConnectionLabel: () =>
      deps.connectionLabel()
      ?? explorer.findNode(deps.connectionId.value || deps.tabConnectionId() || '')?.label,
    getSqlParamValues: () => deps.sqlParamValues.value,
    applyParameters: applySqlParameters,
    getSelectedText: () => deps.editorRef.value?.getSelectedText() ?? '',
    getCurrentLineSql: () => deps.editorRef.value?.getCurrentLineSql() ?? '',
    getCurrentLineNumber: () => deps.editorRef.value?.getCurrentLineNumber() ?? null,
    getFullDocumentSql: () => deps.sql.value,
    getSelectionStartLine: () => deps.editorRef.value?.getSelectionStartLine() ?? null,
    setSql: (value) => { deps.sql.value = value },
    layoutEditor: () => { deps.editorRef.value?.layout() },
    isEditorFullscreen: deps.isEditorFullscreen,
    exitEditorFullscreen: deps.exitEditorFullscreen,
  })

  const actions = useSqlEditorActions({
    getTabId: deps.tabId,
    getSql: () => deps.sql.value,
    getSqlFile: deps.tabSqlFile,
    getConnectionId: () => deps.connectionId.value || deps.tabConnectionId(),
    getInstanceId: () => deps.instanceId.value ?? deps.tabInstanceId(),
    getDatabase: () => deps.databaseName.value,
    getConnectionLabel: () => deps.connectionLabel() ?? t('common.unnamedConnection'),
    getInstanceLabel: () => deps.databaseName.value,
    getDbType: () => deps.dbDialect.value,
    editorRef: () => deps.editorRef.value ?? null,
    onExecuteComplete: deps.onExecuteComplete,
    onProductionApprovalRequired: (blockedSql) => {
      gate.promptProductionApproval(blockedSql)
    },
    applyParameters: (text) => applySqlParameters(text, deps.sqlParamValues.value),
    getProductionPerfActive: () => deps.productionPerfActive.value,
    getSchema: () => getActiveSqlEditorRuntime().getSchema(),
  })
  boundRunSql = actions.runSql

  return {
    dangerousSqlPending,
    dangerousSqlPendingSql,
    dangerousSqlPreview,
    dangerousSqlLoading,
    dangerousSqlAffectedCount,
    dangerousSqlSampleRows,
    dangerousSqlSampleColumns,
    dangerousSqlErrorMessage,
    dangerousSqlProductionForced,
    dangerousSqlRisk,
    disarmDangerousSqlPending,
    ...gate,
    ...actions,
  }
}
