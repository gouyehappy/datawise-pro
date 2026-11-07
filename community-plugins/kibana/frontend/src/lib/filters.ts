/** Structured Discover filters → Lucene (OSD/Kibana filter bar pattern). */

export type DiscoverFilter = {
  id: string
  field: string
  value: string
  /** false = filter for, true = filter out */
  negate: boolean
}

export function makeFilterId(field: string, value: string, negate: boolean): string {
  return `${negate ? '-' : '+'}:${field}=${value}`
}

export function quoteLuceneValue(value: string): string {
  if (/^[\w.@\-+]+$/.test(value)) return value
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export function filterToLucene(f: DiscoverFilter): string {
  const clause = `${f.field}:${quoteLuceneValue(f.value)}`
  return f.negate ? `NOT ${clause}` : clause
}

/** Merge free-text query with filter pills into one Lucene string for search. */
export function buildSearchQuery(freeText: string, filters: DiscoverFilter[]): string {
  const parts: string[] = []
  const q = freeText.trim()
  if (q && q !== '*') parts.push(q.includes(' ') && !/^(AND|OR|NOT)\b/i.test(q) && !q.includes(':') ? `(${q})` : q)
  for (const f of filters) parts.push(filterToLucene(f))
  if (!parts.length) return '*'
  return parts.join(' AND ')
}

export function upsertFilter(
  filters: DiscoverFilter[],
  field: string,
  value: string,
  negate: boolean,
): DiscoverFilter[] {
  const id = makeFilterId(field, value, negate)
  const opposite = makeFilterId(field, value, !negate)
  const without = filters.filter((f) => f.id !== id && f.id !== opposite)
  return [...without, { id, field, value, negate }]
}

export function removeFilter(filters: DiscoverFilter[], id: string): DiscoverFilter[] {
  return filters.filter((f) => f.id !== id)
}
