/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'

import { addHostColorSchemeListener } from '@/i18n/host-appearance'
import { hasHostBridge } from '@/lib/host-bridge'

type Theme = 'dark' | 'light' | 'system'

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  actualTheme: Omit<Theme, 'system'>
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
  actualTheme: 'light',
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

function readStoredTheme(storageKey: string, defaultTheme: Theme): Theme {
  // Inside DataWise workbench the host owns light/dark — ignore localStorage.
  if (hasHostBridge()) {
    const attr = document.documentElement.getAttribute('data-theme')
    if (attr === 'light' || attr === 'dark') return attr
    return 'dark'
  }
  return (localStorage.getItem(storageKey) as Theme) || defaultTheme
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'vite-ui-theme',
  ...props
}: ThemeProviderProps) {
  const hostOwned = hasHostBridge()
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme(storageKey, defaultTheme))
  const [actualTheme, setActualTheme] = useState<Omit<Theme, 'system'>>(
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme
  )

  // Watch for system theme changes when theme is 'system' (standalone only).
  useEffect(() => {
    if (hostOwned) {
      const root = window.document.documentElement
      const scheme = theme === 'light' ? 'light' : 'dark'
      root.classList.remove('light', 'dark')
      root.classList.add(scheme)
      setActualTheme(scheme)
      return
    }
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleChange = () => {
        const root = window.document.documentElement
        root.classList.remove('light', 'dark')

        const systemTheme = mediaQuery.matches ? 'dark' : 'light'
        root.classList.add(systemTheme)
        setActualTheme(systemTheme)
      }

      handleChange()
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    setActualTheme(theme)
    root.classList.add(theme)
  }, [hostOwned, theme])

  useEffect(() => {
    if (hostOwned) {
      return addHostColorSchemeListener((scheme) => {
        setTheme(scheme)
      })
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey || event.newValue === null) {
        return
      }

      if (
        event.newValue === 'light' ||
        event.newValue === 'dark' ||
        event.newValue === 'system'
      ) {
        setTheme(event.newValue)
      }
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [hostOwned, storageKey])

  const value = {
    theme,
    setTheme: (next: Theme) => {
      // Host-owned workbench: ignore plugin UI attempts to persist a private theme.
      if (!hostOwned) {
        localStorage.setItem(storageKey, next)
      }
      setTheme(next)
    },
    actualTheme,
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider')

  return context
}
