import type {SqlEditorGlobalConfig, SqlEditorLocale} from '@sql-editor/types'
import {SQL_EDITOR_FONT_SIZE_DEFAULT} from '@sql-editor/config/formatter-settings'
import {resolveSqlEditorMonacoOptions} from '@sql-editor/constants/editor-options'
import {SQL_EDITOR_LIGHT_THEME} from '@sql-editor/constants/editor-themes'

/** 默认 Monaco 主题（宿主未注入时使用） */
export const DEFAULT_SQL_EDITOR_THEME = SQL_EDITOR_LIGHT_THEME

/** 默认 UI 语言（首次无个人配置时使用，不跟随浏览器） */
export const DEFAULT_SQL_EDITOR_LOCALE: SqlEditorLocale = 'en'

export const DEFAULT_SQL_EDITOR_CONFIG: SqlEditorGlobalConfig = {
    theme: DEFAULT_SQL_EDITOR_THEME,
    monacoOptions: () =>
        resolveSqlEditorMonacoOptions({fontSize: SQL_EDITOR_FONT_SIZE_DEFAULT}),
}
