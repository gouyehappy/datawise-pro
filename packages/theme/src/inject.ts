/**
 * Stable Host Adapter inject Symbols (framework ↔ Host App).
 * Hosts may provide implementations; consumers must tolerate missing injects.
 */
export const DW_UI_I18N = Symbol('dw.ui.i18n')
export const DW_TOAST = Symbol('dw.toast')
export const DW_CLIPBOARD = Symbol('dw.clipboard')
export const DW_PERSISTENCE = Symbol('dw.persistence')
export const DW_THEME_STORAGE = Symbol('dw.theme.storage')
