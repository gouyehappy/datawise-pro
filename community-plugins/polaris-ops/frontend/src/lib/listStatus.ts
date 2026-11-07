type Translate = (
  key: 'loading' | 'statusTruncated' | 'statusTruncatedMore' | 'statusShown' | 'statusFiltered',
  vars?: Record<string, string | number>,
) => string

export function formatListStatus(
  t: Translate,
  opts: {
    loading: boolean
    truncated: boolean
    /** Rows currently visible (after client filter). */
    shown: number
    /** Rows loaded from server (before client filter). */
    loaded?: number
    total: number
  },
): string {
  if (opts.loading) return t('loading')
  const loaded = opts.loaded ?? opts.shown
  if (opts.truncated) {
    if (!opts.total || opts.total <= loaded) {
      return t('statusTruncatedMore', { loaded })
    }
    return t('statusTruncated', { loaded, total: opts.total })
  }
  if (opts.loaded != null && opts.shown !== opts.loaded) {
    return t('statusFiltered', { shown: opts.shown, loaded: opts.loaded })
  }
  return t('statusShown', { shown: opts.shown, total: opts.total || opts.shown })
}
