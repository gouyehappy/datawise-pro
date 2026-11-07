/**
 * Official Code Editor Host SPI — appearance settings for Monaco shells.
 * Hosts register prefs (or a reactive getter) at boot; third-party apps
 * get open defaults when nothing is configured.
 */

export type EditorWordWrap = 'on' | 'off' | 'wordWrapColumn' | 'bounded'

export type EditorSettingsPort = {
  theme: string
  fontSize: number
  fontFamily: string
  lineHeight: number
  lineNumbers: boolean
  wordWrap: EditorWordWrap
  minimap: {enabled: boolean}
  folding: boolean
}

/** Partial overlay or a getter (read inside effects for reactivity). */
export type EditorSettingsSource =
  | Partial<EditorSettingsPort>
  | (() => Partial<EditorSettingsPort>)

export const DEFAULT_EDITOR_SETTINGS_PORT: EditorSettingsPort = {
  theme: 'vs-dark',
  fontSize: 14,
  fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  lineHeight: 1.5,
  lineNumbers: true,
  wordWrap: 'on',
  minimap: {enabled: true},
  folding: true,
}

let source: EditorSettingsSource = {}

/** Features register appearance prefs once at app boot (object or reactive getter). */
export function configureCodeEditorHost(port: EditorSettingsSource): void {
  source = port
}

export function useCodeEditorHost(): EditorSettingsPort {
  const partial = typeof source === 'function' ? source() : source
  return {
    ...DEFAULT_EDITOR_SETTINGS_PORT,
    ...partial,
    minimap: {
      ...DEFAULT_EDITOR_SETTINGS_PORT.minimap,
      ...(partial.minimap ?? {}),
    },
  }
}

export function resetCodeEditorHostForTests(): void {
  source = {}
}
