import {logPerf} from '@/core/utils/perf-log'
import {computed, nextTick} from 'vue'
import type {SqlEditorExpose, SqlEditorSchema} from '@datawise/sql-editor/types'
import {
    parseSqlErrorLine,
    readApiErrorLine,
    resolveEditorErrorLine,
} from '@datawise/sql-editor/utils/sql-error'
import type {DbType} from '@/core/types'
import {ApiError, sqlApi} from '@/api'
import {t} from '@/i18n'
import {isCatalogSchemaDbType} from '@/features/explorer/services/explorer-lazy-load'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useShortcutPanelStore} from '@/features/layout/stores/shortcut-panel-store'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useTeamStore} from '@/features/team/stores/team-store'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {isProductionApprovalRequiredError} from '@/shared/api/http/api-error'
import {resolveDisplayApiErrorMessage} from '@/shared/api/http/api-error-message'
import {
    canDmlConnection,
    requiresDdlAccess,
    requiresWriteAccess,
    resolveConnectionAccess,
} from '@/features/team/services/connection-access.service'
import {splitSqlStatements} from '@/features/workspace/services/split-sql-statements'
import {resolveClientMaxResultRows, resolveSqlPageSize} from '@/features/settings/services/query-limit.service'
import {resolveFederatedMaxRows} from '@/features/platform/services/federated-max-rows.service'
import {resolveExecutableSql as pickExecutableSql} from '@/features/workspace/services/resolve-executable-sql'
import type {SqlExecuteMode} from '@/features/workspace/services/resolve-executable-sql'
import {
    buildErrorQueryResultItem,
    buildSuccessQueryResultItem,
    resolveQueryResultTabLabel,
} from '@/features/workspace/services/query-result-item'
import {sumConsoleQueryTotals} from '@/features/workspace/services/query-result-refresh.service'
import type {QueryResultItem} from '@/features/workspace/types'
import {executeSqlBatch} from '@/features/workspace/services/sql-batch-execute.service'
import {registerConnectionHealthCheck} from '@/features/explorer/services/register-connection-health.service'
import {useConnectionCapabilities} from '@/features/datasource/composables/useConnectionCapabilities'
import {
    runPluginAfterResult,
    runPluginBeforeExecute,
} from '@/features/plugin/services/plugin-hook.service'
import {
    collectPreExecuteDiagnostics,
    mapDiagnosticToEditorLine,
    summarizePreExecuteDiagnostics,
} from '@/features/workspace/services/sql-pre-execute-diagnostics.service'
import {useQueryResultPaneSettingsStore} from '@/features/workspace/stores/query-result-pane-settings'
import {renumberResultLabels} from '@/features/workspace/services/workspace-query-results.service'

export type SqlRunPerfSource = 'toolbar' | 'gutter' | 'shortcut' | 'context-menu' | 'explain' | 'editor' | 'vqb'

export type SqlRunOptions = {
    /** 结果区刷新：仅更新指定结果 Tab，不替换其它 Tab */
    refreshResultIndex?: number
    /** 跳过危险 SQL 工具栏确认（提交待执行语句时） */
    skipDangerousCheck?: boolean
    /** 跳过执行前表/列诊断提示（二次确认 / 刷新 / EXPLAIN） */
    skipSchemaCheck?: boolean
    /** PERF 日志来源（行内运行、工具栏、快捷键等） */
    perfSource?: SqlRunPerfSource
    /** 单次执行覆盖 maxRows（如联邦截断后提高上限）；仍受联邦硬顶约束 */
    maxRowsOverride?: number
    /** 执行语义：选区 / 当前语句 / 全部；默认 auto */
    mode?: SqlExecuteMode
}

export interface SqlEditorActionsOptions {
    getTabId: () => string
    getSql: () => string
    getSqlFile: () => string | undefined
    getConnectionId: () => string | undefined
    getInstanceId: () => string | null | undefined
    getDatabase: () => string | undefined
    getConnectionLabel: () => string
    getInstanceLabel: () => string | null | undefined
    getDbType: () => DbType | undefined
    editorRef: () => SqlEditorExpose | null
    onExecuteComplete?: () => void
    /** 执行前确认（危险 SQL 预览等） */
    beforeExecute?: (sql: string) => Promise<boolean>
    /** 服务端拦截生产写时引导提交审批（INSERT/DDL 等未走危险确认条的路径） */
    onProductionApprovalRequired?: (sql: string) => void
    /** 将参数占位符替换为实际值 */
    applyParameters?: (sql: string) => string
    /** 当前连接是否启用生产环境性能模式收紧策略 */
    getProductionPerfActive?: () => boolean
    /** 当前编辑器 Schema（执行前表/列诊断） */
    getSchema?: () => SqlEditorSchema | null | undefined
}

