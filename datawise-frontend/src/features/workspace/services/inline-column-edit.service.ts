import type {DbType} from '@/core/types'
import type {TableColumnDetail} from '@/shared/api/types'
import {
    buildAlterColumnSql,
    buildBatchCommentColumnDdl,
    type AlterColumnSpec,
} from '@/features/workspace/services/alter-column-ddl.service'
import {
    composeColumnDataType,
    parseColumnDataType,
} from '@/features/workspace/services/column-data-type-options.service'

export type InlineColumnEditField =
    | 'name'
    | 'dataType'
    | 'length'
    | 'scale'
    | 'nullable'
    | 'defaultValue'
    | 'comment'

function normalizeDefault(value: string | null | undefined): string {
    return value == null ? '' : String(value).trim()
}

function toModifySpec(column: TableColumnDetail, patch: Partial<AlterColumnSpec>): AlterColumnSpec {
    return {
        name: column.name,
        dataType: column.dataType || 'VARCHAR(255)',
        nullable: column.nullable,
        autoIncrement: column.autoIncrement,
        defaultValue: column.defaultValue ?? null,
        ...patch,
    }
}

function resolveNextDataType(
    original: TableColumnDetail,
    field: 'dataType' | 'length' | 'scale',
    nextValue: string,
): string {
    const parsed = parseColumnDataType(original.dataType || '')
    if (field === 'dataType') {
        const next = nextValue.trim()
        if (!next) return original.dataType || ''
        if (/\([^)]*\)\s*$/.test(next)) return next
        return composeColumnDataType(next, parsed.length, parsed.scale)
    }
    if (field === 'length') {
        return composeColumnDataType(parsed.baseType, nextValue, parsed.scale)
    }
    return composeColumnDataType(parsed.baseType, parsed.length, nextValue)
}

/** 根据单元格草稿相对原列生成 ALTER / COMMENT SQL；无变更或无法生成时返回 null */
export function buildInlineColumnCellAlterSql(options: {
    dbType?: DbType
    tableName: string
    database?: string
    original: TableColumnDetail
    field: InlineColumnEditField
    nextValue: string | boolean
}): string | null {
    const tableName = options.tableName.trim()
    if (!tableName || !options.original.name.trim()) return null

    const {dbType, database, original, field} = options

    if (field === 'name') {
        const renameTo = String(options.nextValue).trim()
        if (!renameTo || renameTo === original.name) return null
        return buildAlterColumnSql('rename', {
            dbType,
            tableName,
            database,
            column: {
                name: original.name,
                dataType: original.dataType || '',
                nullable: original.nullable,
                renameTo,
            },
        })
    }

    if (field === 'comment') {
        const comment = String(options.nextValue)
        const previous = original.comment ?? ''
        if (comment === previous) return null
        return buildBatchCommentColumnDdl({
            dbType,
            tableName,
            database,
            comments: [{name: original.name, comment}],
            columnMeta: [
                {
                    name: original.name,
                    dataType: original.dataType,
                    nullable: original.nullable,
                },
            ],
        })
    }

    if (field === 'nullable') {
        const nullable = Boolean(options.nextValue)
        if (nullable === original.nullable) return null
        return buildAlterColumnSql('modify', {
            dbType,
            tableName,
            database,
            column: toModifySpec(original, {nullable}),
        })
    }

    if (field === 'dataType' || field === 'length' || field === 'scale') {
        const dataType = resolveNextDataType(original, field, String(options.nextValue))
        if (!dataType || dataType === (original.dataType || '').trim()) return null
        return buildAlterColumnSql('modify', {
            dbType,
            tableName,
            database,
            column: toModifySpec(original, {dataType}),
        })
    }

    const nextDefault = normalizeDefault(String(options.nextValue))
    const previousDefault = normalizeDefault(original.defaultValue)
    if (nextDefault === previousDefault) return null
    return buildAlterColumnSql('modify', {
        dbType,
        tableName,
        database,
        column: toModifySpec(original, {
            defaultValue: nextDefault || null,
        }),
    })
}
