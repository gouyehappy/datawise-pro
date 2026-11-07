import moment from 'moment'

/** Kibana Discover classic time column format. */
export function formatDiscoverTime(value: string | undefined | null): string {
  if (!value) return '—'
  const m = moment(value)
  if (!m.isValid()) return String(value)
  return m.format('MMM D, YYYY @ HH:mm:ss.SSS')
}

export function dig(obj: Record<string, unknown>, path: string): unknown {
  if (path in obj) return obj[path]
  const parts = path.split('.')
  let cur: unknown = obj
  for (const p of parts) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

export function flattenSource(
  obj: Record<string, unknown>,
  prefix = '',
  out: Array<{ field: string; value: unknown }> = [],
): Array<{ field: string; value: unknown }> {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flattenSource(v as Record<string, unknown>, path, out)
    } else {
      out.push({ field: path, value: v })
    }
  }
  return out
}

const STOP = new Set(['AND', 'OR', 'NOT', 'and', 'or', 'not'])

/**
 * Extract highlight tokens from Lucene/KQL — same idea as Kibana Discover
 * marking `hh_30`, `t00002`, `2063c7f4` inside `_source`.
 */
export function extractQueryTokens(query: string): string[] {
  const q = query.trim()
  if (!q || q === '*') return []
  const found = new Set<string>()

  // field : value  /  field:value  /  field: *wild*
  const clauseRe = /[\w.@]+\s*:\s*("([^"]+)"|\S+)/g
  let m: RegExpExecArray | null
  while ((m = clauseRe.exec(q))) {
    const raw = (m[2] ?? m[1] ?? '').replace(/^"+|"+$/g, '')
    pushToken(found, raw)
  }

  // Bare words (non-field query)
  if (!found.size) {
    for (const part of q.split(/[\s()]+/)) {
      if (!part || STOP.has(part) || part.includes(':')) continue
      pushToken(found, part)
    }
  }

  return Array.from(found).sort((a, b) => b.length - a.length)
}

function pushToken(into: Set<string>, raw: string) {
  // Strip Lucene wildcards but keep the core for substring highlight
  const core = raw.replace(/\*/g, '').replace(/\?/g, '').trim()
  if (core.length >= 2 && !STOP.has(core)) into.add(core)
  // Also keep dotted/path pieces that look like ids
  const idish = core.match(/[a-f0-9]{6,}/i)
  if (idish && idish[0].length >= 6) into.add(idish[0])
}

/** Highlight query tokens inside a string (Kibana yellow mark). */
export function highlightText(text: string, query: string): Array<string | { mark: string }> {
  const tokens = extractQueryTokens(query)
  if (!tokens.length) return [text]
  const re = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi')
  const parts: Array<string | { mark: string }> = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push({ mark: m[0] })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length ? parts : [text]
}

export function textMatchesQuery(text: string, query: string): boolean {
  const tokens = extractQueryTokens(query)
  if (!tokens.length) return false
  const lower = text.toLowerCase()
  return tokens.some((t) => lower.includes(t.toLowerCase()))
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** Kibana Discover default `truncate:maxLength` is 150. */
export const DISCOVER_TRUNCATE_LEN = 150

/**
 * Truncate a field value for the doc table (classic Discover).
 * Prefer a window around the first query hit so yellow marks stay visible.
 */
export function truncateForDiscover(
  text: string,
  query = '',
  maxLen = DISCOVER_TRUNCATE_LEN,
): string {
  if (!text || text.length <= maxLen) return text
  const tokens = extractQueryTokens(query)
  if (tokens.length) {
    const re = new RegExp(tokens.map(escapeRegExp).join('|'), 'i')
    const m = re.exec(text)
    if (m && m.index != null) {
      const half = Math.floor((maxLen - m[0].length) / 2)
      let start = Math.max(0, m.index - Math.max(half, 24))
      let end = Math.min(text.length, start + maxLen)
      if (end - start < maxLen) start = Math.max(0, end - maxLen)
      const slice = text.slice(start, end)
      return `${start > 0 ? '…' : ''}${slice}${end < text.length ? '…' : ''}`
    }
  }
  return `${text.slice(0, maxLen)}…`
}
