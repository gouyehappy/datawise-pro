export type ExplorerSqlFileMessageKind =
    | 'deleteMessage'
    | 'invalidName'
    | 'renameFailed'
    | 'renamed'
    | 'deleteFailed'
    | 'deleted'
    | 'scheduleContextMissing'

/** i18n keys for explorer SQL file rename / delete / schedule toasts. */
export function resolveExplorerSqlFileMessageKey(kind: ExplorerSqlFileMessageKind): string {
    if (kind === 'deleteMessage') return 'explorer.deleteSqlFileMessage'
    if (kind === 'invalidName') return 'explorer.invalidSqlFileName'
    if (kind === 'renameFailed') return 'explorer.renameSqlFileFailed'
    if (kind === 'renamed') return 'explorer.sqlFileRenamed'
    if (kind === 'deleteFailed') return 'explorer.deleteSqlFileFailed'
    if (kind === 'deleted') return 'explorer.sqlFileDeleted'
    return 'explorer.scheduleSqlFileContextMissing'
}
