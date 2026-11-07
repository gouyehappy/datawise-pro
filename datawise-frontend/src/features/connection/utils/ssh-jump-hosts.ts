/**
 * ProxyJump (`jump_hosts`) JSON validation for the host connection form.
 * Kept in sync with community-plugins/ssh/frontend/src/lib/jumpHosts.ts and
 * backend parse_jump_hosts / JumpHost::validate.
 */

export type JumpHostsValidation =
  | {ok: true; hopCount: number}
  | {ok: false; error: string}

const AUTH_METHODS = new Set(['password', 'private-key', 'private-key-password', 'agent'])

function validateHost(host: string): string | null {
  if (!host) return 'each hop needs a non-empty host'
  if (/\s/.test(host)) return `invalid host '${host}': must not contain whitespace`
  if (host.includes('://')) return `invalid host '${host}': use a bare hostname, not a URI`
  return null
}

function parseHop(value: unknown, index: number): {host: string; port: number} | string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return `Jump host #${index + 1} must be an object`
  }
  const row = value as Record<string, unknown>
  const host = typeof row.host === 'string' ? row.host.trim() : ''
  const hostError = validateHost(host)
  if (hostError) return `Jump host #${index + 1}: ${hostError}`

  let port = 22
  if (row.port !== undefined && row.port !== null) {
    const n = typeof row.port === 'number' ? row.port : Number(row.port)
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      return `Jump host #${index + 1} (${host}): port must be between 1 and 65535`
    }
    port = n
  }

  const username = typeof row.username === 'string' ? row.username.trim() : ''
  if (!username) return `Jump host #${index + 1} (${host}): missing username`

  const authRaw = typeof row.authentication === 'string' && row.authentication.trim()
    ? row.authentication.trim()
    : 'password'
  if (!AUTH_METHODS.has(authRaw)) {
    return `Jump host #${index + 1} (${host}): unsupported authentication method`
  }

  const password = typeof row.password === 'string' ? row.password : ''
  const privateKeyPath =
    typeof row.private_key_path === 'string' ? row.private_key_path.trim() : ''

  if (authRaw === 'password' && !password) {
    return `Jump host #${index + 1} (${host}) requires a password`
  }
  if ((authRaw === 'private-key' || authRaw === 'private-key-password') && !privateKeyPath) {
    return `Jump host #${index + 1} (${host}) requires private_key_path`
  }

  return {host, port}
}

/** Validate connection-form textarea text for SSH `jump_hosts`. */
export function validateJumpHostsText(text: string): JumpHostsValidation {
  const trimmed = text.trim()
  if (!trimmed) return {ok: true, hopCount: 0}

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (cause) {
    return {
      ok: false,
      error: `jump_hosts must be a JSON array of hop objects: ${cause instanceof Error ? cause.message : String(cause)}`,
    }
  }
  if (!Array.isArray(parsed)) {
    return {ok: false, error: 'jump_hosts must be a JSON array of hop objects'}
  }
  if (parsed.length > 3) {
    return {ok: false, error: 'At most 3 jump hosts are supported'}
  }

  const seen = new Set<string>()
  for (let i = 0; i < parsed.length; i += 1) {
    const hop = parseHop(parsed[i], i)
    if (typeof hop === 'string') return {ok: false, error: hop}
    const key = `${hop.host}:${hop.port}`
    if (seen.has(key)) {
      return {ok: false, error: `Jump host #${i + 1} (${hop.host}) repeats an earlier hop`}
    }
    seen.add(key)
  }
  return {ok: true, hopCount: parsed.length}
}
