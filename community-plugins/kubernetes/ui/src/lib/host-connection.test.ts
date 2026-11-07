import { describe, expect, it } from 'vitest'

import { readConnectionId, readConnectionIdFromUrl, resolveConnectionId } from './host-connection'

describe('host connection bootstrap', () => {
  it('reads dwConnectionId from the iframe URL', () => {
    expect(readConnectionIdFromUrl('?dwUiTicket=x&dwConnectionId=conn-42')).toBe('conn-42')
    expect(readConnectionIdFromUrl('')).toBe('')
  })

  it('prefers top-level connectionId over nested connection.id', () => {
    expect(
      readConnectionId({
        connectionId: 'top',
        connection: { id: 'nested' },
      }),
    ).toBe('top')
    expect(readConnectionId({ connection: { id: 'nested' } })).toBe('nested')
    expect(readConnectionId({})).toBe('')
  })

  it('falls back across bridge context and URL seed', () => {
    const original = `${window.location.pathname}${window.location.search}`
    try {
      window.history.replaceState({}, '', '/?dwConnectionId=from-url')
      expect(resolveConnectionId({ connection: { id: 'from-ctx' } })).toBe('from-ctx')
      expect(resolveConnectionId({})).toBe('from-url')
      expect(resolveConnectionId(undefined, '', { connectionId: '  ' })).toBe('from-url')
    } finally {
      window.history.replaceState({}, '', original || '/')
    }
  })
})
