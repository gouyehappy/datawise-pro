import type {TreeNode} from '@/core/types'
import {isPinnableExplorerNode} from '@/features/explorer/services/explorer-pinned-sort.service'

export function isTablesFolderNode(node: Pick<TreeNode, 'type' | 'label'>): boolean {
    return node.type === 'folder' && node.label === 'tables'
}

export type TablesFolderViewAction = 'schema-er' | 'schema-tables'

/** Tables-folder views that share schema ER context resolution. */
export function resolveTablesFolderViewAction(
    menuId: string,
    node: Pick<TreeNode, 'type' | 'label'>,
): TablesFolderViewAction | null {
    if (!isTablesFolderNode(node)) return null
    if (menuId === 'schema-er' || menuId === 'schema-tables') return menuId
    return null
}

/** i18n key when schema ER / tables context cannot be resolved for a tables-folder view. */
export function resolveTablesFolderViewContextMissingKey(action: TablesFolderViewAction): string {
    return action === 'schema-er'
        ? 'explorer.schemaErContextMissing'
        : 'explorer.schemaTablesContextMissing'
}

export function isOpenMenuAction(menuId: string): boolean {
    return menuId === 'open'
}

export function isPinMenuAction(menuId: string, node: Pick<TreeNode, 'type'>): boolean {
    return menuId === 'pin' && isPinnableExplorerNode(node)
}

export type SqlExportWizardMenuVariant = 'export' | 'backup'

export function resolveSqlExportWizardMenuVariant(
    menuId: string,
    nodeType: TreeNode['type'],
): SqlExportWizardMenuVariant | null {
    if (nodeType !== 'table' && nodeType !== 'database') return null
    if (menuId === 'export-wizard') return 'export'
    if (menuId === 'backup-wizard') return 'backup'
    return null
}

export function isRestoreWizardMenuAction(
    menuId: string,
    nodeType: TreeNode['type'],
): boolean {
    return menuId === 'restore-wizard' && nodeType === 'database'
}

export type ConnectionLifecycleMenuAction = 'connect' | 'disconnect' | 'reconnect'

export function resolveConnectionLifecycleMenuAction(
    menuId: string,
    nodeType: TreeNode['type'],
): ConnectionLifecycleMenuAction | null {
    if (nodeType !== 'connection') return null
    if (menuId === 'connect' || menuId === 'disconnect' || menuId === 'reconnect') return menuId
    return null
}

export type ConnectionLifecycleToast = {
    key: string
    tone: 'success' | 'error'
}

/**
 * Toast after connect / disconnect / reconnect.
 * 成功态由树节点 / 叠加层自证，不弹 toast；仅断开失败需要立刻提醒。
 */
export function resolveConnectionLifecycleToast(
    action: ConnectionLifecycleMenuAction,
    ok: boolean,
): ConnectionLifecycleToast | null {
    if (action === 'disconnect' && !ok) {
        return {key: 'explorer.connectionDisconnectFailed', tone: 'error'}
    }
    return null
}

export type TableDangerAction = 'truncate' | 'delete'

/** i18n key for truncate / delete table confirm dialogs. */
export function resolveTableDangerDialogMessageKey(action: TableDangerAction): string {
    return action === 'truncate'
        ? 'explorer.truncateTableMessage'
        : 'explorer.deleteTableMessage'
}

export type ExplorerDeleteShortcutIntent =
    | {kind: 'delete-database'; permissionAction: 'delete-database'}
    | {kind: 'delete-table'; permissionAction: 'delete'}
    | {kind: 'delete-sql-file'; permissionAction: 'delete'}
    | {kind: 'delete-project-file'; permissionAction: 'delete-project-file'}
    | {kind: 'delete-catalog'; permissionAction: 'delete'}

/**
 * Pure delete-shortcut routing by node type / project sandbox id.
 * Permission / DDL checks remain in the composable.
 */
export function resolveExplorerDeleteShortcutIntent(
    node: Pick<TreeNode, 'type' | 'id'> | TreeNode['type'],
): ExplorerDeleteShortcutIntent | null {
    const nodeType = typeof node === 'string' ? node : node.type
    const nodeId = typeof node === 'string' ? '' : node.id
    if (
        nodeId.startsWith('project-file:')
        && (
            nodeType === 'project-file'
            || nodeType === 'sql_file'
            || nodeType === 'project-docs'
            || nodeType === 'project-scripts'
        )
    ) {
        return {kind: 'delete-project-file', permissionAction: 'delete-project-file'}
    }
    if (nodeType === 'database') {
        return {kind: 'delete-database', permissionAction: 'delete-database'}
    }
    if (nodeType === 'table') {
        return {kind: 'delete-table', permissionAction: 'delete'}
    }
    if (nodeType === 'sql_file') {
        return {kind: 'delete-sql-file', permissionAction: 'delete'}
    }
    if (nodeType === 'connection' || nodeType === 'group') {
        return {kind: 'delete-catalog', permissionAction: 'delete'}
    }
    return null
}

