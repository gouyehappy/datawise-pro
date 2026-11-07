import type {DbType} from '@/core/types'

const MYSQL_FAMILY = new Set<DbType>(['mysql', 'mariadb', 'tidb', 'oceanbase', 'starrocks', 'doris', 'gbase8a'])
const PG_FAMILY = new Set<DbType>(['postgresql', 'kingbase', 'greenplum', 'opengauss', 'highgo'])

/** DBeaver 风格：类型列只选基础类型；长度 / 精度在独立列 */
const MYSQL_BASE_TYPES = [
    'varchar',
    'char',
    'tinytext',
    'text',
    'mediumtext',
    'longtext',
    'tinyint',
    'smallint',
    'mediumint',
    'int',
    'bigint',
    'decimal',
    'float',
    'double',
    'bit',
    'boolean',
    'date',
    'time',
    'datetime',
    'timestamp',
    'year',
    'json',
    'binary',
    'varbinary',
    'blob',
    'mediumblob',
    'longblob',
    'enum',
    'set',
] as const

const PG_BASE_TYPES = [
    'varchar',
    'character varying',
    'char',
    'text',
    'smallint',
    'integer',
    'bigint',
    'numeric',
    'real',
    'double precision',
    'boolean',
    'date',
    'time',
    'timestamp',
    'timestamptz',
    'json',
    'jsonb',
    'uuid',
    'bytea',
] as const

const SQLSERVER_BASE_TYPES = [
    'varchar',
    'nvarchar',
    'char',
    'nchar',
    'text',
    'ntext',
    'tinyint',
    'smallint',
    'int',
    'bigint',
    'decimal',
    'numeric',
    'float',
    'real',
    'bit',
    'date',
    'time',
    'datetime',
    'datetime2',
    'uniqueidentifier',
    'varbinary',
] as const

const ORACLE_BASE_TYPES = [
    'VARCHAR2',
    'NVARCHAR2',
    'CHAR',
    'NCHAR',
    'CLOB',
    'NUMBER',
    'INTEGER',
    'FLOAT',
    'BINARY_FLOAT',
    'BINARY_DOUBLE',
    'DATE',
    'TIMESTAMP',
    'RAW',
    'BLOB',
] as const

const GENERIC_BASE_TYPES = [
    'VARCHAR',
    'CHAR',
    'TEXT',
    'INT',
    'BIGINT',
    'SMALLINT',
    'DECIMAL',
    'FLOAT',
    'DOUBLE',
    'BOOLEAN',
    'DATE',
    'TIME',
    'TIMESTAMP',
    'JSON',
] as const

const LENGTH_TYPES = new Set([
    'varchar',
    'character varying',
    'char',
    'nchar',
    'nvarchar',
    'nvarchar2',
    'varchar2',
    'binary',
    'varbinary',
    'bit',
    'raw',
    'tinyint',
    'smallint',
    'mediumint',
    'int',
    'integer',
    'bigint',
])

const SCALE_TYPES = new Set([
    'decimal',
    'numeric',
    'number',
    'float',
    'double',
    'datetime',
    'timestamp',
    'time',
    'datetime2',
])

export type ParsedColumnDataType = {
    baseType: string
    /** 长度或 precision（第一参数） */
    length: string | null
    /** scale / 小数秒（第二参数） */
    scale: string | null
}

function defaultLengthFor(baseType: string): string | null {
    const key = baseType.toLowerCase()
    if (key === 'varchar' || key === 'character varying' || key === 'nvarchar' || key === 'varchar2') {
        return '255'
    }
    if (key === 'char' || key === 'nchar') return '1'
    if (key === 'varbinary' || key === 'binary') return '255'
    if (key === 'raw') return '16'
    if (key === 'decimal' || key === 'numeric' || key === 'number') return '10'
    if (key === 'bit') return '1'
    return null
}

function defaultScaleFor(baseType: string): string | null {
    const key = baseType.toLowerCase()
    if (key === 'decimal' || key === 'numeric' || key === 'number') return '2'
    return null
}

