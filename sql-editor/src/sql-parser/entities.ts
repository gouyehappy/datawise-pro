import type {EntityContext} from 'dt-sql-parser'

const TABLE_ENTITY_TYPES = new Set(['table', 'view'])
const COLUMN_ENTITY_TYPE = 'column'

/** 从 getAllEntities 结果提取表名（含 catalog.db.table 路径的 text） */
export function extractReferencedTables(entities: EntityContext[] | null | undefined): string[] {
    if (!entities?.length) return []
    const seen = new Set<string>()
    const tables: string[] = []
    for (const entity of entities) {
        if (!TABLE_ENTITY_TYPES.has(String(entity.entityContextType))) continue
        const name = entity.text?.trim()
        if (!name) continue
        const key = name.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        tables.push(name)
    }
    return tables
}

/** 从 getAllEntities 结果提取列名 */
export function extractReferencedColumns(entities: EntityContext[] | null | undefined): string[] {
    if (!entities?.length) return []
    const seen = new Set<string>()
    const columns: string[] = []
    for (const entity of entities) {
        if (String(entity.entityContextType) !== COLUMN_ENTITY_TYPE) continue
        const name = entity.text?.trim()
        if (!name) continue
        const key = name.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        columns.push(name)
    }
    return columns
}
