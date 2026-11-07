import type {TreeNode} from '@/core/types'
import type {
    GroupCatalogDialogIntent,
    SqlFileMenuIntent,
    SshScriptMenuIntent,
    TableDangerAction,
    ViewModelMenuIntent,
} from '@/features/explorer/services/explorer-menu-intents.service'
import {
    resolveDeleteMenuIntent,
    resolveTableDangerDialogMessageKey,
} from '@/features/explorer/services/explorer-menu-intents.service'
import {resolveExplorerSqlFileMessageKey} from '@/features/explorer/services/explorer-sql-file-messages'
import {stripSqlExtension} from '@/features/explorer/services/sql-script-naming'
import {resolveViewModelMessageKey} from '@/features/explorer/services/view-model-messages'
import {resolveSshScriptRecordMessageKey} from '@/features/ssh/services/ssh-script-record-messages'

export type TableDangerConfirmPlan<A extends TableDangerAction = TableDangerAction> = {
    type: A
    messageKey: string
}

/** Pure truncate / delete-table confirm dialog payload (message key only). */
export function resolveTableDangerConfirmPlan<A extends TableDangerAction>(
    action: A,
): TableDangerConfirmPlan<A> {
    return {
        type: action,
        messageKey: resolveTableDangerDialogMessageKey(action),
    }
}

export type GroupCatalogDialogPlan =
    | {dialog: 'new-subgroup'}
    | {dialog: 'rename'; defaultName: string}

export function resolveGroupCatalogDialogPlan(
    intent: GroupCatalogDialogIntent,
    label: string,
): GroupCatalogDialogPlan {
    if (intent === 'new-subgroup') return {dialog: 'new-subgroup'}
    return {dialog: 'rename', defaultName: label}
}

export type SqlFileMenuDialogPlan =
    | {dialog: 'rename'; defaultName: string}
    | {dialog: 'delete'; messageKey: string}

/** Rename / delete dialog plans for SQL file menu intents (side-effect intents return null). */
export function resolveSqlFileMenuDialogPlan(
    intent: SqlFileMenuIntent,
    fileLabel: string,
): SqlFileMenuDialogPlan | null {
    if (intent === 'rename') {
        return {dialog: 'rename', defaultName: stripSqlExtension(fileLabel)}
    }
    if (intent === 'delete') {
        return {
            dialog: 'delete',
            messageKey: resolveExplorerSqlFileMessageKey('deleteMessage'),
        }
    }
    return null
}

export type ViewModelMenuDialogPlan =
    | {dialog: 'rename'; defaultName: string}
    | {dialog: 'delete'; messageKey: string}

/** Rename / delete dialog plans for view-model menu intents. */
export function resolveViewModelMenuDialogPlan(
    intent: ViewModelMenuIntent,
    label: string,
): ViewModelMenuDialogPlan | null {
    if (intent === 'rename') return {dialog: 'rename', defaultName: label}
    if (intent === 'delete') {
        return {
            dialog: 'delete',
            messageKey: resolveViewModelMessageKey('deleteMessage'),
        }
    }
    return null
}

export type SshScriptMenuDialogPlan =
    | {dialog: 'rename-record'; defaultName: string}
    | {dialog: 'delete-record'; messageKey: string}

/** Rename / delete dialog plans for SSH script menu intents. */
export function resolveSshScriptMenuDialogPlan(
    intent: SshScriptMenuIntent,
    label: string,
): SshScriptMenuDialogPlan | null {
    if (intent === 'rename-record') return {dialog: 'rename-record', defaultName: label}
    if (intent === 'delete-record') {
        return {
            dialog: 'delete-record',
            messageKey: resolveSshScriptRecordMessageKey('deleteConfirm'),
        }
    }
    return null
}

export type DeleteMenuUiPlan =
    | {kind: 'delete-database'; requiresDdlCheck: true}
    | {kind: 'delete-table'; type: 'delete'; messageKey: string}
    | {kind: 'delete-catalog'}

/**
 * Pure delete-menu UI plan (which dialog + message keys).
 * DDL checks remain in the composable.
 */
export function resolveDeleteMenuUiPlan(
    menuId: string,
    nodeType: TreeNode['type'],
): DeleteMenuUiPlan | null {
    const intent = resolveDeleteMenuIntent(menuId, nodeType)
    if (!intent) return null
    if (intent === 'delete-database') {
        return {kind: 'delete-database', requiresDdlCheck: true}
    }
    if (intent === 'delete-table') {
        const danger = resolveTableDangerConfirmPlan('delete')
        return {kind: 'delete-table', type: danger.type, messageKey: danger.messageKey}
    }
    return {kind: 'delete-catalog'}
}
