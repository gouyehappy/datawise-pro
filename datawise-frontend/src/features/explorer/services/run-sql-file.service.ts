import type {TreeNode} from '@/core/types'
import {t} from '@/i18n'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useShortcutPanelStore} from '@/features/layout/stores/shortcut-panel-store'
import {buildDatabaseConsoleContext} from '@/features/explorer/services/sql-editor-actions.service'
import {resolveConsoleTabTitle} from '@/features/workspace/services/console-tab-title'
import {executeSqlBatch} from '@/features/workspace/services/sql-batch-execute.service'
import {resolveRunSqlBatch} from '@/features/workspace/services/run-sql-batch.service'
import {resolveClientMaxResultRows} from '@/features/settings/services/query-limit.service'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'

export const RUN_SQL_FILE_ACCEPT = '.sql,text/plain,application/sql'

/** 打开文件选择器，用户取消时 resolve null */
export function pickSqlFile(): Promise<File | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = RUN_SQL_FILE_ACCEPT
        input.style.display = 'none'
        document.body.appendChild(input)

        let settled = false
        const finish = (file: File | null) => {
            if (settled) return
            settled = true
            input.remove()
            window.removeEventListener('focus', onWindowFocus)
            resolve(file)
        }

        input.onchange = () => {
            finish(input.files?.[0] ?? null)
        }

        const onWindowFocus = () => {
            window.setTimeout(() => {
                if (!input.files?.length) {
                    finish(null)
                }
            }, 400)
        }
        window.addEventListener('focus', onWindowFocus)
        input.click()
    })
}

export interface ExecuteSqlFileContentOptions {
    tree: TreeNode[]
    databaseNode: Pick<TreeNode, 'id' | 'label'>
    connectionName?: string
    sql: string
    fileName: string
    /** 控制台状态文案前缀；默认 runSqlFile */
    statusPrefix?: 'runSqlFile' | 'restoreWizard'
    /** 弹窗仍打开时不要 toast「开始执行」（遵守 toast-while-modal 约束） */
    notifyStarted?: boolean
}

/** 将 SQL 内容打开到控制台并批量执行（还原向导 / 运行 SQL 文件共用） */
export async function executeSqlFileContent(options: ExecuteSqlFileContentOptions): Promise<boolean> {
    const layout = useLayoutStore()
    const workspace = useWorkspaceStore()
    const shortcutPanel = useShortcutPanelStore()
    const appConfig = useAppConfigStore()
    const prefix = options.statusPrefix ?? 'runSqlFile'
    const notifyStarted = options.notifyStarted !== false

    const batch = resolveRunSqlBatch(options.sql)
    if (!batch.length) {
        if (notifyStarted) {
            layout.showErrorToast(t(`explorer.${prefix}Empty`))
        }
        return false
    }

    const ctx = await buildDatabaseConsoleContext(
        options.tree,
        options.databaseNode,
        options.connectionName,
    )
    if (!ctx) {
        if (notifyStarted) {
            layout.showErrorToast(t(`explorer.${prefix}ContextMissing`))
        }
        return false
    }

    const tabTitle = resolveConsoleTabTitle({
        connectionHost: ctx.connectionHost,
        connectionName: ctx.connectionName,
        sqlFile: options.fileName,
    })

    const tabId = await workspace.openConsole({
        connectionId: ctx.connectionId,
        connectionName: ctx.connectionName,
        instanceId: ctx.databaseNode.id,
        database: ctx.databaseNode.label,
        sql: options.sql,
        title: tabTitle,
    })

    if (notifyStarted) {
        layout.showToast(t(`explorer.${prefix}Started`, {name: options.fileName}))
    }

    const connection = {
        connectionId: ctx.connectionId,
        database: ctx.databaseNode.label,
        maxRows: resolveClientMaxResultRows(),
    }

    const result = await executeSqlBatch(
        batch,
        connection,
        (entry) => shortcutPanel.appendSqlLog(entry, ctx.connectionId),
        {
            onProgress: (results) => {
                appConfig.setShowConsoleResultPanel(true)
                workspace.setConsoleQueryResults(tabId, results)
                const summary = results[0]
                if (summary?.batchEntries) {
                    workspace.setExecutionResult(summary.total, summary.durationMs)
                }
            },
            isPluginEnabled: (pluginId) => usePluginStore().isEnabled(pluginId),
        },
    )

    workspace.setConsoleQueryResults(tabId, result.items)
    workspace.setExecutionResult(result.totalRows, result.totalDuration)

    if (result.lastErrorMessage) {
        workspace.setStatus(result.lastErrorMessage)
        return false
    }

    workspace.setStatus(t(`explorer.${prefix}Done`, {name: options.fileName, count: batch.length}))
    return true
}

/** 数据库节点右键「运行 SQL 文件」：选文件 → 打开控制台 → 批量执行 */
export async function runSqlFileForDatabase(
    tree: TreeNode[],
    databaseNode: Pick<TreeNode, 'id' | 'label'>,
    connectionName?: string,
): Promise<void> {
    const layout = useLayoutStore()

    const file = await pickSqlFile()
    if (!file) return

    let sql: string
    try {
        sql = await file.text()
    } catch {
        layout.showErrorToast(t('explorer.runSqlFileReadFailed'))
        return
    }

    await executeSqlFileContent({
        tree,
        databaseNode,
        connectionName,
        sql,
        fileName: file.name,
    })
}
