import type {WorkspaceTab} from '@/core/types'
import type {SaveViewModelPayload} from '@/shared/api/types'
import {viewModelApi} from '@/api/modules/view-model'
import {isSingleViewModelStatement, isViewModelSelectSql} from '@/features/explorer/services/view-model-sql'
import {splitSqlStatements} from '@/features/workspace/services/split-sql-statements'
import {sqlApi} from '@/api/modules/sql'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {t} from '@/i18n'

export type ViewModelSaveOutcome = 'published' | 'draft'

export interface ViewModelSaveAttemptResult {
    outcome: ViewModelSaveOutcome
    reason?: string
}

function buildPayload(
    tab: WorkspaceTab,
    sql: string,
    instanceNameOverride?: string,
): SaveViewModelPayload | null {
    const connectionId = tab.connectionId
    const instanceName = instanceNameOverride?.trim() || tab.database?.trim()
    const name = tab.viewModelName?.trim()
    if (!connectionId || !instanceName || !name) return null
    return {
        connectionId,
        instanceName,
        instanceId: tab.instanceId ?? undefined,
        name,
        sql,
    }
}

export async function saveViewModelDraftFromEditor(
    tab: WorkspaceTab,
    sql: string,
    instanceName?: string,
): Promise<ViewModelSaveAttemptResult> {
    const trimmed = sql.trim()
    const payload = buildPayload(tab, trimmed, instanceName)
    if (!payload) {
        return {outcome: 'draft', reason: 'missing_scope'}
    }
    if (!trimmed) {
        return {outcome: 'draft', reason: 'sql_required'}
    }
    await viewModelApi.saveDraft(payload)
    return {outcome: 'draft'}
}

export async function saveViewModelFromEditor(
    tab: WorkspaceTab,
    sql: string,
    instanceName?: string,
): Promise<ViewModelSaveAttemptResult> {
    const trimmed = sql.trim()
    const payload = buildPayload(tab, trimmed, instanceName)
    if (!payload) {
        return {outcome: 'draft', reason: 'missing_scope'}
    }
    if (!trimmed) {
        return {outcome: 'draft', reason: 'sql_required'}
    }

    const statements = splitSqlStatements(trimmed)
    if (!isSingleViewModelStatement(trimmed, statements)) {
        await viewModelApi.saveDraft(payload)
        return {outcome: 'draft', reason: 'single_select_required'}
    }

    try {
        await sqlApi.execute(trimmed, {
            connectionId: payload.connectionId,
            database: payload.instanceName,
            pageSize: 1,
        })
        await viewModelApi.save(payload)
        return {outcome: 'published'}
    } catch (error) {
        await viewModelApi.saveDraft(payload)
        const message = resolveCaughtApiErrorMessage(error, t, 'viewModel.saveFailed')
        return {outcome: 'draft', reason: message}
    }
}

export function canPreviewViewModelSql(sql: string): boolean {
    return isViewModelSelectSql(sql.trim())
}
