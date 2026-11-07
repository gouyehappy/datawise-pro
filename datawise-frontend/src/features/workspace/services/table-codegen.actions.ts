import type {ComposerTranslation} from 'vue-i18n'
import type {TreeNode, WorkspaceTab} from '@/core/types'
import {findDatabaseLabel} from '@/core/utils/tree'
import {tableDetailApi} from '@/api'
import {generateTableCode} from './table-codegen.service'
import type {TableCodeTemplate} from './table-codegen.types'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

function resolveDatabaseName(tab: WorkspaceTab, tree: TreeNode[]): string | undefined {
    if (tab.database?.trim()) return tab.database.trim()
    if (tab.instanceId) {
        return findDatabaseLabel(tree, tab.instanceId) ?? undefined
    }
    return undefined
}

export function buildCodegenConsoleTitle(
    tableName: string,
    template: TableCodeTemplate,
    t: ComposerTranslation,
): string {
    const label = t(`workspace.tableCodegen.templates.${template}`)
    return `${tableName} · ${label}`
}

export async function openGeneratedTableCode(options: {
    tab: WorkspaceTab
    template: TableCodeTemplate
    tree: TreeNode[]
    openConsole: (opts: {
        connectionId?: string
        instanceId?: string | null
        database?: string
        sql?: string
        title?: string
    }) => Promise<string>
    showToast: (message: string) => void
    t: ComposerTranslation
}): Promise<void> {
    const {tab, template, tree, openConsole, showToast, t} = options
    if (tab.type !== 'table' || !tab.tableName?.trim() || !tab.connectionId) {
        showToast(t('workspace.tableCodegen.failed'))
        return
    }
    try {
        const properties = await tableDetailApi.fetchProperties(tab.tableName, {
            connectionId: tab.connectionId,
            database: resolveDatabaseName(tab, tree),
        })
        if (!properties.columns.length) {
            showToast(t('workspace.tableCodegen.noColumns'))
            return
        }
        const code = generateTableCode(template, {properties})
        await openConsole({
            connectionId: tab.connectionId,
            instanceId: tab.instanceId,
            database: tab.database,
            sql: code,
            title: buildCodegenConsoleTitle(properties.tableName || tab.tableName, template, t),
        })
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'workspace.tableCodegen.failed')
        showToast(t('workspace.tableCodegen.failedWithDetail', {message}))
    }
}
