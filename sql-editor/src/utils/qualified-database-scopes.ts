import type {SqlEditorSchema} from '@sql-editor/types'
import {
    catalogUsesSchemaLevel,
    resolveSchemasForCatalogKey,
} from '@sql-editor/utils/from-qualified-input'

const FROM_JOIN_REF =
    /\b(?:FROM|(?:INNER|LEFT|RIGHT|FULL|CROSS)\s+JOIN|JOIN)\s+([`"']?[\w$]+(?:\.[`"']?[\w$]+)*[`"']?[.]?)/gi

export interface FromJoinQualifiedRef {
    parts: string[]
    trailingDot: boolean
}

function parseFromJoinRef(raw: string): FromJoinQualifiedRef {
    const unquoted = raw.replace(/^[`"']|[`"']$/g, '')
    const trailingDot = unquoted.endsWith('.')
    const bare = trailingDot ? unquoted.slice(0, -1) : unquoted
    return {
        parts: bare ? bare.split('.').filter(Boolean) : [],
        trailingDot,
    }
}

/** 遍历 SQL 中 FROM/JOIN 后的限定名引用 */
export function iterateFromJoinQualifiedRefs(sql: string): FromJoinQualifiedRef[] {
    const refs: FromJoinQualifiedRef[] = []
    const pattern = new RegExp(FROM_JOIN_REF.source, 'gi')
    let match: RegExpExecArray | null
    while ((match = pattern.exec(sql)) !== null) {
        refs.push(parseFromJoinRef(match[1]))
    }
    return refs
}

/** 需要懒加载表列表的数据库 scope（Trino: catalog.schema；MySQL: database） */
export function extractDatabaseTableScopes(
    sql: string,
    schema: Pick<SqlEditorSchema, 'schemasByCatalog'> = {},
): string[] {
    const scopes = new Set<string>()
    for (const ref of iterateFromJoinQualifiedRefs(sql)) {
        if (ref.parts.length >= 2) {
            scopes.add(`${ref.parts[0]}.${ref.parts[1]}`)
        } else if (ref.parts.length === 1 && ref.trailingDot) {
            if (!catalogUsesSchemaLevel(schema, ref.parts[0])) {
                scopes.add(ref.parts[0])
            }
        }
    }
    return [...scopes]
}

/** Trino：catalog. 后 schema 索引缺失时需刷新 Explorer */
export function extractCatalogSchemaRefreshPrefixes(
    sql: string,
    schemasByCatalog: Record<string, string[]> | undefined,
): string[] {
    const catalogs: string[] = []
    for (const ref of iterateFromJoinQualifiedRefs(sql)) {
        if (ref.parts.length !== 1 || !ref.trailingDot) continue
        const catalog = ref.parts[0]
        if (!catalogUsesSchemaLevel({schemasByCatalog}, catalog)) continue
        if (resolveSchemasForCatalogKey(schemasByCatalog, catalog).length) continue
        catalogs.push(catalog)
    }
    return catalogs
}

/** @deprecated use extractDatabaseTableScopes */
export function extractQualifiedDatabaseScopes(sql: string): string[] {
    return extractDatabaseTableScopes(sql)
}

export function normalizeDatabaseScopeKey(scope: string): string {
    return scope.trim().toLowerCase()
}

export function resolveDatabaseScopeEntry<T>(
    map: Record<string, T> | undefined,
    scope: string,
): T | undefined {
    if (!map || !scope) return undefined
    if (map[scope]) return map[scope]
    const lower = normalizeDatabaseScopeKey(scope)
    const hit = Object.entries(map).find(([key]) => normalizeDatabaseScopeKey(key) === lower)
    return hit?.[1]
}
