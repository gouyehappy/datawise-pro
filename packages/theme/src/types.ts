/**
 * Theme preference types + presets (framework-pure; no Host @/ imports).
 */

export type ThemeMode = 'light' | 'dark'
export type ThemeAppearance = ThemeMode | 'system'
export type BackgroundTone = 'default' | 'warm' | 'cool' | 'slate'
export type PrimaryTone = 'violet' | 'blue' | 'cyan' | 'green' | 'orange' | 'rose'
export type UiSkin = 'classic' | 'ide' | 'atelier' | 'ledger'

/** Shell UI font (not Monaco / terminal). */
export type UiFontId =
    | 'geist'
    | 'noto'
    | 'system'
    | 'segoe'
    | 'yahei'
    | 'pingfang'
    | 'sourceHan'
    | 'harmony'
    | 'custom'

/** Shell UI text size scale (not Monaco). Applied as data-ui-text-scale. */
export type UiTextScaleId = 'sm' | 'md' | 'lg' | 'custom'

/** Shell control density (heights / compact chrome). Applied as data-ui-density. */
export type UiDensityId = 'sm' | 'md' | 'lg'

export interface ThemePreferences {
    appearance: ThemeAppearance
    background: BackgroundTone
    primary: PrimaryTone
    uiSkin: UiSkin
    /** Interface chrome font; applied as --dw-font */
    uiFont: UiFontId
    /** Primary family name when uiFont === 'custom' */
    uiFontCustom?: string
    /** Interface chrome text size; applied as data-ui-text-scale */
    uiTextScale: UiTextScaleId
    /** Body px when uiTextScale === 'custom' (clamped 11–18) */
    uiFontSizePx?: number
    /** Interface control density; applied as data-ui-density */
    uiDensity: UiDensityId
}

export interface UiSkinCapabilities {
    panelShadow: 'inherit' | 'none'
    shellFlush: boolean
    activityBarLabels: boolean
    tabStyle: 'pill' | 'strip'
}

export interface UiSkinDefinition {
    id: UiSkin
    capabilities: UiSkinCapabilities
}

export const UI_SKIN_DEFINITIONS: readonly UiSkinDefinition[] = [
    {
        id: 'classic',
        capabilities: {
            panelShadow: 'inherit',
            shellFlush: false,
            activityBarLabels: true,
            tabStyle: 'pill',
        },
    },
    {
        id: 'ide',
        capabilities: {
            panelShadow: 'none',
            shellFlush: true,
            activityBarLabels: true,
            tabStyle: 'strip',
        },
    },
    {
        id: 'atelier',
        capabilities: {
            panelShadow: 'inherit',
            shellFlush: false,
            activityBarLabels: true,
            tabStyle: 'pill',
        },
    },
    {
        id: 'ledger',
        capabilities: {
            panelShadow: 'none',
            shellFlush: true,
            activityBarLabels: true,
            tabStyle: 'strip',
        },
    },
] as const

export const UI_SKIN_IDS: UiSkin[] = UI_SKIN_DEFINITIONS.map((item) => item.id)

export function resolveUiSkinDefinition(id: UiSkin | string | undefined): UiSkinDefinition {
    return UI_SKIN_DEFINITIONS.find((item) => item.id === id) ?? UI_SKIN_DEFINITIONS[0]
}

export const UI_FONT_IDS: UiFontId[] = [
    'geist',
    'noto',
    'system',
    'segoe',
    'yahei',
    'pingfang',
    'sourceHan',
    'harmony',
    'custom',
]
export const UI_TEXT_SCALE_IDS: UiTextScaleId[] = ['sm', 'md', 'lg', 'custom']
export const UI_DENSITY_IDS: UiDensityId[] = ['sm', 'md', 'lg']

export const UI_FONT_SIZE_PX_MIN = 11
export const UI_FONT_SIZE_PX_MAX = 18
export const UI_FONT_SIZE_PX_STEP = 0.5
export const UI_FONT_SIZE_PX_MD = 13.5

export const UI_FONT_SIZE_PX_BY_SCALE: Record<'sm' | 'md' | 'lg', number> = {
    sm: 12,
    md: UI_FONT_SIZE_PX_MD,
    lg: 15,
}

export const UI_TEXT_SCALE_FACTOR: Record<'sm' | 'md' | 'lg', number> = {
    sm: UI_FONT_SIZE_PX_BY_SCALE.sm / UI_FONT_SIZE_PX_MD,
    md: 1,
    lg: UI_FONT_SIZE_PX_BY_SCALE.lg / UI_FONT_SIZE_PX_MD,
}

export const UI_FONT_STACKS: Record<Exclude<UiFontId, 'custom'>, string> = {
    geist:
        "'Geist Variable', 'Geist', 'Noto Sans SC Variable', 'Noto Sans SC', 'Segoe UI Variable', 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', system-ui, sans-serif",
    noto:
        "'Noto Sans SC Variable', 'Noto Sans SC', 'Segoe UI Variable', 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', 'Source Han Sans SC', 'HarmonyOS Sans SC', system-ui, sans-serif",
    system:
        "system-ui, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif",
    segoe:
        "'Segoe UI Variable', 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', system-ui, sans-serif",
    yahei:
        "'Microsoft YaHei UI', 'Microsoft YaHei', 'Segoe UI', system-ui, sans-serif",
    pingfang:
        "'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', 'Microsoft YaHei', system-ui, sans-serif",
    sourceHan:
        "'Source Han Sans SC', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif",
    harmony:
        "'HarmonyOS Sans SC', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif",
}

const SYSTEM_FALLBACK_STACK =
    "system-ui, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif"

