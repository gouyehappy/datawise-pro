import {
    DEFAULT_EDITOR_SETTINGS,
    EDITOR_FONT_OPTIONS,
    EDITOR_FONT_SIZE_MAX,
    EDITOR_FONT_SIZE_MIN,
    EDITOR_LINE_HEIGHT_MAX,
    EDITOR_LINE_HEIGHT_MIN,
    EDITOR_STORAGE_KEY,
    EDITOR_THEME_OPTIONS,
    LEGACY_THEME_MAP,
    MAX_RESULT_ROWS_MIN,
    MAX_RESULT_ROWS_MAX,
    SLOW_QUERY_THRESHOLD_MAX,
    SLOW_QUERY_THRESHOLD_MIN,
    DEFAULT_GRID_PAGE_SIZE,
    GRID_PAGE_SIZE_OPTIONS,
    type EditorSettings,
    type EditorThemeId,
} from '@/shared/config/editor-presets'
import {UserResource} from '@/shared/auth/user-resource.types'
import {
    canPersistLocalResource,
    canReadResource,
    resolveResourceStorageKey,
} from '@/shared/auth/user-resource-policy'
import {isNativeDesktopHost} from '@/shared/browser/desktop-bridge'
import {persistDesktopChromePatch} from '@/shared/browser/desktop-chrome-persist'

const FONT_SET = new Set<string>(EDITOR_FONT_OPTIONS)

function resolveStorageKey(): string {
    // Desktop: host seeds unscoped key (machine last-write). Prefer that over :user:*.
    if (isNativeDesktopHost()) {
        return EDITOR_STORAGE_KEY
    }
    return resolveResourceStorageKey(UserResource.EditorPreferences, EDITOR_STORAGE_KEY)
        ?? EDITOR_STORAGE_KEY
}

function isEditorThemeId(value: unknown): value is EditorThemeId {
    if (typeof value !== 'string') return false
    if (EDITOR_THEME_OPTIONS.includes(value as EditorThemeId)) return true
    return value in LEGACY_THEME_MAP
}

function normalizeTheme(value: unknown): EditorThemeId {
    if (typeof value !== 'string') return DEFAULT_EDITOR_SETTINGS.theme
    if (EDITOR_THEME_OPTIONS.includes(value as EditorThemeId)) return value as EditorThemeId
    return LEGACY_THEME_MAP[value] ?? DEFAULT_EDITOR_SETTINGS.theme
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
    const num = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(num)) return fallback
    return Math.min(max, Math.max(min, num))
}

function normalizeGridPageSize(value: unknown): number {
    const num = clampNumber(
        value,
        DEFAULT_EDITOR_SETTINGS.defaultGridPageSize,
        DEFAULT_GRID_PAGE_SIZE,
        GRID_PAGE_SIZE_OPTIONS[GRID_PAGE_SIZE_OPTIONS.length - 1],
    )
    if (num <= 0) return DEFAULT_GRID_PAGE_SIZE
    if (GRID_PAGE_SIZE_OPTIONS.includes(num as (typeof GRID_PAGE_SIZE_OPTIONS)[number])) return num
    return DEFAULT_GRID_PAGE_SIZE
}

function sanitizeEditorSettingsFromPartial(parsed: Partial<EditorSettings>): EditorSettings {
    const fontFamily = typeof parsed.fontFamily === 'string' && parsed.fontFamily.trim()
        ? parsed.fontFamily.trim()
        : DEFAULT_EDITOR_SETTINGS.fontFamily
    return {
        theme: isEditorThemeId(parsed.theme) ? normalizeTheme(parsed.theme) : DEFAULT_EDITOR_SETTINGS.theme,
        fontFamily: FONT_SET.has(fontFamily) ? fontFamily : DEFAULT_EDITOR_SETTINGS.fontFamily,
        fontSize: clampNumber(parsed.fontSize, DEFAULT_EDITOR_SETTINGS.fontSize, EDITOR_FONT_SIZE_MIN, EDITOR_FONT_SIZE_MAX),
        lineHeight: clampNumber(parsed.lineHeight, DEFAULT_EDITOR_SETTINGS.lineHeight, EDITOR_LINE_HEIGHT_MIN, EDITOR_LINE_HEIGHT_MAX),
        lineNumbers: parsed.lineNumbers ?? DEFAULT_EDITOR_SETTINGS.lineNumbers,
        minimap: parsed.minimap ?? DEFAULT_EDITOR_SETTINGS.minimap,
        wordWrap: parsed.wordWrap ?? DEFAULT_EDITOR_SETTINGS.wordWrap,
        folding: parsed.folding ?? DEFAULT_EDITOR_SETTINGS.folding,
        maxResultRows: clampNumber(
            parsed.maxResultRows,
            DEFAULT_EDITOR_SETTINGS.maxResultRows,
            MAX_RESULT_ROWS_MIN,
            MAX_RESULT_ROWS_MAX,
        ),
        defaultGridPageSize: normalizeGridPageSize(parsed.defaultGridPageSize),
        slowQueryThresholdMs: clampNumber(
            parsed.slowQueryThresholdMs,
            DEFAULT_EDITOR_SETTINGS.slowQueryThresholdMs,
            SLOW_QUERY_THRESHOLD_MIN,
            SLOW_QUERY_THRESHOLD_MAX,
        ),
        productionPerfMode: typeof parsed.productionPerfMode === 'boolean'
            ? parsed.productionPerfMode
            : DEFAULT_EDITOR_SETTINGS.productionPerfMode,
    }
}

/** True when the dedicated editor key already has a value (runtime authority present). */
export function editorSettingsStorageHasValue(): boolean {
    if (typeof localStorage === 'undefined') return false
    try {
        return Boolean(localStorage.getItem(resolveStorageKey()))
    } catch {
        return false
    }
}

/**
 * Runtime authority: `dw-cli-editor-settings`.
 * App-config `editor` is import/export envelope only — hydrate when dedicated key is empty.
 */
export function hydrateEditorSettingsFromEnvelope(
    envelope: Partial<EditorSettings> | null | undefined,
    apply: (settings: EditorSettings) => void,
): void {
    if (!envelope || editorSettingsStorageHasValue()) return
    apply(sanitizeEditorSettingsFromPartial(envelope))
}

export function readStoredEditorSettings(): EditorSettings {
    // Guest 可读不可写：退出后仍读取本机 last-write / scope 内已保存的编辑器外观。
    if (!canReadResource(UserResource.EditorPreferences)) return {...DEFAULT_EDITOR_SETTINGS}
    try {
        const raw = localStorage.getItem(resolveStorageKey())
        if (!raw) return {...DEFAULT_EDITOR_SETTINGS}
        const parsed = JSON.parse(raw) as Partial<EditorSettings>
        return sanitizeEditorSettingsFromPartial(parsed)
    } catch {
        return {...DEFAULT_EDITOR_SETTINGS}
    }
}

export function persistEditorSettings(settings: EditorSettings) {
    if (!canPersistLocalResource(UserResource.EditorPreferences)) return
    localStorage.setItem(resolveStorageKey(), JSON.stringify(settings))
    if (isNativeDesktopHost()) {
        persistDesktopChromePatch({
            editorFontSize: settings.fontSize,
            editorFontFamily: settings.fontFamily,
        })
    }
}
