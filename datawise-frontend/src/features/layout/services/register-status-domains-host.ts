import {registerStatusDomain, type StatusVariant} from '@datawise/ui'

let registered = false

/**
 * Product domain maps for StatusPill / resolveStatusVariant.
 * Package keeps resolvers empty until this boot hook runs.
 */
export function registerStatusDomainsHost(): void {
  if (registered) return
  registered = true

  registerStatusDomain('log', (s): StatusVariant | null =>
    s === 'error' ? 'error' : 'success',
  )

  registerStatusDomain('preflight', (s): StatusVariant | null => {
    if (s === 'ready') return 'success'
    if (s === 'warn') return 'warn'
    if (s === 'blocked') return 'error'
    return null
  })

  registerStatusDomain('validation', (s): StatusVariant | null => {
    if (s === 'match') return 'success'
    if (s === 'mismatch') return 'error'
    if (s === 'skipped') return 'warn'
    return null
  })

  registerStatusDomain('schema', (s): StatusVariant | null => {
    if (s === 'added') return 'success'
    if (s === 'removed') return 'error'
    if (s === 'changed') return 'primary'
    if (s === 'unchanged') return 'neutral'
    return null
  })

  registerStatusDomain('connection', (s): StatusVariant | null => {
    if (s === 'ok') return 'success'
    if (s === 'error') return 'error'
    return 'neutral'
  })

  // export / migration share generic buckets (running/success/error/warn)
  registerStatusDomain('export', () => null)
  registerStatusDomain('migration', () => null)
}
