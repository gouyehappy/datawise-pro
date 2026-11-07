import type {InjectionKey} from 'vue'
import type {SqlEditorGlobalConfig, SqlEditorRuntime} from '@sql-editor/types'
import type {SqlEditorShortcutsController} from '@sql-editor/composables/useSqlEditorShortcutsController'

/** Vue provide/inject：Monaco 主题与字体等外观 */
export const SQL_EDITOR_CONFIG_KEY: InjectionKey<SqlEditorGlobalConfig> = Symbol('SqlEditorConfig')

/** Vue provide/inject：补全运行时（Schema / 方言 / 片段层） */
export const SQL_EDITOR_RUNTIME_KEY: InjectionKey<SqlEditorRuntime> = Symbol('SqlEditorRuntime')

/**
 * 宿主注入的 App 级设置控制器（与设置页、编辑器抽屉共用同一持久化与 sync）。
 * 产品侧由 ensureSqlEditorPlugin provide；未注入时抽屉为本 runtime 建本地控制器。
 */
export const SQL_EDITOR_SHORTCUTS_CONTROLLER_KEY: InjectionKey<SqlEditorShortcutsController> =
    Symbol('SqlEditorShortcutsController')