/** 解析 `varchar(32)` / `decimal(10,2)` / `datetime(3)` */
export function parseColumnDataType(dataType: string): ParsedColumnDataType {
    const raw = (dataType ?? '').trim()
    if (!raw) return {baseType: '', length: null, scale: null}
    const match = raw.match(/^(.*?)\s*\(([^)]*)\)\s*$/)
    if (!match) {
        return {baseType: raw, length: null, scale: null}
    }
    const baseType = match[1]!.trim()
    const args = match[2]!.split(',').map((part) => part.trim()).filter(Boolean)
    return {
        baseType,
        length: args[0] ?? null,
        scale: args[1] ?? null,
    }
}

export function typeSupportsLength(baseType: string): boolean {
    return LENGTH_TYPES.has(baseType.trim().toLowerCase())
        || SCALE_TYPES.has(baseType.trim().toLowerCase())
}

export function typeSupportsScale(baseType: string): boolean {
    const key = baseType.trim().toLowerCase()
    return key === 'decimal' || key === 'numeric' || key === 'number'
}

/** 由基础类型 + 长度 + 精度合成完整声明 */
export function composeColumnDataType(
    baseType: string,
    length: string | null | undefined,
    scale: string | null | undefined,
): string {
    const base = baseType.trim()
    if (!base) return ''
    const lengthText = length?.trim() || ''
    const scaleText = scale?.trim() || ''
    const key = base.toLowerCase()

    if (key === 'decimal' || key === 'numeric' || key === 'number') {
        const len = lengthText || defaultLengthFor(base) || '10'
        const sc = scaleText || defaultScaleFor(base) || '0'
        return `${base}(${len},${sc})`
    }

    if (key === 'datetime' || key === 'timestamp' || key === 'time' || key === 'datetime2') {
        // DBeaver：小数秒放在 Length；Scale 通常空。兼容把小数秒放 Scale 的情况。
        const frac = lengthText || scaleText
        return frac ? `${base}(${frac})` : base
    }

    if (key === 'float' || key === 'double') {
        if (lengthText && scaleText) return `${base}(${lengthText},${scaleText})`
        if (lengthText) return `${base}(${lengthText})`
        return base
    }

    if (LENGTH_TYPES.has(key)) {
        const len = lengthText || defaultLengthFor(base)
        return len ? `${base}(${len})` : base
    }

    return base
}

/**
 * 下拉选中基础类型：保留原长度/精度（若新类型仍支持），否则填默认。
 */
export function applySelectedColumnDataType(currentValue: string, selectedBaseType: string): string {
    const selected = selectedBaseType.trim()
    if (!selected) return currentValue.trim()
    const parsed = parseColumnDataType(currentValue)
    const keepLength = typeSupportsLength(selected) ? parsed.length : null
    const keepScale = typeSupportsScale(selected) ? parsed.scale : null
    return composeColumnDataType(selected, keepLength, keepScale)
}

export function listColumnDataTypeSuggestions(dbType: DbType | undefined): string[] {
    if (!dbType) return [...GENERIC_BASE_TYPES]
    if (MYSQL_FAMILY.has(dbType)) return [...MYSQL_BASE_TYPES]
    if (PG_FAMILY.has(dbType)) return [...PG_BASE_TYPES]
    if (dbType === 'sqlserver') return [...SQLSERVER_BASE_TYPES]
    if (dbType === 'oracle' || dbType === 'dm') return [...ORACLE_BASE_TYPES]
    return [...GENERIC_BASE_TYPES]
}

export function filterColumnDataTypeSuggestions(
    dbType: DbType | undefined,
    query: string,
    currentValue?: string,
): string[] {
    const suggestions = listColumnDataTypeSuggestions(dbType)
    const needle = query.trim().toLowerCase()
    const currentBase = parseColumnDataType(currentValue ?? '').baseType

    const filtered = needle
        ? suggestions.filter((item) => {
            const lower = item.toLowerCase()
            return lower.includes(needle) || needle.includes(lower)
        })
        : suggestions.slice()

    const hasCurrentBase = filtered.some(
        (item) => item.toLowerCase() === currentBase.toLowerCase(),
    )
    if (currentBase && !hasCurrentBase) {
        if (!needle || currentBase.toLowerCase().includes(needle) || needle.includes(currentBase.toLowerCase())) {
            filtered.unshift(currentBase)
        }
    }
    return filtered
}
