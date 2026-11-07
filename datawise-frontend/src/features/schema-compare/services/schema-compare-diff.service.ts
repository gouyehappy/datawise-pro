import type {
    ColumnDiff,
    ColumnSchemaSnapshot,
    SchemaCompareSummary,
    TableDiffStatus,
    TableSchemaDiff,
} from '@/features/schema-compare/types/schema-compare.types'

function normalizeDefault(value: string | null | undefined): string | null {
    if (value == null) return null
    const trimmed = String(value).trim()
    return trimmed.length ? trimmed : null
}

function columnSignature(column: ColumnSchemaSnapshot): string {
    return [
        column.dataType.trim().toLowerCase(),
        column.nullable ? '1' : '0',
        column.autoIncrement ? '1' : '0',
        normalizeDefault(column.defaultValue) ?? '',
        (column.keyType ?? '').toLowerCase(),
    ].join('|')
}

export function diffColumns(
    leftColumns: ColumnSchemaSnapshot[],
    rightColumns: ColumnSchemaSnapshot[],
): ColumnDiff[] {
    const leftMap = new Map(leftColumns.map((column) => [column.name.toLowerCase(), column]))
    const rightMap = new Map(rightColumns.map((column) => [column.name.toLowerCase(), column]))
    const names = new Set([...leftMap.keys(), ...rightMap.keys()])
    const diffs: ColumnDiff[] = []

    for (const key of [...names].sort()) {
        const left = leftMap.get(key)
        const right = rightMap.get(key)
        if (left && !right) {
            diffs.push({name: left.name, status: 'added', left, changes: ['missing_on_right']})
            continue
        }
        if (!left && right) {
            diffs.push({name: right.name, status: 'removed', right, changes: ['missing_on_left']})
            continue
        }
        if (!left || !right) continue
        const changes: string[] = []
        if (columnSignature(left) !== columnSignature(right)) {
            if (left.dataType.trim().toLowerCase() !== right.dataType.trim().toLowerCase()) {
                changes.push('dataType')
            }
            if (left.nullable !== right.nullable) changes.push('nullable')
            if (left.autoIncrement !== right.autoIncrement) changes.push('autoIncrement')
            if (normalizeDefault(left.defaultValue) !== normalizeDefault(right.defaultValue)) {
                changes.push('defaultValue')
            }
            if ((left.keyType ?? '').toLowerCase() !== (right.keyType ?? '').toLowerCase()) {
                changes.push('keyType')
            }
            if ((left.comment ?? '').trim() !== (right.comment ?? '').trim()) changes.push('comment')
            if (!changes.length) changes.push('definition')
        }
        if (changes.length) {
            diffs.push({name: left.name, status: 'modified', left, right, changes})
        }
    }

    return diffs
}

export function diffTableNames(leftTables: string[], rightTables: string[]): TableSchemaDiff[] {
    const leftSet = new Set(leftTables.map((name) => name.toLowerCase()))
    const rightSet = new Set(rightTables.map((name) => name.toLowerCase()))
    const canonical = new Map<string, string>()
    for (const name of [...leftTables, ...rightTables]) {
        canonical.set(name.toLowerCase(), name)
    }

    const diffs: TableSchemaDiff[] = []
    for (const [key, tableName] of canonical) {
        const onLeft = leftSet.has(key)
        const onRight = rightSet.has(key)
        let status: TableDiffStatus = 'unchanged'
        if (onLeft && !onRight) status = 'added'
        else if (!onLeft && onRight) status = 'removed'
        diffs.push({tableName, status, columnDiffs: []})
    }

    return diffs.sort((a, b) => a.tableName.localeCompare(b.tableName))
}

export function summarizeTableDiffs(tableDiffs: TableSchemaDiff[]): SchemaCompareSummary {
    return tableDiffs.reduce(
        (acc, item) => {
            acc[item.status] += 1
            return acc
        },
        {added: 0, removed: 0, changed: 0, unchanged: 0},
    )
}
