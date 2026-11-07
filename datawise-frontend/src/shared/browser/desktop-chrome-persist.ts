/**
 * Canonical machine chrome patch keys for desktop-chrome.json (last-write-wins).
 * Host also accepts legacy theme* aliases; new code must use these bare keys only.
 */
import {persistDesktopUiKeys} from '@/shared/browser/desktop-ui-store'
import {isNativeDesktopHost} from '@/shared/browser/desktop-bridge'
import type {ThemePreferences} from '@/shared/config/theme-presets'

export type DesktopChromePatch = {
    appearance?: string
    background?: string
    primary?: string
    uiSkin?: string
    uiFont?: string
    uiFontCustom?: string
    uiTextScale?: string
    uiFontSizePx?: string | number
    uiDensity?: string
    locale?: string
    zoomLevel?: string | number
    editorFontSize?: string | number
    editorFontFamily?: string
}

export function persistDesktopChromePatch(patch: DesktopChromePatch): void {
    if (!isNativeDesktopHost()) return
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === '') continue
        out[key] = String(value)
    }
    if (Object.keys(out).length === 0) return
    persistDesktopUiKeys(out)
}

export function persistDesktopThemePrefs(prefs: ThemePreferences): void {
    persistDesktopChromePatch({
        appearance: prefs.appearance,
        background: prefs.background,
        primary: prefs.primary,
        uiSkin: prefs.uiSkin ?? 'classic',
        uiFont: prefs.uiFont ?? 'geist',
        uiFontCustom: prefs.uiFontCustom || undefined,
        uiTextScale: prefs.uiTextScale ?? 'md',
        uiFontSizePx: prefs.uiTextScale === 'custom' ? prefs.uiFontSizePx : undefined,
        uiDensity: prefs.uiDensity ?? 'md',
    })
}
