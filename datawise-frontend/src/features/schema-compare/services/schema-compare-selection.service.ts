import type {DbType} from '@/core/types'
import {buildSchemaMigrateDdl} from '@/features/schema-compare/services/schema-compare-ddl.service'
import type {SchemaCompareResult, TableSchemaDiff} from '@/features/schema-compare/types/schema-compare.types'

export function listConflictTableDiffs(tableDiffs: readonly TableSchemaDiff[]): TableSchemaDiff[] {
    return tableDiffs.filter((item) => item.status !== 'unchanged')
}

export function buildDefaultTableSelection(tableDiffs: readonly TableSchemaDiff[]): Set<string> {
    return new Set(listConflictTableDiffs(tableDiffs).map((item) => item.tableName))
}

export function buildDefaultColumnSelection(tableDiff: TableSchemaDiff): Set<string> {
    return new Set(tableDiff.columnDiffs.map((column) => column.name))
}

export function applySchemaCompareSelection(
    tableDiffs: readonly TableSchemaDiff[],
    selectedTables: ReadonlySet<string>,
    selectedColumnsByTable: ReadonlyMap<string, ReadonlySet<string>>,
): TableSchemaDiff[] {
    const selected: TableSchemaDiff[] = []

    for (const table of tableDiffs) {
        if (table.status === 'unchanged') continue
        if (!selectedTables.has(table.tableName)) continue

        if (table.status === 'added' || table.status === 'removed') {
            selected.push(table)
            continue
        }

        const columnSelection = selectedColumnsByTable.get(table.tableName)
        const columnDiffs = table.columnDiffs.filter((column) =>
            columnSelection ? columnSelection.has(column.name) : true,
        )
        if (!columnDiffs.length) continue
        selected.push({...table, columnDiffs})
    }

    return selected
}

export function buildSelectedSchemaMigrateDdl(
    result: SchemaCompareResult,
    targetDbType: DbType | undefined,
    targetDatabase: string | undefined,
    selectedTables: ReadonlySet<string>,
    selectedColumnsByTable: ReadonlyMap<string, ReadonlySet<string>>,
): string {
    const tableDiffs = applySchemaCompareSelection(
        result.tableDiffs,
        selectedTables,
        selectedColumnsByTable,
    )
    const createDdls = new Map(Object.entries(result.createDdls))
    return buildSchemaMigrateDdl(tableDiffs, targetDbType, createDdls, targetDatabase)
}

export function countSelectedChanges(
    tableDiffs: readonly TableSchemaDiff[],
    selectedTables: ReadonlySet<string>,
    selectedColumnsByTable: ReadonlyMap<string, ReadonlySet<string>>,
): number {
    return applySchemaCompareSelection(tableDiffs, selectedTables, selectedColumnsByTable).length
}
