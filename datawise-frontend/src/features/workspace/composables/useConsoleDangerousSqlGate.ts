import {computed, ref, type Ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {reviewSql} from '@/features/platform/services/sql-review.service'
import type {SqlReviewFinding} from '@/features/platform/types/platform.types'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useTeamStore} from '@/features/team/stores/team-store'
import {resolveProductionApprovalTeams} from '@/features/team/services/production-approval-policy.service'
import {splitSqlStatements} from '@/features/workspace/services/split-sql-statements'
import {resolveExecutableSql} from '@/features/workspace/services/resolve-executable-sql'
import type {SqlExecuteMode} from '@/features/workspace/services/resolve-executable-sql'
import type {SqlRunOptions} from '@/features/workspace/composables/useSqlEditorActions'
import type {ConnectionEnvironment} from '@/features/connection/services/connection-environment.service'

type DangerousSqlGate = 'blocked' | 'armed' | 'auto'

export type ConsoleDangerousSqlGateDeps = {
  /** From useDangerousSqlPending */
  pending: Ref<boolean>
  pendingSql: Ref<string | null>
  autoApprovedRows: Ref<number | null>
  requiresConfirmation: (sql: string) => boolean
  armPending: (sql: string) => Promise<boolean>
  disarm: () => void
  /** From useSqlEditorActions — set after actions are created */
  runSql: (executableOverride?: unknown, runOptions?: SqlRunOptions) => void
  getConnectionId: () => string | undefined
  getDatabase: () => string | undefined
  getEnvironment: () => ConnectionEnvironment
  getConnectionLabel: () => string | undefined
  getSqlParamValues: () => Record<string, string>
  applyParameters: (sql: string, values: Record<string, string>) => string
  getSelectedText: () => string
  getCurrentLineSql: () => string
  getCurrentLineNumber: () => number | null
  getFullDocumentSql: () => string
  getSelectionStartLine: () => number | null
  setSql: (sql: string) => void
  layoutEditor: () => void
  isEditorFullscreen: () => boolean
  exitEditorFullscreen: () => void
}

/**
 * Production approval + SQL review + dangerous confirmation gate around execute.
 * Injects pending/arm/disarm from useDangerousSqlPending and runSql from useSqlEditorActions.
 */
