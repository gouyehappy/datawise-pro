/** English fallback copy for framework components (no vue-i18n required). */
export const DW_UI_DEFAULTS_EN = {
  common: {
    cancel: 'Cancel',
    save: 'Save',
    confirm: 'Confirm',
    close: 'Close',
    clear: 'Clear',
    search: 'Search',
    more: 'More',
    collapse: 'Collapse',
    reload: 'Reload',
    panelLoading: 'Loading…',
    panelLoadFailedTitle: 'Failed to load page',
    panelLoadFailedHint:
      'The view could not be loaded in time. Check your network and try again, or reload the app.',
    resizeWidth: 'Resize width',
    resizeHeight: 'Resize height',
    resizeColumn: 'Resize column',
    select: {
      searchPlaceholder: 'Type to filter…',
      noMatch: 'No matching options',
      matchCount: '{count} matches',
    },
    searchablePopup: {
      searchPlaceholder: 'Select or type…',
      empty: 'No matches',
    },
  },
  toast: {
    info: 'Info',
    success: 'Success',
    warning: 'Warning',
    error: 'Error',
    kinds: {
      info: 'Info',
      success: 'Success',
      warning: 'Warning',
      error: 'Error',
    },
  },
  filter: {
    empty: 'No matches',
    hint: '{shown} of {total}',
  },
  transfer: {
    available: 'Available',
    selected: 'Selected',
    add: 'Add',
    remove: 'Remove',
  },
  unsaved: {
    discard: 'Discard',
    save: 'Save',
  },
  secret: {
    show: 'Show password',
    hide: 'Hide password',
  },
} as const

export type DwUiDefaults = typeof DW_UI_DEFAULTS_EN

export type DwUiI18nFn = (key: string, params?: Record<string, string | number>) => string

export function createDwUiI18nFromDefaults(
  overrides: Partial<DwUiDefaults> = {},
): DwUiI18nFn {
  const merged = {
    ...DW_UI_DEFAULTS_EN,
    ...overrides,
    common: {
      ...DW_UI_DEFAULTS_EN.common,
      ...(overrides.common ?? {}),
      select: {
        ...DW_UI_DEFAULTS_EN.common.select,
        ...(overrides.common?.select ?? {}),
      },
      searchablePopup: {
        ...DW_UI_DEFAULTS_EN.common.searchablePopup,
        ...(overrides.common?.searchablePopup ?? {}),
      },
    },
    toast: {
      ...DW_UI_DEFAULTS_EN.toast,
      ...(overrides.toast ?? {}),
      kinds: {
        ...DW_UI_DEFAULTS_EN.toast.kinds,
        ...(overrides.toast?.kinds ?? {}),
      },
    },
    filter: {...DW_UI_DEFAULTS_EN.filter, ...(overrides.filter ?? {})},
    transfer: {...DW_UI_DEFAULTS_EN.transfer, ...(overrides.transfer ?? {})},
    unsaved: {...DW_UI_DEFAULTS_EN.unsaved, ...(overrides.unsaved ?? {})},
    secret: {...DW_UI_DEFAULTS_EN.secret, ...(overrides.secret ?? {})},
  }

  return (key, params) => {
    const parts = key.split('.')
    let cur: unknown = merged
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in (cur as object)) {
        cur = (cur as Record<string, unknown>)[p]
      } else {
        return key
      }
    }
    let text = typeof cur === 'string' ? cur : key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.split(`{${k}}`).join(String(v))
      }
    }
    return text
  }
}
