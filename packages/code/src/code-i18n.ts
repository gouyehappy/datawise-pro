import {useDwI18n} from '@datawise/ui'

/** Package English fallbacks (same key paths as host locales when wired). */
export const CODE_DEFAULTS_EN = {
  'common.codeViewer.copy': 'Copy',
  'common.codeViewer.expand': 'Expand',
  'common.codeViewer.expandTitle': 'Code',
  'common.codeViewer.loading': 'Loading…',
  'common.codeViewer.empty': 'No content',
  'common.logViewer.live': 'Live',
  'common.logViewer.liveShort': 'LIVE',
  'common.logViewer.find': 'Find',
  'common.logViewer.follow': 'Follow tail',
  'common.logViewer.jumpTop': 'Jump to top',
  'common.logViewer.jumpBottom': 'Jump to bottom',
  'common.logViewer.copy': 'Copy',
  'common.logViewer.openFullscreen': 'Expand',
  'common.logViewer.loading': 'Loading…',
  'common.logViewer.findEmpty': 'No matches',
  'common.findBar.placeholder': 'Find',
  'common.findBar.ariaLabel': 'Find in content',
  'common.findBar.noMatch': 'No results',
  'common.findBar.matchIndex': '{index} of {count}',
  'common.findBar.prev': 'Previous match',
  'common.findBar.next': 'Next match',
  'common.findBar.close': 'Close find',
} as const

export type CodeI18nFn = (key: string, params?: Record<string, string | number>) => string

function formatParams(text: string, params?: Record<string, string | number>): string {
  if (!params) return text
  let out = text
  for (const [k, v] of Object.entries(params)) {
    out = out.split(`{${k}}`).join(String(v))
  }
  return out
}

/**
 * Prefer inject(DW_UI_I18N) via useDwI18n; fall back to package English defaults.
 */
export function useCodeI18n(): CodeI18nFn {
  const uiT = useDwI18n()
  return (key, params) => {
    const fromUi = uiT(key, params)
    if (fromUi !== key) return fromUi
    const fallback = CODE_DEFAULTS_EN[key as keyof typeof CODE_DEFAULTS_EN]
    if (fallback) return formatParams(fallback, params)
    return key
  }
}
