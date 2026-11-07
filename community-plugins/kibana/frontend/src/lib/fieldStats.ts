/**
 * Field top-value stats from current hits — adapted from OpenSearch Dashboards
 * Discover `getFieldValueCounts` / `get_details` (Apache-2.0).
 */
import { dig, formatFieldValue } from './format'
import type { SearchHit } from './types'

export type FieldBucket = {
  value: string
  count: number
  percent: number
}

export type FieldDetails = {
  exists: number
  total: number
  buckets: FieldBucket[]
  error?: string
}

export function getFieldDetails(
  field: string,
  hits: SearchHit[],
  topN = 5,
): FieldDetails {
  const total = hits.length
  if (!total) {
    return { exists: 0, total: 0, buckets: [], error: 'No documents in current sample.' }
  }

  const counts = new Map<string, number>()
  let exists = 0

  for (const hit of hits) {
    const source =
      hit.source && typeof hit.source === 'object' ? (hit.source as Record<string, unknown>) : {}
    const raw = dig(source, field)
    if (raw === undefined || raw === null || raw === '') continue
    exists++
    const values = Array.isArray(raw) ? raw : [raw]
    for (const v of values) {
      const key = formatFieldValue(v)
      if (key === '—' || key === '') continue
      counts.set(key, (counts.get(key) || 0) + 1)
    }
  }

  const buckets = Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      count,
      percent: Math.round((count / total) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN)

  return { exists, total, buckets }
}

/** Popular fields = highest presence in current hit sample (OSD groupFields style). */
export function rankPopularFields(
  fieldNames: string[],
  hits: SearchHit[],
  limit = 9,
): string[] {
  if (!hits.length) return fieldNames.slice(0, limit)
  const scores = new Map<string, number>()
  for (const name of fieldNames) {
    let n = 0
    for (const hit of hits) {
      const source =
        hit.source && typeof hit.source === 'object' ? (hit.source as Record<string, unknown>) : {}
      const v = dig(source, name)
      if (v !== undefined && v !== null && v !== '') n++
    }
    scores.set(name, n)
  }
  return [...fieldNames]
    .sort((a, b) => (scores.get(b) || 0) - (scores.get(a) || 0) || a.localeCompare(b))
    .filter((f) => (scores.get(f) || 0) > 0)
    .slice(0, limit)
}
