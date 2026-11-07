import type {SqlColumnMeta, SqlEditorSchema} from '@sql-editor/types'
import {maskNonCodeRegions} from './sql-scan'

export type PredicateLeftColumn = {
    table: string
    column: string
    meta: SqlColumnMeta
}

function unquoteIdent(value: string): string {
    return value.replace(/^[`"'\[]|[`"'\]]$/g, '')
}

function findColumnMeta(
    table: string,
    column: string,
    knownColumns: Record<string, SqlColumnMeta[]>,
): SqlColumnMeta | null {
    const cols = knownColumns[table] ?? knownColumns[table.toLowerCase()]
    const hit = cols?.find((c) => c.name.toLowerCase() === column.toLowerCase())
    return hit ?? null
}

function resolveTable(
    qualifier: string,
    aliases: Record<string, string>,
    knownTables: string[],
): string | null {
    const key = qualifier.toLowerCase()
    if (aliases[key]) return aliases[key]
    return knownTables.find((t) => t.toLowerCase() === key) ?? null
}

function resolveFromColumnName(
    column: string,
    aliases: Record<string, string>,
    knownTables: string[],
    schema: SqlEditorSchema,
): PredicateLeftColumn | null {
    if (/^(and|or|not|where|having|on|set|null|true|false|select|from|join)$/i.test(column)) {
        return null
    }

    for (const table of Object.values(aliases)) {
        const meta = findColumnMeta(table, column, schema.columns)
        if (meta) return {table, column: meta.name, meta}
    }
    for (const table of knownTables) {
        const meta = findColumnMeta(table, column, schema.columns)
        if (meta) return {table, column: meta.name, meta}
    }
    if (Object.keys(aliases).length === 1) {
        const table = Object.values(aliases)[0]
        const meta = findColumnMeta(table, column, schema.columns) ?? {name: column}
        return {table, column, meta}
    }
    // 单表查询无别名：`FROM users WHERE name `
    if (knownTables.length === 1) {
        const table = knownTables[0]
        const meta = findColumnMeta(table, column, schema.columns) ?? {name: column}
        return {table, column, meta}
    }
    return null
}

const OP_TAIL =
    '(?:(?:NOT\\s+)?(?:LIKE|IN|IS|BETWEEN)|(?:=|<>|!=|>=|<=|<|>))'
/** 运算符后可选的不完整右值标识符（`= pai`） */
const OPTIONAL_RHS_IDENT = '(?:\\s+[A-Za-z_][\\w$]*)?'

/**
 * 解析谓词左侧列（`alias.col =`、`col LIKE` 等），供值补全与运算符类型过滤。
 * 也覆盖 operators 阶段列已写完、运算符尚未键入：`alias.col ` / `col `；
 * 以及右值打了一半：`col = pai` / `alias.col = pr`（勿把右值当成左列）。
 */
export function resolvePredicateLeftColumn(
    segment: string,
    aliases: Record<string, string>,
    knownTables: string[],
    schema: SqlEditorSchema,
): PredicateLeftColumn | null {
    const text = maskNonCodeRegions(segment).trimEnd()

    const qualifiedOp =
        new RegExp(
            `(?:^|[\\s,(])([\`"'\\[]?[\\w$]+[\`"'\\]]?)\\.([\`"'\\[]?[\\w$]+[\`"'\\]]?)\\s*${OP_TAIL}\\s*$`,
            'i',
        ).exec(text)
    const qualifiedOpWithRhs =
        new RegExp(
            `(?:^|[\\s,(])([\`"'\\[]?[\\w$]+[\`"'\\]]?)\\.([\`"'\\[]?[\\w$]+[\`"'\\]]?)\\s*${OP_TAIL}${OPTIONAL_RHS_IDENT}$`,
            'i',
        ).exec(text)
    const qualifiedBare =
        /(?:^|[\s,(])([`"'\[]?[\w$]+[`"'\]]?)\.([`"'\[]?[\w$]+[`"'\]]?)\s*$/i.exec(text)

    const q = qualifiedOp ?? qualifiedOpWithRhs ?? qualifiedBare
    if (q) {
        const table = resolveTable(unquoteIdent(q[1]), aliases, knownTables)
        const column = unquoteIdent(q[2])
        if (table) {
            const meta = findColumnMeta(table, column, schema.columns) ?? {name: column}
            return {table, column, meta}
        }
    }

    const unqualifiedOp =
        new RegExp(
            `(?:^|[\\s,(])([\`"'\\[]?[\\w$]+[\`"'\\]]?)\\s*${OP_TAIL}\\s*$`,
            'i',
        ).exec(text)
    const unqualifiedOpWithRhs =
        new RegExp(
            `(?:^|[\\s,(])([\`"'\\[]?[\\w$]+[\`"'\\]]?)\\s*${OP_TAIL}${OPTIONAL_RHS_IDENT}$`,
            'i',
        ).exec(text)
    // 仅在谓词连接词 / WHERE|HAVING|ON 后的裸列，避免误吃 SELECT 列表列名
    const unqualifiedBare =
        /(?:^|[\s,(]|(?:\bWHERE|\bHAVING|\bAND|\bOR|\bON|\bSET)\s+)([`"'\[]?[\w$]+[`"'\]]?)\s*$/i.exec(text)

    const u = unqualifiedOp ?? unqualifiedOpWithRhs ?? unqualifiedBare
    if (u) {
        return resolveFromColumnName(unquoteIdent(u[1]), aliases, knownTables, schema)
    }

    return null
}

/** FK 参与列（JOIN ON / WHERE 关联键）排序加权。 */
export function isFkColumn(
    meta: SqlColumnMeta,
    table: string,
    inQueryTables: string[],
    foreignKeys: SqlEditorSchema['foreignKeys'],
): boolean {
    if (!foreignKeys?.length) return false
    const inSet = new Set(inQueryTables.map((t) => t.toLowerCase()))
    const tbl = table.toLowerCase()
    for (const fk of foreignKeys) {
        if (
            fk.fromTable.toLowerCase() === tbl &&
            fk.fromColumn.toLowerCase() === meta.name.toLowerCase() &&
            inSet.has(fk.toTable.toLowerCase())
        ) {
            return true
        }
        if (
            fk.toTable.toLowerCase() === tbl &&
            fk.toColumn.toLowerCase() === meta.name.toLowerCase() &&
            inSet.has(fk.fromTable.toLowerCase())
        ) {
            return true
        }
    }
    return false
}
