import type {ComposerTranslation} from 'vue-i18n'
import type {TreeNode, WorkspaceTab} from '@/core/types'
import {findDatabaseLabel} from '@/core/utils/tree'
import {datagenApi, tableDetailApi} from '@/api'
import {downloadTextFile} from '@/shared/utils/download-text'
import {
    clampFakeDataRowCount,
} from '@/features/workspace/services/fake-data.service'
import {canDmlConnection} from '@/features/team/services/connection-access.service'
import type {TeamSummary} from '@/core/types'

export function resolveDatabaseName(tab: WorkspaceTab, tree: TreeNode[]): string | undefined {
    if (tab.database?.trim()) return tab.database.trim()
    if (tab.instanceId) {
        return findDatabaseLabel(tree, tab.instanceId) ?? undefined
    }
    return undefined
}

export async function fetchFakeDataProperties(tab: WorkspaceTab, tree: TreeNode[]) {
    if (tab.type !== 'table' || !tab.tableName?.trim() || !tab.connectionId) {
        throw new Error('invalid table tab')
    }
    return tableDetailApi.fetchProperties(tab.tableName, {
        connectionId: tab.connectionId,
        database: resolveDatabaseName(tab, tree),
    })
}

export async function previewFakeDataForTab(options: {
    tab: WorkspaceTab
    tree: TreeNode[]
    rowCount: number
    seed?: number
}) {
    const {tab, tree, rowCount, seed} = options
    if (tab.type !== 'table' || !tab.tableName?.trim() || !tab.connectionId) {
        throw new Error('invalid table tab')
    }
    return datagenApi.previewTableDatagen({
        connectionId: tab.connectionId,
        database: resolveDatabaseName(tab, tree),
        tableName: tab.tableName,
        rowCount: clampFakeDataRowCount(rowCount),
        seed,
    })
}

export type FakeDataExecuteResult =
    | {ok: true; message: string}
    | {ok: false; message?: string; silent?: boolean}

/** 执行假数据写入。访客/权限不足不 toast（对话框 disabled + hint / 就地错误）。 */
export async function executeFakeDataForTab(options: {
    tab: WorkspaceTab
    tree: TreeNode[]
    properties: Awaited<ReturnType<typeof fetchFakeDataProperties>>
    rowCount: number
    seed?: number
    teams: TeamSummary[]
    isGuest: boolean
    t: ComposerTranslation
}): Promise<FakeDataExecuteResult> {
    const {tab, tree, properties, rowCount, teams, isGuest, t} = options
    if (isGuest) {
        return {ok: false, silent: true}
    }
    if (!tab.connectionId || !canDmlConnection(tab.connectionId, teams)) {
        return {ok: false, message: t('workspace.fakeData.writeDenied')}
    }
    const insertable = properties.columns.filter((column) => !(column.autoIncrement && column.keyType === 'PRI'))
    if (!insertable.length) {
        return {ok: false, message: t('workspace.fakeData.noColumns')}
    }
    if (!tab.tableName?.trim()) {
        return {ok: false, message: t('workspace.fakeData.failed')}
    }

    await datagenApi.executeTableDatagen({
        connectionId: tab.connectionId,
        database: resolveDatabaseName(tab, tree),
        tableName: tab.tableName,
        rowCount: clampFakeDataRowCount(rowCount),
        seed: options.seed,
    })
    return {
        ok: true,
        message: t('workspace.fakeData.executed', {count: clampFakeDataRowCount(rowCount)}),
    }
}

export async function exportFakeDataForTab(options: {
    tab: WorkspaceTab
    tree: TreeNode[]
    properties: Awaited<ReturnType<typeof fetchFakeDataProperties>>
    rowCount: number
    seed?: number
    t: ComposerTranslation
}): Promise<string> {
    const {tab, tree, properties, rowCount, t} = options
    const preview = await previewFakeDataForTab({tab, tree, rowCount, seed: options.seed})
    const sql = preview.insertSql
    const tableName = properties.tableName || tab.tableName || 'table'
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const fileName = `${tableName}-fake-data-${stamp}.sql`
    downloadTextFile(sql, fileName, 'text/plain;charset=utf-8')
    return t('workspace.fakeData.exported', {fileName})
}