async function jumpEditorToErrorLine(editor: SqlEditorExpose | null, line: number) {
    if (!editor || line < 1) return
    await nextTick()
    requestAnimationFrame(() => {
        editor.goToLine(line)
        editor.layout()
    })
}

function resolveStatementErrorLine(options: {
    editor: SqlEditorExpose | null
    editorText: string
    statement: string
    message: string
    apiError: unknown
    anchorLine?: number | null
}): number | null {
    const apiLine = options.apiError instanceof ApiError ? readApiErrorLine(options.apiError.data) : null
    const parsedLine = parseSqlErrorLine(options.message, options.statement.trim())
    const errorLineInSql = apiLine ?? parsedLine
    const selectionStart =
        options.anchorLine
        ?? options.editor?.getSelectionStartLine()
        ?? options.editor?.getCurrentLineNumber()
        ?? null
    return resolveEditorErrorLine({
        editorText: options.editorText,
        executable: options.statement,
        errorLineInSql,
        selectionStartLine: selectionStart,
    })
}

function logSqlEditorExecutePerf(
    startedAt: number,
    runOptions: SqlRunOptions | undefined,
    details: Record<string, unknown>,
) {
    logPerf('sql.editor.execute', startedAt, {
        source: runOptions?.perfSource ?? 'editor',
        ...details,
    })
}

