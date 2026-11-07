/** Heuristic field-type icons — classic Kibana sidebar (t / # / clock). */
export type FieldKind = 'string' | 'number' | 'date' | 'other'

const DATE_FIELDS = new Set([
  '@timestamp',
  'timestamp',
  'time',
  'datetime',
  'event.ingested',
  'event.created',
])

export function guessFieldKind(name: string): FieldKind {
  const lower = name.toLowerCase()
  if (
    DATE_FIELDS.has(name) ||
    name === '@timestamp' ||
    lower.endsWith('timestamp') ||
    lower.endsWith('_at') ||
    lower === 'time' ||
    lower === 'time1' ||
    lower === 'time2' ||
    lower === 'datetime'
  ) {
    return 'date'
  }
  if (lower.includes('timeout') || lower.includes('timezone') || lower.includes('timeline')) {
    return 'string'
  }
  if (
    lower.includes('count') ||
    lower.includes('number') ||
    lower.endsWith('_ms') ||
    lower.endsWith('score') ||
    lower === '_score'
  ) {
    return 'number'
  }
  if (name.startsWith('_') && name !== '_source') return 'other'
  return 'string'
}

export function fieldTypeLabel(kind: FieldKind): string {
  switch (kind) {
    case 'string':
      return 't'
    case 'number':
      return '#'
    case 'date':
      return '⏱'
    default:
      return '?'
  }
}