const SQL_EXPORT_MENU_IDS = new Set([
    'export-structure',
    'export-all',
    'copy-structure',
    'copy-data',
])

export function isSqlExportClipboardMenuAction(menuId: string): boolean {
    return SQL_EXPORT_MENU_IDS.has(menuId)
}

export function isModelsFolderNode(node: Pick<TreeNode, 'type' | 'label'>): boolean {
    return node.type === 'folder' && node.label === 'models'
}

export type GroupCatalogDialogIntent = 'new-subgroup' | 'rename'

export function resolveGroupCatalogDialogIntent(
    menuId: string,
    nodeType: TreeNode['type'],
): GroupCatalogDialogIntent | null {
    if (nodeType !== 'group') return null
    if (menuId === 'new-subgroup') return 'new-subgroup'
    if (menuId === 'rename') return 'rename'
    return null
}

export type SqlFileMenuIntent = 'rename' | 'delete' | 'script-history' | 'schedule'

export function resolveSqlFileMenuIntent(
    menuId: string,
    nodeType: TreeNode['type'],
): SqlFileMenuIntent | null {
    if (nodeType !== 'sql_file') return null
    if (menuId === 'rename') return 'rename'
    if (menuId === 'delete-sql-file') return 'delete'
    if (menuId === 'script-history') return 'script-history'
    if (menuId === 'schedule-sql-file') return 'schedule'
    return null
}

export type ViewModelMenuIntent =
    | 'new'
    | 'edit'
    | 'lineage'
    | 'rename'
    | 'delete'

export function resolveViewModelMenuIntent(
    menuId: string,
    node: Pick<TreeNode, 'type' | 'label'>,
): ViewModelMenuIntent | null {
    if (menuId === 'new-view-model' && isModelsFolderNode(node)) return 'new'
    if (node.type !== 'view_model') return null
    if (menuId === 'edit-view-model') return 'edit'
    if (menuId === 'view-lineage') return 'lineage'
    if (menuId === 'rename') return 'rename'
    if (menuId === 'delete-view-model') return 'delete'
    return null
}

export type SshScriptMenuIntent =
    | 'new-record'
    | 'refresh-records'
    | 'delete-record'
    | 'rename-record'

export function resolveSshScriptMenuIntent(
    menuId: string,
    nodeType: TreeNode['type'],
): SshScriptMenuIntent | null {
    if (menuId === 'new-ssh-script-record' && nodeType === 'ssh-script-records') return 'new-record'
    if (menuId === 'refresh-ssh-script-records' && nodeType === 'ssh-script-records') return 'refresh-records'
    if (menuId === 'delete-ssh-script-record' && nodeType === 'ssh-script-record') return 'delete-record'
    if (menuId === 'rename-ssh-script-record' && nodeType === 'ssh-script-record') return 'rename-record'
    return null
}

export type TableOpenViewMenuAction = 'ddl' | 'properties'

/** Table context-menu actions that open a table tab view. */
export function resolveTableOpenViewMenuAction(
    menuId: string,
    nodeType: TreeNode['type'],
): TableOpenViewMenuAction | null {
    if (nodeType !== 'table') return null
    if (menuId === 'ddl') return 'ddl'
    if (menuId === 'edit') return 'properties'
    return null
}

export type DatabaseCompareMenuAction = 'schema-compare' | 'cross-env-compare'

export function resolveDatabaseCompareMenuAction(
    menuId: string,
    nodeType: TreeNode['type'],
): DatabaseCompareMenuAction | null {
    if (nodeType !== 'database') return null
    if (menuId === 'schema-compare' || menuId === 'cross-env-compare') return menuId
    return null
}

export type MigrateDataMenuTarget = 'table-or-database' | 'view-model'

export function resolveMigrateDataMenuTarget(
    menuId: string,
    nodeType: TreeNode['type'],
): MigrateDataMenuTarget | null {
    if (menuId !== 'migrate-data') return null
    if (nodeType === 'database' || nodeType === 'table') return 'table-or-database'
    if (nodeType === 'view_model') return 'view-model'
    return null
}

export type ConsoleMenuTarget = 'database' | 'table' | 'generic'

export function resolveConsoleMenuTarget(
    menuId: string,
    nodeType: TreeNode['type'],
): ConsoleMenuTarget | null {
    if (menuId !== 'console') return null
    if (nodeType === 'database') return 'database'
    if (nodeType === 'table') return 'table'
    return 'generic'
}

