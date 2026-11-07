import type {TableColumnDetail} from '@/shared/api/types'

export type {SchemaScope} from '@/core/types'

export type TableDiffStatus = 'added' | 'removed' | 'changed' | 'unchanged'

export type ColumnDiffStatus = 'added' | 'removed' | 'modified'

export interface ColumnSchemaSnapshot {
    name: string
    dataType: string
    nullable: boolean
    autoIncrement: boolean
    keyType?: string | null
    defaultValue?: string | null
    comment?: string | null
}

export interface ColumnDiff {
    name: string
    status: ColumnDiffStatus
    left?: ColumnSchemaSnapshot
    right?: ColumnSchemaSnapshot
    changes: string[]
}

export interface TableSchemaDiff {
    tableName: string
    status: TableDiffStatus
    columnDiffs: ColumnDiff[]
}

export interface SchemaCompareSummary {
    added: number
    removed: number
    changed: number
    unchanged: number
}

export interface SchemaCompareResult {
    tableDiffs: TableSchemaDiff[]
    ddl: string
    summary: SchemaCompareSummary
    /** CREATE TABLE DDL for tables only on reference side */
    createDdls: Record<string, string>
}

export function toColumnSnapshot(column: TableColumnDetail): ColumnSchemaSnapshot {
    return {
        name: column.name,
        dataType: column.dataType,
        nullable: column.nullable,
        autoIncrement: column.autoIncrement,
        keyType: column.keyType ?? null,
        defaultValue: column.defaultValue ?? null,
        comment: column.comment ?? null,
    }
}
