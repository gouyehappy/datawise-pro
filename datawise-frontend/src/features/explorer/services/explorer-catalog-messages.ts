export type ExplorerCatalogMessageKind =
    | 'permissionDenied'
    | 'connectionMoved'
    | 'groupRenamed'
    | 'subgroupCreated'
    | 'folderNameDefault'
    | 'moveConnection'
    | 'deleteDatabaseSuccess'

/** i18n keys for catalog group / connection mutations. */
export function resolveExplorerCatalogMessageKey(kind: ExplorerCatalogMessageKind): string {
    if (kind === 'permissionDenied') return 'auth.permissionDenied'
    if (kind === 'connectionMoved') return 'explorer.connectionMoved'
    if (kind === 'groupRenamed') return 'explorer.groupRenamed'
    if (kind === 'subgroupCreated') return 'explorer.subgroupCreated'
    if (kind === 'folderNameDefault') return 'explorer.folderNameDefault'
    if (kind === 'moveConnection') return 'explorer.context.moveConnection'
    return 'explorer.deleteDatabaseSuccess'
}
