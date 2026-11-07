/**
 * Host status helpers — SoT `@datawise/ui` + product domain registration.
 * Call `registerStatusDomainsHost()` from AppShell before StatusPill usage.
 */
import type {StatusVariant} from '@datawise/ui'

export {
  resolveStatusVariant,
  statusVariantClass,
  registerStatusDomain,
  type StatusVariant,
} from '@datawise/ui'

/** Product domains used by DataWise StatusPill callers. */
export type StatusDomain =
  | 'export'
  | 'migration'
  | 'log'
  | 'preflight'
  | 'validation'
  | 'schema'
  | 'connection'

/** 日志级别 → 视觉变体（用于日志行着色） */
export function resolveLogLevelVariant(level: string | null | undefined): StatusVariant {
  const normalized = (level ?? '').trim().toLowerCase()
  if (normalized === 'success') return 'success'
  if (normalized === 'warn' || normalized === 'warning') return 'warn'
  if (normalized === 'error') return 'error'
  return 'info'
}