export type CreateNamespaceMenuMode = 'database' | 'schema'

export function resolveCreateNamespaceMenuMode(
    menuId: string,
    nodeType: TreeNode['type'],
): CreateNamespaceMenuMode | null {
    if (nodeType !== 'connection') return null
    if (menuId === 'create-database') return 'database'
    if (menuId === 'create-schema') return 'schema'
    return null
}

/** Tab ids bound to a deleted SSH script record (for close-on-delete). */
export function listSshScriptRecordTabIds(
    tabs: ReadonlyArray<{
        id: string
        type?: string
        connectionId?: string
        sshScriptRecordId?: string
    }>,
    connectionId: string,
    recordId: string,
): string[] {
    return tabs
        .filter((tab) =>
            tab.type === 'ssh-script-record'
            && tab.connectionId === connectionId
            && tab.sshScriptRecordId === recordId,
        )
        .map((tab) => tab.id)
}

export type RefreshMenuTarget = 'connection' | 'tables-scope'

export function resolveRefreshMenuTarget(
    menuId: string,
    node: Pick<TreeNode, 'type' | 'label'>,
): RefreshMenuTarget | null {
    if (menuId !== 'refresh') return null
    if (node.type === 'connection') return 'connection'
    if (node.type === 'table' || isTablesFolderNode(node)) return 'tables-scope'
    return null
}

export type DeleteMenuIntent = 'delete-database' | 'delete-table' | 'delete-catalog'

export function resolveDeleteMenuIntent(
    menuId: string,
    nodeType: TreeNode['type'],
): DeleteMenuIntent | null {
    if (menuId === 'delete-database' && nodeType === 'database') return 'delete-database'
    if (menuId === 'delete' && nodeType === 'table') return 'delete-table'
    if (menuId === 'delete' && (nodeType === 'connection' || nodeType === 'group')) return 'delete-catalog'
    return null
}

export function isEditConnectionMenuAction(
    menuId: string,
    node: Pick<TreeNode, 'type' | 'dbType'>,
): boolean {
    return menuId === 'edit' && node.type === 'connection' && Boolean(node.dbType)
}

export function isCopyNameMenuAction(menuId: string): boolean {
    return menuId === 'copy-name'
}

export function isMoveHereMenuAction(
    menuId: string,
    nodeType: TreeNode['type'],
): boolean {
    return menuId === 'move-here' && nodeType === 'group'
}

export function resolveCatalogDeletedMessageKey(nodeType: 'group' | 'connection'): string {
    return nodeType === 'group' ? 'explorer.groupDeleted' : 'explorer.connectionDeleted'
}

export type ShortcutEditIntent = 'table-properties' | 'connection-form'

export function resolveShortcutEditIntent(
    node: Pick<TreeNode, 'type' | 'dbType'>,
): ShortcutEditIntent | null {
    if (node.type === 'table') return 'table-properties'
    if (node.type === 'connection' && node.dbType) return 'connection-form'
    return null
}

export type ShortcutOpenIntent = 'connection-form' | 'open-node'

export function resolveShortcutOpenIntent(
    node: Pick<TreeNode, 'type' | 'dbType'>,
): ShortcutOpenIntent {
    if (node.type === 'connection' && node.dbType) return 'connection-form'
    return 'open-node'
}

export type KafkaPublishMenuIntent = 'from-kafka-connection' | 'from-table'

export function resolveKafkaPublishMenuIntent(
    menuId: string,
    node: Pick<TreeNode, 'type' | 'dbType'>,
): KafkaPublishMenuIntent | null {
    if (menuId === 'publish-table-data' && node.type === 'connection' && node.dbType === 'kafka') {
        return 'from-kafka-connection'
    }
    if (menuId === 'publish-to-kafka' && node.type === 'table') {
        return 'from-table'
    }
    return null
}

export type SimpleScopedMenuAction =
    | 'truncate'
    | 'import'
    | 'export-data'
    | 'run-sql-file'
    | 'export-metadoc'

export function resolveSimpleScopedMenuAction(
    menuId: string,
    nodeType: TreeNode['type'],
): SimpleScopedMenuAction | null {
    if (menuId === 'truncate' && nodeType === 'table') return 'truncate'
    if (menuId === 'import' && nodeType === 'table') return 'import'
    if (menuId === 'export-data' && nodeType === 'table') return 'export-data'
    if (menuId === 'run-sql-file' && nodeType === 'database') return 'run-sql-file'
    if (menuId === 'export-metadoc' && nodeType === 'database') return 'export-metadoc'
    return null
}
