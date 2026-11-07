/** SQL 编辑器字号范围（与 DataWise 全局编辑器一致） */
export const SQL_EDITOR_FONT_SIZE_MIN = 12
export const SQL_EDITOR_FONT_SIZE_MAX = 24
export const SQL_EDITOR_FONT_SIZE_DEFAULT = 12

export type SqlFormatterKeywordCase = 'upper' | 'lower' | 'preserve'
export type SqlFormatterIndentStyle = 'standard' | 'tabularLeft' | 'tabularRight'
export type SqlFormatterLogicalOperatorNewline = 'before' | 'after'

export interface SqlEditorFormatterSettings {
    /** 使用 sql-formatter 库；关闭时仅用关键字换行回退 */
    useLibrary?: boolean
    /** 手写时在子句关键字前自动换行，避免单行过长 */
    formatAsYouType?: boolean
    keywordCase?: SqlFormatterKeywordCase
    identifierCase?: SqlFormatterKeywordCase
    functionCase?: SqlFormatterKeywordCase
    tabWidth?: 2 | 4
    /** 缩进使用 Tab 字符（否则为空格） */
    useTabs?: boolean
    indentStyle?: SqlFormatterIndentStyle
    logicalOperatorNewline?: SqlFormatterLogicalOperatorNewline
    linesBetweenQueries?: 1 | 2
    /** 运算符两侧紧凑（如 a=b 而非 a = b） */
    denseOperators?: boolean
    /** 分号单独换行 */
    newlineBeforeSemicolon?: boolean
}

export type ResolvedSqlEditorFormatterSettings = Required<SqlEditorFormatterSettings>

export const DEFAULT_SQL_EDITOR_FORMATTER_SETTINGS: ResolvedSqlEditorFormatterSettings = {
    useLibrary: true,
    formatAsYouType: true,
    keywordCase: 'upper',
    identifierCase: 'preserve',
    functionCase: 'preserve',
    tabWidth: 2,
    useTabs: false,
    indentStyle: 'standard',
    logicalOperatorNewline: 'before',
    linesBetweenQueries: 2,
    denseOperators: false,
    newlineBeforeSemicolon: false,
}

export function clampSqlEditorFontSize(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
    return Math.min(SQL_EDITOR_FONT_SIZE_MAX, Math.max(SQL_EDITOR_FONT_SIZE_MIN, Math.round(value)))
}

function isKeywordCase(value: unknown): value is SqlFormatterKeywordCase {
    return value === 'upper' || value === 'lower' || value === 'preserve'
}

export function normalizeSqlEditorFormatterLayer(
    raw: Partial<SqlEditorFormatterSettings> | null | undefined,
): SqlEditorFormatterSettings | undefined {
    if (!raw || typeof raw !== 'object') return undefined

    const next: SqlEditorFormatterSettings = {}
    if (typeof raw.useLibrary === 'boolean') next.useLibrary = raw.useLibrary
    if (typeof raw.formatAsYouType === 'boolean') next.formatAsYouType = raw.formatAsYouType
    if (isKeywordCase(raw.keywordCase)) next.keywordCase = raw.keywordCase
    if (isKeywordCase(raw.identifierCase)) next.identifierCase = raw.identifierCase
    if (isKeywordCase(raw.functionCase)) next.functionCase = raw.functionCase
    if (raw.tabWidth === 2 || raw.tabWidth === 4) next.tabWidth = raw.tabWidth
    if (typeof raw.useTabs === 'boolean') next.useTabs = raw.useTabs
    if (raw.indentStyle === 'standard' || raw.indentStyle === 'tabularLeft' || raw.indentStyle === 'tabularRight') {
        next.indentStyle = raw.indentStyle
    }
    if (raw.logicalOperatorNewline === 'before' || raw.logicalOperatorNewline === 'after') {
        next.logicalOperatorNewline = raw.logicalOperatorNewline
    }
    if (raw.linesBetweenQueries === 1 || raw.linesBetweenQueries === 2) {
        next.linesBetweenQueries = raw.linesBetweenQueries
    }
    if (typeof raw.denseOperators === 'boolean') next.denseOperators = raw.denseOperators
    if (typeof raw.newlineBeforeSemicolon === 'boolean') {
        next.newlineBeforeSemicolon = raw.newlineBeforeSemicolon
    }
    return Object.keys(next).length ? next : undefined
}

export function resolveSqlEditorFormatterSettings(
    layer?: SqlEditorFormatterSettings | null,
    base: ResolvedSqlEditorFormatterSettings = DEFAULT_SQL_EDITOR_FORMATTER_SETTINGS,
): ResolvedSqlEditorFormatterSettings {
    const normalized = normalizeSqlEditorFormatterLayer(layer) ?? {}
    return {
        useLibrary: normalized.useLibrary ?? base.useLibrary,
        formatAsYouType: normalized.formatAsYouType ?? base.formatAsYouType,
        keywordCase: normalized.keywordCase ?? base.keywordCase,
        identifierCase: normalized.identifierCase ?? base.identifierCase,
        functionCase: normalized.functionCase ?? base.functionCase,
        tabWidth: normalized.tabWidth ?? base.tabWidth,
        useTabs: normalized.useTabs ?? base.useTabs,
        indentStyle: normalized.indentStyle ?? base.indentStyle,
        logicalOperatorNewline: normalized.logicalOperatorNewline ?? base.logicalOperatorNewline,
        linesBetweenQueries: normalized.linesBetweenQueries ?? base.linesBetweenQueries,
        denseOperators: normalized.denseOperators ?? base.denseOperators,
        newlineBeforeSemicolon: normalized.newlineBeforeSemicolon ?? base.newlineBeforeSemicolon,
    }
}
