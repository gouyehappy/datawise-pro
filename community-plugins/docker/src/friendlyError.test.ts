import { describe, expect, it } from 'vitest'
import { friendlyDockerError } from './friendlyError'

const t = (key: string) => key

describe('friendlyDockerError', () => {
  it('maps Windows named-pipe failures to Desktop tip', () => {
    const result = friendlyDockerError(
      'open //./pipe/docker_engine: The system cannot find the file specified.',
      t,
    )
    expect(result.tip).toBe('errorTipLocalDesktop')
  })

  it('maps connection refused to refused tip', () => {
    const result = friendlyDockerError('dial tcp 127.0.0.1:2375: connect: connection refused', t)
    expect(result.tip).toBe('errorTipRefused')
  })

  it('maps SSH host-key issues', () => {
    const result = friendlyDockerError('ssh: handshake failed: knownhosts mismatch', t)
    expect(result.tip).toBe('errorTipSsh')
  })

  it('falls back to retry tip', () => {
    const result = friendlyDockerError('boom', t)
    expect(result.message).toBe('boom')
    expect(result.tip).toBe('errorTipRetry')
  })
})
