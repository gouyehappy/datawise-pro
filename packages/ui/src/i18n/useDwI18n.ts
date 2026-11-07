import {inject} from 'vue'
import {DW_UI_I18N} from '@datawise/theme'
import {createDwUiI18nFromDefaults, type DwUiI18nFn} from './defaults-en'

const fallback = createDwUiI18nFromDefaults()

/**
 * Resolve UI copy: inject(DW_UI_I18N) → English defaults. Never throws.
 */
export function useDwI18n(): DwUiI18nFn {
  const injected = inject<DwUiI18nFn | undefined>(DW_UI_I18N, undefined)
  return injected ?? fallback
}
