import { addHostEnvListener } from '@/lib/host-bridge'

type AppearanceLike = {
  colorScheme?: string
}

type HostInfoLike = {
  appearance?: AppearanceLike
  theme?: { appearance?: string }
}

type AppearanceHost = {
  ready?: Promise<unknown>
  appearance?: AppearanceLike | string
  theme?: { appearance?: string }
  getHostInfo?: () => Promise<HostInfoLike>
  onHostInfo?: (listener: (info: HostInfoLike) => void) => () => void
  onAppearanceChange?: (listener: (appearance: AppearanceLike) => void) => () => void
}

export type HostColorScheme = 'light' | 'dark'

const HOST_SCHEME_EVENT = 'datawise-host-color-scheme'

function schemeFromUnknown(value: unknown): HostColorScheme | null {
  if (value === 'light' || value === 'dark') return value
  return null
}

function resolveScheme(info: HostInfoLike | AppearanceLike | string | null | undefined): HostColorScheme | null {
  if (typeof info === 'string') return schemeFromUnknown(info)
  if (!info || typeof info !== 'object') return null
  if ('colorScheme' in info) return schemeFromUnknown(info.colorScheme)
  const appearance = (info as HostInfoLike).appearance
  if (typeof appearance === 'string') return schemeFromUnknown(appearance)
  if (appearance && typeof appearance === 'object') {
    const fromAppearance = schemeFromUnknown(appearance.colorScheme)
    if (fromAppearance) return fromAppearance
  }
  return schemeFromUnknown((info as HostInfoLike).theme?.appearance)
}

function applyScheme(scheme: HostColorScheme) {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(scheme)
  root.setAttribute('data-theme', scheme)
  root.setAttribute('data-dw-theme', scheme)
  root.style.colorScheme = scheme
  window.dispatchEvent(new CustomEvent(HOST_SCHEME_EVENT, { detail: scheme }))
}

/** Subscribe ThemeProvider (and peers) to host color-scheme pushes. */
export function addHostColorSchemeListener(handler: (scheme: HostColorScheme) => void): () => void {
  const onEvent = (event: Event) => {
    const scheme = schemeFromUnknown((event as CustomEvent).detail)
    if (scheme) handler(scheme)
  }
  window.addEventListener(HOST_SCHEME_EVENT, onEvent)
  return () => window.removeEventListener(HOST_SCHEME_EVENT, onEvent)
}

/**
 * Keep workbench light/dark aligned with the DataWise host.
 * Host is the source of truth — local theme prefs must not override this.
 */
export function syncHostAppearance(host: AppearanceHost): () => void {
  let active = true
  const apply = (value: unknown) => {
    if (!active) return
    const scheme = resolveScheme(value as HostInfoLike)
    if (scheme) applyScheme(scheme)
  }

  const offHostInfo = host.onHostInfo?.(apply)
  const offAppearance = host.onAppearanceChange?.(apply)
  const onEnvironment = (event: Event) => {
    apply((event as CustomEvent<HostInfoLike>).detail)
  }
  const offEnv = addHostEnvListener(onEnvironment)

  void host.ready?.then(
    () => {
      if (host.getHostInfo) {
        void host.getHostInfo().then(apply).catch(() => apply(host))
      } else {
        apply(host)
      }
    },
    () => apply(host),
  )

  return () => {
    active = false
    offHostInfo?.()
    offAppearance?.()
    offEnv()
  }
}