export function useConsoleDangerousSqlGate(deps: ConsoleDangerousSqlGateDeps) {
  const {t} = useI18n()
  const layout = useLayoutStore()
  const workspace = useWorkspaceStore()
  const teamStore = useTeamStore()

  const productionApprovalDialogOpen = ref(false)
  const productionApprovalSubmitting = ref(false)
  const productionApprovalError = ref('')
  /** Prod write SQL that skipped the dangerous-confirm bar (INSERT / ALTER / CREATE…). */
  const productionApprovalSql = ref<string | null>(null)
  const sqlReviewFindings = ref<SqlReviewFinding[]>([])
  /** Fail-closed: block until review completes successfully. */
  const sqlReviewBlocked = ref(true)
  const sqlReviewSuggestedSql = ref<string | null>(null)
  const sqlReviewRewriteNote = ref<string | null>(null)
  const sqlReviewRewriteLoading = ref(false)
  let sqlReviewGeneration = 0

  const approvalContextSql = computed(
      () => deps.pendingSql.value?.trim() || productionApprovalSql.value?.trim() || '',
  )

  function promptProductionApproval(sqlText: string) {
    const trimmed = sqlText.trim()
    if (!trimmed) return
    productionApprovalError.value = ''
    productionApprovalSql.value = trimmed
    productionApprovalDialogOpen.value = true
  }

  function clearProductionApprovalPrompt() {
    productionApprovalSql.value = null
    productionApprovalError.value = ''
    productionApprovalDialogOpen.value = false
  }

  const productionApprovalTeams = computed(() => {
    const pendingSql = approvalContextSql.value
    if (!pendingSql) return []
    return resolveProductionApprovalTeams({
      env: deps.getEnvironment(),
      sql: pendingSql,
      connectionId: deps.getConnectionId(),
      teams: teamStore.teams,
    })
  })

  const needsProductionApproval = computed(() => productionApprovalTeams.value.length > 0)

  const dangerousSqlSubmitTitle = computed(() =>
      needsProductionApproval.value
          ? t('console.productionApproval.submitForApproval')
          : t('console.dangerousSql.submit'),
  )

  function resolveConsoleExecutable(executableOverride?: unknown, mode?: SqlExecuteMode) {
    return resolveExecutableSql(
        executableOverride,
        () => deps.getSelectedText(),
        {
          mode,
          fallbackToCurrentLineSql: () => deps.getCurrentLineSql(),
          getCurrentLineNumber: () => deps.getCurrentLineNumber(),
          fallbackToFullDocument: () => deps.getFullDocumentSql(),
          getSelectionStartLine: () => deps.getSelectionStartLine(),
        },
    )
  }

  function batchNeedsDangerousConfirmation(resolvedSql: string): boolean {
    const statements = splitSqlStatements(resolvedSql)
    const batch = statements.length > 1 ? statements : [statements[0] ?? resolvedSql]
    return batch.some((statement) => deps.requiresConfirmation(statement.trim()))
  }

  async function loadSqlReviewFindings(resolvedSql: string) {
    const generation = ++sqlReviewGeneration
    sqlReviewFindings.value = []
    sqlReviewBlocked.value = true
    sqlReviewSuggestedSql.value = null
    sqlReviewRewriteNote.value = null
    const connId = deps.getConnectionId()
    if (!connId) return
    sqlReviewRewriteLoading.value = true
    try {
      const result = await reviewSql(
          {
            sql: resolvedSql,
            connectionId: connId,
            database: deps.getDatabase(),
            aiRewrite: true,
          },
          {silent: true},
      )
      if (generation !== sqlReviewGeneration) return
      sqlReviewFindings.value = result.findings ?? []
      sqlReviewBlocked.value = !result.allowed
      sqlReviewSuggestedSql.value = result.suggestedSql?.trim() || null
      sqlReviewRewriteNote.value = result.rewriteNote?.trim() || null
    } catch {
      if (generation !== sqlReviewGeneration) return
      // Fail-closed: keep blocked on network/API errors.
      sqlReviewFindings.value = []
      sqlReviewBlocked.value = true
      sqlReviewSuggestedSql.value = null
      sqlReviewRewriteNote.value = null
    } finally {
      if (generation === sqlReviewGeneration) {
        sqlReviewRewriteLoading.value = false
      }
    }
  }

  function applySqlReviewSuggestion() {
    const suggested = sqlReviewSuggestedSql.value?.trim()
    if (!suggested) return
    deps.setSql(suggested)
    deps.layoutEditor()
    workspace.setStatus(t('platform.sqlReview.appliedRewrite'))
    void loadSqlReviewFindings(suggested)
  }

  async function armDangerousSqlWithReview(resolved: string): Promise<DangerousSqlGate> {
    await loadSqlReviewFindings(resolved)
    if (sqlReviewBlocked.value) return 'blocked'
    const suggested = sqlReviewSuggestedSql.value?.trim()
    if (suggested && suggested !== resolved.trim()) {
      // Suggested rewrite must be explicitly applied; do not arm the original dangerous SQL.
      return 'blocked'
    }
    // 预演结果决定是否打断：低风险直接放行（P3 治理预演）
    return (await deps.armPending(resolved)) ? 'armed' : 'auto'
  }

  function executeSql(executableOverride?: unknown, runOptions?: SqlRunOptions) {
    if (deps.isEditorFullscreen()) {
      deps.exitEditorFullscreen()
    }
    if (!runOptions?.skipDangerousCheck) {
      const {sql: executable} = resolveConsoleExecutable(executableOverride, runOptions?.mode)
      const trimmed = executable.trim()
      if (trimmed) {
        const resolved = deps.applyParameters(trimmed, deps.getSqlParamValues())
        if (batchNeedsDangerousConfirmation(resolved)) {
          void armDangerousSqlWithReview(resolved).then((gate) => {
            if (gate !== 'auto') return
            const rows = deps.autoApprovedRows.value
            if (rows != null) {
              workspace.setStatus(t('console.dangerousSql.autoApproved', {count: rows}))
            }
            // 低风险已预演：跳过确认直接执行
            executeSql(executableOverride, {...runOptions, skipDangerousCheck: true})
          }).catch((error) => {
            deps.disarm()
            const message = resolveCaughtApiErrorMessage(error, t, 'console.dangerousSql.armFailed')
            workspace.setStatus(message)
            layout.showErrorToast(message)
          })
          return
        }
        // INSERT / ALTER / CREATE etc. skip the dangerous bar but still need prod approval.
        const approvalTeams = resolveProductionApprovalTeams({
          env: deps.getEnvironment(),
          sql: resolved,
          connectionId: deps.getConnectionId(),
          teams: teamStore.teams,
        })
        if (approvalTeams.length > 0) {
          promptProductionApproval(resolved)
          return
        }
      }
    }
    sqlReviewFindings.value = []
    sqlReviewBlocked.value = false
    sqlReviewSuggestedSql.value = null
    sqlReviewRewriteNote.value = null
    deps.runSql(executableOverride, runOptions)
  }

  function submitDangerousSql() {
    if (!deps.pending.value || !deps.pendingSql.value) return
    if (needsProductionApproval.value) {
      productionApprovalError.value = ''
      productionApprovalDialogOpen.value = true
      return
    }
    const pending = deps.pendingSql.value
    deps.disarm()
    executeSql(pending, {skipDangerousCheck: true})
  }

  async function onSubmitProductionApproval(teamId: string) {
    const pendingSql = approvalContextSql.value
    const connId = deps.getConnectionId()
    if (!pendingSql || !connId) return

    productionApprovalSubmitting.value = true
    productionApprovalError.value = ''
    try {
      await teamStore.submitProductionApproval(teamId, {
        connectionId: connId,
        connectionName: deps.getConnectionLabel(),
        database: deps.getDatabase() || undefined,
        sql: pendingSql,
      })
      clearProductionApprovalPrompt()
      deps.disarm()
      layout.notifyQuiet({
        category: 'workspace',
        titleKey: 'approvalDone',
        bodyKey: 'approvalDone',
        params: {detail: t('console.productionApproval.submitted')},
      })
    } catch (error) {
      productionApprovalError.value =
          resolveCaughtApiErrorMessage(error, t, 'console.productionApproval.submitFailed')
    } finally {
      productionApprovalSubmitting.value = false
    }
  }

  function onProductionApprovalDialogOpen(open: boolean) {
    productionApprovalDialogOpen.value = open
    if (!open) {
      productionApprovalSql.value = null
      productionApprovalError.value = ''
    }
  }

  function rollbackDangerousSql() {
    deps.disarm()
    clearProductionApprovalPrompt()
  }

  return {
    productionApprovalDialogOpen,
    productionApprovalSubmitting,
    productionApprovalError,
    productionApprovalSql,
    sqlReviewFindings,
    sqlReviewBlocked,
    sqlReviewSuggestedSql,
    sqlReviewRewriteNote,
    sqlReviewRewriteLoading,
    approvalContextSql,
    productionApprovalTeams,
    needsProductionApproval,
    dangerousSqlSubmitTitle,
    promptProductionApproval,
    clearProductionApprovalPrompt,
    resolveConsoleExecutable,
    loadSqlReviewFindings,
    applySqlReviewSuggestion,
    armDangerousSqlWithReview,
    executeSql,
    submitDangerousSql,
    onSubmitProductionApproval,
    onProductionApprovalDialogOpen,
    rollbackDangerousSql,
  }
}
