/**
 * Shell UI text scale — single control for chrome typography.
 *
 * Runtime: `html[data-ui-text-scale]` + CSS in `styles/ui-text-scale.css`
 * Preference: `ThemePreferences.uiTextScale` (Settings → 基本 → 外观)
 *
 * Body token: `--dw-font-size` (sm/md/lg presets or custom px).
 * Type ladder: `--dw-text-*` as % of body (host + plugins).
 *
 * Keep out of this control (own settings): Monaco, xterm, desktop CEF zoom.
 * Community plugin iframes receive `--dw-ui-text-scale` / `--dw-font-size` /
 * `--font-sans` via the host bridge (host config wins; bootstrap fills defaults).
 * See `community-plugins/docs/PLUGIN_TYPOGRAPHY.md`.
 */
import {
    DEFAULT_THEME_PREFERENCES,
    UI_FONT_SIZE_PX_MD,
    UI_TEXT_SCALE_IDS,
    isUiTextScaleId,
    resolveUiFontSizePx,
    type ThemePreferences,
    type UiTextScaleId,
} from '@/shared/config/theme-presets'

export {UI_TEXT_SCALE_IDS, isUiTextScaleId, type UiTextScaleId}

/** Preset body px (keep in sync with ui-text-scale.css). */
export const UI_FONT_SIZE_PX_BY_SCALE: Record<'sm' | 'md' | 'lg', number> = {
    sm: 12,
    md: UI_FONT_SIZE_PX_MD,
    lg: 15,
}

/**
 * Relative multipliers vs md body (13.5px). Keep in sync with
 * styles/ui-text-scale.css and community workbench-bridge-bootstrap.js.
 */
export const UI_TEXT_SCALE_FACTOR: Record<'sm' | 'md' | 'lg', number> = {
    sm: UI_FONT_SIZE_PX_BY_SCALE.sm / UI_FONT_SIZE_PX_MD,
    md: 1,
    lg: UI_FONT_SIZE_PX_BY_SCALE.lg / UI_FONT_SIZE_PX_MD,
}

export const DEFAULT_UI_TEXT_SCALE: UiTextScaleId = DEFAULT_THEME_PREFERENCES.uiTextScale

/** Surfaces that inherit shell scale via CSS tokens. */
export const UI_TEXT_SCALE_SHELL_SURFACES = [
    'menus',
    'context-menu',
    'tab-bar',
    'titlebar',
    'explorer',
    'settings',
    'modals',
    'markdown-toc',
    'data-grid-chrome',
    'ai-chrome',
] as const

/**
 * Surfaces that keep an existing independent control — do NOT add more settings;
 * do NOT invent parallel scale prefs. Prefer bridging factor later if needed.
 */
export const UI_TEXT_SCALE_EXCLUDED_SURFACES = [
    'monaco-editor',
    'desktop-zoom',
    'lock-screen-branding',
] as const

export function resolveUiTextScaleId(value: unknown): UiTextScaleId {
    return isUiTextScaleId(value) ? value : DEFAULT_UI_TEXT_SCALE
}

/** Factor for presets only; custom → use resolveUiTextScaleFactorFromPrefs. */
export function resolveUiTextScaleFactor(value: unknown): number {
    const id = resolveUiTextScaleId(value)
    if (id === 'custom') return 1
    return UI_TEXT_SCALE_FACTOR[id]
}

export function resolveUiTextScaleFactorFromPrefs(
    prefs: Pick<ThemePreferences, 'uiTextScale' | 'uiFontSizePx'>,
): number {
    if (prefs.uiTextScale === 'custom') {
        const px = resolveUiFontSizePx(prefs) ?? UI_FONT_SIZE_PX_MD
        return px / UI_FONT_SIZE_PX_MD
    }
    return resolveUiTextScaleFactor(prefs.uiTextScale)
}

/** Resolved body px for any scale (preset or custom). */
export function resolveBodyFontSizePx(
    prefs: Pick<ThemePreferences, 'uiTextScale' | 'uiFontSizePx'>,
): number {
    if (prefs.uiTextScale === 'custom') {
        return resolveUiFontSizePx(prefs) ?? UI_FONT_SIZE_PX_MD
    }
    if (prefs.uiTextScale === 'sm' || prefs.uiTextScale === 'lg') {
        return UI_FONT_SIZE_PX_BY_SCALE[prefs.uiTextScale]
    }
    return UI_FONT_SIZE_PX_BY_SCALE.md
}

/** Read live factor from document (after theme apply). */
export function readDocumentUiTextScaleFactor(
    root: HTMLElement | null = typeof document !== 'undefined' ? document.documentElement : null,
): number {
    if (!root) return UI_TEXT_SCALE_FACTOR.md
    const readCss = root.style?.getPropertyValue?.bind(root.style)
    const css = readCss ? readCss('--dw-ui-text-scale').trim() : ''
    const n = Number.parseFloat(css)
    if (Number.isFinite(n) && n > 0) return n
    const attr = root.getAttribute?.('data-ui-text-scale')
    if (attr === 'sm' || attr === 'md' || attr === 'lg') return UI_TEXT_SCALE_FACTOR[attr]
    return UI_TEXT_SCALE_FACTOR.md
}
