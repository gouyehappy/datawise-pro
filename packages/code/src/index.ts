/**
 * @datawise/code
 *
 * Neutral Monaco shell + code/log viewers. Appearance via `EditorSettingsPort`
 * (`configureCodeEditorHost` / `useCodeEditorHost`) — no host settings file paths.
 * SQL format is optional via `DwMonacoEditor` `formatText` prop (not `@datawise/sql-editor`).
 */

export {
  configureCodeEditorHost,
  useCodeEditorHost,
  resetCodeEditorHostForTests,
  DEFAULT_EDITOR_SETTINGS_PORT,
  type EditorSettingsPort,
  type EditorSettingsSource,
  type EditorWordWrap,
} from './code-editor-host'

export type {GitLineKind, GitLineMark, LocalGitLineKind, LocalGitLineMark} from './git-line-marks'

export {
  resolveCodeLanguage,
  codeLanguageLabel,
  type ResolveCodeLanguageInput,
} from './resolve-code-language'

export {useContentFind, type ContentFindMatchState} from './useContentFind'
export {useCodeClipboard, type DwClipboardFace} from './clipboard'
export {useCodeI18n, CODE_DEFAULTS_EN, type CodeI18nFn} from './code-i18n'
export {
  buildMinimapOptions,
  toMonacoAppearanceOptions,
  resolveMinimapTone,
} from './monaco-appearance'

export {default as DwMonacoEditor} from './components/DwMonacoEditor.vue'
/** Stable alias — same as `DwMonacoEditor`. */
export {default as DwCodeShell} from './components/DwMonacoEditor.vue'
export {default as DwCodeViewer} from './components/DwCodeViewer.vue'
export {default as DwLogViewer} from './components/DwLogViewer.vue'
export {default as DwFindBar} from './components/DwFindBar.vue'

export const CODE_PACKAGE = '@datawise/code' as const
