import {getDefaultSqlEditorRuntime} from '@datawise/sql-editor/runtime/sql-editor-runtime'
import {
    useSqlEditorShortcutsController,
    type SqlEditorShortcutsController,
} from '@datawise/sql-editor/composables/useSqlEditorShortcutsController'
import {
    createAppSqlEditorShortcutsPersistence,
    exportSharedSqlEditorShortcutsDownload,
    parseSqlEditorShortcutsConfigText,
} from '@/features/settings/services/sql-editor-shortcuts.service'

let appController: SqlEditorShortcutsController | null = null

/** App 级 SQL 编辑器设置控制器单例（设置页 Pinia store 与 Shell 共用）。 */
export function getAppSqlEditorShortcutsController(): SqlEditorShortcutsController {
    if (!appController) {
        appController = useSqlEditorShortcutsController(getDefaultSqlEditorRuntime(), {
            persistence: createAppSqlEditorShortcutsPersistence(),
            parseSharedConfigText: parseSqlEditorShortcutsConfigText,
            exportSharedConfig: exportSharedSqlEditorShortcutsDownload,
        })
    }
    return appController
}
