import type {DbType, TreeNode} from '@/core/types'
import type {CreateNamespaceMenuMode} from '@/features/explorer/services/explorer-menu-intents.service'
import {defaultScheduleNameForSqlFile} from '@/features/platform/services/scheduled-sql-payload.service'

export type NewConnectionFormPlan = {
    dbType: DbType
    options?: {groupId: string}
}

/** Pure open-connection-form args when picking a db type from the add menu. */
export function resolveNewConnectionFormPlan(
    dbType: DbType,
    node: Pick<TreeNode, 'type' | 'id'>,
): NewConnectionFormPlan {
    if (node.type === 'group') {
        return {dbType, options: {groupId: node.id}}
    }
    return {dbType}
}

export type EditConnectionFormPlan = {
    dbType: DbType
    connectionId: string
    connectionName: string
}

/** Pure edit-connection form args (null when dbType is missing). */
export function resolveEditConnectionFormPlan(
    node: Pick<TreeNode, 'id' | 'label' | 'dbType'>,
): EditConnectionFormPlan | null {
    if (!node.dbType) return null
    return {
        dbType: node.dbType,
        connectionId: node.id,
        connectionName: node.label,
    }
}

/** Pure workspace args for create-database / create-schema. */
export function buildCreateNamespaceWorkspaceArgs(
    mode: CreateNamespaceMenuMode,
    node: Pick<TreeNode, 'id' | 'label' | 'dbType'>,
) {
    return {
        connectionId: node.id,
        connectionName: node.label,
        dbType: node.dbType,
        mode,
        hostLabel: node.label,
        explorerNodeId: node.id,
    }
}

/** Pure schedule-task draft when scheduling an explorer SQL file. */
export function buildSqlFileScheduleDraft(fileName: string) {
    return {
        name: defaultScheduleNameForSqlFile(fileName),
        source: 'workspace_file' as const,
        sqlFile: fileName,
        cronExpression: '0 0 * * *',
        enabled: true,
    }
}
