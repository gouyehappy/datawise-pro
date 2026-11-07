/**
 * Shell UI density — single control for control/toolbar/tab heights.
 *
 * Runtime: `html[data-ui-density]` + CSS in `styles/ui-density.css`
 * Preference: `ThemePreferences.uiDensity` (Settings → 基本 → 外观)
 *
 * New shell UI must use `--dw-density-*` / `--dw-control-h*` (never raw control heights)
 * so it follows this scale automatically.
 *
 * Orthogonal to uiTextScale (type size) and uiSkin (chrome language).
 */
import {
    DEFAULT_THEME_PREFERENCES,
    UI_DENSITY_IDS,
    isUiDensityId,
    type UiDensityId,
} from '@/shared/config/theme-presets'

export {UI_DENSITY_IDS, isUiDensityId, type UiDensityId}

export const DEFAULT_UI_DENSITY: UiDensityId = DEFAULT_THEME_PREFERENCES.uiDensity

export function resolveUiDensityId(value: unknown): UiDensityId {
    return isUiDensityId(value) ? value : DEFAULT_UI_DENSITY
}
