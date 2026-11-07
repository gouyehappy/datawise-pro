<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch, watchEffect} from 'vue'
import * as monaco from 'monaco-editor'
import {useCodeEditorHost} from '../code-editor-host'
import type {GitLineMark} from '../git-line-marks'
import {
  buildMinimapOptions,
  resolveMinimapTone,
  toMonacoAppearanceOptions,
} from '../monaco-appearance'
import '../styles/git-line-marks.css'

const props = defineProps<{
  modelValue: string
  language?: string
  readonly?: boolean
  /** Settings / preview: no context menu / content sync side-effects. */
  preview?: boolean
  /** Merge/override Monaco construction & update options. */
  extraOptions?: monaco.editor.IStandaloneEditorConstructionOptions
  /** Force theme id (e.g. readonly dark preview); restored on unmount. */
  forceTheme?: string
  /** Git gutter marks; re-applied after setValue (which clears decorations). */
  gitLineMarks?: GitLineMark[] | null
  /**
   * Optional formatter (e.g. SQL). Core editor never imports `@datawise/sql-editor`.
   * When omitted, `formatDocument` / `formatSelection` return false.
   */
  formatText?: (text: string) => string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  contextmenu: [payload: {x: number; y: number; selectedText: string}]
  'cursor-change': [payload: {lineNumber: number; column: number; offset: number}]
  focus: []
  blur: []
}>()

const containerRef = ref<HTMLElement>()
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let gitDecorationIds: string[] = []
const hasFocus = ref(false)
let themeBeforeForce: string | null = null

const GIT_GUTTER_CLASS: Record<GitLineMark['kind'], string> = {
  added: 'dw-git-gutter-added',
  modified: 'dw-git-gutter-modified',
  deleted: 'dw-git-gutter-deleted',
}

const GIT_LINE_CLASS: Record<GitLineMark['kind'], string> = {
  added: 'dw-git-line-added',
  modified: 'dw-git-line-modified',
  deleted: 'dw-git-line-deleted',
}

const GIT_OVERVIEW_COLOR: Record<GitLineMark['kind'], string> = {
  added: '#22c55e',
  modified: '#f59e0b',
  deleted: '#dc2626',
}

const minimapTone = computed(() => {
  const theme = props.forceTheme ?? useCodeEditorHost().theme
  return resolveMinimapTone(theme)
})

function resolvedTheme(): string {
  return props.forceTheme ?? useCodeEditorHost().theme
}

function applyTheme(theme: string) {
  monaco.editor.setTheme(theme)
}

function getSelectedText(): string {
  if (!editor) return ''
  const selection = editor.getSelection()
  const model = editor.getModel()
  if (!selection || !model) return ''
  return model.getValueInRange(selection)
}

function getExecutableText(): string {
  const selected = getSelectedText().trim()
  return selected || (editor?.getValue() ?? '')
}

function formatSelection(): boolean {
  if (!editor || props.readonly || !props.formatText) return false
  const selection = editor.getSelection()
  const model = editor.getModel()
  if (!selection || !model || selection.isEmpty()) return false
  const selected = model.getValueInRange(selection)
  if (!selected.trim()) return false
  const formatted = props.formatText(selected)
  editor.executeEdits('dw-monaco-format-selection', [
    {range: selection, text: formatted, forceMoveMarkers: true},
  ])
  emit('update:modelValue', editor.getValue())
  return true
}

/** Prefer selection; otherwise format whole document when `formatText` is set. */
function formatDocument(): boolean {
  if (!editor || props.readonly || !props.formatText) return false
  if (formatSelection()) return true
  const formatted = props.formatText(editor.getValue())
  editor.setValue(formatted)
  emit('update:modelValue', formatted)
  return Boolean(formatted)
}

function layout() {
  editor?.layout()
}

function getScrollRatio(): number {
  if (!editor) return 0
  const max = editor.getScrollHeight() - editor.getLayoutInfo().height
  if (max <= 0) return 0
  return Math.min(1, Math.max(0, editor.getScrollTop() / max))
}

function setScrollRatio(ratio: number) {
  if (!editor) return
  const max = editor.getScrollHeight() - editor.getLayoutInfo().height
  if (max <= 0) return
  editor.setScrollTop(Math.min(1, Math.max(0, ratio)) * max)
}

function onDidScroll(listener: () => void): () => void {
  if (!editor) return () => {}
  const sub = editor.onDidScrollChange(() => listener())
  return () => sub.dispose()
}

function goToLine(lineNumber: number) {
  if (!editor) return
  const model = editor.getModel()
  if (!model) return
  const line = Math.min(Math.max(1, Math.floor(lineNumber)), model.getLineCount())
  editor.setSelection(new monaco.Selection(line, 1, line, 1))
  editor.revealLineInCenter(line)
  editor.focus()
}

function getVisibleTopLine(): number {
  if (!editor) return 1
  const ranges = editor.getVisibleRanges()
  const top = ranges[0]?.startLineNumber
  return typeof top === 'number' && top > 0 ? top : 1
}

function clearGitLineMarks() {
  if (!editor) {
    gitDecorationIds = []
    return
  }
  gitDecorationIds = editor.deltaDecorations(gitDecorationIds, [])
}

function setGitLineMarks(marks: GitLineMark[] | null | undefined) {
  if (!editor) return
  const list = marks ?? []
  const decorations: monaco.editor.IModelDeltaDecoration[] = list.map((mark) => {
    const start = Math.max(1, mark.startLine)
    const end = Math.max(start, mark.endLine)
    return {
      range: new monaco.Range(start, 1, end, 1),
      options: {
        isWholeLine: true,
        className: GIT_LINE_CLASS[mark.kind],
        linesDecorationsClassName: GIT_GUTTER_CLASS[mark.kind],
        overviewRuler: {
          color: GIT_OVERVIEW_COLOR[mark.kind],
          position: monaco.editor.OverviewRulerLane.Left,
        },
      },
    }
  })
  gitDecorationIds = editor.deltaDecorations(gitDecorationIds, decorations)
}