/** 控制台 SQL 编辑器的执行、保存、格式化 */
export function useSqlEditorActions(options: SqlEditorActionsOptions) {
    const shortcutPanel = useShortcutPanelStore()
    const workspace = useWorkspaceStore()
    const auth = useAuthStore()
    const appConfig = useAppConfigStore()
    const teamStore = useTeamStore()
    const toast = useAppToast()
    const resultPaneSettings = useQueryResultPaneSettingsStore()
    const running = computed(() => workspace.isConsoleRunning(options.getTabId()))
    /** 已提示过的可执行 SQL：再次执行同一语句则跳过 schema 诊断 */
    let schemaWarnBypassSql: string | null = null

    function publishConsoleResults(tabId: string, prefix: QueryResultItem[], next: QueryResultItem[]) {
        const merged = [...prefix, ...next]
        renumberResultLabels(merged, resolveQueryResultTabLabel)
        workspace.setConsoleQueryResults(tabId, merged)
    }
    const dbType = computed(() => options.getDbType())
    const {caps: connectionCaps} = useConnectionCapabilities(dbType)

    function isPluginHookEnabled(pluginId: string) {
        return usePluginStore().isEnabled(pluginId)
    }

    async function applyPluginBeforeExecute(sql: string, connectionId: string, database?: string) {
        const result = await runPluginBeforeExecute(
            {sql, connectionId, database},
            isPluginHookEnabled,
        )
        if (result.cancel) {
            notifyActionIssue(result.message ?? t('console.runFailed'))
            return null
        }
        return result.sql ?? sql
    }

    async function emitPluginAfterResult(payload: {
        sql: string
        connectionId: string
        database?: string
        success: boolean
        rowCount?: number
        durationMs?: number
        errorMessage?: string
    }) {
        await runPluginAfterResult(payload, isPluginHookEnabled)
    }

    function notifySuccess(message: string) {
        workspace.setStatus(message)
    }

    function notifyActionIssue(message: string, options?: {toast?: boolean; variant?: 'warning' | 'error'}) {
        workspace.setStatus(message)
        if (options?.toast === false) return
        if (options?.variant === 'warning') {
            toast.warning(message)
            return
        }
        toast.error(message)
    }

    function formatRunError(error: unknown): string {
        return resolveDisplayApiErrorMessage(error, t) || t('console.runFailed')
    }

    function resolveExecutableSql(executableOverride?: unknown, mode?: SqlExecuteMode) {
        const editor = options.editorRef()
        return pickExecutableSql(
            executableOverride,
            () => editor?.getSelectedText() ?? '',
            {
                mode,
                fallbackToCurrentLineSql: () => editor?.getCurrentLineSql() ?? '',
                getCurrentLineNumber: () => editor?.getCurrentLineNumber() ?? null,
                fallbackToFullDocument: () => options.getSql(),
                getSelectionStartLine: () => editor?.getSelectionStartLine() ?? null,
            },
        )
    }

    function runSql(executableOverride?: unknown, runOptions?: SqlRunOptions) {
        if (running.value) return

        const editor = options.editorRef()
        const {sql: executable, anchorLine} = resolveExecutableSql(executableOverride, runOptions?.mode)
        if (!executable.trim()) {
            const emptyHint =
                runOptions?.mode === 'selection'
                    ? t('console.selectionRequired')
                    : runOptions?.mode === 'statement'
                        ? t('console.statementRequired')
                        : runOptions?.mode === 'all'
                            ? t('console.documentRequired')
                            : t('console.selectionRequired')
            notifyActionIssue(emptyHint, {toast: false})
            return
        }

        const connectionId = options.getConnectionId()
        if (!connectionId) {
            notifyActionIssue(t('console.connectionRequired'), {variant: 'warning'})
            return
        }

        const dbType = options.getDbType()
        if (!connectionCaps.value.sqlExecute) {
            notifyActionIssue(t('console.sqlNotSupported', {dbType: dbType ?? 'unknown'}), {variant: 'warning'})
            return
        }

        const access = resolveConnectionAccess(connectionId, teamStore.teams)
        if (requiresDdlAccess(executable) && access !== 'ddl') {
            notifyActionIssue(t('console.ddlNotAllowed'), {variant: 'warning'})
            return
        }
        if (requiresWriteAccess(executable) && access === 'readonly') {
            notifyActionIssue(t('console.readOnlyConnection'), {variant: 'warning'})
            return
        }

        const refreshIndex = runOptions?.refreshResultIndex
        const isRefresh = refreshIndex !== undefined
        const trimmedExecutable = executable.trim()
        const resolvedForCheck = options.applyParameters?.(trimmedExecutable) ?? trimmedExecutable
        const skipSchemaCheck =
            runOptions?.skipSchemaCheck
            || runOptions?.skipDangerousCheck
            || isRefresh
        if (!skipSchemaCheck) {
            const schema = options.getSchema?.()
            const diagnostics = collectPreExecuteDiagnostics(resolvedForCheck, schema)
            const summary = summarizePreExecuteDiagnostics(diagnostics)
            if (summary && schemaWarnBypassSql !== trimmedExecutable) {
                schemaWarnBypassSql = trimmedExecutable
                const editorLine = mapDiagnosticToEditorLine(summary.firstLine, anchorLine)
                void jumpEditorToErrorLine(editor, editorLine)
                notifyActionIssue(
                    t('console.schemaWarn', {
                        count: summary.count,
                        message: summary.firstMessage,
                    }),
                    {variant: 'warning'},
                )
                return
            }
            schemaWarnBypassSql = null
        }

        const tabId = options.getTabId()
        const runGeneration = workspace.beginConsoleRun(tabId)
        appConfig.setShowConsoleResultPanel(true)
        void (async () => {
            const started = performance.now()
        const editorText = options.getSql()
        const resolvedSql = resolvedForCheck
            const pageSize = resolveSqlPageSize(options.getProductionPerfActive?.() ?? false)
            const clientMaxRows = resolveClientMaxResultRows(options.getProductionPerfActive?.() ?? false)
            const maxRows = runOptions?.maxRowsOverride != null
                ? resolveFederatedMaxRows(runOptions.maxRowsOverride)
                : clientMaxRows
            const connection = {
                connectionId,
                database: options.getDatabase(),
                pageSize,
                maxRows: maxRows > 0 ? maxRows : undefined,
                dbType: options.getDbType(),
                sessionKey: tabId,
                perfSource: runOptions?.perfSource,
            }

            /** Prior results kept when「保留已有结果」is on; empty when clearing. */
            let keptPrefix: QueryResultItem[] = []

            function clearResultsForNewRun() {
                // Clear only after preflight/plugin allow so cancel/deny keeps prior results.
                if (!isRefresh && workspace.isConsoleRunCurrent(tabId, runGeneration)) {
                    if (resultPaneSettings.settings.keepExistingResults) {
                        keptPrefix = [...(workspace.consoleQueryByTabId[tabId]?.results ?? [])]
                        return
                    }
                    keptPrefix = []
                    workspace.setConsoleQueryResults(tabId, [])
                    // Prefer the upcoming result-set tab (index 0), not Messages.
                    workspace.setConsoleActiveView(tabId, 0)
                }
            }

            function applyRefreshResult(index: number, item: QueryResultItem) {
                if (!workspace.isConsoleRunCurrent(tabId, runGeneration)) return
                workspace.updateConsoleQueryResultAtIndex(tabId, index, item)
                const state = workspace.consoleQueryByTabId[tabId]
                if (state) {
                    const {totalRows, totalDuration} = sumConsoleQueryTotals(state.results)
                    workspace.setExecutionResult(totalRows, totalDuration)
                }
            }

            function applySuccessResult(result: Awaited<ReturnType<typeof sqlApi.execute>>, sql: string, index: number) {
                if (!workspace.isConsoleRunCurrent(tabId, runGeneration)) return
                const labelIndex = isRefresh ? index : keptPrefix.length
                const item = buildSuccessQueryResultItem(result, labelIndex, sql, connection.dbType)
                if (isRefresh) {
                    applyRefreshResult(refreshIndex!, item)
                } else {
                    publishConsoleResults(tabId, keptPrefix, [item])
                    workspace.setExecutionResult(result.rowCount, result.durationMs)
                }
            }

            function applyErrorResult(payload: {
                sql: string
                errorMessage: string
                errorLine?: number
                durationMs?: number
            }, index: number) {
                if (!workspace.isConsoleRunCurrent(tabId, runGeneration)) return
                const labelIndex = isRefresh ? index : keptPrefix.length
                const item = buildErrorQueryResultItem(payload, labelIndex)
                if (isRefresh) {
                    applyRefreshResult(refreshIndex!, item)
                } else {
                    publishConsoleResults(tabId, keptPrefix, [item])
                }
            }

            try {
                editor?.clearErrorLine()
                const statements = splitSqlStatements(resolvedSql)
                const batch = statements.length > 1 ? statements : [statements[0] ?? resolvedSql]

                if (options.beforeExecute) {
                    for (const statement of batch) {
                        const allowed = await options.beforeExecute(statement)
                        if (!allowed) {
                            return
                        }
                    }
                }

                if (batch.length === 1) {
                    let sql = batch[0]
                    const resultIndex = isRefresh ? refreshIndex! : 0
                    try {
                        const hookedSql = await applyPluginBeforeExecute(sql, connectionId, connection.database)
                        if (hookedSql == null) return
                        sql = hookedSql
                        if (!workspace.isConsoleRunCurrent(tabId, runGeneration)) return
                        clearResultsForNewRun()
                        const result = await sqlApi.execute(sql, connection)
                        if (!workspace.isConsoleRunCurrent(tabId, runGeneration)) return
                        registerConnectionHealthCheck(connectionId, 'ok')
                        applySuccessResult(result, sql, resultIndex)
                        logSqlEditorExecutePerf(started, runOptions, {
                            connectionId,
                            database: connection.database,
                            rowCount: result.rowCount,
                            serverDurationMs: result.durationMs,
                            sqlLen: sql.length,
                        })
                        await emitPluginAfterResult({
                            sql,
                            connectionId,
                            database: connection.database,
                            success: true,
                            rowCount: result.rowCount,
                            durationMs: result.durationMs,
                        })
                        void shortcutPanel.appendSqlLog(
                            {
                                sql: result.sql,
                                time: new Date().toLocaleTimeString(),
                                duration: `${result.durationMs}ms`,
                                durationMs: result.durationMs,
                                status: 'success',
                                rows: result.rowCount,
                                database: connection.database,
                            },
                            connectionId,
                            connection.database,
                        ).catch((logError) => {
                            console.warn('[appendSqlLog]', logError)
                        })
                    } catch (error) {
                        if (!workspace.isConsoleRunCurrent(tabId, runGeneration)) return
                        const message = formatRunError(error)
                        const durationMs = Math.round(performance.now() - started)
                        logSqlEditorExecutePerf(started, runOptions, {
                            connectionId,
                            database: connection.database,
                            ok: false,
                            sqlLen: sql.length,
                        })
                        const errorLine = resolveStatementErrorLine({
                            editor,
                            editorText,
                            statement: sql,
                            message,
                            apiError: error,
                            anchorLine,
                        })

                        applyErrorResult(
                            {
                                sql,
                                errorMessage: message,
                                errorLine: errorLine ?? undefined,
                                durationMs,
                            },
                            resultIndex,
                        )
                        await emitPluginAfterResult({
                            sql,
                            connectionId,
                            database: connection.database,
                            success: false,
                            durationMs,
                            errorMessage: message,
                        })
                        if (isProductionApprovalRequiredError(error)) {
                            options.onProductionApprovalRequired?.(sql)
                        } else {
                            notifyActionIssue(message)
                        }

                        if (errorLine) {
                            await jumpEditorToErrorLine(editor, errorLine)
                        }

                        void shortcutPanel.appendSqlLog(
                            {
                                sql,
                                time: new Date().toLocaleTimeString(),
                                duration: `${durationMs}ms`,
                                durationMs,
                                status: 'error',
                                database: connection.database,
                            },
                            connectionId,
                            connection.database,
                        ).catch((logError) => {
                            console.warn('[appendSqlLog]', logError)
                        })
                    }
                    return
                }

                clearResultsForNewRun()
                const result = await executeSqlBatch(
                    batch,
                    connection,
                    (entry) => shortcutPanel.appendSqlLog(
                        {...entry, database: connection.database},
                        connectionId,
                        connection.database,
                    ),
                    {
                        onProgress: (results) => {
                            if (!workspace.isConsoleRunCurrent(tabId, runGeneration)) return
                            appConfig.setShowConsoleResultPanel(true)
                            publishConsoleResults(tabId, keptPrefix, results)
                            const summary = results[0]
                            if (summary?.batchEntries) {
                                workspace.setExecutionResult(summary.total, summary.durationMs)
                            }
                        },
                        resolveErrorLine: (sql, message, error) =>
                            resolveStatementErrorLine({
                                editor,
                                editorText,
                                statement: sql,
                                message,
                                apiError: error,
                                anchorLine,
                            }) ?? undefined,
                        isPluginEnabled: isPluginHookEnabled,
                        shouldContinue: () => workspace.isConsoleRunCurrent(tabId, runGeneration),
                    },
                )

                if (!workspace.isConsoleRunCurrent(tabId, runGeneration)) return

                publishConsoleResults(tabId, keptPrefix, result.items)
                workspace.setExecutionResult(result.totalRows, result.totalDuration)
                registerConnectionHealthCheck(connectionId, 'ok')
                logPerf('sql.editor.execute.batch', started, {
                    source: runOptions?.perfSource ?? 'editor',
                    connectionId,
                    database: connection.database,
                    statementCount: batch.length,
                    totalRows: result.totalRows,
                    serverDurationMs: result.totalDuration,
                })

                if (result.lastErrorMessage) {
                    const approvalSql = result.firstErrorSql?.trim()
                    if (result.productionApprovalRequired && approvalSql) {
                        options.onProductionApprovalRequired?.(approvalSql)
                    } else {
                        notifyActionIssue(result.lastErrorMessage)
                    }
                    if (result.firstErrorLine) {
                        await jumpEditorToErrorLine(editor, result.firstErrorLine)
                    }
                }
            } catch (error) {
                if (!workspace.isConsoleRunCurrent(tabId, runGeneration)) return
                const message = formatRunError(error)
                if (isProductionApprovalRequiredError(error)) {
                    options.onProductionApprovalRequired?.(resolvedSql)
                } else {
                    notifyActionIssue(message)
                }
                console.error('[runSql]', error)
            } finally {
                workspace.endConsoleRun(tabId, runGeneration)
                if (workspace.isConsoleRunCurrent(tabId, runGeneration)) {
                    options.onExecuteComplete?.()
                }
            }
        })()
    }

    function onExecuteClick() {
        runSql(undefined, {perfSource: 'toolbar'})
    }

    function saveConsole() {
        if (auth.isGuest) {
            notifyActionIssue(t('auth.guestReadOnlyHint'))
            return
        }
        const connectionId = options.getConnectionId()
        if (!connectionId) {
            notifyActionIssue(t('console.connectionRequired'))
            return
        }

        const instanceName = options.getInstanceLabel()?.trim()
        const dbType = options.getDbType()
        if (!instanceName && !isCatalogSchemaDbType(dbType)) {
            notifyActionIssue(t('console.instanceRequired'))
            return
        }

        void workspace.saveConsoleTab(options.getTabId()).then((ok) => {
            if (!ok) {
                notifyActionIssue(t('console.saveFailed'))
            }
        })
    }

    function formatSql() {
        const ok = options.editorRef()?.formatDocument() ?? false
        if (ok) workspace.setStatus(t('console.formatted'))
    }

    function formatSelection() {
        const ok = options.editorRef()?.formatSelection() ?? false
        if (ok) workspace.setStatus(t('console.formatted'))
    }

    function jumpToErrorLine(lineNumber: number) {
        void jumpEditorToErrorLine(options.editorRef(), lineNumber)
    }

    return {running, runSql, onExecuteClick, saveConsole, formatSql, formatSelection, jumpToErrorLine}
}
