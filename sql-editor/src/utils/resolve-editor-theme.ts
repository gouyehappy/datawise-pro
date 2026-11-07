import {DEFAULT_SQL_EDITOR_THEME} from '@sql-editor/config/defaults'
import {normalizeSqlEditorThemeId} from '@sql-editor/constants/editor-themes'
import type {SqlEditorGlobalConfig} from '@sql-editor/types'

export interface ResolveSqlEditorThemeInput {
    personalTheme?: string | null
    hostTheme?: string | null
    propTheme?: string | null
    /** 宿主提供 setTheme 时，以外部设置为准（DataWise 设置页） */
    hostManaged?: boolean
    fallback?: string
}

/** 宿主是否接管 Monaco 主题（提供 setTheme 即视为托管） */
export function isSqlEditorThemeHostManaged(
    globalConfig: SqlEditorGlobalConfig | null | undefined,
): boolean {
    return typeof globalConfig?.setTheme === 'function'
}

/** 统一解析 SQL 编辑器 Monaco 主题：托管模式下宿主优先，否则个人层 > 宿主 > prop */
export function resolveSqlEditorTheme(input: ResolveSqlEditorThemeInput): string {
    const fallback = normalizeSqlEditorThemeId(input.fallback) ?? DEFAULT_SQL_EDITOR_THEME
    const host = normalizeSqlEditorThemeId(input.hostTheme)
    const personal = normalizeSqlEditorThemeId(input.personalTheme)
    const prop = normalizeSqlEditorThemeId(input.propTheme)

    if (input.hostManaged && host) return host
    if (personal) return personal
    if (host) return host
    if (prop) return prop
    return fallback
}
