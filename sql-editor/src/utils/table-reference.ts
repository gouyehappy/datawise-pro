import type {SqlEditorSchema} from '@sql-editor/types'

/** 去掉标识符引号 */
export function unquoteTableIdent(value: string): string {
    return value.replace(/^[`"'\[]|[`"'\]]$/g, '')
}

/** 限定名取物理表名：hive.a003.test → test */
export function tableBaseNameFromRef(ref: string): string {
    const bare = unquoteTableIdent(ref)
    const dot = bare.lastIndexOf('.')
    return dot >= 0 ? bare.slice(dot + 1) : bare
}

/** Trino catalog.schema.table → catalog.schema；两段式 db.table → db */
export function tableScopeFromRef(ref: string): string | undefined {
    const parts = unquoteTableIdent(ref).split('.').filter(Boolean)
    if (parts.length >= 3) return `${parts[0]}.${parts[1]}`
    if (parts.length === 2) return parts[0]
    return undefined
}

/** 在 knownTables 中按全名或限定名末段匹配 */
export function findKnownTable(name: string, knownTables: string[]): string | null {
    const lower = unquoteTableIdent(name).toLowerCase()
    const direct = knownTables.find((t) => t.toLowerCase() === lower)
    if (direct) return direct

    const base = tableBaseNameFromRef(name).toLowerCase()
    if (base !== lower) {
        return knownTables.find((t) => t.toLowerCase() === base) ?? null
    }
    return null
}

/**
 * 将 SQL 中的表引用解析为 schema 中的规范短表名。
 * 限定名优先按 tableCatalogs 与 catalog.schema 消歧。
 */
export function resolveKnownTableRef(
    ref: string,
    knownTables: string[],
    schema?: Pick<SqlEditorSchema, 'tableCatalogs'>,
): string | null {
    const bare = unquoteTableIdent(ref).trim()
    if (!bare || bare.endsWith('.')) return null

    const direct = findKnownTable(bare, knownTables)
    if (!direct) return null

    const scope = tableScopeFromRef(bare)
    if (!scope || !schema?.tableCatalogs) return direct

    const scopeLower = scope.toLowerCase()
    const base = tableBaseNameFromRef(bare).toLowerCase()
    const candidates = knownTables.filter((t) => t.toLowerCase() === base)
    if (candidates.length <= 1) return direct

    const scoped = candidates.find((t) => schema.tableCatalogs?.[t]?.toLowerCase() === scopeLower)
    return scoped ?? direct
}

/** 前缀是否仍是更长表名的前缀（仅比较物理表名段） */
export function hasLongerTablePrefix(prefix: string, knownTables: string[]): boolean {
    const base = tableBaseNameFromRef(prefix)
    if (!base) return false
    const lower = base.toLowerCase()
    return knownTables.some(
        (t) => t.toLowerCase().startsWith(lower) && t.toLowerCase().length > lower.length,
    )
}

/** FROM/JOIN 中表引用是否已完整且能在 schema 中解析 */
export function isCompleteKnownTableRef(
    ref: string,
    knownTables: string[],
    schema?: Pick<SqlEditorSchema, 'tableCatalogs'>,
): boolean {
    const bare = unquoteTableIdent(ref).trim()
    if (!bare || bare.endsWith('.')) return false
    const resolved = resolveKnownTableRef(bare, knownTables, schema)
    if (!resolved) return false
    return tableBaseNameFromRef(bare).toLowerCase() === resolved.toLowerCase()
}
