/** 列类型粗分类，用于谓词值模板与列排序。 */
export type SqlValueKind = 'numeric' | 'boolean' | 'temporal' | 'string' | 'unknown'

export function classifyColumnType(type?: string): SqlValueKind {
    if (!type?.trim()) return 'unknown'
    const t = type.toLowerCase().replace(/\s+/g, '')

    if (/^(tinyint\(1\)|bool|boolean)/.test(t)) return 'boolean'
    if (/(int|decimal|numeric|float|double|real|number|money|serial|bigint|smallint|tinyint)/.test(t)) {
        return 'numeric'
    }
    if (/(date|time|year|interval|timestamp)/.test(t)) return 'temporal'
    if (/(char|text|blob|binary|json|uuid|enum|varchar|nvarchar)/.test(t)) return 'string'
    return 'unknown'
}
