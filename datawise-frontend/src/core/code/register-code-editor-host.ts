import {provide} from 'vue'
import {
  configureCodeEditorHost,
  type EditorSettingsPort,
} from '@datawise/code'
import {DW_CLIPBOARD} from '@datawise/theme'
import {readClipboardText, writeClipboardText} from '@/shared/browser/app-clipboard'
import {ensureMonacoThemes} from '@/shared/config/monaco-editor-appearance'
import {useEditorSettingsState} from '@/shared/config/editor-settings-state'

let registered = false

function editorSettingsPort(): Partial<EditorSettingsPort> {
  const {settings} = useEditorSettingsState()
  const s = settings.value
  return {
    theme: s.theme,
    fontSize: s.fontSize,
    fontFamily: s.fontFamily,
    lineHeight: s.lineHeight,
    lineNumbers: s.lineNumbers,
    wordWrap: s.wordWrap ? 'on' : 'off',
    minimap: {enabled: s.minimap},
    folding: s.folding,
  }
}

/**
 * Wire `@datawise/code` to host editor prefs + clipboard inject.
 * Locale stays on `registerUiI18nHost` (`DW_UI_I18N` aliases) — do not re-provide here.
 * Call once from AppShell setup (mirrors `registerDataGridHost`).
 */
export function registerCodeEditorHost(): void {
  if (!registered) {
    registered = true
    ensureMonacoThemes()
    configureCodeEditorHost(() => editorSettingsPort())
  }

  // Provide on the calling component instance so package injects resolve for descendants.
  provide(DW_CLIPBOARD, {
    writeText: async (text: string) => {
      const ok = await writeClipboardText(text)
      if (!ok) throw new Error('clipboard write failed')
    },
    readText: async () => (await readClipboardText()) ?? '',
  })
}
