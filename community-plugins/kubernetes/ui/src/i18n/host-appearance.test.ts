import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { addHostColorSchemeListener, syncHostAppearance } from './host-appearance'

describe('syncHostAppearance', () => {
  let stop: (() => void) | undefined

  beforeEach(() => {
    document.documentElement.className = ''
    document.documentElement.removeAttribute('data-theme')
  })

  afterEach(() => {
    stop?.()
    stop = undefined
  })

  it('applies colorScheme from getHostInfo after ready', async () => {
    stop = syncHostAppearance({
      ready: Promise.resolve(),
      getHostInfo: async () => ({
        appearance: { colorScheme: 'light' },
        theme: { appearance: 'light' },
      }),
    })
    await vi.waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
      expect(document.documentElement.classList.contains('light')).toBe(true)
    })
  })

  it('notifies color-scheme listeners', async () => {
    const seen: string[] = []
    const off = addHostColorSchemeListener((scheme) => {
      seen.push(scheme)
    })
    stop = syncHostAppearance({
      ready: Promise.resolve(),
      onHostInfo: (cb) => {
        cb({ appearance: { colorScheme: 'dark' }, theme: { appearance: 'dark' } })
        return () => {}
      },
    })
    await vi.waitFor(() => expect(seen).toContain('dark'))
    off()
  })
})