export function isUiFontId(value: unknown): value is UiFontId {
    return typeof value === 'string' && (UI_FONT_IDS as string[]).includes(value)
}

export function isUiTextScaleId(value: unknown): value is UiTextScaleId {
    return typeof value === 'string' && (UI_TEXT_SCALE_IDS as string[]).includes(value)
}

export function isUiDensityId(value: unknown): value is UiDensityId {
    return typeof value === 'string' && (UI_DENSITY_IDS as string[]).includes(value)
}

export function clampUiFontSizePx(value: unknown): number {
    const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
    if (!Number.isFinite(n)) return UI_FONT_SIZE_PX_MD
    const stepped = Math.round(n / UI_FONT_SIZE_PX_STEP) * UI_FONT_SIZE_PX_STEP
    return Math.min(UI_FONT_SIZE_PX_MAX, Math.max(UI_FONT_SIZE_PX_MIN, stepped))
}

export function sanitizeUiFontCustom(value: unknown): string {
    if (typeof value !== 'string') return ''
    return value.replace(/['";{}\\]/g, '').trim().slice(0, 64)
}

export function buildCustomUiFontStack(familyName: string): string {
    const name = sanitizeUiFontCustom(familyName)
    if (!name) return UI_FONT_STACKS.system
    const quoted = name.includes(' ') ? `'${name}'` : name
    return `${quoted}, ${SYSTEM_FALLBACK_STACK}`
}

export function resolveUiFontStack(
    id: UiFontId | string | undefined | null,
    customName?: string | null,
): string {
    if (id === 'custom') return buildCustomUiFontStack(customName || '')
    if (isUiFontId(id) && id !== 'custom') return UI_FONT_STACKS[id]
    return UI_FONT_STACKS.noto
}

export function resolveUiFontSizePx(
    prefs: Pick<ThemePreferences, 'uiTextScale' | 'uiFontSizePx'>,
): number | null {
    if (prefs.uiTextScale !== 'custom') return null
    return clampUiFontSizePx(prefs.uiFontSizePx ?? UI_FONT_SIZE_PX_MD)
}

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

export function resolveUiTextScaleFactorFromPrefs(
    prefs: Pick<ThemePreferences, 'uiTextScale' | 'uiFontSizePx'>,
): number {
    if (prefs.uiTextScale === 'custom') {
        const px = resolveUiFontSizePx(prefs) ?? UI_FONT_SIZE_PX_MD
        return px / UI_FONT_SIZE_PX_MD
    }
    if (prefs.uiTextScale === 'sm' || prefs.uiTextScale === 'lg') {
        return UI_TEXT_SCALE_FACTOR[prefs.uiTextScale]
    }
    return UI_TEXT_SCALE_FACTOR.md
}

export const DEFAULT_THEME_PREFERENCES: ThemePreferences = {
    appearance: 'system',
    background: 'cool',
    primary: 'blue',
    uiSkin: 'classic',
    uiFont: 'geist',
    uiFontCustom: '',
    uiTextScale: 'md',
    uiFontSizePx: UI_FONT_SIZE_PX_MD,
    uiDensity: 'md',
}

export function resolveThemeMode(appearance: ThemeAppearance, systemPrefersDark = false): ThemeMode {
    if (appearance === 'system') return systemPrefersDark ? 'dark' : 'light'
    return appearance
}

interface BgTokens {
    bg: string
    muted: string
    panel: string
    hover: string
    rail: string
}

interface PrimaryTokens {
    primary: string
    hover: string
}

export const PRIMARY_PRESETS: Record<PrimaryTone, PrimaryTokens> = {
    violet: {primary: '#7c3aed', hover: '#6d28d9'},
    blue: {primary: '#2563eb', hover: '#1d4ed8'},
    cyan: {primary: '#0891b2', hover: '#0e7490'},
    green: {primary: '#16a34a', hover: '#15803d'},
    orange: {primary: '#ea580c', hover: '#c2410c'},
    rose: {primary: '#e11d48', hover: '#be123c'},
}

export const BACKGROUND_PRESETS_LIGHT: Record<BackgroundTone, BgTokens> = {
    default: {
        bg: '#ffffff',
        muted: '#f8f9fb',
        panel: '#fafbfc',
        hover: '#f3f4f6',
        rail: '#f5f6f8',
    },
    warm: {
        bg: '#faf9f7',
        muted: '#f5f3ef',
        panel: '#f7f5f1',
        hover: '#ede9e3',
        rail: '#f0ece6',
    },
    cool: {
        bg: '#f8fafc',
        muted: '#f1f5f9',
        panel: '#f4f7fb',
        hover: '#e8eef5',
        rail: '#eef2f7',
    },
    slate: {
        bg: '#f4f6f8',
        muted: '#eceff3',
        panel: '#f0f2f5',
        hover: '#e2e6eb',
        rail: '#e8ebef',
    },
}

export const BACKGROUND_PRESETS_DARK: Record<BackgroundTone, BgTokens> = {
    default: {
        bg: '#0c0c0e',
        muted: '#141416',
        panel: '#18181b',
        hover: '#222226',
        rail: '#080809',
    },
    warm: {
        bg: '#100e0c',
        muted: '#171512',
        panel: '#1c1a16',
        hover: '#27241f',
        rail: '#0c0a08',
    },
    cool: {
        bg: '#0c1015',
        muted: '#121820',
        panel: '#171e27',
        hover: '#1f2936',
        rail: '#090c10',
    },
    slate: {
        bg: '#0e1013',
        muted: '#15191e',
        panel: '#1a1f25',
        hover: '#242a32',
        rail: '#0a0c0f',
    },
}
