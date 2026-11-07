export type HostConnectionContext = {
  connectionId?: string
  connection?: { id?: string }
  [key: string]: unknown
}

/** Connection id seeded on the iframe URL (host uiUrl / bootstrap). */
export function readConnectionIdFromUrl(
  search = typeof location !== 'undefined' ? location.search : '',
): string {
  try {
    return new URLSearchParams(search || '').get('dwConnectionId')?.trim() || ''
  } catch {
    return ''
  }
}

/** Prefer top-level connectionId, then nested connection.id. */
export function readConnectionId(context?: HostConnectionContext | null): string {
  if (!context || typeof context !== 'object') return ''
  const top = typeof context.connectionId === 'string' ? context.connectionId.trim() : ''
  if (top) return top
  const nested = context.connection?.id
  return typeof nested === 'string' ? nested.trim() : ''
}

/** First non-empty id from bridge context pieces, then the iframe URL seed. */
export function resolveConnectionId(
  ...parts: Array<HostConnectionContext | null | undefined | string>
): string {
  for (const part of parts) {
    if (typeof part === 'string') {
      const id = part.trim()
      if (id) return id
    } else {
      const id = readConnectionId(part)
      if (id) return id
    }
  }
  return readConnectionIdFromUrl()
}
