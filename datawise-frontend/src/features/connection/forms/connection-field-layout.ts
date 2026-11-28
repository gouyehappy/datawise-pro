/**
 * Shared wide/half rules for connection form descriptor fields
 * (community plugins + builtin packs).
 */
import type {DescriptorFormField} from '@/features/connection/forms/descriptor-connection-bindings'

const WIDE_BINDINGS = new Set([
  'http_endpoint',
  'url',
  'kafka_bootstrap',
  'kudu_masters',
  'database',
])

/** Path-like keys that need a full row (certs, sockets, known_hosts, …). */
const WIDE_KEY_RE = /(_path|cert|private_key|known_hosts|pipe_path|socket_path)$/i

export type ConnectionFieldWideOptions = {
  /** Select option count after dynamic options merge (defaults to field.options). */
  optionCount?: number
  hasFilePicker?: boolean
}

/**
 * Whether a descriptor field should span the full connection form grid.
 * Half-width keeps host/port and ssh_host/ssh_port paired.
 */
export function isConnectionFieldWide(
  field: DescriptorFormField,
  opts: ConnectionFieldWideOptions = {},
): boolean {
  if (field.type === 'textarea' || field.type === 'boolean') return true
  if (opts.hasFilePicker) return true

  const binding = field.binding || ''
  if (WIDE_BINDINGS.has(binding)) return true

  if (field.type === 'select') {
    const count = opts.optionCount ?? field.options?.length ?? 0
    if (count >= 5) return true
  }

  if (WIDE_KEY_RE.test(field.key || '')) return true

  return false
}
