import type {DbType, TreeNode} from '@/core/types'
import {
    resolveExplorerDeleteShortcutIntent,
    resolveShortcutEditIntent,
    resolveShortcutOpenIntent,
    resolveTableDangerDialogMessageKey,
} from '@/features/explorer/services/explorer-menu-intents.service'
import {resolveExplorerSqlFileMessageKey} from '@/features/explorer/services/explorer-sql-file-messages'

export type ShortcutConnectionFormCommand = {
    type: 'open-connection-form'
    dbType: DbType
    connectionId: string
    connectionName: string
}

export type ShortcutOpenCommand =
    | ShortcutConnectionFormCommand
    | {type: 'open-node'}

export type ShortcutEditCommand =
    | ShortcutConnectionFormCommand
    | {type: 'open-table-properties'}

function connectionFormCommand(
    node: Pick<TreeNode, 'id' | 'label' | 'dbType'>,
): ShortcutConnectionFormCommand | null {
    if (!node.dbType) return null
    return {
        type: 'open-connection-form',
        dbType: node.dbType,
        connectionId: node.id,
        connectionName: node.label,
    }
}

/** Pure workspace command for explorer Enter / open shortcut. */
export function resolveShortcutOpenCommand(
    node: Pick<TreeNode, 'type' | 'id' | 'label' | 'dbType'>,
): ShortcutOpenCommand {
    if (resolveShortcutOpenIntent(node) === 'connection-form') {
        return connectionFormCommand(node) ?? {type: 'open-node'}
    }
    return {type: 'open-node'}
}

/** Pure workspace command for explorer F4 / edit shortcut. */
export function resolveShortcutEditCommand(
    node: Pick<TreeNode, 'type' | 'id' | 'label' | 'dbType'>,
): ShortcutEditCommand | null {
    const intent = resolveShortcutEditIntent(node)
    if (intent === 'table-properties') return {type: 'open-table-properties'}
    if (intent === 'connection-form') return connectionFormCommand(node)
    return null
}

export type ExplorerDeleteShortcutUiPlan =
    | {
          kind: 'delete-database'
          permissionAction: 'delete-database'
          requiresDdlCheck: true
      }
    | {
          kind: 'delete-table'
          permissionAction: 'delete'
          messageKey: string
      }
    | {
          kind: 'delete-sql-file'
          permissionAction: 'delete'
          messageKey: string
      }
    | {
          kind: 'delete-project-file'
          permissionAction: 'delete-project-file'
          messageKey: string
          isDirectory: boolean
      }
    | {
          kind: 'delete-catalog'
          permissionAction: 'delete'
      }

/**
 * Pure delete-shortcut UI plan (which dialog + message keys).
 * Permission / DDL checks remain in the composable.
 */
export function resolveExplorerDeleteShortcutUiPlan(
    node: Pick<TreeNode, 'type' | 'id'> | TreeNode['type'],
): ExplorerDeleteShortcutUiPlan | null {
    const intent = resolveExplorerDeleteShortcutIntent(node)
    if (!intent) return null
    if (intent.kind === 'delete-database') {
        return {...intent, requiresDdlCheck: true}
    }
    if (intent.kind === 'delete-table') {
        return {
            ...intent,
            messageKey: resolveTableDangerDialogMessageKey('delete'),
        }
    }
    if (intent.kind === 'delete-sql-file') {
        return {
            ...intent,
            messageKey: resolveExplorerSqlFileMessageKey('deleteMessage'),
        }
    }
    if (intent.kind === 'delete-project-file') {
        const nodeType = typeof node === 'string' ? node : node.type
        const isDirectory = nodeType === 'project-docs' || nodeType === 'project-scripts'
        return {
            ...intent,
            isDirectory,
            messageKey: isDirectory
                ? 'explorer.deleteProjectFolderMessage'
                : 'explorer.deleteProjectFileMessage',
        }
    }
    return intent
}
