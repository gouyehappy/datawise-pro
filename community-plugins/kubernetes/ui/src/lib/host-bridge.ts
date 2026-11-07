/**
 * DataWise host bridge accessor.
 * Uses `window.datawisePlugin` only.
 */

export type HostBridge = {
  ready?: Promise<unknown>
  context?: unknown
  locale?: string
  theme?: { appearance?: string; tokens?: Record<string, string> }
  appearance?: { colorScheme?: string } | string
  getHostInfo?: () => Promise<{
    locale?: string
    appearance?: { colorScheme?: string }
    theme?: { appearance?: string; tokens?: Record<string, string> }
  }>
  onHostInfo?: (fn: (info: unknown) => void) => () => void
  onAppearanceChange?: (fn: (appearance: unknown) => void) => () => void
  onLocaleChange?: (fn: (locale: string) => void) => () => void
  invoke?: (...args: unknown[]) => unknown
  request?: (...args: unknown[]) => unknown
  onContext?: (fn: (ctx: unknown) => void) => () => void
  onContextChange?: (fn: (ctx: unknown) => void) => () => void
  reopenConnection?: (connectionId: string) => Promise<unknown>
  saveFile?: (
    options: { fileName: string; contentType: string },
    data: Uint8Array,
  ) => Promise<{ path?: string } | null>
  [key: string]: unknown
}

type HostWindow = Window & {
  datawisePlugin?: HostBridge
}

/** Normalize host API shape differences (theme/onContext/request aliases). */
export function normalizeHostBridge(raw: HostBridge): HostBridge {
  return new Proxy(raw, {
    get(target, prop, receiver) {
      if (prop === 'theme') {
        const appearance =
          target.theme?.appearance ||
          (typeof target.appearance === 'string' ? target.appearance : undefined)
        return appearance ? { appearance } : target.theme
      }
      if (prop === 'onContext') {
        return target.onContextChange || target.onContext
      }
      if (prop === 'request') {
        return target.request ?? target.invoke
      }
      return Reflect.get(target, prop, receiver)
    },
  })
}

export function getHostBridge(): HostBridge | undefined {
  const w = window as HostWindow
  const raw = w.datawisePlugin
  return raw ? normalizeHostBridge(raw) : undefined
}

export function hasHostBridge(): boolean {
  const w = window as HostWindow
  return Boolean(w.datawisePlugin)
}

/** Host env event name dispatched by DataWise workbench bootstrap. */
export const HOST_ENV_EVENTS = ['datawise-plugin-env'] as const

export function addHostEnvListener(handler: EventListener): () => void {
  for (const name of HOST_ENV_EVENTS) {
    document.addEventListener(name, handler)
    window.addEventListener(name, handler)
  }
  return () => {
    for (const name of HOST_ENV_EVENTS) {
      document.removeEventListener(name, handler)
      window.removeEventListener(name, handler)
    }
  }
}

/** Previous product prefix — read once to migrate prefs into datawise keys. */
const LEGACY_PREF_PREFIX = 'dbx:kite:'
const PREF_PREFIX = 'datawise:kite:'

/** Read preference JSON with legacy key fallback; migrate on write. */
export function readMigratedLocalStorage(connectionId: string, suffix: string): string | null {
  const nextKey = `${PREF_PREFIX}${connectionId}:${suffix}`
  const legacyKey = `${LEGACY_PREF_PREFIX}${connectionId}:${suffix}`
  const next = localStorage.getItem(nextKey)
  if (next != null) return next
  const legacy = localStorage.getItem(legacyKey)
  if (legacy != null) {
    try {
      localStorage.setItem(nextKey, legacy)
    } catch {
      /* ignore quota */
    }
  }
  return legacy
}

export function writeMigratedLocalStorage(connectionId: string, suffix: string, value: string) {
  const nextKey = `${PREF_PREFIX}${connectionId}:${suffix}`
  try {
    localStorage.setItem(nextKey, value)
  } catch {
    /* ignore */
  }
}

export const WORKBENCH_PREF_PREFIX = 'datawise-k8s:'
/** Previous product prefix — read once to migrate prefs into datawise keys. */
export const LEGACY_WORKBENCH_PREF_PREFIX = 'dbx-k8s:'

export function readWorkbenchPreferencesRaw(connectionId: string): string {
  const nextKey = `${WORKBENCH_PREF_PREFIX}${connectionId}`
  const legacyKey = `${LEGACY_WORKBENCH_PREF_PREFIX}${connectionId}`
  const next = localStorage.getItem(nextKey)
  if (next != null) return next
  const legacy = localStorage.getItem(legacyKey)
  if (legacy != null) {
    try {
      localStorage.setItem(nextKey, legacy)
    } catch {
      /* ignore */
    }
  }
  return legacy || '{}'
}

export function writeWorkbenchPreferencesRaw(connectionId: string, value: string) {
  try {
    localStorage.setItem(`${WORKBENCH_PREF_PREFIX}${connectionId}`, value)
  } catch {
    /* ignore */
  }
}
