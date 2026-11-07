import type {editor as MonacoEditorNS} from 'monaco-editor'
import type {EditorSettingsPort} from './code-editor-host'

export function buildMinimapOptions(
  enabled: boolean,
): MonacoEditorNS.IEditorMinimapOptions {
  if (!enabled) return {enabled: false}
  return {
    enabled: true,
    side: 'right',
    size: 'proportional',
    scale: 1,
    maxColumn: 120,
    showSlider: 'always',
    renderCharacters: true,
    showRegionSectionHeaders: false,
  }
}

/** Appearance-only Monaco options from the settings port. */
export function toMonacoAppearanceOptions(
  settings: EditorSettingsPort,
): MonacoEditorNS.IStandaloneEditorConstructionOptions {
  return {
    theme: settings.theme,
    fontFamily: settings.fontFamily,
    fontSize: settings.fontSize,
    lineHeight: settings.lineHeight,
    lineNumbers: settings.lineNumbers ? 'on' : 'off',
    minimap: buildMinimapOptions(settings.minimap.enabled),
    wordWrap: settings.wordWrap,
    folding: settings.folding,
    foldingHighlight: settings.folding,
    showFoldingControls: settings.folding ? 'mouseover' : 'never',
  }
}

/** Heuristic minimap chrome tone from theme id (no host theme table). */
export function resolveMinimapTone(theme: string): 'light' | 'dark' {
  const id = theme.toLowerCase()
  if (id.includes('light') || id === 'vs' || id === 'hc-light') return 'light'
  return 'dark'
}
