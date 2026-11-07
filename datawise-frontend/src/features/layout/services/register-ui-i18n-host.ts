import {provide} from 'vue'
import {useI18n} from 'vue-i18n'
import {DW_UI_I18N} from '@datawise/theme'

let registered = false

/**
 * Bridge vue-i18n → `DW_UI_I18N` so `@datawise/overlays` / `@datawise/ui`
 * components (ConfirmDialog, ModalActions, …) resolve host locale copy.
 * Call once from AppShell setup.
 */
export function registerUiI18nHost(): void {
  if (registered) return
  registered = true

  const {t} = useI18n()
  const keyAlias: Record<string, string> = {
    'secret.show': 'auth.showPassword',
    'secret.hide': 'auth.hidePassword',
    'toast.info': 'toast.kinds.info',
    'toast.success': 'toast.kinds.success',
    'toast.warning': 'toast.kinds.warning',
    'toast.error': 'toast.kinds.error',
    'common.collapse': 'common.collapse',
    'common.reload': 'common.reload',
    'common.panelLoading': 'common.panelLoading',
    'common.panelLoadFailedTitle': 'common.panelLoadFailedTitle',
    'common.panelLoadFailedHint': 'common.panelLoadFailedHint',
    'common.resizeColumn': 'common.resizeColumn',
    'common.searchablePopup.searchPlaceholder': 'common.searchablePopup.searchPlaceholder',
    'common.searchablePopup.empty': 'common.searchablePopup.empty',
  }
  provide(DW_UI_I18N, (key: string, params?: Record<string, string | number>) => {
    const resolved = keyAlias[key] ?? key
    return t(resolved, params as Record<string, unknown>)
  })
}
