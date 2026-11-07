export interface PluginContext {
  connectionId?: string
  connection?: {
    id?: string
    name?: string
    host?: string
    port?: number | string
    username?: string
    readOnly?: boolean
  }
  locale?: string
  theme?: { appearance?: 'light' | 'dark'; tokens?: Record<string, string> }
  [key: string]: unknown
}

interface DatawisePlugin {
  ready: Promise<unknown>
  context: PluginContext
  locale?: string
  theme?: { appearance?: 'light' | 'dark'; tokens?: Record<string, string> }
  invoke<T>(method: string, params?: Record<string, unknown>, options?: { timeoutMs?: number }): Promise<T>
  onContext?(fn: (context: PluginContext) => void): () => void
  onContextChange?(fn: (context: PluginContext) => void): () => void
  onThemeChange?(fn: (theme: { appearance?: 'light' | 'dark' }) => void): () => void
  storage?: {
    get(key: string): Promise<string | null | undefined>
    set(key: string, value: string): Promise<void>
  }
  clipboard?: { writeText(text: string): Promise<void> }
  shell?: { openExternal(url: string): Promise<boolean> }
}

declare global {
  interface Window {
    datawisePlugin?: DatawisePlugin
  }
}

export function getPlugin(): DatawisePlugin {
  if (!window.datawisePlugin) {
    throw new Error('This page must run inside the DataWise plugin sandbox')
  }
  return window.datawisePlugin
}

export async function waitReady(): Promise<DatawisePlugin> {
  const plugin = getPlugin()
  await plugin.ready
  return plugin
}

export async function invoke<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const plugin = getPlugin()
  const connectionId =
    (params.connectionId as string | undefined)
    || plugin.context?.connectionId
    || plugin.context?.connection?.id
    || ''
  return plugin.invoke<T>(method, { ...params, connectionId }, { timeoutMs: 120_000 })
}

export function applyTheme(appearance?: string): void {
  const theme = appearance === 'light' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.setAttribute('data-dw-theme', theme)
}

export async function storageGet(key: string): Promise<string> {
  try {
    const plugin = getPlugin()
    if (!plugin.storage) return ''
    return (await plugin.storage.get(key)) || ''
  } catch {
    return ''
  }
}

export async function storageSet(key: string, value: string): Promise<void> {
  try {
    const plugin = getPlugin()
    if (!plugin.storage) return
    await plugin.storage.set(key, value)
  } catch {
    // ignore
  }
}

/** Open http(s) via host shell; fall back to window.open when the bridge is older. */
export async function openExternalUrl(url?: string | null): Promise<boolean> {
  const trimmed = (url || '').trim()
  if (!/^https?:\/\//i.test(trimmed)) return false
  try {
    const plugin = getPlugin()
    if (plugin.shell?.openExternal) {
      const ok = await plugin.shell.openExternal(trimmed)
      if (ok) return true
    }
  } catch {
    // fall through
  }
  try {
    const win = window.open(trimmed, '_blank', 'noopener,noreferrer')
    return !!win
  } catch {
    return false
  }
}
