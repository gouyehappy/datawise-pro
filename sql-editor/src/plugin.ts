import {type App} from 'vue'
import SqlEditor from './components/SqlEditor.vue'
import SqlEditorHintBar from './components/SqlEditorHintBar.vue'
import SqlEditorSettingsDrawer from './components/SqlEditorSettingsDrawer.vue'
import SqlEditorSettingsShell from './components/settings/SqlEditorSettingsShell.vue'
import {SQL_EDITOR_CONFIG_KEY, SQL_EDITOR_RUNTIME_KEY} from './config/injection'
import {DEFAULT_SQL_EDITOR_CONFIG} from './config/defaults'
import {
    createSqlEditorRuntime,
    setDefaultSqlEditorRuntime,
} from './runtime/sql-editor-runtime'
import type {SqlEditorGlobalConfig, SqlEditorRuntime, SqlEditorRuntimeOptions} from './types'

export interface SqlEditorPluginOptions {
    config?: SqlEditorGlobalConfig
    runtime?: SqlEditorRuntime | SqlEditorRuntimeOptions
    registerComponents?: boolean
}

function isRuntimeInstance(value: unknown): value is SqlEditorRuntime {
    return Boolean(
        value
        && typeof value === 'object'
        && 'sync' in value
        && typeof (value as SqlEditorRuntime).sync === 'function',
    )
}

/** Vue 插件：注册补全、注入外观配置与 Runtime（Monaco 补全延至 SqlEditor 首次挂载，避免桌面冷启动卡死） */
export function installSqlEditorPlugin(app: App, options: SqlEditorPluginOptions = {}) {
    app.provide(SQL_EDITOR_CONFIG_KEY, options.config ?? DEFAULT_SQL_EDITOR_CONFIG)

    const runtime = isRuntimeInstance(options.runtime)
        ? options.runtime
        : createSqlEditorRuntime(options.runtime)

    setDefaultSqlEditorRuntime(runtime)
    app.provide(SQL_EDITOR_RUNTIME_KEY, runtime)

    if (options.registerComponents !== false) {
        app.component('SqlEditor', SqlEditor)
        app.component('SqlEditorHintBar', SqlEditorHintBar)
        app.component('SqlEditorSettingsDrawer', SqlEditorSettingsDrawer)
        app.component('SqlEditorSettingsShell', SqlEditorSettingsShell)
    }
}

export {SqlEditor, SqlEditorHintBar, SqlEditorSettingsDrawer, SqlEditorSettingsShell}
