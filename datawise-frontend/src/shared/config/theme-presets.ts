import type {UiSkin} from '@/core/ui-skin'
import {UI_SKIN_IDS} from '@/core/ui-skin'

export type ThemeMode = 'light' | 'dark'
export type ThemeAppearance = ThemeMode | 'system'
export type BackgroundTone = 'default' | 'warm' | 'cool' | 'slate'
export type PrimaryTone = 'violet' | 'blue' | 'cyan' | 'green' | 'orange' | 'rose'
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
export type {UiSkin}

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
    /**
     * Opt-in functional icon colors for toolbars / rails / tabs.
     * Explorer tree, DB marks, and plugin logos stay colored. Applied as html[data-icon-tones=on|off].
     */
    coloredToolbarIcons: boolean
    /**
     * Marks prefs written after the monochrome-default migration.
     * Missing → treat coloredToolbarIcons as false once, then persist this flag.
     */
    iconToneV2?: boolean
}

export const THEME_STORAGE_KEY = 'dw-cli-theme-prefs'
/** @deprecated 请用 @/core/ui-skin 的 UI_SKIN_IDS；保留兼容旧 import */
export const UI_SKINS: UiSkin[] = [...UI_SKIN_IDS]

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
export const UI_TEXT_SCALE_PRESET_IDS: Array<'sm' | 'md' | 'lg'> = ['sm', 'md', 'lg']
export const UI_DENSITY_IDS: UiDensityId[] = ['sm', 'md', 'lg']

/** Custom body size bounds (px). */
export const UI_FONT_SIZE_PX_MIN = 11
export const UI_FONT_SIZE_PX_MAX = 18
export const UI_FONT_SIZE_PX_STEP = 0.5
/** Reference body size for md — used to derive --dw-ui-text-scale when custom. */
export const UI_FONT_SIZE_PX_MD = 13.5

/**
 * CSS stacks for shell UI. Keep in sync with public/theme-boot.js UI_FONT_STACKS.
 * Default `geist` matches variables.css --dw-font (Geist Latin + Noto SC).
 */
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
    // Strip quotes / semicolons that could break CSS font-family lists.
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

/** Primary family name for SettingsSelect preview (use-option-font). */
export function resolveUiFontPreviewFamily(
    id: UiFontId,
    customName?: string | null,
): string {
    switch (id) {
        case 'system':
            return 'system-ui'
        case 'segoe':
            return 'Segoe UI'
        case 'yahei':
            return 'Microsoft YaHei'
        case 'pingfang':
            return 'PingFang SC'
        case 'sourceHan':
            return 'Source Han Sans SC'
        case 'harmony':
            return 'HarmonyOS Sans SC'
        case 'custom': {
            const name = sanitizeUiFontCustom(customName || '')
            return name || 'system-ui'
        }
        case 'noto':
            return 'Noto Sans SC'
        case 'geist':
        default:
            return 'Geist Variable'
    }
}

/** Resolved body px when custom; null means use CSS preset for sm/md/lg. */
export function resolveUiFontSizePx(
    prefs: Pick<ThemePreferences, 'uiTextScale' | 'uiFontSizePx'>,
): number | null {
    if (prefs.uiTextScale !== 'custom') return null
    return clampUiFontSizePx(prefs.uiFontSizePx ?? UI_FONT_SIZE_PX_MD)
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
    coloredToolbarIcons: false,
    iconToneV2: true,
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

/*
 * Dark（sync @datawise/theme）：中间略淡、四周 chrome 加重，对比收一收。
 */
export const BACKGROUND_PRESETS_DARK: Record<BackgroundTone, BgTokens> = {
    default: {
        bg: '#1a1b1e',
        muted: '#222326',
        panel: '#1e1f22',
        hover: '#323438',
        rail: '#2b2d30',
    },
    warm: {
        bg: '#1a1816',
        muted: '#221f1c',
        panel: '#1e1c19',
        hover: '#34302c',
        rail: '#2a2724',
    },
    cool: {
        bg: '#1a1b1e',
        muted: '#222326',
        panel: '#1e1f22',
        hover: '#323438',
        rail: '#2b2d30',
    },
    slate: {
        bg: '#181a1f',
        muted: '#21242a',
        panel: '#1c1e24',
        hover: '#32363e',
        rail: '#2a2d33',
    },
}
