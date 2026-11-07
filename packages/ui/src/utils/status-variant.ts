/** Neutral status visual variants — product domain maps register at host boot. */
export type StatusVariant =
  | 'success'
  | 'error'
  | 'warn'
  | 'running'
  | 'info'
  | 'neutral'
  | 'primary'
  | 'accent'

/** Free-form domain id; hosts register resolvers via {@link registerStatusDomain}. */
export type StatusDomain = string

export type StatusDomainResolver = (normalizedStatus: string) => StatusVariant | null | undefined

const SUCCESS = new Set(['success', 'ok', 'done', 'ready', 'match'])
const ERROR = new Set(['error', 'failed', 'blocked', 'mismatch'])
const WARN = new Set(['warn', 'warning', 'partial', 'skipped', 'paused'])
const RUNNING = new Set(['running', 'pending', 'in_progress'])

const domainResolvers = new Map<string, StatusDomainResolver>()

/** Register / replace a product domain map (e.g. schema, connection). */
export function registerStatusDomain(domain: string, resolve: StatusDomainResolver): void {
  domainResolvers.set(domain, resolve)
}

export function clearStatusDomainsForTests(): void {
  domainResolvers.clear()
}

export function resolveStatusVariant(
  status: string | null | undefined,
  domain?: StatusDomain | null,
): StatusVariant {
  const normalized = (status ?? '').trim().toLowerCase()
  if (!normalized) return 'neutral'

  if (domain) {
    const fromDomain = domainResolvers.get(domain)?.(normalized)
    if (fromDomain) return fromDomain
  }

  if (RUNNING.has(normalized)) return 'running'
  if (SUCCESS.has(normalized)) return 'success'
  if (ERROR.has(normalized)) return 'error'
  if (WARN.has(normalized)) return 'warn'
  if (normalized === 'info') return 'info'
  return 'neutral'
}

export function statusVariantClass(variant: StatusVariant): string {
  return `dw-status--${variant}`
}
