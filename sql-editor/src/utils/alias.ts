/**
 * 表别名：由表名派生缩写，保证单条 SQL 内唯一。
 * @see alias-from-name.ts 生成规则 · alias-line.ts 行内检测
 */
import {stripSqlForParsing, statementBoundsAtOffset} from './parse-references'
import {suggestTableAlias} from './alias-from-name'
import {getSqlEditorAutoTableAliasEnabled} from '@sql-editor/config/snippets/cache'
import {sqlEditorSuggestT} from '@sql-editor/i18n'

export {existingAliasAfterTableOnLine} from './alias-line'
import {existingAliasAfterTableOnLine} from './alias-line'

export {
    tableBaseName,
    splitTableWords,
    primaryAliasFromWords,
    aliasCandidatesForTable,
    suggestTableAlias,
} from './alias-from-name'

const JOIN_PREFIX = '(?:INNER|LEFT|RIGHT|FULL|CROSS\\s+)?'
const TABLE_ALIAS_PATTERN = new RegExp(
    `\\b(?:FROM|${JOIN_PREFIX}JOIN)\\s+(?:[\`"']?[\\w$]+[\`"']?(?:\\.[\\w$]+)?\\s+)(?:AS\\s+)?([A-Za-z_][\\w$]*)\\b`,
    'gi',
)

/** FROM/JOIN 后仅有预留别名（片段占位：FROM  ct / FROM ct） */
const PLACEHOLDER_ALIAS_PATTERN = new RegExp(
    `\\b(?:FROM|${JOIN_PREFIX}JOIN)\\s+(?:AS\\s+)?([A-Za-z_][\\w$]*)\\b`,
    'gi',
)

const SQL_KEYWORDS = new Set([
    'inner', 'left', 'right', 'full', 'cross', 'join', 'on', 'where', 'group', 'order', 'by',
    'having', 'limit', 'union', 'select', 'from', 'as', 'and', 'or', 'using', 'natural',
])

function isAliasToken(token: string): boolean {
    const lower = token.toLowerCase()
    if (SQL_KEYWORDS.has(lower)) return false
    return /^[A-Za-z_][\w$]*$/.test(token)
}

function addAliasToken(used: Set<string>, token: string | undefined) {
    if (token && isAliasToken(token)) used.add(token.toLowerCase())
}

function sqlTextForAliasScope(sql: string, offset?: number): string {
    if (offset === undefined) return stripSqlForParsing(sql)
    return stripSqlForParsing(statementBoundsAtOffset(sql, offset).text)
}

/** 收集当前 SQL 中已占用的表别名（默认仅当前语句，以分号为界） */
export function collectUsedAliases(
    aliases: Record<string, string>,
    sql: string,
    currentLine?: string,
    offset?: number,
): Set<string> {
    const used = new Set<string>()

    for (const key of Object.keys(aliases)) {
        addAliasToken(used, key)
    }

    const text = sqlTextForAliasScope(sql, offset)
    for (const pattern of [TABLE_ALIAS_PATTERN, PLACEHOLDER_ALIAS_PATTERN]) {
        pattern.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = pattern.exec(text)) !== null) {
            addAliasToken(used, match[1])
        }
    }

    const linesToScan = currentLine ? [currentLine, ...text.split('\n')] : text.split('\n')
    for (const line of linesToScan) {
        if (!/\b(?:FROM|JOIN)\b/i.test(line)) continue
        const fromJoin = /\b(?:FROM|(?:INNER|LEFT|RIGHT|FULL|CROSS\s+)?JOIN)\s+/gi
        let opener: RegExpExecArray | null
        while ((opener = fromJoin.exec(line)) !== null) {
            const rest = line.slice(opener.index + opener[0].length).trimStart()
            const aliasMatch = /^(?:[\w$."`]+\s+)?(?:AS\s+)?([A-Za-z_][\w$]*)\b/i.exec(rest)
            if (aliasMatch) addAliasToken(used, aliasMatch[1])
        }
    }

    return used
}

/** 为 FROM/JOIN 表补全生成别名：由表名缩写，保证语句内不重复 */
export function nextTableAlias(
    table: string,
    aliases: Record<string, string>,
    sql = '',
    currentLine?: string,
    extraUsed?: ReadonlySet<string>,
    offset?: number,
): string {
    const used = collectUsedAliases(aliases, sql, currentLine, offset)
    if (extraUsed) {
        for (const token of extraUsed) used.add(token.toLowerCase())
    }
    return suggestTableAlias(table, used)
}

/** 表名补全：后面已有别名则只插表名，否则附带由表名派生的唯一别名 */
export function tableCompletionInsertText(
    table: string,
    line: string,
    replaceEndColumn: number,
    aliases: Record<string, string>,
    sql = '',
    offset?: number,
    options?: { insertMode?: 'name-only' },
): { insertText: string; detail: string } {
    // 读全局 settings cache（runtime.sync 写入），避免 active runtime 与设置抽屉不同步
    if (options?.insertMode === 'name-only' || !getSqlEditorAutoTableAliasEnabled()) {
        return {insertText: table, detail: sqlEditorSuggestT('alias.table')}
    }
    const existing = existingAliasAfterTableOnLine(line, replaceEndColumn)
    if (existing) {
        return {
            insertText: table,
            detail: sqlEditorSuggestT('alias.table_reuse', {alias: existing}),
        }
    }
    const alias = nextTableAlias(table, aliases, sql, line, undefined, offset)
    return {
        insertText: `${table} ${alias}`,
        detail: sqlEditorSuggestT('alias.table_alias', {alias}),
    }
}

/** 优先使用非表名别名，最后回退表名 */
export function preferredAlias(table: string, aliases: Record<string, string>): string {
    const entries = Object.entries(aliases).filter(([, name]) => name === table)
    const named = entries.find(([alias]) => alias.toLowerCase() !== table.toLowerCase())
    if (named) return named[0]
    return table
}

/** 列出 SQL 中有效的表别名（排除表名自身映射） */
export function listQueryAliases(aliases: Record<string, string>): { alias: string; table: string }[] {
    const seen = new Set<string>()
    const result: { alias: string; table: string }[] = []
    for (const [alias, table] of Object.entries(aliases)) {
        if (alias.toLowerCase() === table.toLowerCase()) continue
        const key = `${alias}:${table}`
        if (seen.has(key)) continue
        seen.add(key)
        result.push({alias, table})
    }
    return result.sort((a, b) => a.alias.localeCompare(b.alias, undefined, {numeric: true}))
}
