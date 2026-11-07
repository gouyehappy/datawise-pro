import {
    DEFAULT_THEME_PREFERENCES,
    THEME_STORAGE_KEY,
    UI_FONT_SIZE_PX_MD,
    clampUiFontSizePx,
    isUiDensityId,
    isUiFontId,
    isUiTextScaleId,
    sanitizeUiFontCustom,
    type BackgroundTone,
    type PrimaryTone,
    type ThemeAppearance,
    type ThemeMode,
    type ThemePreferences,
    type UiDensityId,
    type UiFontId,
    type UiTextScaleId,
    type UiSkin,
} from '@/shared/config/theme-presets'
import {isRegisteredUiSkin} from '@/core/ui-skin'
import {resolveAppConfigStorageKey} from '@/shared/config/app-config-storage-scope'
import {UserResource} from '@/shared/auth/user-resource.types'
import {
    canReadResource,
    resolveResourceStorageKey,
} from '@/shared/auth/user-resource-policy'
import {isNativeDesktopHost} from '@/shared/browser/desktop-bridge'

const BACKGROUND_TONES: BackgroundTone[] = ['default', 'warm', 'cool', 'slate']
const PRIMARY_TONES: PrimaryTone[] = ['violet', 'blue', 'cyan', 'green', 'orange', 'rose']
const APPEARANCES: ThemeAppearance[] = ['light', 'dark', 'system']

function isBackgroundTone(value: unknown): value is BackgroundTone {
    return typeof value === 'string' && BACKGROUND_TONES.includes(value as BackgroundTone)
}

function isPrimaryTone(value: unknown): value is PrimaryTone {
    return typeof value === 'string' && PRIMARY_TONES.includes(value as PrimaryTone)
}

function isThemeAppearance(value: unknown): value is ThemeAppearance {
    return typeof value === 'string' && APPEARANCES.includes(value as ThemeAppearance)
}

function isUiSkin(value: unknown): value is UiSkin {
    return isRegisteredUiSkin(value)
}

function readUiFont(value: unknown): UiFontId {
    return isUiFontId(value) ? value : DEFAULT_THEME_PREFERENCES.uiFont
}

function readUiTextScale(value: unknown): UiTextScaleId {
    return isUiTextScaleId(value) ? value : DEFAULT_THEME_PREFERENCES.uiTextScale
}

function readUiDensity(value: unknown): UiDensityId {
    return isUiDensityId(value) ? value : DEFAULT_THEME_PREFERENCES.uiDensity
}

function readAppearance(parsed: Partial<ThemePreferences> & {mode?: ThemeMode}): ThemeAppearance {
    if (isThemeAppearance(parsed.appearance)) return parsed.appearance
    if (parsed.mode === 'dark') return 'dark'
    return 'light'
}

export function normalizeThemePreferences(
    parsed: Partial<ThemePreferences> & {mode?: ThemeMode} = {},
): ThemePreferences {
    const uiFont = readUiFont(parsed.uiFont)
    const uiTextScale = readUiTextScale(parsed.uiTextScale)
    return {
        appearance: readAppearance(parsed),
        background: isBackgroundTone(parsed.background)
            ? parsed.background
            : DEFAULT_THEME_PREFERENCES.background,
        primary: isPrimaryTone(parsed.primary) ? parsed.primary : DEFAULT_THEME_PREFERENCES.primary,
        uiSkin: isUiSkin(parsed.uiSkin) ? parsed.uiSkin : DEFAULT_THEME_PREFERENCES.uiSkin,
        uiFont,
        uiFontCustom: sanitizeUiFontCustom(
            parsed.uiFontCustom ?? DEFAULT_THEME_PREFERENCES.uiFontCustom,
        ),
        uiTextScale,
        uiFontSizePx: clampUiFontSizePx(
            parsed.uiFontSizePx ?? DEFAULT_THEME_PREFERENCES.uiFontSizePx ?? UI_FONT_SIZE_PX_MD,
        ),
        uiDensity: readUiDensity(parsed.uiDensity),
    }
}

function resolveThemeStorageKey(): string {
    // Desktop: host seeds unscoped key (machine last-write). Prefer that over :user:* / :guest.
    if (isNativeDesktopHost()) {
        return THEME_STORAGE_KEY
    }
    return resolveResourceStorageKey(UserResource.ThemePreferences, THEME_STORAGE_KEY)
        ?? THEME_STORAGE_KEY
}

/** True when the dedicated theme key already has a value (runtime authority present). */
export function themePreferencesStorageHasValue(): boolean {
    if (typeof localStorage === 'undefined') return false
    try {
        if (isNativeDesktopHost()) {
            return Boolean(localStorage.getItem(THEME_STORAGE_KEY))
        }
        const key = resolveResourceStorageKey(UserResource.ThemePreferences, THEME_STORAGE_KEY)
            ?? THEME_STORAGE_KEY
        return Boolean(localStorage.getItem(key))
    } catch {
        return false
    }
}

export function readStoredThemePreferences(): ThemePreferences {
    // Guest 可读不可写：退出登录后仍要沿用本机/scope 内已保存的界面款式与主题。
    if (!canReadResource(UserResource.ThemePreferences)) return {...DEFAULT_THEME_PREFERENCES}
    try {
        const raw = localStorage.getItem(resolveThemeStorageKey())
        if (!raw) return {...DEFAULT_THEME_PREFERENCES}
        const parsed = JSON.parse(raw) as Partial<ThemePreferences> & {mode?: ThemeMode}
        return normalizeThemePreferences(parsed)
    } catch {
        return {...DEFAULT_THEME_PREFERENCES}
    }
}

/**
 * Runtime authority: `dw-cli-theme-prefs`.
 * App-config `theme` is import/export envelope only — hydrate when dedicated key is empty.
 */
export function hydrateThemePreferencesFromEnvelope(
    envelope: Partial<ThemePreferences> | null | undefined,
    apply: (prefs: ThemePreferences) => void,
): void {
    if (!envelope || themePreferencesStorageHasValue()) return
    apply(normalizeThemePreferences(envelope))
}

/** 启动时读取主题：桌面优先宿主 seed 的无后缀 key（本机 last-write）；Web 仍按用户 scope */
export function readThemePreferencesOnBoot(): ThemePreferences {
    // 仅按读权限裁决；写权限留给 persist，避免 guest 被误判回默认配色。
    if (!canReadResource(UserResource.ThemePreferences)) return {...DEFAULT_THEME_PREFERENCES}
    try {
        // Desktop host seeds `dw-cli-theme-prefs` (unscoped) before Vue boots.
        // Prefer that over `:user:*` scoped keys to avoid a second paint with a different theme.
        if (isNativeDesktopHost()) {
            const hostRaw = localStorage.getItem(THEME_STORAGE_KEY)
            if (hostRaw) {
                const parsed = JSON.parse(hostRaw) as Partial<ThemePreferences> & {mode?: ThemeMode}
                return normalizeThemePreferences(parsed)
            }
        }
        const themeKey = resolveResourceStorageKey(UserResource.ThemePreferences, THEME_STORAGE_KEY)
            ?? THEME_STORAGE_KEY
        if (localStorage.getItem(themeKey)) {
            return readStoredThemePreferences()
        }
        const raw = localStorage.getItem(resolveAppConfigStorageKey())
        if (raw) {
            const parsed = JSON.parse(raw) as {theme?: Partial<ThemePreferences> & {mode?: ThemeMode}}
            if (parsed.theme) {
                return normalizeThemePreferences(parsed.theme)
            }
        }
    } catch {
        /* fall through */
    }
    return readStoredThemePreferences()
}
