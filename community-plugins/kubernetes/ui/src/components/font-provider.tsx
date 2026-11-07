/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'

type FontOption = 'system' | 'maple' | 'jetbrains'

type FontProviderProps = {
  children: React.ReactNode
  defaultFont?: FontOption
  storageKey?: string
}

type FontProviderState = {
  font: FontOption
  setFont: (font: FontOption) => void
}

const initialState: FontProviderState = {
  font: 'system',
  setFont: () => null,
}

const FontProviderContext = createContext<FontProviderState>(initialState)

export function FontProvider({
  children,
  defaultFont = 'system',
  // v2: reset prior Maple-as-UI-chrome default so workbenches match other plugins.
  storageKey = 'vite-ui-font-v2',
  ...props
}: FontProviderProps) {
  const [font, setFont] = useState<FontOption>(
    () => (localStorage.getItem(storageKey) as FontOption) || defaultFont
  )

  useEffect(() => {
    const root = window.document.documentElement
    // Default UI chrome uses plugin --font-sans (system stack). Maple/JetBrains
    // remain optional overrides for users who pick them in Settings.
    let value = 'var(--font-sans)'
    if (font === 'maple') {
      value = "'Maple Mono', var(--font-sans)"
    }
    if (font === 'jetbrains') {
      value = "'JetBrains Mono', var(--font-sans)"
    }
    root.style.setProperty('--app-font-sans', value)
    localStorage.setItem(storageKey, font)
  }, [font, storageKey])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey || event.newValue === null) {
        return
      }

      if (
        event.newValue === 'system' ||
        event.newValue === 'maple' ||
        event.newValue === 'jetbrains'
      ) {
        setFont(event.newValue)
      }
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [storageKey])

  const value = useMemo(
    () => ({
      font,
      setFont: (f: FontOption) => setFont(f),
    }),
    [font]
  )

  return (
    <FontProviderContext.Provider {...props} value={value}>
      {children}
    </FontProviderContext.Provider>
  )
}

export const useFont = () => {
  const context = useContext(FontProviderContext)
  if (context === undefined)
    throw new Error('useFont must be used within a FontProvider')
  return context
}
