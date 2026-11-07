import { useEffect, useState } from 'react'
import { EuiProvider } from '@elastic/eui'
import { DiscoverApp } from './discover/DiscoverApp'
import { getBridge } from './lib/bridge'
import lightThemeCss from '@elastic/eui/dist/eui_theme_light.css?raw'
import darkThemeCss from '@elastic/eui/dist/eui_theme_dark.css?raw'

type ColorMode = 'light' | 'dark'

function readScheme(value: unknown): ColorMode | null {
  if (!value) return null
  if (typeof value === 'string') return value === 'light' ? 'light' : 'dark'
  if (typeof value === 'object') {
    const v = value as {
      appearance?: string
      colorScheme?: string
      theme?: { appearance?: string }
    }
    if (v.appearance === 'light' || v.colorScheme === 'light' || v.theme?.appearance === 'light') {
      return 'light'
    }
    if (v.appearance === 'dark' || v.colorScheme === 'dark' || v.theme?.appearance === 'dark') {
      return 'dark'
    }
  }
  return null
}

function schemeFromDom(): ColorMode | null {
  const root = document.documentElement
  const attr = root.getAttribute('data-theme') || root.getAttribute('data-dw-theme')
  if (attr === 'light' || attr === 'dark') return attr
  if (root.style.colorScheme === 'light' || root.style.colorScheme === 'dark') {
    return root.style.colorScheme as ColorMode
  }
  return null
}

function initialScheme(): ColorMode {
  const bridge = getBridge()
  return (
    readScheme(bridge?.theme) ||
    readScheme(bridge?.appearance) ||
    schemeFromDom() ||
    'light'
  )
}

function ensureThemeStyle(colorMode: ColorMode) {
  const id = 'datawise-eui-theme'
  let style = document.getElementById(id) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = id
    document.head.appendChild(style)
  }
  style.textContent = colorMode === 'dark' ? darkThemeCss : lightThemeCss
}

function applyRootScheme(colorMode: ColorMode) {
  const root = document.documentElement
  root.setAttribute('data-theme', colorMode)
  root.setAttribute('data-dw-theme', colorMode)
  root.style.colorScheme = colorMode
  document.body?.setAttribute('class', colorMode === 'dark' ? 'euiColorModeDark' : 'euiColorModeLight')
}

export default function App() {
  const [colorMode, setColorMode] = useState<ColorMode>(initialScheme)

  useEffect(() => {
    applyRootScheme(colorMode)
    ensureThemeStyle(colorMode)
  }, [colorMode])

  useEffect(() => {
    const bridge = getBridge()
    let cancelled = false

    const apply = (next: unknown) => {
      const scheme = readScheme(next) || schemeFromDom()
      if (scheme && !cancelled) setColorMode(scheme)
    }

    void (async () => {
      try {
        await bridge?.ready
        if (cancelled) return
        apply(bridge?.theme || bridge?.appearance)
        const info = await bridge?.getHostInfo?.()
        if (info) apply(info.theme || info.appearance || info)
      } catch {
        /* host theme optional at boot */
      }
    })()

    const offAppearance = bridge?.onAppearanceChange?.(apply)
    const offHostInfo = bridge?.onHostInfo?.((info) => apply(info.theme || info.appearance || info))
    const onEnv = (ev: Event) => {
      const detail = (ev as CustomEvent).detail || {}
      apply(detail.theme || detail.appearance || detail)
    }
    document.addEventListener('datawise-plugin-env', onEnv)

    const mo = new MutationObserver(() => {
      const fromDom = schemeFromDom()
      if (fromDom && !cancelled) setColorMode(fromDom)
    })
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-dw-theme', 'style'],
    })

    return () => {
      cancelled = true
      offAppearance?.()
      offHostInfo?.()
      document.removeEventListener('datawise-plugin-env', onEnv)
      mo.disconnect()
    }
  }, [])

  return (
    <EuiProvider colorMode={colorMode} key={colorMode}>
      <DiscoverApp />
    </EuiProvider>
  )
}
