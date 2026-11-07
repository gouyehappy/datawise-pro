export type DatabaseSqlEditorMenuAction =
    | 'open-latest'
    | 'show-recent'
    | 'create-new'
    | 'open-blank'

/**
 * Pure matcher for database-scoped SQL editor context-menu ids.
 * Does not include legacy `console` (different setModule behavior).
 */
export function resolveDatabaseSqlEditorMenuAction(
    menuId: string,
    nodeType: string,
): DatabaseSqlEditorMenuAction | null {
    if (nodeType !== 'database') return null
    if (menuId === 'sql-editor-open') return 'open-latest'
    if (menuId === 'sql-editor-recent') return 'show-recent'
    if (menuId === 'sql-editor-new') return 'create-new'
    if (menuId === 'sql-editor-console') return 'open-blank'
    return null
}

/** Map keyboard/database shortcut actions onto the same SQL editor intents. */
export function mapDatabaseShortcutToSqlEditorAction(
    action: 'open' | 'recent' | 'new' | 'console',
): DatabaseSqlEditorMenuAction {
    if (action === 'open') return 'open-latest'
    if (action === 'recent') return 'show-recent'
    if (action === 'new') return 'create-new'
    return 'open-blank'
}
