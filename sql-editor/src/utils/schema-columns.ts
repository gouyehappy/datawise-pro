import type {SqlColumnMeta, SqlEditorSchema, SqlForeignKey} from '@sql-editor/types'
import {tableBaseNameFromRef} from '@sql-editor/utils/table-reference'
import {sqlEditorT} from '@sql-editor/i18n'
import {getActiveSqlEditorRuntime} from '@sql-editor/runtime/sql-editor-runtime'

/** 归一化列定义（兼容旧版 string[]） */
export function normalizeColumnMeta(columns: SqlColumnMeta[] | string[] | undefined): SqlColumnMeta[] {
    if (!columns?.length) return []
    if (typeof columns[0] === 'string') {
        return (columns as string[]).map((name) => ({name}))
    }
    return columns as SqlColumnMeta[]
}

export function columnNames(columns: SqlColumnMeta[] | string[] | undefined): string[] {
    return normalizeColumnMeta(columns).map((col) => col.name)
}

export function columnsForTable(schema: SqlEditorSchema, table: string): SqlColumnMeta[] {
    const direct = schema.columns[table]
    if (direct?.length) return normalizeColumnMeta(direct)
    const lower = table.toLowerCase()
    const exact = Object.entries(schema.columns).find(([name]) => name.toLowerCase() === lower)
    if (exact?.[1]?.length) return normalizeColumnMeta(exact[1])

    // 短表名 ↔ catalog.schema.table 互认（别名解析与 schema 键不一致时）
    const base = tableBaseNameFromRef(table).toLowerCase()
    const byBase = Object.entries(schema.columns).find(
        ([name]) => tableBaseNameFromRef(name).toLowerCase() === base,
    )
    return normalizeColumnMeta(byBase?.[1])
}

/** 状态栏短摘要（不含注释全文 — 注释在 documentation / 名称旁短注） */
export function columnDetail(meta: SqlColumnMeta): string {
    const parts: string[] = []
    if (meta.type) parts.push(meta.type)
    if (meta.pk) parts.push('PK')
    if (meta.nullable === false) parts.push('NOT NULL')
    else if (meta.nullable === true) parts.push('NULL')
    return parts.join(' · ')
}

function docLabel(key: string): string {
    return sqlEditorT(getActiveSqlEditorRuntime().getLocale(), key)
}

/**
 * 补全二级面板卡片：注释一眼打头 → 限定名 → 分行标注技术事实。
 * 避免与一级旁注 / Monaco header.detail 再刷一遍「varchar · PK」。
 */
export function columnDocumentation(meta: SqlColumnMeta, table?: string): string {
    const lines: string[] = []
    const comment = meta.comment?.trim()
    if (comment) {
        lines.push(`**${comment}**`)
    }

    const qualified = table ? `${table}.${meta.name}` : meta.name
    lines.push(`\`${qualified}\``)

    if (meta.type) {
        lines.push(`${docLabel('completion.doc.type')}  \`${meta.type}\``)
    }

    const constraints: string[] = []
    if (meta.pk) constraints.push('PK')
    if (meta.nullable === false) constraints.push('NOT NULL')
    else if (meta.nullable === true) constraints.push('NULL')
    if (constraints.length) {
        lines.push(`${docLabel('completion.doc.constraint')}  ${constraints.join(' · ')}`)
    }

    if (meta.defaultValue !== undefined && meta.defaultValue !== '') {
        lines.push(`${docLabel('completion.doc.default')}  \`${meta.defaultValue}\``)
    }

    if (meta.enumValues?.length) {
        const sample = meta.enumValues.slice(0, 8).map((v) => `\`${v}\``).join(', ')
        const more = meta.enumValues.length > 8 ? ` …(+${meta.enumValues.length - 8})` : ''
        lines.push(`${docLabel('completion.doc.enum')}  ${sample}${more}`)
    }

    return lines.join('\n\n')
}

/** 表注释（用于补全旁注） */
export function commentForTable(schema: SqlEditorSchema, table: string): string | undefined {
    const direct = schema.tableComments?.[table]?.trim()
    if (direct) return direct
    const hit = Object.entries(schema.tableComments ?? {}).find(
        ([name]) => name.toLowerCase() === table.toLowerCase(),
    )
    if (hit?.[1]?.trim()) return hit[1].trim()

    const needle = table.toLowerCase()
    for (const bundle of Object.values(schema.tablesByDatabase ?? {})) {
        const fromBundle = bundle.tableComments?.[table]?.trim()
        if (fromBundle) return fromBundle
        const entry = Object.entries(bundle.tableComments ?? {}).find(
            ([name]) => name.toLowerCase() === needle,
        )
        if (entry?.[1]?.trim()) return entry[1].trim()
    }
    return undefined
}

