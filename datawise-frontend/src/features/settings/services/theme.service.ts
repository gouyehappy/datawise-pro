/**
 * 主题运行时服务。
 * 首屏同步逻辑需与 public/theme-boot.js 保持一致。
 * CSS var 构建走 `@datawise/theme`；persist / auth / desktop 仍在宿主。
 */
import {
    buildThemeVars,
    clearManagedThemeVars,
    type BackgroundTone as PkgBackgroundTone,
    type PrimaryTone as PkgPrimaryTone,
    type ThemeMode as PkgThemeMode,
    type UiSkin as PkgUiSkin,
} from '@datawise/theme'
import {
    DEFAULT_THEME_PREFERENCES,
    THEME_STORAGE_KEY,
    resolveThemeMode,
    resolveUiFontStack,
    type ThemeMode,
    type ThemePreferences,
} from '@/shared/config/theme-presets'
import {UserResource} from '@/shared/auth/user-resource.types'
import {
    canPersistLocalResource,
    resolveResourceStorageKey,
} from '@/shared/auth/user-resource-policy'
import {persistDesktopThemePrefs} from '@/shared/browser/desktop-chrome-persist'
import {isNativeDesktopHost, readDatawiseHost} from '@/shared/browser/desktop-bridge'
import {
    normalizeThemePreferences,
    readStoredThemePreferences,
    readThemePreferencesOnBoot,
} from '@/shared/config/theme-preferences-storage'
import {
    resolveBodyFontSizePx,
    resolveUiTextScaleFactorFromPrefs,
} from '@/shared/config/ui-text-scale'

export {
    normalizeThemePreferences,
    readStoredThemePreferences,
    readThemePreferencesOnBoot,
}

/** theme-boot.js 已写入且 mode/色调一致时，避免 clear+apply 造成闪色 */
export function isThemeBootApplied(prefs: ThemePreferences, mode?: ThemeMode): boolean {
    if (typeof document === 'undefined') return false
    const root = document.documentElement
    if (root.getAttribute('data-dw-theme-boot') !== '1') return false
    const resolved = mode ?? resolveThemeMode(prefs.appearance, getSystemPrefersDark())
    if (root.getAttribute('data-theme') !== resolved) return false
    if (root.getAttribute('data-bg-tone') !== prefs.background) return false
    const skin = prefs.uiSkin ?? DEFAULT_THEME_PREFERENCES.uiSkin
    if (root.getAttribute('data-ui-skin') !== skin) return false
    const uiFont = prefs.uiFont ?? DEFAULT_THEME_PREFERENCES.uiFont
    if (root.getAttribute('data-ui-font') !== uiFont) return false
    const uiTextScale = prefs.uiTextScale ?? DEFAULT_THEME_PREFERENCES.uiTextScale
    if (root.getAttribute('data-ui-text-scale') !== uiTextScale) return false
    if (uiTextScale === 'custom') {
        const px = resolveBodyFontSizePx(prefs)
        if (root.getAttribute('data-ui-font-size-px') !== String(px)) return false
    } else if (root.getAttribute('data-ui-font-size-px')) {
        return false
    }
    const uiDensity = prefs.uiDensity ?? DEFAULT_THEME_PREFERENCES.uiDensity
    if (root.getAttribute('data-ui-density') !== uiDensity) return false
    return true
}

/** 在 Vue 挂载前同步主题，避免刷新时闪烁或配色错乱 */
export function bootstrapTheme(): void {
    if (typeof document === 'undefined') return
    const prefs = readThemePreferencesOnBoot()
    const mode = resolveThemeMode(prefs.appearance, getSystemPrefersDark())
    if (!isThemeBootApplied(prefs, mode)) {
        applyThemePreferences(prefs, mode)
    }
    syncThemePrefsToDesktopHost(prefs)
}

function syncThemePrefsToDesktopHost(prefs: ThemePreferences): void {
    if (typeof window === 'undefined' || !readDatawiseHost()) return
    persistDesktopThemePrefs(prefs)
}

export function persistThemePreferences(prefs: ThemePreferences) {
    if (!canPersistLocalResource(UserResource.ThemePreferences)) return
    const raw = JSON.stringify(prefs)
    // Desktop: machine last-write only (unscoped). Scoped :user:* keys cause boot flash vs host seed.
    if (isNativeDesktopHost()) {
        localStorage.setItem(THEME_STORAGE_KEY, raw)
        syncThemePrefsToDesktopHost(prefs)
        return
    }
    const key = resolveResourceStorageKey(UserResource.ThemePreferences, THEME_STORAGE_KEY)
        ?? THEME_STORAGE_KEY
    localStorage.setItem(key, raw)
}

