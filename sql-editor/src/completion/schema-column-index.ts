import type {SqlColumnMeta} from '@sql-editor/types'
import {matchesColumnInitials} from './column-fuzzy'

type TableColumnIndex = {
    sorted: SqlColumnMeta[]
    source: SqlColumnMeta[]
}

const indexByColumns = new WeakMap<SqlColumnMeta[], TableColumnIndex>()

function columnIndex(columns: SqlColumnMeta[]): TableColumnIndex {
    const cached = indexByColumns.get(columns)
    if (cached && cached.source === columns) return cached
    const sorted = [...columns].sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}))
    const entry = {sorted, source: columns}
    indexByColumns.set(columns, entry)
    return entry
}

function lowerBound(sorted: SqlColumnMeta[], prefix: string): number {
    let lo = 0
    let hi = sorted.length
    while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (sorted[mid].name.toLowerCase() < prefix) lo = mid + 1
        else hi = mid
    }
    return lo
}

/**
 * 宽表列补全：
 * 1) 全名前缀（startsWith）
 * 2) 无前缀命中时，snake/camel 首字母缩写（ct → create_time）
 * 禁止任意子串模糊，避免 COUNT → user_count。
 */
export function filterColumnsForCompletion(columns: SqlColumnMeta[], prefix: string): SqlColumnMeta[] {
    if (!columns.length) return []
    if (!prefix) return columns

    const p = prefix.toLowerCase()
    const {sorted} = columnIndex(columns)
    const prefixHits: SqlColumnMeta[] = []

    const start = lowerBound(sorted, p)
    for (let i = start; i < sorted.length; i++) {
        const meta = sorted[i]
        const name = meta.name.toLowerCase()
        if (!name.startsWith(p)) break
        prefixHits.push(meta)
    }
    if (prefixHits.length) return prefixHits

    // 仅缩写：保持稳定字母序
    return sorted.filter((meta) => matchesColumnInitials(meta.name, p))
}
