import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useTranslation } from 'react-i18next'
import { RouterProvider } from 'react-router-dom'

import './index.css'
import './i18n'
import { syncHostAppearance } from './i18n/host-appearance'
import { syncHostLanguage } from './i18n/host-language'
import { getHostBridge } from './lib/host-bridge'
import {
  type HostConnectionContext,
  resolveConnectionId,
} from './lib/host-connection'
import { initUiStorage } from './lib/ui-storage'

import { AppearanceProvider } from './components/appearance-provider'
import { RuntimeProvider } from './contexts/runtime-context'
import { SidebarConfigProvider } from './contexts/sidebar-config-context'
import { clearDatawiseResourceDiscovery } from './lib/datawise-resource-discovery'
import { QueryProvider } from './lib/query-provider'
import { router } from './routes'

type HostBridgeApi = {
  ready: Promise<unknown>
  context?: HostConnectionContext
  locale?: string
  request?: (method: string, params?: unknown, options?: { timeoutMs?: number }) => Promise<unknown>
  invoke?: (method: string, params?: unknown, options?: { timeoutMs?: number }) => Promise<unknown>
  onContext?: (fn: (context: HostConnectionContext) => void) => () => void
  onLocaleChange?: (fn: (locale: string) => void) => () => void
}

const HOST_CONTEXT_TIMEOUT_MS = 10_000
const HOST_CONTEXT_POLL_MS = 100

export function AppBootstrap() {
  return <RouterProvider router={router} />
}

function DatawiseRoot() {
  const { t } = useTranslation()
  const [connection, setConnection] = useState<string | null>(() => {
    const seeded = resolveConnectionId(getHostBridge()?.context as HostConnectionContext | undefined)
    return seeded || null
  })
  const [error, setError] = useState('')

  useEffect(() => {
    const bridge = getHostBridge() as HostBridgeApi | undefined
    if (!bridge) {
      setError('DataWise Host Bridge unavailable')
      return
    }

    let alive = true
    let resolved = false

    const apply = (context?: HostConnectionContext | null) => {
      if (!alive || resolved) return
      const id = resolveConnectionId(context, bridge.context)
      if (!id) return
      resolved = true
      clearDatawiseResourceDiscovery()
      setConnection(id)
      setError('')
    }

    apply(bridge.context)

    const off = bridge.onContext?.(apply)
    const offLocale = syncHostLanguage(bridge)
    const offAppearance = syncHostAppearance(bridge)

    void bridge.ready.then(() => apply(bridge.context)).catch((reason) => {
      if (alive && !resolved) setError(String(reason))
    })

    const fetchHostContext = async () => {
      const call = bridge.request ?? bridge.invoke
      if (!call) return
      try {
        const result = await call('host.getContext', {}, { timeoutMs: 2000 })
        if (result && typeof result === 'object') apply(result as HostConnectionContext)
      } catch {
        // Host may not answer until the iframe is bound — keep polling.
      }
    }

    void fetchHostContext()
    const poll = window.setInterval(() => {
      if (!alive || resolved) return
      apply(bridge.context)
      void fetchHostContext()
    }, HOST_CONTEXT_POLL_MS)

    const timeout = window.setTimeout(() => {
      if (!alive || resolved) return
      setError(
        t(
          'errors.hostBridgeMissing',
          'Host did not provide connection context. Close this tab and reconnect from the sidebar.',
        ),
      )
    }, HOST_CONTEXT_TIMEOUT_MS)

    return () => {
      alive = false
      window.clearInterval(poll)
      window.clearTimeout(timeout)
      off?.()
      offLocale?.()
      offAppearance?.()
    }
  }, [t])

  if (error)
    return (
      <div role="alert" className="p-6">
        {error}
      </div>
    )
  if (!connection)
    return <div className="p-6 text-muted-foreground">{t('common.loading')}</div>
  return (
    <QueryProvider key={connection}>
      <AppearanceProvider
        defaultTheme="system"
        defaultColorTheme="default"
        defaultFont="system"
      >
        <RuntimeProvider>
          <SidebarConfigProvider>
            <AppBootstrap />
          </SidebarConfigProvider>
        </RuntimeProvider>
      </AppearanceProvider>
    </QueryProvider>
  )
}

// hostApi 1.2: opaque-origin frames have no localStorage — prime the host
// storage cache before the first render reads it.
void initUiStorage().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <DatawiseRoot />
    </StrictMode>
  )
})
