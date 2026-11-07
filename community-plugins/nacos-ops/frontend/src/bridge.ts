export type HostBridge = {
  ready?: Promise<unknown>
  context?: { connectionId?: string }
  locale?: string
  theme?: { appearance?: 'light' | 'dark'; tokens?: Record<string, string> }
  appearance?: { colorScheme?: string } | string
  invoke?: (method: string, params?: Record<string, unknown>, opts?: { timeoutMs?: number }) => Promise<unknown>
  clipboard?: { writeText(text: string): Promise<void>; readText?: () => Promise<string> }
  onAppearanceChange?: (fn: (appearance: unknown) => void) => () => void
  onThemeChange?: (fn: (theme: { appearance?: string }) => void) => () => void
  onLocaleChange?: (fn: (locale: string) => void) => () => void
  onContextChange?: (fn: (ctx: { connectionId?: string }) => void) => () => void
  getHostInfo?: () => Promise<{
    locale?: string
    appearance?: { colorScheme?: string }
    theme?: { appearance?: string; tokens?: Record<string, string> }
  }>
}

/** Prefer host clipboard (sandboxed iframe), then navigator, then execCommand. */
export async function writeClipboardText(bridge: HostBridge | null | undefined, text: string) {
  if (bridge?.clipboard?.writeText) {
    try {
      await bridge.clipboard.writeText(text)
      return
    } catch {
      /* fall through */
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    /* fall through */
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('data-dw-clipboard', '1')
  ta.style.cssText = 'position:fixed;left:-9999px;top:0'
  document.body.appendChild(ta)
  ta.select()
  try {
    if (!document.execCommand('copy')) throw new Error('execCommand copy failed')
  } finally {
    ta.remove()
  }
}

declare global {
  interface Window {
    datawisePlugin?: HostBridge
  }
}

export async function getBridge(): Promise<HostBridge> {
  const start = Date.now()
  while (Date.now() - start < 15000) {
    const raw = window.datawisePlugin
    if (raw?.ready) {
      await Promise.race([
        raw.ready,
        new Promise((r) => setTimeout(r, 8000)),
      ])
      return raw
    }
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error('Host bridge unavailable')
}

function resolveAppearance(appearance: unknown): 'light' | 'dark' {
  const raw =
    typeof appearance === 'string'
      ? appearance
      : (appearance as { colorScheme?: string; appearance?: string } | null)?.colorScheme ||
        (appearance as { appearance?: string } | null)?.appearance ||
        ''
  return /light/i.test(String(raw)) ? 'light' : 'dark'
}

/** Align with Jenkins: host injects --color-background / --color-foreground… */
export function applyAppearance(appearance: unknown) {
  const theme = resolveAppearance(appearance)
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.setAttribute('data-dw-theme', theme)
  document.documentElement.style.colorScheme = theme
}

export async function syncHostTheme(bridge: HostBridge) {
  try {
    const info = await bridge.getHostInfo?.()
    const appearance =
      info?.appearance?.colorScheme ||
      info?.theme?.appearance ||
      bridge.theme?.appearance ||
      bridge.appearance
    applyAppearance(appearance)
  } catch {
    applyAppearance(bridge.theme?.appearance || bridge.appearance || 'dark')
  }
}