export function getSystemPrefersDark(): boolean {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function applyThemePreferences(
    prefs: ThemePreferences,
    resolvedMode?: ThemeMode,
    options?: { force?: boolean },
) {
    const root = document.documentElement
    const mode = resolvedMode ?? resolveThemeMode(prefs.appearance, getSystemPrefersDark())
    if (!options?.force && isThemeBootApplied(prefs, mode)) {
        return
    }

    const skin = prefs.uiSkin ?? DEFAULT_THEME_PREFERENCES.uiSkin
    const uiFont = prefs.uiFont ?? DEFAULT_THEME_PREFERENCES.uiFont
    const uiTextScale = prefs.uiTextScale ?? DEFAULT_THEME_PREFERENCES.uiTextScale
    const uiDensity = prefs.uiDensity ?? DEFAULT_THEME_PREFERENCES.uiDensity
    const bodyPx = resolveBodyFontSizePx(prefs)
    const textScaleFactor = resolveUiTextScaleFactorFromPrefs(prefs)
    clearManagedThemeVars(root)
    root.setAttribute('data-theme', mode)
    root.setAttribute('data-bg-tone', prefs.background)
    root.setAttribute('data-ui-skin', skin)
    root.setAttribute('data-ui-font', uiFont)
    root.setAttribute('data-ui-text-scale', uiTextScale)
    root.setAttribute('data-ui-density', uiDensity)
    if (uiTextScale === 'custom') {
        root.setAttribute('data-ui-font-size-px', String(bodyPx))
    } else {
        root.removeAttribute('data-ui-font-size-px')
    }
    root.style.colorScheme = mode
    // Shell UI font (not cleared by MANAGED_THEME_VARS — set every apply)
    root.style.setProperty('--dw-font', resolveUiFontStack(uiFont, prefs.uiFontCustom))
    // Body size + factor for JS consumers (charts / plugin bridge); CSS ladder % of body
    root.style.setProperty('--dw-font-size', `${bodyPx}px`)
    root.style.setProperty('--dw-ui-text-scale', String(textScaleFactor))

    const vars = buildThemeVars(
        mode as PkgThemeMode,
        prefs.background as PkgBackgroundTone,
        prefs.primary as PkgPrimaryTone,
        skin as PkgUiSkin,
    )
    for (const [name, value] of Object.entries(vars)) {
        root.style.setProperty(name, value)
    }
    let chromeBg = vars['--dw-bg-chrome']
    const hostChrome =
        typeof window !== 'undefined'
            ? (window as Window & {__DW_HOST_CHROME__?: string}).__DW_HOST_CHROME__
            : undefined
    // First paint: keep host chrome when already seeded (avoid recompute flash).
    if (!options?.force && typeof hostChrome === 'string' && hostChrome) {
        chromeBg = hostChrome
        vars['--dw-bg-chrome'] = chromeBg
        root.style.setProperty('--dw-bg-chrome', chromeBg)
    }
    if (chromeBg) {
        root.style.setProperty('--dw-boot-chrome', chromeBg)
        root.style.backgroundColor = chromeBg
        if (document.body) {
            document.body.style.backgroundColor = chromeBg
        }
        const w = window as Window & {__DW_BOOT_CHROME__?: string; __DW_HOST_CHROME__?: string}
        w.__DW_BOOT_CHROME__ = chromeBg
        if (options?.force) {
            w.__DW_HOST_CHROME__ = chromeBg
        }
    }
    root.setAttribute('data-dw-theme-boot', '1')
}

export function watchSystemTheme(
    onChange: (hint?: {appearance?: string; resolvedMode?: string; chromeBg?: string}) => void,
): () => void {
    if (typeof window === 'undefined') return () => {
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => onChange()
    mq.addEventListener('change', handler)

    // JCEF may not fire matchMedia when OS theme flips; host bridge pushes resolved mode + chromeBg.
    let unsubBridge: (() => void) | undefined
    try {
        const theme = (window.datawise ?? window.__datawiseDesktopBridge)?.theme
        if (theme?.onSystemChange) {
            unsubBridge = theme.onSystemChange((payload) => {
                onChange({
                    appearance: payload?.appearance,
                    resolvedMode: payload?.resolvedMode,
                    chromeBg: payload?.chromeBg,
                })
            })
        }
    } catch {
        // ignore
    }

    return () => {
        mq.removeEventListener('change', handler)
        unsubBridge?.()
    }
}
