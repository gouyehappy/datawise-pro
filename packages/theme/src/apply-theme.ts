/**
 * Pure theme application — writes CSS vars + data attributes to an HTMLElement.
 * No auth, UserResource, desktop bridge, or Pinia.
 */
import {
    BACKGROUND_PRESETS_DARK,
    BACKGROUND_PRESETS_LIGHT,
    DEFAULT_THEME_PREFERENCES,
    PRIMARY_PRESETS,
    resolveBodyFontSizePx,
    resolveThemeMode,
    resolveUiFontStack,
    resolveUiSkinDefinition,
    resolveUiTextScaleFactorFromPrefs,
    type BackgroundTone,
    type PrimaryTone,
    type ThemeMode,
    type ThemePreferences,
    type UiSkin,
} from './types'

/** CSS variables cleared before each apply so mode switches leave no residue */
export const MANAGED_THEME_VARS = [
    '--dw-primary',
    '--dw-primary-hover',
    '--dw-primary-softer',
    '--dw-primary-mild',
    '--dw-primary-soft',
    '--dw-primary-tint',
    '--dw-primary-border',
    '--dw-primary-ring',
    '--dw-bg',
    '--dw-bg-muted',
    '--dw-bg-panel',
    '--dw-bg-hover',
    '--dw-bg-rail',
    '--dw-bg-editor',
    '--dw-bg-chrome',
    '--dw-border',
    '--dw-border-light',
    '--dw-panel-border',
    '--dw-panel-shadow',
    '--dw-text',
    '--dw-text-secondary',
    '--dw-text-muted',
    '--dw-text-dim',
    '--dw-tool-hover',
    '--dw-tool-active',
    '--dw-tool-pill-active',
    '--dw-tab-bar-bg',
    '--dw-tab-bar-border',
    '--dw-tab-active-bg',
    '--dw-tab-active-border',
    '--dw-tab-active-text',
    '--dw-tab-inactive-text',
    '--dw-tab-hover-bg',
    '--dw-tab-close-hover',
    '--dw-shadow',
    '--dw-menu-shadow',
] as const

const DARK_UI = {
    border: '#2e3440',
    borderLight: '#252b33',
    panelBorder: 'rgba(255, 255, 255, 0.12)',
    panelShadow: '0 1px 3px rgba(0, 0, 0, 0.28)',
    text: '#f0f0f3',
    textSecondary: '#d4d4d8',
    textMuted: '#c4c7cc',
    textDim: '#a8adb6',
    tabBarBg: '#161a20',
    tabBarBorder: '#1e242c',
    tabActiveBg: '#222831',
    tabActiveBorder: '#3574f0',
    tabActiveText: '#f4f4f7',
    tabInactiveText: '#c8c8d0',
    tabHoverBg: 'rgba(255, 255, 255, 0.1)',
    tabCloseHover: 'rgba(255, 255, 255, 0.12)',
    toolPillActive: '#2a3038',
    shadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
    menuShadow:
        '0 1px 2px rgba(0, 0, 0, 0.2), 0 4px 12px rgba(0, 0, 0, 0.24), 0 16px 40px rgba(0, 0, 0, 0.32)',
} as const

const LIGHT_UI = {
    border: '#e2e8f0',
    borderLight: '#eef2f7',
    panelBorder: 'rgba(15, 23, 42, 0.08)',
    panelShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
    text: '#111827',
    textSecondary: '#6b7280',
    textMuted: '#9ca3af',
    textDim: '#808080',
    chrome: '#dce4ee',
    tabBarBg: '#dce3ea',
    tabBarBorder: '#c5cdd8',
    tabActiveBg: '#ffffff',
    tabActiveBorder: '#2563eb',
    tabActiveText: '#1f2937',
    tabInactiveText: '#6b7280',
    tabHoverBg: 'rgba(0, 0, 0, 0.08)',
    tabCloseHover: 'rgba(0, 0, 0, 0.08)',
    shadow: '0 8px 24px rgba(15, 23, 42, 0.1)',
    menuShadow:
        '0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.06), 0 16px 40px rgba(15, 23, 42, 0.1)',
} as const

