import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FontProvider, useFont } from './font-provider'

function createStorage() {
  let store: Record<string, string> = {}

  return {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key)
        ? store[key]
        : null
    },
    setItem(key: string, value: string) {
      store[key] = value
    },
    removeItem(key: string) {
      delete store[key]
    },
    clear() {
      store = {}
    },
  }
}

vi.stubGlobal('localStorage', createStorage())
vi.stubGlobal('sessionStorage', createStorage())

function FontConsumer() {
  const { font, setFont } = useFont()

  return (
    <div>
      <span data-testid="state">{font}</span>
      <button type="button" onClick={() => setFont('system')}>
        set system
      </button>
      <button type="button" onClick={() => setFont('jetbrains')}>
        set jetbrains
      </button>
    </div>
  )
}

describe('FontProvider', () => {
  it('syncs the app font variable and persists font changes', async () => {
    localStorage.clear()

    render(
      <FontProvider defaultFont="system" storageKey="font-theme-key-v2">
        <FontConsumer />
      </FontProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('system')
    })
    expect(
      document.documentElement.style.getPropertyValue('--app-font-sans')
    ).toBe('var(--font-sans)')
    expect(localStorage.getItem('font-theme-key-v2')).toBe('system')

    fireEvent.click(screen.getByRole('button', { name: 'set jetbrains' }))

    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('jetbrains')
    })
    expect(
      document.documentElement.style.getPropertyValue('--app-font-sans')
    ).toBe("'JetBrains Mono', var(--font-sans)")
    expect(localStorage.getItem('font-theme-key-v2')).toBe('jetbrains')
  })

  it('syncs font changes from another window via storage events', async () => {
    localStorage.clear()

    render(
      <FontProvider defaultFont="system" storageKey="font-theme-key-v2">
        <FontConsumer />
      </FontProvider>
    )

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'font-theme-key-v2',
        newValue: 'maple',
      })
    )

    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('maple')
    })
    expect(
      document.documentElement.style.getPropertyValue('--app-font-sans')
    ).toBe("'Maple Mono', var(--font-sans)")
  })
})
