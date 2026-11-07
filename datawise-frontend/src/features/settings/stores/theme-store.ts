import {defineStore} from 'pinia'
import {computed, ref} from 'vue'
import type {
    BackgroundTone,
    PrimaryTone,
    ThemeAppearance,
    ThemeMode,
    ThemePreferences,
    UiDensityId,
    UiFontId,
    UiTextScaleId,
} from '@/features/settings/constants/theme-presets'
import type {UiSkin} from '@/core/ui-skin'
import {
    UI_FONT_SIZE_PX_MD,
    clampUiFontSizePx,
    resolveThemeMode,
    sanitizeUiFontCustom,
} from '@/features/settings/constants/theme-presets'
import {
    applyThemePreferences,
    getSystemPrefersDark,
    isThemeBootApplied,
    normalizeThemePreferences,
    persistThemePreferences,
    readThemePreferencesOnBoot,
    watchSystemTheme,
} from '@/features/settings/services/theme.service'

/** 主题外观、配色与 UI 款式偏好 */
export const useThemeStore = defineStore('theme', () => {
    const storedTheme = readThemePreferencesOnBoot()

    const appearance = ref<ThemeAppearance>(storedTheme.appearance)
    const backgroundTone = ref<BackgroundTone>(storedTheme.background)
    const primaryTone = ref<PrimaryTone>(storedTheme.primary)
    const uiSkin = ref<UiSkin>(storedTheme.uiSkin)
    const uiFont = ref<UiFontId>(storedTheme.uiFont)
    const uiFontCustom = ref<string>(storedTheme.uiFontCustom ?? '')
    const uiTextScale = ref<UiTextScaleId>(storedTheme.uiTextScale)
    const uiFontSizePx = ref<number>(storedTheme.uiFontSizePx ?? UI_FONT_SIZE_PX_MD)
    const uiDensity = ref<UiDensityId>(storedTheme.uiDensity)
    const systemPrefersDark = ref(getSystemPrefersDark())

    const resolvedMode = computed<ThemeMode>(() =>
        resolveThemeMode(appearance.value, systemPrefersDark.value),
    )

    function currentPreferences(): ThemePreferences {
        return {
            appearance: appearance.value,
            background: backgroundTone.value,
            primary: primaryTone.value,
            uiSkin: uiSkin.value,
            uiFont: uiFont.value,
            uiFontCustom: uiFontCustom.value,
            uiTextScale: uiTextScale.value,
            uiFontSizePx: uiFontSizePx.value,
            uiDensity: uiDensity.value,
        }
    }

    function syncPreferences() {
        const prefs = currentPreferences()
        persistThemePreferences(prefs)
        applyThemePreferences(prefs, resolvedMode.value, {force: true})
    }

    {
        const prefs = currentPreferences()
        persistThemePreferences(prefs)
        if (!isThemeBootApplied(prefs, resolvedMode.value)) {
            applyThemePreferences(prefs, resolvedMode.value)
        }
    }
    watchSystemTheme((hint) => {
        if (hint?.appearance === 'dark' || hint?.appearance === 'light') {
            systemPrefersDark.value = hint.appearance === 'dark'
        } else {
            systemPrefersDark.value = getSystemPrefersDark()
        }
        // OS flip: re-apply colors only. Keep appearance=system; host already refreshed chromeBg.
        if (appearance.value === 'system') {
            const prefs = currentPreferences()
            applyThemePreferences(prefs, resolvedMode.value, {force: true})
            if (hint?.chromeBg && typeof document !== 'undefined') {
                const root = document.documentElement
                root.style.setProperty('--dw-boot-chrome', hint.chromeBg)
                root.style.setProperty('--dw-bg-chrome', hint.chromeBg)
                root.style.backgroundColor = hint.chromeBg
                ;(window as Window & {__DW_HOST_CHROME__?: string; __DW_BOOT_CHROME__?: string}).__DW_HOST_CHROME__ =
                    hint.chromeBg
                ;(window as Window & {__DW_BOOT_CHROME__?: string}).__DW_BOOT_CHROME__ = hint.chromeBg
            }
        }
    })

    function setAppearance(value: ThemeAppearance) {
        appearance.value = value
        syncPreferences()
    }

    function setMode(mode: ThemeMode) {
        setAppearance(mode)
    }

    function setBackgroundTone(tone: BackgroundTone) {
        backgroundTone.value = tone
        syncPreferences()
    }

    function setPrimaryTone(tone: PrimaryTone) {
        primaryTone.value = tone
        syncPreferences()
    }

    function setUiSkin(skin: UiSkin) {
        uiSkin.value = skin
        syncPreferences()
    }

    function setUiFont(font: UiFontId) {
        uiFont.value = font
        syncPreferences()
    }

    function setUiFontCustom(name: string) {
        uiFontCustom.value = sanitizeUiFontCustom(name)
        if (uiFont.value !== 'custom') {
            uiFont.value = 'custom'
        }
        syncPreferences()
    }

    function setUiTextScale(scale: UiTextScaleId) {
        uiTextScale.value = scale
        syncPreferences()
    }

    function setUiFontSizePx(px: number) {
        uiFontSizePx.value = clampUiFontSizePx(px)
        if (uiTextScale.value !== 'custom') {
            uiTextScale.value = 'custom'
        }
        syncPreferences()
    }

    function setUiDensity(density: UiDensityId) {
        uiDensity.value = density
        syncPreferences()
    }

    function toggleMode() {
        setAppearance(resolvedMode.value === 'light' ? 'dark' : 'light')
    }

    function importPreferences(prefs: ThemePreferences | Partial<ThemePreferences>) {
        const next = normalizeThemePreferences(prefs)
        appearance.value = next.appearance
        backgroundTone.value = next.background
        primaryTone.value = next.primary
        uiSkin.value = next.uiSkin
        uiFont.value = next.uiFont
        uiFontCustom.value = next.uiFontCustom ?? ''
        uiTextScale.value = next.uiTextScale
        uiFontSizePx.value = next.uiFontSizePx ?? UI_FONT_SIZE_PX_MD
        uiDensity.value = next.uiDensity
        syncPreferences()
    }

    return {
        appearance,
        backgroundTone,
        primaryTone,
        uiSkin,
        uiFont,
        uiFontCustom,
        uiTextScale,
        uiFontSizePx,
        uiDensity,
        resolvedMode,
        setAppearance,
        setMode,
        setBackgroundTone,
        setPrimaryTone,
        setUiSkin,
        setUiFont,
        setUiFontCustom,
        setUiTextScale,
        setUiFontSizePx,
        setUiDensity,
        toggleMode,
        importPreferences,
    }
})
