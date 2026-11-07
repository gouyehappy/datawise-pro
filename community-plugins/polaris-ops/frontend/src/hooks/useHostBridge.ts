import { useCallback, useEffect, useState } from 'react'
import { applyAppearance, getBridge, syncHostTheme, type HostBridge } from '../bridge'
import { errMessage } from '../lib/types'

export function useHostBridge() {
  const [bridge, setBridge] = useState<HostBridge | null>(null)
  const [locale, setLocale] = useState('en')
  const [connectionId, setConnectionId] = useState('')
  const [bootError, setBootError] = useState('')

  useEffect(() => {
    let unsubs: Array<() => void> = []
    ;(async () => {
      try {
        const b = await getBridge()
        setBridge(b)
        setLocale(b.locale || navigator.language || 'en')
        setConnectionId(b.context?.connectionId || '')
        await syncHostTheme(b)
        unsubs.push(b.onAppearanceChange?.(applyAppearance) || (() => {}))
        unsubs.push(b.onThemeChange?.((theme) => applyAppearance(theme?.appearance)) || (() => {}))
        unsubs.push(b.onLocaleChange?.((loc) => setLocale(loc || 'en')) || (() => {}))
        unsubs.push(
          b.onContextChange?.((ctx) => setConnectionId(ctx?.connectionId || '')) || (() => {}),
        )
      } catch (e) {
        setBootError(errMessage(e))
      }
    })()
    return () => unsubs.forEach((u) => u())
  }, [])

  const invoke = useCallback(
    async (method: string, params: Record<string, unknown> = {}) => {
      if (!bridge?.invoke) throw new Error('invoke unavailable')
      if (!connectionId) throw new Error('missing connectionId')
      return bridge.invoke(method, { ...params, connectionId }, { timeoutMs: 60000 })
    },
    [bridge, connectionId],
  )

  return { bridge, locale, connectionId, bootError, invoke }
}
