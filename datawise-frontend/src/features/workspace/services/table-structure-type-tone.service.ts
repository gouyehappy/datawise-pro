/** Color tone class suffix for structure-editor type cells (dbx-style). */
export type StructureTypeTone =
    | 'numeric'
    | 'boolean'
    | 'real'
    | 'text'
    | 'json'
    | 'temporal'
    | 'binary'
    | 'enum'
    | 'spatial'
    | 'other'

export function structureDataTypeTone(baseType: string): StructureTypeTone {
    const type = baseType.trim().toLowerCase()
    if (!type) return 'other'
    if (/^(?:bool|boolean)$/.test(type)) return 'boolean'
    if (/^(?:enum|set)(?:\b|$)/.test(type)) return 'enum'
    if (/^(?:json|jsonb|xml)\b/.test(type)) return 'json'
    if (/^(?:date|time|timestamp|timestamptz|datetime|smalldatetime|interval|year)\b/.test(type)) {
        return 'temporal'
    }
    if (/^(?:tinyblob|mediumblob|longblob|blob|binary|varbinary|bytea|image|raw)\b/.test(type)) {
        return 'binary'
    }
    if (/^(?:geometry|point|linestring|polygon|multipoint|multilinestring|multipolygon)\b/.test(type)) {
        return 'spatial'
    }
    if (/^(?:number|numeric|decimal|dec|float|double|real|money)\b/.test(type)) return 'real'
    if (/^(?:tinyint|smallint|mediumint|int|integer|bigint|serial|bigserial|bit)\b/.test(type)) {
        return 'numeric'
    }
    if (/^(?:char|varchar|varchar2|nvarchar|nchar|text|tinytext|mediumtext|longtext|clob|nclob|string|uuid)\b/.test(type)) {
        return 'text'
    }
    return 'other'
}
