import type {SqlEditorThemeOption} from '@sql-editor/types'

/** SQL 编辑器仅提供深色 / 浅色两套 Monaco 主题 */
export type SqlEditorThemeId = 'one-dark' | 'github-light'

export const SQL_EDITOR_DARK_THEME: SqlEditorThemeId = 'one-dark'
export const SQL_EDITOR_LIGHT_THEME: SqlEditorThemeId = 'github-light'

export const SQL_EDITOR_THEME_OPTIONS: SqlEditorThemeId[] = [
    SQL_EDITOR_DARK_THEME,
    SQL_EDITOR_LIGHT_THEME,
]

const THEME_SET = new Set<string>(SQL_EDITOR_THEME_OPTIONS)

const LEGACY_THEME_MAP: Record<string, SqlEditorThemeId> = {
    'datawise-dark': SQL_EDITOR_DARK_THEME,
    'datawise-light': SQL_EDITOR_LIGHT_THEME,
    vs: SQL_EDITOR_LIGHT_THEME,
    'vs-dark': SQL_EDITOR_DARK_THEME,
    dracula: SQL_EDITOR_DARK_THEME,
    'github-dark': SQL_EDITOR_DARK_THEME,
    'monokai-bright': SQL_EDITOR_LIGHT_THEME,
    monokai: SQL_EDITOR_DARK_THEME,
    'solarized-dark': SQL_EDITOR_DARK_THEME,
    'solarized-light': SQL_EDITOR_LIGHT_THEME,
    xcode: SQL_EDITOR_LIGHT_THEME,
    'hc-light': SQL_EDITOR_LIGHT_THEME,
    'hc-black': SQL_EDITOR_DARK_THEME,
}

export function normalizeSqlEditorThemeId(value: unknown): SqlEditorThemeId | undefined {
    if (typeof value !== 'string') return undefined
    if (THEME_SET.has(value)) return value as SqlEditorThemeId
    return LEGACY_THEME_MAP[value]
}

export function buildSqlEditorThemeOptions(
    label: (themeId: SqlEditorThemeId) => string,
): SqlEditorThemeOption[] {
    return SQL_EDITOR_THEME_OPTIONS.map((id) => ({id, label: label(id)}))
}
