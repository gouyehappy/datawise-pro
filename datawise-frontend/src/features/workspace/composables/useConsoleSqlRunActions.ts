import {useI18n} from 'vue-i18n'
import type {Ref} from 'vue'
import type {SqlEditorExpose} from '@datawise/sql-editor'
import type {SqlRunOptions} from '@/features/workspace/composables/useSqlEditorActions'
import type {SqlExecuteMode} from '@/features/workspace/services/resolve-executable-sql'
import {
  supportsExplainAnalyze,
  wrapExplainSql,
} from '@/features/workspace/services/explain-plan.service'
import {
  DEFAULT_TABLE_SHORTCUT_ROWS,
  buildTableShortcutSql,
} from '@/features/workspace/services/sql-table-shortcut.service'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import type {DbType} from '@/core/types'

export type ConsoleSqlRunActionsDeps = {
  sql: Ref<string>
  editorRef: Ref<SqlEditorExpose | undefined>
  tabId: () => string
  dbDialect: Ref<DbType | undefined>
  explainPlanEnabled: Ref<boolean>
  sqlExplainCapable: () => boolean
  sqlExplainHint: () => string
  guestReadOnly: Ref<boolean>
  guestReadOnlyHint: Ref<string>
  executeSql: (executableOverride?: unknown, runOptions?: SqlRunOptions) => void
}

/** Toolbar / gutter / shortcut run helpers for the SQL console. */
export function useConsoleSqlRunActions(deps: ConsoleSqlRunActionsDeps) {
  const {t} = useI18n()
  const workspace = useWorkspaceStore()
  const layout = useLayoutStore()

  function runWithMode(mode: SqlExecuteMode) {
    deps.executeSql(undefined, {perfSource: 'toolbar', mode})
  }

  function resolveToolbarStatementSql(): string {
    const selected = deps.editorRef.value?.getSelectedText?.()?.trim()
    if (selected) return selected
    return deps.editorRef.value?.getCurrentLineSql?.()?.trim() || deps.sql.value.trim()
  }

  function onRunStatementFromGutter(payload: {sql: string; anchorLine: number}) {
    deps.executeSql(payload.sql, {perfSource: 'gutter'})
  }

  function runExplainPlanFromToolbar(event?: MouseEvent) {
    const targetSql = resolveToolbarStatementSql()
    const trimmed = targetSql.trim()
    if (!trimmed) return
    if (!deps.explainPlanEnabled.value) return
    if (!deps.sqlExplainCapable()) {
      workspace.setStatus(deps.sqlExplainHint())
      return
    }

    const analyze = Boolean(event?.shiftKey) && supportsExplainAnalyze(deps.dbDialect.value)
    const wrapped = wrapExplainSql(trimmed, deps.dbDialect.value, analyze)
    deps.executeSql(wrapped, {skipDangerousCheck: true, perfSource: 'explain'})
  }

  async function saveStatementAsFileFromToolbar() {
    if (deps.guestReadOnly.value) {
      workspace.setStatus(deps.guestReadOnlyHint.value)
      return
    }
    const statementSql = resolveToolbarStatementSql()
    if (!statementSql) return
    const ok = await workspace.saveConsoleStatementAsFile(deps.tabId(), statementSql)
    if (!ok) {
      workspace.setStatus(t('console.saveFailed'))
    }
  }

  function requestExplainPlan(targetSql: string) {
    const trimmed = targetSql.trim()
    if (!trimmed) return
    if (!deps.explainPlanEnabled.value) return
    if (!deps.sqlExplainCapable()) {
      workspace.setStatus(deps.sqlExplainHint())
      return
    }
    const wrapped = wrapExplainSql(trimmed, deps.dbDialect.value, false)
    deps.executeSql(wrapped, {skipDangerousCheck: true})
  }

  function runTableShortcutFromSelection(kind: 'select-first' | 'count') {
    const selected = deps.editorRef.value?.getSelectedText?.()?.trim() ?? ''
    if (!selected) {
      layout.showWarningToast(t('console.tableShortcutNeedSelection'))
      return
    }
    const sqlText = buildTableShortcutSql(kind, selected, deps.dbDialect.value, DEFAULT_TABLE_SHORTCUT_ROWS)
    if (!sqlText) {
      layout.showWarningToast(t('console.tableShortcutInvalid'))
      return
    }
    deps.executeSql(sqlText, {perfSource: 'shortcut'})
  }

  return {
    runWithMode,
    onRunStatementFromGutter,
    runExplainPlanFromToolbar,
    saveStatementAsFileFromToolbar,
    requestExplainPlan,
    runTableShortcutFromSelection,
  }
}