function applyGitLineMarksFromProps() {
  setGitLineMarks(props.gitLineMarks)
}

function applySettings() {
  if (!editor) return
  const prefs = useCodeEditorHost()
  const theme = resolvedTheme()
  const options = toMonacoAppearanceOptions({...prefs, theme})
  editor.updateOptions({
    fontFamily: options.fontFamily,
    fontSize: options.fontSize,
    lineHeight: options.lineHeight,
    lineNumbers: options.lineNumbers,
    minimap: props.forceTheme ? {enabled: false} : buildMinimapOptions(prefs.minimap.enabled),
    wordWrap: props.forceTheme ? 'on' : options.wordWrap,
    folding: options.folding,
    foldingHighlight: options.foldingHighlight,
    showFoldingControls: options.showFoldingControls,
    readOnly: props.readonly ?? false,
    lineDecorationsWidth: 10,
    ...props.extraOptions,
    scrollbar: {
      verticalScrollbarSize: 4,
      horizontalScrollbarSize: 4,
      verticalSliderSize: 4,
      horizontalSliderSize: 4,
      arrowSize: 0,
      useShadows: false,
      verticalHasArrows: false,
      horizontalHasArrows: false,
      ...props.extraOptions?.scrollbar,
    },
  })
  applyTheme(theme)
}

function emitCursorChange() {
  if (!editor) return
  const position = editor.getPosition()
  const model = editor.getModel()
  if (!position || !model) return
  emit('cursor-change', {
    lineNumber: position.lineNumber,
    column: position.column,
    offset: model.getOffsetAt(position),
  })
}

onMounted(() => {
  if (!containerRef.value) return
  const prefs = useCodeEditorHost()
  const theme = resolvedTheme()
  if (props.forceTheme) themeBeforeForce = prefs.theme
  applyTheme(theme)
  const settingsOptions = toMonacoAppearanceOptions({...prefs, theme})
  editor = monaco.editor.create(containerRef.value, {
    value: props.modelValue,
    language: props.language ?? 'plaintext',
    automaticLayout: true,
    scrollBeyondLastLine: false,
    padding: {top: 8, bottom: 8},
    contextmenu: false,
    readOnly: props.readonly ?? false,
    ...settingsOptions,
    ...props.extraOptions,
    scrollbar: {
      verticalScrollbarSize: 4,
      horizontalScrollbarSize: 4,
      verticalSliderSize: 4,
      horizontalSliderSize: 4,
      arrowSize: 0,
      useShadows: false,
      verticalHasArrows: false,
      horizontalHasArrows: false,
      ...props.extraOptions?.scrollbar,
    },
  })
  if (!props.preview) {
    editor.onDidChangeModelContent(() => emit('update:modelValue', editor?.getValue() ?? ''))
    editor.onDidChangeCursorPosition(() => emitCursorChange())
    editor.onDidFocusEditorWidget(() => {
      hasFocus.value = true
      emit('focus')
    })
    editor.onDidBlurEditorWidget(() => {
      hasFocus.value = false
      emit('blur')
    })
    editor.onContextMenu((event) => {
      event.event.preventDefault()
      const mouseEvent = event.event.browserEvent as MouseEvent
      emit('contextmenu', {
        x: mouseEvent.clientX,
        y: mouseEvent.clientY,
        selectedText: getSelectedText(),
      })
    })
  }
  applySettings()
  applyGitLineMarksFromProps()
  emitCursorChange()
})

watch(
  () => props.modelValue,
  (value) => {
    if (editor && editor.getValue() !== value) {
      editor.setValue(value)
      applyGitLineMarksFromProps()
    }
  },
)

watch(
  () => props.gitLineMarks,
  () => applyGitLineMarksFromProps(),
  {deep: true},
)

watch(
  () => props.language,
  (language) => {
    const model = editor?.getModel()
    if (!model || !language) return
    monaco.editor.setModelLanguage(model, language)
  },
)

watch(
  () => props.forceTheme,
  () => applySettings(),
)

watch(
  () => props.extraOptions,
  () => applySettings(),
  {deep: true},
)

watchEffect(() => {
  void useCodeEditorHost()
  applySettings()
})

watch(
  () => props.readonly,
  (value) => editor?.updateOptions({readOnly: value ?? false}),
)

onBeforeUnmount(() => {
  clearGitLineMarks()
  editor?.dispose()
  editor = null
  if (props.forceTheme && themeBeforeForce) {
    applyTheme(themeBeforeForce)
  }
})

defineExpose({
  getSelectedText,
  /** Alias for SQL-console callers; returns selection or full text. */
  getExecutableSql: getExecutableText,
  getExecutableText,
  formatDocument,
  formatSelection,
  layout,
  getScrollRatio,
  setScrollRatio,
  onDidScroll,
  goToLine,
  getVisibleTopLine,
  setGitLineMarks,
  clearGitLineMarks,
  hasFocus: () => hasFocus.value || Boolean(editor?.hasTextFocus()),
})
</script>

<template>
  <div ref="containerRef" class="dw-monaco-host" :data-minimap-tone="minimapTone"/>
</template>

<style scoped>
.dw-monaco-host {
  width: 100%;
  height: 100%;
  min-height: 120px;
}
</style>
