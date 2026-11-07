const FONT_KEY = 'dw.polaris-ops.editorFontSize'

export const EDITOR_FONT_SIZES = [11, 12, 13, 14, 15, 16, 18] as const
export type EditorFontSize = (typeof EDITOR_FONT_SIZES)[number]

export const DEFAULT_EDITOR_FONT_SIZE: EditorFontSize = 13

export function readEditorFontSize(): EditorFontSize {
  try {
    const raw = Number(localStorage.getItem(FONT_KEY))
    if ((EDITOR_FONT_SIZES as readonly number[]).includes(raw)) {
      return raw as EditorFontSize
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_EDITOR_FONT_SIZE
}

export function writeEditorFontSize(size: EditorFontSize) {
  try {
    localStorage.setItem(FONT_KEY, String(size))
  } catch {
    /* ignore */
  }
}

export function stepEditorFontSize(current: EditorFontSize, delta: -1 | 1): EditorFontSize {
  const idx = EDITOR_FONT_SIZES.indexOf(current)
  const next = EDITOR_FONT_SIZES[Math.max(0, Math.min(EDITOR_FONT_SIZES.length - 1, idx + delta))]
  return next ?? DEFAULT_EDITOR_FONT_SIZE
}