function withAlpha(hex: string, alpha: number): string {
    const normalized = hex.replace('#', '')
    const value = normalized.length === 3
        ? normalized.split('').map((c) => c + c).join('')
        : normalized
    const r = Number.parseInt(value.slice(0, 2), 16)
    const g = Number.parseInt(value.slice(2, 4), 16)
    const b = Number.parseInt(value.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function clearManagedThemeVars(root: HTMLElement): void {
    for (const name of MANAGED_THEME_VARS) {
        root.style.removeProperty(name)
    }
}

export function buildThemeVars(
    mode: ThemeMode,
    background: BackgroundTone,
    primaryTone: PrimaryTone,
    uiSkin: UiSkin = 'classic',
): Record<string, string> {
    const primary = PRIMARY_PRESETS[primaryTone] ?? PRIMARY_PRESETS.blue
    const surfaces = mode === 'dark'
        ? BACKGROUND_PRESETS_DARK[background] ?? BACKGROUND_PRESETS_DARK.cool
        : BACKGROUND_PRESETS_LIGHT[background] ?? BACKGROUND_PRESETS_LIGHT.cool
    const ui = mode === 'dark' ? DARK_UI : LIGHT_UI
    const skinDef = resolveUiSkinDefinition(uiSkin)
    const caps = skinDef.capabilities
    const panelShadow = caps.panelShadow === 'none' ? 'none' : ui.panelShadow

    const chrome = mode === 'dark' ? surfaces.rail : LIGHT_UI.chrome
    const tabStrip = caps.tabStyle === 'strip'

    return {
        '--dw-primary': primary.primary,
        '--dw-primary-hover': primary.hover,
        '--dw-primary-softer': withAlpha(primary.primary, mode === 'dark' ? 0.08 : 0.06),
        '--dw-primary-mild': withAlpha(primary.primary, mode === 'dark' ? 0.16 : 0.1),
        '--dw-primary-soft': withAlpha(primary.primary, mode === 'dark' ? 0.14 : 0.12),
        '--dw-primary-tint': mode === 'dark'
            ? `color-mix(in srgb, ${primary.primary} 18%, var(--dw-bg-panel))`
            : `color-mix(in srgb, ${primary.primary} 11%, var(--dw-bg))`,
        '--dw-primary-border': withAlpha(primary.primary, 0.45),
        '--dw-primary-ring': withAlpha(primary.primary, mode === 'dark' ? 0.34 : 0.22),
        '--dw-bg': surfaces.bg,
        '--dw-bg-muted': surfaces.muted,
        '--dw-bg-panel': surfaces.panel,
        '--dw-bg-hover': surfaces.hover,
        '--dw-bg-rail': surfaces.rail,
        '--dw-bg-editor': surfaces.bg,
        '--dw-bg-chrome': chrome,
        '--dw-border': ui.border,
        '--dw-border-light': ui.borderLight,
        '--dw-panel-border': ui.panelBorder,
        '--dw-panel-shadow': panelShadow,
        '--dw-text': ui.text,
        '--dw-text-secondary': ui.textSecondary,
        '--dw-text-muted': ui.textMuted,
        '--dw-text-dim': ui.textDim,
        '--dw-tool-hover': mode === 'dark'
            ? 'color-mix(in srgb, #fff 7%, transparent)'
            : 'color-mix(in srgb, var(--dw-text) 6%, transparent)',
        '--dw-tool-active': `color-mix(in srgb, ${primary.primary} 10%, var(--dw-bg-rail))`,
        '--dw-tool-pill-active': mode === 'dark'
            ? DARK_UI.toolPillActive
            : 'color-mix(in srgb, var(--dw-text) 9%, var(--dw-bg-hover))',
        '--dw-tab-bar-bg': tabStrip ? chrome : ui.tabBarBg,
        '--dw-tab-bar-border': tabStrip ? ui.panelBorder : ui.tabBarBorder,
        '--dw-tab-active-bg': tabStrip ? surfaces.bg : ui.tabActiveBg,
        '--dw-tab-active-border': tabStrip ? 'transparent' : ui.tabActiveBorder,
        '--dw-tab-active-text': tabStrip ? ui.text : ui.tabActiveText,
        '--dw-tab-inactive-text': ui.tabInactiveText,
        '--dw-tab-hover-bg': tabStrip
            ? (mode === 'dark'
                ? 'color-mix(in srgb, #fff 5%, transparent)'
                : 'color-mix(in srgb, var(--dw-text) 6%, transparent)')
            : ui.tabHoverBg,
        '--dw-tab-close-hover': tabStrip
            ? (mode === 'dark'
                ? 'color-mix(in srgb, #fff 10%, transparent)'
                : 'color-mix(in srgb, var(--dw-text) 10%, transparent)')
            : ui.tabCloseHover,
        '--dw-shadow': ui.shadow,
        '--dw-menu-shadow': ui.menuShadow,
    }
}

export interface ApplyThemeOptions {
    /** Target element (default: document.documentElement when available) */
    root?: HTMLElement
    /** Pre-resolved light/dark; otherwise derived from appearance + systemPrefersDark */
    resolvedMode?: ThemeMode
    systemPrefersDark?: boolean
    /** Also paint body / --dw-boot-chrome when document is available */
    paintChromeBackground?: boolean
}

/**
 * Apply theme preferences to an HTMLElement (documentElement by default).
 */
export function applyTheme(
    prefs: ThemePreferences,
    options: ApplyThemeOptions = {},
): {mode: ThemeMode; vars: Record<string, string>} {
    const root =
        options.root
        ?? (typeof document !== 'undefined' ? document.documentElement : undefined)
    if (!root) {
        throw new Error('applyTheme: no root HTMLElement (pass options.root outside DOM)')
    }

    const mode =
        options.resolvedMode
        ?? resolveThemeMode(prefs.appearance, options.systemPrefersDark ?? false)

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
    root.style.setProperty('--dw-font', resolveUiFontStack(uiFont, prefs.uiFontCustom))
    root.style.setProperty('--dw-font-size', `${bodyPx}px`)
    root.style.setProperty('--dw-ui-text-scale', String(textScaleFactor))

    const vars = buildThemeVars(mode, prefs.background, prefs.primary, skin)
    for (const [name, value] of Object.entries(vars)) {
        root.style.setProperty(name, value)
    }

    const paintChrome = options.paintChromeBackground !== false
    const chromeBg = vars['--dw-bg-chrome']
    if (paintChrome && chromeBg) {
        root.style.setProperty('--dw-boot-chrome', chromeBg)
        root.style.backgroundColor = chromeBg
        if (typeof document !== 'undefined' && document.body) {
            document.body.style.backgroundColor = chromeBg
        }
    }

    root.setAttribute('data-dw-theme-boot', '1')
    return {mode, vars}
}

/** Alias matching Host naming */
export const applyThemePreferences = applyTheme