/** 表所属 catalog / 库名（用于补全展示） */
export function catalogForTable(schema: SqlEditorSchema, table: string): string | undefined {
    const direct = schema.tableCatalogs?.[table]
    if (direct) return direct
    const hit = Object.entries(schema.tableCatalogs ?? {}).find(
        ([name]) => name.toLowerCase() === table.toLowerCase(),
    )
    return hit?.[1]
}

export function findTableKey(schema: SqlEditorSchema, table: string): string | null {
    if (schema.columns[table]) return table
    const hit = Object.keys(schema.columns).find((name) => name.toLowerCase() === table.toLowerCase())
    return hit ?? null
}

export function findColumnMeta(
    schema: SqlEditorSchema,
    table: string,
    column: string,
): SqlColumnMeta | null {
    const cols = columnsForTable(schema, table)
    return cols.find((c) => c.name.toLowerCase() === column.toLowerCase()) ?? null
}

export function columnEnumValues(meta: SqlColumnMeta | null | undefined): string[] {
    if (!meta?.enumValues?.length) return []
    return meta.enumValues.filter((v) => v.length > 0)
}

/** 与当前查询中已引用表有 FK 关系的候选表（JOIN 优先） */
export function relatedTablesForJoin(schema: SqlEditorSchema, inQuery: string[]): string[] {
    const inSet = new Set(inQuery.map((t) => t.toLowerCase()))
    const related = new Set<string>()
    for (const fk of schema.foreignKeys ?? []) {
        if (inSet.has(fk.fromTable.toLowerCase())) related.add(fk.toTable)
        if (inSet.has(fk.toTable.toLowerCase())) related.add(fk.fromTable)
    }
    return [...related]
}

/** 两表之间的 FK 等值条件（ON 子句） */
export function fkJoinConditions(
    schema: SqlEditorSchema,
    tableA: string,
    aliasA: string,
    tableB: string,
    aliasB: string,
): string[] {
    const results: string[] = []
    const a = tableA.toLowerCase()
    const b = tableB.toLowerCase()
    for (const fk of schema.foreignKeys ?? []) {
        const from = fk.fromTable.toLowerCase()
        const to = fk.toTable.toLowerCase()
        if (from === a && to === b) {
            results.push(`${aliasA}.${fk.fromColumn} = ${aliasB}.${fk.toColumn}`)
        } else if (from === b && to === a) {
            results.push(`${aliasB}.${fk.fromColumn} = ${aliasA}.${fk.toColumn}`)
        }
    }
    return results
}

/** 两表同名列等值条件（无 FK 时的 ON 启发式，不含已由 FK 覆盖的配对） */
export function sameNameJoinConditions(
    schema: SqlEditorSchema,
    tableA: string,
    aliasA: string,
    tableB: string,
    aliasB: string,
): string[] {
    const colsA = columnsForTable(schema, tableA)
    const colsB = columnsForTable(schema, tableB)
    if (!colsA.length || !colsB.length) return []

    const fkCovered = new Set(
        fkJoinConditions(schema, tableA, aliasA, tableB, aliasB).map((c) => c.toLowerCase()),
    )
    const namesB = new Set(colsB.map((c) => c.name.toLowerCase()))
    const results: string[] = []
    for (const col of colsA) {
        const key = col.name.toLowerCase()
        if (!namesB.has(key)) continue
        const cond = `${aliasA}.${col.name} = ${aliasB}.${col.name}`
        if (fkCovered.has(cond.toLowerCase())) continue
        results.push(cond)
    }
    return results
}

/** 列名是否出现在查询中另一张表上（ON 子句同名列提权） */
export function columnNameSharedAcrossTables(
    schema: SqlEditorSchema,
    table: string,
    columnName: string,
    otherTables: string[],
): boolean {
    const key = columnName.toLowerCase()
    for (const other of otherTables) {
        if (other.toLowerCase() === table.toLowerCase()) continue
        if (columnsForTable(schema, other).some((c) => c.name.toLowerCase() === key)) return true
    }
    return false
}

export function mergeForeignKeys(
    existing: SqlForeignKey[],
    incoming: SqlForeignKey[],
): SqlForeignKey[] {
    const seen = new Set(existing.map((fk) => fkKey(fk)))
    const merged = [...existing]
    for (const fk of incoming) {
        const key = fkKey(fk)
        if (seen.has(key)) continue
        seen.add(key)
        merged.push(fk)
    }
    return merged
}

function fkKey(fk: SqlForeignKey): string {
    return `${fk.fromTable}.${fk.fromColumn}->${fk.toTable}.${fk.toColumn}`.toLowerCase()
}
