import type {SqlEditorSchema} from '@sql-editor/types'

export interface FromQualifiedInput {
    raw: string
    segments: string[]
    trailingDot: boolean
    /** 最后一个点号后的片段（trailingDot 时为空） */
    localPartial: string
    databaseScope?: string
}

export function parseFromJoinQualifiedInput(input: string): FromQualifiedInput {
    const raw = input.replace(/^[`"']|[`"']$/g, '')
    const trailingDot = raw.endsWith('.')
    const bare = trailingDot ? raw.slice(0, -1) : raw
    const segments = bare ? bare.split('.').filter(Boolean) : []
    const localPartial = trailingDot ? '' : (segments[segments.length - 1] ?? '')
    const databaseScope = segments.length >= 2 ? `${segments[0]}.${segments[1]}` : undefined
    return {raw, segments, trailingDot, localPartial, databaseScope}
}

export function isFromJoinQualifiedTrailingDot(tablePrefix: string): boolean {
    return parseFromJoinQualifiedInput(tablePrefix).trailingDot
}

export function resolveSchemasForCatalogKey(
    schemasByCatalog: Record<string, string[]> | undefined,
    catalog: string,
): string[] {
    if (!schemasByCatalog) return []
    if (schemasByCatalog[catalog]) return schemasByCatalog[catalog]
    const lower = catalog.toLowerCase()
    const hit = Object.entries(schemasByCatalog).find(([key]) => key.toLowerCase() === lower)
    return hit?.[1] ?? []
}

/** Trino 等 catalog 下挂 schema；MySQL 等 catalog 即 database，无 schema 层 */
export function catalogUsesSchemaLevel(
    schema: Pick<SqlEditorSchema, 'schemasByCatalog'>,
    catalog: string,
): boolean {
    if (!schema.schemasByCatalog) return false
    const lower = catalog.toLowerCase()
    return Object.keys(schema.schemasByCatalog).some((key) => key.toLowerCase() === lower)
}

/** 解析限定名后用于拉取表列表的 scope（catalog.schema 或 database） */
export function resolveTableScopeFromSegments(
    schema: Pick<SqlEditorSchema, 'schemasByCatalog'>,
    segments: string[],
): string | undefined {
    if (segments.length >= 2) return `${segments[0]}.${segments[1]}`
    if (segments.length === 1 && !catalogUsesSchemaLevel(schema, segments[0])) {
        return segments[0]
    }
    return undefined
}

/** 是否仍使用绑定库下的扁平表名列表（输入含 `.` 时走层级补全） */
export function isCatalogSchemaTableStage(
    _schema: Pick<SqlEditorSchema, 'catalogs'>,
    qualifiedInput: string,
): boolean {
    return !qualifiedInput.includes('.')
}

/** FROM/JOIN 限定名：trailing dot 时在光标处插入；否则只替换最后一段 */
export function fromJoinQualifiedLocalPartial(qualifiedInput: string): string {
    const {trailingDot, localPartial} = parseFromJoinQualifiedInput(qualifiedInput)
    return trailingDot ? '' : localPartial
}

export function fromJoinQualifiedUsesCursorInsert(qualifiedInput: string): boolean {
    return parseFromJoinQualifiedInput(qualifiedInput).trailingDot
}
