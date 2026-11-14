<script setup lang="ts">
import {inject, computed, onBeforeUnmount, onMounted, ref, unref, watch} from 'vue'
import * as monaco from 'monaco-editor'
import {SQL_EDITOR_CONFIG_KEY} from '@sql-editor/config/injection'
import {DEFAULT_SQL_EDITOR_THEME} from '@sql-editor/config/defaults'
import {SQL_EDITOR_MONACO_OPTIONS, resolveSqlEditorMonacoOptions} from '@sql-editor/constants/editor-options'
import {formatSql} from '@sql-editor/utils/format'
import {planFormatAsYouTypeBreak} from '@sql-editor/utils/format-as-you-type'
import {isCursorInStringOrCommentCached} from '@sql-editor/completion/incremental-scan'
import {registerSqlEditorLineShortcuts} from '@sql-editor/editor/line-shortcuts'
import {bindSuggestAcceptSuppress} from '@sql-editor/completion/monaco/suggest-accept'
import {
  bindSqlSuggestDetailsAutoShow,
  applySqlSuggestDetailsSetting,
} from '@sql-editor/completion/monaco/suggest-details'
import {bindSqlSuggestWidgetWidth} from '@sql-editor/completion/monaco/suggest-width'
import {extractExecutableLineSql} from '@sql-editor/utils/current-line-sql'
import {resolveStatementAtCursor, resolveStatementAtLine} from '@sql-editor/utils/statement-at-cursor'
import {
  findStatementContainingOffset,
  indexSqlStatements,
} from '@sql-editor/utils/sql-statement-index'
import {bindSqlRunGutter} from '@sql-editor/editor/run-gutter'
import {isSqlRunGutterEnabled} from '@sql-editor/editor/run-gutter-enabled'
import {bindSqlTablePeek} from '@sql-editor/editor/table-peek'
import type {SqlTablePeekPayload} from '@sql-editor/utils/sql-table-peek'
import {
  getSqlEditorShowSuggestDetails,
  getSqlEditorFolding,
  getSqlEditorFontSize,
  getSqlEditorTheme,
  getSqlEditorFormatterSettings,
  getSqlEditorColumnDiagnosticsMode,
  getSqlEditorVimModeEnabled,
  sqlEditorSettingsVersion,
} from '@sql-editor/config/snippets/cache'
import {
  isLargeSqlDocument,
  shouldRunLiveColumnDiagnostics,
} from '@sql-editor/constants/large-document'
import {applySqlEditorMonacoTheme, ensureSqlEditorMonacoThemes} from '@sql-editor/monaco/themes'
import {
  planAiBlockInsert,
  planAiSqlInsert,
  buildAiExplanationBlock,
  buildAiSqlBlock
} from '@sql-editor/ai/format-ai-insert'
import type {SqlEditorAiAction, SqlGutterStatementPayload, SqlKeybindingConfig} from '@sql-editor/types'
import {getActiveSqlEditorRuntime} from '@sql-editor/runtime/sql-editor-runtime'
import {suppressAutocomplete, isAutocompleteSuppressed} from '@sql-editor/completion/suppress-autocomplete'
import {
  bypassesAutocompleteSuppress,
  lineBeforeIsColumnRef,
  shouldScheduleEditorAutoSuggest,
} from '@sql-editor/completion/trigger-policy'
import {resolveEditorUiTone} from '@sql-editor/utils/editor-ui-tone'
import {
    isSqlEditorThemeHostManaged,
    resolveSqlEditorTheme,
} from '@sql-editor/utils/resolve-editor-theme'
import {collectSqlColumnDiagnostics} from '@sql-editor/utils/sql-column-diagnostics'

const props = withDefaults(
    defineProps<{
      modelValue: string
      readonly?: boolean
      preview?: boolean
      theme?: string
      monacoOptions?: monaco.editor.IStandaloneEditorConstructionOptions
      keybindings?: SqlKeybindingConfig[]
      customHandlers?: Record<string, () => boolean | void>
      runGutterHint?: string
      tablePeekHint?: string
      resolveTablePeek?: (sql: string, offset: number) => SqlTablePeekPayload | null
    }>(),
    {
      theme: DEFAULT_SQL_EDITOR_THEME,
    },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  contextmenu: [payload: { x: number; y: number; selectedText: string }]
  'cursor-change': [payload: { lineNumber: number; column: number; offset: number }]
  focus: []
  'run-statement': [payload: SqlGutterStatementPayload]
  'open-table': [payload: SqlTablePeekPayload]
}>()

const globalConfig = inject(SQL_EDITOR_CONFIG_KEY, null)
const containerRef = ref<HTMLElement>()
const vimStatusRef = ref<HTMLElement>()
const uiTone = computed(() => resolveEditorUiTone(resolveTheme()))
let editor: monaco.editor.IStandaloneCodeEditor | null = null
/** Body-level host so fixed suggest widgets are not skewed by ancestor transform/filter. */
let overflowWidgetsHost: HTMLDivElement | null = null
let errorDecorations: string[] = []
let statementFrameDecorations: string[] = []
let lineShortcutDisposable: monaco.IDisposable | null = null
let suggestDetailsDisposable: monaco.IDisposable | null = null
let suggestWidthDisposable: monaco.IDisposable | null = null
let suggestAcceptDisposable: monaco.IDisposable | null = null
let selectionSyncDisposable: monaco.IDisposable | null = null
let runGutterDisposable: monaco.IDisposable | null = null
let tablePeekDisposable: monaco.IDisposable | null = null
let initRafOuter = 0
let initRafInner = 0
let diagnosticTimer: ReturnType<typeof setTimeout> | null = null
let statementFrameTimer: ReturnType<typeof setTimeout> | null = null
let formatAsYouTypeBusy = false
let vimModeController: {dispose: () => void} | null = null
let vimStatusNode: HTMLDivElement | null = null
let vimAttachGeneration = 0

const COLUMN_DIAGNOSTIC_OWNER = 'sql-column-diagnostics'

function resolveTheme(): string {
  void sqlEditorSettingsVersion.value
  return resolveSqlEditorTheme({
    personalTheme: getSqlEditorTheme(),
    hostTheme: globalConfig?.theme !== undefined ? unref(globalConfig.theme) : undefined,
    propTheme: props.theme,
    hostManaged: isSqlEditorThemeHostManaged(globalConfig),
  })
}

function resolveMonacoOptions(): monaco.editor.IStandaloneEditorConstructionOptions {
  const fromInject = globalConfig?.monacoOptions?.() ?? SQL_EDITOR_MONACO_OPTIONS
  const fromProps = props.monacoOptions ?? {}
  const merged = resolveSqlEditorMonacoOptions({...fromInject, ...fromProps})
  const personalFontSize = getSqlEditorFontSize()
  if (personalFontSize !== undefined) {
    merged.fontSize = personalFontSize
  }
  void sqlEditorSettingsVersion.value
  const folding = getSqlEditorFolding()
  merged.folding = folding
  merged.foldingHighlight = folding
  merged.showFoldingControls = folding ? 'mouseover' : 'never'
  merged.glyphMargin = true
  if (getSqlEditorVimModeEnabled()) {
    merged.lineNumbers = 'relative'
  }
  return merged
}

function getSelectedText(): string {
  if (!editor) return ''
  const selection = editor.getSelection()
  const model = editor.getModel()
  if (!selection || !model) return ''
  return model.getValueInRange(selection)
}

function getExecutableSql(): string {
  const selected = getSelectedText().trim()
  return selected || (editor?.getValue() ?? '')
}

function applyFormattedSqlToRange(range: monaco.IRange, rawSql: string): boolean {
  if (!editor) return false
  const trimmed = rawSql.trim()
  if (!trimmed) return false
  const formatted = formatSql(trimmed)
  editor.executeEdits('sql-editor-format', [
    {range, text: formatted, forceMoveMarkers: true},
  ])
  emit('update:modelValue', editor.getValue())
  return true
}

/**
 * 仅格式化选区。
 * 无选区时返回 false（由 formatDocument / 快捷键回退到当前语句）。
 */
function formatSelection(): boolean {
  if (!editor || props.readonly) return false
  const selection = editor.getSelection()
  const model = editor.getModel()
  if (!selection || !model || selection.isEmpty()) return false
  return applyFormattedSqlToRange(selection, model.getValueInRange(selection))
}

/** 格式化光标所在语句（非整份文档） */
function formatStatementAtCursor(): boolean {
  if (!editor || props.readonly) return false
  const model = editor.getModel()
  const position = editor.getPosition()
  if (!model || !position) return false
  const full = model.getValue()
  const offset = model.getOffsetAt(position)
  const span = findStatementContainingOffset(indexSqlStatements(full), offset)
  if (!span?.sql.trim()) return false
  const start = model.getPositionAt(span.startOffset)
  const end = model.getPositionAt(span.endOffset)
  const range = new monaco.Range(
      start.lineNumber,
      start.column,
      end.lineNumber,
      end.column,
  )
  return applyFormattedSqlToRange(range, span.sql)
}

/**
 * 工具栏 / API 格式化入口：
 * 1) 有选区 → 只格式化选区
 * 2) 无选区 → 只格式化光标所在语句
 * 绝不整文件重写（避免多段脚本被一起改掉）
 */
function formatDocument(): boolean {
  if (formatSelection()) return true
  return formatStatementAtCursor()
}

/** 快捷键：选区优先，否则当前语句 */
function formatSelectionOrStatement(): boolean {
  return formatDocument()
}

function foldAll(): void {
  void editor?.getAction('editor.foldAll')?.run()
}

function unfoldAll(): void {
  void editor?.getAction('editor.unfoldAll')?.run()
}

function getCursorLineNumber(): number | null {
  if (!editor) return null
  return editor.getPosition()?.lineNumber ?? null
}

function resolveStatementAtEditorCursor() {
  if (!editor) return null
  const model = editor.getModel()
  const position = editor.getPosition()
  if (!model || !position) return null
  return resolveStatementAtCursor(model.getValue(), model.getOffsetAt(position))
}

function getCurrentLineSql(): string {
  if (!editor) return ''
  const model = editor.getModel()
  if (!model) return ''

  const statement = resolveStatementAtEditorCursor()
  if (statement?.sql.trim()) return statement.sql

  // 再按行号归属整句（与 resolveStatementAtCursor 互补，保证多行任意行可执行）
  const lineNumber = getCursorLineNumber()
  if (lineNumber) {
    const byLine = resolveStatementAtLine(model.getValue(), lineNumber)
    if (byLine?.sql.trim()) return byLine.sql
    return extractExecutableLineSql(model.getLineContent(lineNumber))
  }
  return ''
}

function getCurrentLineNumber(): number | null {
  const statement = resolveStatementAtEditorCursor()
  if (statement?.sql.trim()) return statement.anchorLine
  const sql = getCurrentLineSql()
  if (!sql) return null
  return getCursorLineNumber()
}

function getSelectionStartLine(): number | null {
  if (!editor) return null
  const selection = editor.getSelection()
  const selected = getSelectedText().trim()
  if (!selected || !selection) return null
  return selection.startLineNumber
}

function clearErrorLine() {
  if (!editor) return
  errorDecorations = editor.deltaDecorations(errorDecorations, [])
}

function clearStatementFrame() {
  if (!editor) return
  statementFrameDecorations = editor.deltaDecorations(statementFrameDecorations, [])
}

function scheduleStatementFrame() {
  if (!editor || props.readonly || props.preview) {
    clearStatementFrame()
    return
  }
  if (statementFrameTimer) clearTimeout(statementFrameTimer)
  statementFrameTimer = setTimeout(() => {
    statementFrameTimer = null
    applyStatementFrame()
  }, 80)
}

/** 当前语句半透明底框（光标移动时跟随） */
function applyStatementFrame() {
  if (!editor || props.readonly || props.preview) {
    clearStatementFrame()
    return
  }
  const model = editor.getModel()
  if (!model) {
    clearStatementFrame()
    return
  }
  // Large docs: skip statement frame re-index (same gate as column diagnostics auto).
  if (
      getSqlEditorColumnDiagnosticsMode() === 'auto'
      && isLargeSqlDocument(model.getValue(), model.getLineCount())
  ) {
    clearStatementFrame()
    return
  }
  const statement = resolveStatementAtEditorCursor()
  if (!statement?.sql.trim()) {
    clearStatementFrame()
    return
  }
  const startLine = Math.max(1, statement.startLine)
  const endLine = Math.max(startLine, statement.endLine)
  statementFrameDecorations = editor.deltaDecorations(statementFrameDecorations, [
    {
      range: new monaco.Range(startLine, 1, endLine, model.getLineMaxColumn(endLine)),
      options: {
        isWholeLine: true,
        className: 'sql-editor-current-statement',
      },
    },
  ])
}

function clearColumnDiagnostics() {
  const model = editor?.getModel()
  if (!model) return
  monaco.editor.setModelMarkers(model, COLUMN_DIAGNOSTIC_OWNER, [])
}

function scheduleColumnDiagnostics() {
  if (!editor || props.readonly || props.preview) return
  if (diagnosticTimer) clearTimeout(diagnosticTimer)
  diagnosticTimer = setTimeout(() => {
    diagnosticTimer = null
    applyColumnDiagnostics()
  }, 350)
}

function applyColumnDiagnostics() {
  const model = editor?.getModel()
  if (!model || props.readonly || props.preview) return
  const text = model.getValue()
  if (!shouldRunLiveColumnDiagnostics(
      getSqlEditorColumnDiagnosticsMode(),
      text,
      model.getLineCount(),
  )) {
    clearColumnDiagnostics()
    return
  }
  const schema = getActiveSqlEditorRuntime().getSchema()
  if (!schema.tables.length) {
    clearColumnDiagnostics()
    return
  }
  const diagnostics = collectSqlColumnDiagnostics(text, schema)
  monaco.editor.setModelMarkers(
      model,
      COLUMN_DIAGNOSTIC_OWNER,
      diagnostics.map((item) => ({
        severity: monaco.MarkerSeverity.Warning,
        message: item.message,
        startLineNumber: item.line,
        startColumn: item.column,
        endLineNumber: item.line,
        endColumn: item.endColumn,
      })),
  )
}

function disposeVimMode() {
  vimAttachGeneration += 1
  try {
    vimModeController?.dispose()
  } catch {
    // ignore dispose races
  }
  vimModeController = null
  if (vimStatusNode) {
    vimStatusNode.textContent = ''
    vimStatusNode.hidden = true
  }
}

async function syncVimMode() {
  if (!editor || props.preview || props.readonly) {
    disposeVimMode()
    return
  }
  const enabled = getSqlEditorVimModeEnabled()
  if (!enabled) {
    disposeVimMode()
    editor.updateOptions({lineNumbers: resolveMonacoOptions().lineNumbers ?? 'on'})
    return
  }
  if (vimModeController) {
    editor.updateOptions({lineNumbers: 'relative'})
    if (vimStatusNode) vimStatusNode.hidden = false
    return
  }
  const generation = ++vimAttachGeneration
  try {
    const mod = await import('monaco-vim')
    if (generation !== vimAttachGeneration || !editor || !getSqlEditorVimModeEnabled()) {
      return
    }
    const statusEl = vimStatusRef.value
    if (statusEl) {
      vimStatusNode = statusEl
      statusEl.hidden = false
    }
    vimModeController = mod.initVimMode(editor, statusEl ?? null)
    editor.updateOptions({lineNumbers: 'relative'})
  } catch (err) {
    console.warn('[sql-editor] monaco-vim failed to load', err)
    disposeVimMode()
  }
}

function setErrorLine(lineNumber: number | null) {
  if (!editor) return
  const model = editor.getModel()
  if (!model) return
  if (lineNumber === null || lineNumber < 1 || lineNumber > model.getLineCount()) {
    clearErrorLine()
    return
  }
  errorDecorations = editor.deltaDecorations(errorDecorations, [
    {
      range: new monaco.Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber)),
      options: {
        isWholeLine: true,
        className: 'sql-editor-error-line',
        glyphMarginClassName: 'sql-editor-error-glyph',
      },
    },
  ])
}

function goToLine(lineNumber: number, highlight = true) {
  if (!editor) return
  const model = editor.getModel()
  if (!model) return
  const line = Math.min(Math.max(1, lineNumber), model.getLineCount())
  editor.setSelection(new monaco.Selection(line, 1, line, 1))
  editor.revealLineInCenter(line)
  editor.focus()
  if (highlight) setErrorLine(line)
}

function layout() {
  editor?.layout()
}

function insertTextAtCursor(text: string) {
  if (!editor || props.readonly) return
  const selection = editor.getSelection()
  if (!selection) return
  editor.executeEdits('sql-editor', [{range: selection, text, forceMoveMarkers: true}])
  editor.focus()
  emit('update:modelValue', editor.getValue())
  if (text.endsWith('.')) {
    editor.trigger('sql-editor', 'editor.action.triggerSuggest', {auto: true})
  }
}

function insertSnippetAtCursor(snippet: string) {
  if (!editor || props.readonly) return
  type SnippetCtrl = { insert: (template: string) => void }
  const ctrl = editor.getContribution('snippetController2') as SnippetCtrl | null
  if (ctrl?.insert) {
    ctrl.insert(snippet)
    emit('update:modelValue', editor.getValue())
    editor.focus()
    return
  }
  insertTextAtCursor(snippet)
}

function triggerSuggest() {
  if (!editor || props.readonly) return
  editor.trigger('sql-editor', 'editor.action.triggerSuggest', {})
  editor.focus()
}

function dismissSuggestWidget() {
  if (!editor) return
  const controller = editor.getContribution('editor.contrib.suggestController') as {
    cancelSuggestWidget?: () => void
  } | null
  controller?.cancelSuggestWidget?.()
}

let suggestRaf = 0
let suggestTimer: ReturnType<typeof setTimeout> | null = null

function cancelScheduledAutoSuggest() {
  if (suggestRaf) cancelAnimationFrame(suggestRaf)
  suggestRaf = 0
  if (suggestTimer) clearTimeout(suggestTimer)
  suggestTimer = null
}

function insertAiGeneratedSql(prompt: string, generatedSql: string) {
  applyAiActionResult('generate', prompt, generatedSql)
}

function applyAiInsertPlan(plan: ReturnType<typeof planAiSqlInsert>) {
  if (!editor) return
  const model = editor.getModel()
  if (!model) return

  if (plan.append) {
    const lastLine = model.getLineCount()
    const lastCol = model.getLineMaxColumn(lastLine)
    const gap = plan.appendGapLines > 0 ? '\n'.repeat(plan.appendGapLines) : ''
    editor.executeEdits('sql-editor-ai', [{
      range: new monaco.Range(lastLine, lastCol, lastLine, lastCol),
      text: `${gap}${plan.insertLines.join('\n')}`,
      forceMoveMarkers: true,
    }])
  } else {
    const line = plan.startLine + 1
    editor.executeEdits('sql-editor-ai', [{
      range: new monaco.Range(line, 1, line, model.getLineMaxColumn(line)),
      text: plan.insertLines.join('\n'),
      forceMoveMarkers: true,
    }])
  }
}

function finishAiEdit(focusLine: number) {
  if (!editor) return
  dismissSuggestWidget()
  goToLine(focusLine, false)
  editor.focus()
  emit('update:modelValue', editor.getValue())
  requestAnimationFrame(() => dismissSuggestWidget())
  window.setTimeout(() => dismissSuggestWidget(), 120)
}

function applyAiActionResult(action: SqlEditorAiAction, prompt: string, content: string) {
  if (!editor || props.readonly) return
  const model = editor.getModel()
  const position = editor.getPosition()
  if (!model || !position) return

  suppressAutocomplete(400)
  cancelScheduledAutoSuggest()
  dismissSuggestWidget()

  const selection = editor.getSelection()
  const hasSelection = Boolean(selection && !selection.isEmpty())

  if (action === 'explain') {
    const block = buildAiExplanationBlock(prompt, content)
    if (hasSelection && selection) {
      const endLine = selection.endLineNumber
      const endCol = model.getLineMaxColumn(endLine)
      editor.executeEdits('sql-editor-ai', [{
        range: new monaco.Range(endLine, endCol, endLine, endCol),
        text: `\n${block}`,
        forceMoveMarkers: true,
      }])
      finishAiEdit(endLine + 1)
      return
    }
    const plan = planAiBlockInsert(model.getValue(), position.lineNumber, block)
    applyAiInsertPlan(plan)
    finishAiEdit(plan.focusLine)
    return
  }

  const sqlBlock = buildAiSqlBlock(prompt, content)

  if ((action === 'optimize' || action === 'fix') && hasSelection && selection) {
    editor.executeEdits('sql-editor-ai', [{
      range: selection,
      text: sqlBlock,
      forceMoveMarkers: true,
    }])
    finishAiEdit(selection.startLineNumber)
    return
  }

  const plan = planAiSqlInsert(model.getValue(), position.lineNumber, prompt, content)
  applyAiInsertPlan(plan)
  finishAiEdit(plan.focusLine)
}

function applyEditorOptions() {
  if (!editor) return
  const options = resolveMonacoOptions()
  editor.updateOptions({
    ...options,
    readOnly: props.readonly ?? false,
  })
  applyTheme()
}

function applyTheme() {
  ensureSqlEditorMonacoThemes()
  applySqlEditorMonacoTheme(resolveTheme())
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

function syncSelectionToRuntime() {
  if (!editor || props.preview) return
  const selection = editor.getSelection()
  const model = editor.getModel()
  if (!selection || !model || selection.isEmpty()) {
    getActiveSqlEditorRuntime().setSelectedText('')
    return
  }
  getActiveSqlEditorRuntime().setSelectedText(model.getValueInRange(selection))
}

function bindSelectionSync() {
  selectionSyncDisposable?.dispose()
  if (!editor || props.preview) return
  selectionSyncDisposable = editor.onDidChangeCursorSelection(() => syncSelectionToRuntime())
  syncSelectionToRuntime()
}

function bindLineShortcuts() {
  lineShortcutDisposable?.dispose()
  if (!editor || props.preview) return
  lineShortcutDisposable = registerSqlEditorLineShortcuts(editor, {
    readonly: props.readonly,
    keybindings: props.keybindings,
    customHandlers: {
      'sqlEditor.formatSelection': formatSelectionOrStatement,
      ...props.customHandlers,
    },
    onEdit: () => emit('update:modelValue', editor?.getValue() ?? ''),
  })
}

function syncSuggestDetailsHostAttr() {
  const flag = getSqlEditorShowSuggestDetails() ? 'on' : 'off'
  if (containerRef.value) {
    containerRef.value.dataset.suggestDetails = flag
  }
  if (overflowWidgetsHost) {
    overflowWidgetsHost.dataset.suggestDetails = flag
    overflowWidgetsHost.dataset.tone = uiTone.value
  }
}

function ensureOverflowWidgetsHost(): HTMLDivElement {
  if (overflowWidgetsHost) return overflowWidgetsHost
  const host = document.createElement('div')
  host.className = 'monaco-editor sql-monaco-overflow-host'
  host.dataset.tone = uiTone.value
  host.dataset.suggestDetails = getSqlEditorShowSuggestDetails() ? 'on' : 'off'
  // Escape transformed/filtered ancestors; keep a top-left fixed stacking root (Monaco recommend).
  host.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;overflow:visible;z-index:var(--dw-z-dropdown, 120);'
  document.body.appendChild(host)
  overflowWidgetsHost = host
  return host
}

function bindRunGutter() {
  runGutterDisposable?.dispose()
  if (!editor || props.preview || !containerRef.value) return
  runGutterDisposable = bindSqlRunGutter(editor, containerRef.value, {
    isEnabled: () => isSqlRunGutterEnabled(),
    isReadonly: () => props.readonly === true,
    hoverMessage: () => props.runGutterHint?.trim() || 'Run this statement',
    onRun: (payload) => emit('run-statement', payload),
  })
}

function bindTablePeek() {
  tablePeekDisposable?.dispose()
  if (!editor || props.preview) return
  tablePeekDisposable = bindSqlTablePeek(editor, {
    isEnabled: () => typeof props.resolveTablePeek === 'function',
    isReadonly: () => props.readonly === true,
    resolve: (sql, offset) => props.resolveTablePeek?.(sql, offset) ?? null,
    tooltip: () => props.tablePeekHint?.trim() || '',
    onOpen: (payload) => emit('open-table', payload),
  })
}

function bindSuggestDetails() {
  if (!editor || props.preview) return
  suggestDetailsDisposable?.dispose()
  suggestWidthDisposable?.dispose()
  syncSuggestDetailsHostAttr()
  suggestDetailsDisposable = bindSqlSuggestDetailsAutoShow(editor, {
    isEnabled: getSqlEditorShowSuggestDetails,
  })
  suggestWidthDisposable = bindSqlSuggestWidgetWidth(editor)
}

/** 手写子句关键字后自动换行（可在设置中关闭 formatAsYouType） */
function tryFormatAsYouType(event: monaco.editor.IModelContentChangedEvent) {
  if (!editor || props.readonly || props.preview) return
  if (formatAsYouTypeBusy || event.isFlush || event.isUndoing || event.isRedoing) return
  if (!getSqlEditorFormatterSettings().formatAsYouType) return
  if (event.changes.length !== 1) return
  const change = event.changes[0]
  if (!change || change.text !== ' ') return

  const model = editor.getModel()
  const position = editor.getPosition()
  if (!model || !position) return

  const lineNumber = position.lineNumber
  const lineContent = model.getLineContent(lineNumber)
  const lineBefore = lineContent.slice(0, position.column - 1)
  const plan = planFormatAsYouTypeBreak(lineBefore)
  if (!plan) return

  const prefixToCursor = model.getValueInRange(
      new monaco.Range(1, 1, lineNumber, position.column),
  )
  if (isCursorInStringOrCommentCached(prefixToCursor, prefixToCursor.length)) return

  formatAsYouTypeBusy = true
  try {
    const insertPos = new monaco.Position(lineNumber, plan.insertColumn)
    editor.executeEdits('sql-editor-format-as-you-type', [
      {
        range: monaco.Range.fromPositions(insertPos, insertPos),
        text: plan.text,
        forceMoveMarkers: true,
      },
    ])
  } finally {
    requestAnimationFrame(() => {
      formatAsYouTypeBusy = false
    })
  }
}

onMounted(() => {
  if (!containerRef.value || editor) return
  initRafOuter = requestAnimationFrame(() => {
    initRafInner = requestAnimationFrame(() => {
      initRafOuter = 0
      initRafInner = 0
      mountEditor()
    })
  })
})

function mountEditor() {
  if (!containerRef.value || editor) return
  const options = resolveMonacoOptions()
  editor = monaco.editor.create(containerRef.value, {
    value: props.modelValue,
    language: 'sql',
    automaticLayout: true,
    scrollBeyondLastLine: false,
    padding: {top: 8, bottom: 8},
    contextmenu: false,
    readOnly: props.readonly ?? false,
    theme: resolveTheme(),
    ...options,
    // Keep fixedOverflowWidgets from options, but re-parent widgets outside shell transforms.
    overflowWidgetsDomNode: ensureOverflowWidgetsHost(),
  })
  if (!props.preview) {
    bindSuggestDetails()
    bindRunGutter()
    bindTablePeek()
    bindSelectionSync()
    suggestAcceptDisposable = bindSuggestAcceptSuppress(editor, () => {
      suppressAutocomplete(480)
      cancelScheduledAutoSuggest()
      dismissSuggestWidget()
    })

    const scheduleAutoSuggest = (force = false) => {
      if (!force && isAutocompleteSuppressed()) return
      if (suggestRaf) cancelAnimationFrame(suggestRaf)
      suggestRaf = requestAnimationFrame(() => {
        suggestRaf = 0
        if (suggestTimer) clearTimeout(suggestTimer)
        suggestTimer = setTimeout(() => {
          if (!editor || props.readonly) return
          if (!force && isAutocompleteSuppressed()) return
          const model = editor.getModel()
          const position = editor.getPosition()
          if (!model || !position) return
          const prefix = model.getValueInRange(
              new monaco.Range(1, 1, position.lineNumber, position.column),
          )
          if (isCursorInStringOrCommentCached(prefix, prefix.length)) return
          editor.trigger('sql-editor', 'editor.action.triggerSuggest', {auto: true})
        }, 80)
      })
    }

    editor.onDidChangeModelContent((event) => {
      emit('update:modelValue', editor?.getValue() ?? '')
      scheduleColumnDiagnostics()
      scheduleStatementFrame()
      tryFormatAsYouType(event)
      const forceColumnRef = event.changes.some((change) => {
        if (!bypassesAutocompleteSuppress(change.text)) return false
        const model = editor?.getModel()
        const position = editor?.getPosition()
        if (!model || !position) return false
        const lineBefore = model.getLineContent(position.lineNumber).slice(0, position.column - 1)
        return lineBeforeIsColumnRef(lineBefore)
      })
      if (event.isFlush || (isAutocompleteSuppressed() && !forceColumnRef)) {
        cancelScheduledAutoSuggest()
        if (isAutocompleteSuppressed() && !forceColumnRef) dismissSuggestWidget()
        return
      }
      const shouldSchedule = event.changes.some((change) => shouldScheduleEditorAutoSuggest(change.text))
      if (!shouldSchedule) return
      scheduleAutoSuggest(forceColumnRef)
    })
    editor.onDidChangeCursorPosition(() => {
      emitCursorChange()
      scheduleStatementFrame()
    })
    editor.onDidFocusEditorText(() => {
      emit('focus')
      scheduleColumnDiagnostics()
      scheduleStatementFrame()
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
  bindLineShortcuts()
  emitCursorChange()
  scheduleColumnDiagnostics()
  scheduleStatementFrame()
  void syncVimMode()
}

watch(
    () => props.modelValue,
    (value) => {
      if (editor && editor.getValue() !== value) {
        suppressAutocomplete(200)
        cancelScheduledAutoSuggest()
        editor.setValue(value)
        dismissSuggestWidget()
        scheduleColumnDiagnostics()
        scheduleStatementFrame()
      }
    },
)

watch(
    () => sqlEditorSettingsVersion.value,
    () => {
      syncSuggestDetailsHostAttr()
      applyEditorOptions()
      bindRunGutter()
      bindTablePeek()
      if (editor && !props.preview && !getSqlEditorShowSuggestDetails()) {
        applySqlSuggestDetailsSetting(editor, false)
      }
      scheduleColumnDiagnostics()
      scheduleStatementFrame()
      void syncVimMode()
    },
)

watch(
    () => [
      resolveTheme(),
      props.monacoOptions,
      globalConfig?.monacoOptions?.(),
      sqlEditorSettingsVersion.value,
      globalConfig?.theme !== undefined ? unref(globalConfig.theme) : undefined,
    ],
    () => {
      applyEditorOptions()
      if (overflowWidgetsHost) {
        overflowWidgetsHost.dataset.tone = uiTone.value
      }
    },
    {deep: true},
)

watch(
    () => [props.readonly, props.keybindings, props.customHandlers, sqlEditorSettingsVersion.value] as const,
    () => {
      editor?.updateOptions({readOnly: props.readonly ?? false})
      bindLineShortcuts()
      bindRunGutter()
      bindTablePeek()
    },
    {deep: true},
)

onBeforeUnmount(() => {
  if (initRafOuter) cancelAnimationFrame(initRafOuter)
  if (initRafInner) cancelAnimationFrame(initRafInner)
  if (diagnosticTimer) clearTimeout(diagnosticTimer)
  if (statementFrameTimer) clearTimeout(statementFrameTimer)
  clearColumnDiagnostics()
  clearStatementFrame()
  disposeVimMode()
  suggestDetailsDisposable?.dispose()
  suggestWidthDisposable?.dispose()
  suggestAcceptDisposable?.dispose()
  lineShortcutDisposable?.dispose()
  selectionSyncDisposable?.dispose()
  runGutterDisposable?.dispose()
  tablePeekDisposable?.dispose()
  editor?.dispose()
  editor = null
  overflowWidgetsHost?.remove()
  overflowWidgetsHost = null
})

defineExpose({
  getSelectedText,
  getExecutableSql,
  getCurrentLineSql,
  getCurrentLineNumber,
  getSelectionStartLine,
  formatDocument,
  formatSelection,
  foldAll,
  unfoldAll,
  layout,
  insertTextAtCursor,
  insertSnippetAtCursor,
  insertAiGeneratedSql,
  applyAiActionResult,
  triggerSuggest,
  goToLine,
  clearErrorLine,
  setErrorLine,
  refreshColumnDiagnostics: scheduleColumnDiagnostics,
})
</script>

<template>
  <div class="sql-monaco-shell" :data-tone="uiTone">
    <div ref="containerRef" class="sql-monaco-host"/>
    <div
        ref="vimStatusRef"
        class="sql-monaco-vim-status"
        hidden
        aria-live="polite"
    />
  </div>
</template>

<style scoped>
.sql-monaco-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 120px;
}

.sql-monaco-host {
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  /* 与 DwOverlayScroll / --dw-scrollbar-* 同色同宽，避免 Monaco 专用淡色显得更细 */
  --sql-scrollbar-thumb: var(--dw-overlay-sb-thumb, var(--dw-scrollbar-thumb, color-mix(in srgb, #94a3b8 50%, transparent)));
  --sql-scrollbar-thumb-hover: var(--dw-overlay-sb-thumb-hover, var(--dw-scrollbar-thumb-hover, color-mix(in srgb, #94a3b8 72%, transparent)));
  --sql-scrollbar-track: var(--dw-overlay-sb-track, var(--dw-scrollbar-track, transparent));
}

.sql-monaco-shell[data-tone='dark'] .sql-monaco-host {
  --sql-scrollbar-thumb: var(--dw-overlay-sb-thumb, var(--dw-scrollbar-thumb, color-mix(in srgb, #94a3b8 72%, #000)));
  --sql-scrollbar-thumb-hover: var(--dw-overlay-sb-thumb-hover, var(--dw-scrollbar-thumb-hover, color-mix(in srgb, #94a3b8 88%, #000)));
}

.sql-monaco-shell[data-tone='light'] .sql-monaco-host {
  --sql-scrollbar-thumb: var(--dw-overlay-sb-thumb, var(--dw-scrollbar-thumb, color-mix(in srgb, #94a3b8 50%, transparent)));
  --sql-scrollbar-thumb-hover: var(--dw-overlay-sb-thumb-hover, var(--dw-scrollbar-thumb-hover, color-mix(in srgb, #94a3b8 72%, transparent)));
}

.sql-monaco-vim-status {
  flex: 0 0 auto;
  min-height: 22px;
  padding: 2px 10px;
  font-family: var(--dw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 12px;
  line-height: 18px;
  color: var(--dw-text-secondary, #9ca3af);
  background: color-mix(in srgb, var(--dw-surface-raised, #1f2937) 88%, transparent);
  border-top: 1px solid color-mix(in srgb, var(--dw-border, #374151) 80%, transparent);
}
</style>

<style src="@sql-editor/styles/suggest-icons.css"></style>
<style src="@sql-editor/styles/monaco-overlay-scrollbar.css"></style>

<style>
.monaco-editor .sql-editor-current-statement {
  background: color-mix(in srgb, #3b82f6 7%, transparent);
  box-shadow: inset 3px 0 0 color-mix(in srgb, #3b82f6 55%, transparent);
}

.monaco-editor .sql-editor-error-line {
  background: color-mix(in srgb, #ef4444 12%, transparent);
}

.monaco-editor .sql-editor-error-glyph {
  background: #ef4444;
  border-radius: 50%;
  margin-left: 4px;
  width: 8px !important;
  height: 8px !important;
}

.monaco-editor .sql-editor-run-gutter-glyph {
  box-sizing: border-box;
  width: 14px !important;
  height: 14px !important;
  margin-left: 2px;
  cursor: pointer;
  opacity: 0.95;
  background: no-repeat center / 12px 12px
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%2322c55e' d='M4.2 2.8v10.4c0 .55.6.88 1.08.6l7.8-4.55c.48-.28.48-.97 0-1.25L5.28 3.2c-.48-.27-1.08.06-1.08.6z'/%3E%3C/svg%3E");
}

.monaco-editor .sql-editor-run-gutter-glyph:hover {
  opacity: 1;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%2316a34a' d='M4.2 2.8v10.4c0 .55.6.88 1.08.6l7.8-4.55c.48-.28.48-.97 0-1.25L5.28 3.2c-.48-.27-1.08.06-1.08.6z'/%3E%3C/svg%3E");
}

.monaco-editor .sql-editor-table-peek-link {
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

/* 无 documentation 时只有 detail 标题（如 Table · alias）——隐藏空详情，避免一闪 */
:is(.sql-monaco-host[data-suggest-details='on'] .monaco-editor, .sql-monaco-overflow-host[data-suggest-details='on']) .suggest-details:not(.detail-and-doc),
:is(.sql-monaco-host[data-suggest-details='on'] .monaco-editor, .sql-monaco-overflow-host[data-suggest-details='on']) .suggest-widget.shows-details:not(:has(.suggest-details.detail-and-doc)) .suggest-details-container {
  display: none !important;
  visibility: hidden !important;
  pointer-events: none !important;
}

/* 补全二级预览面板：隐藏关闭钮、与一级列表留缝、归属箭头 */
:is(.sql-monaco-host[data-suggest-details='on'] .monaco-editor, .sql-monaco-overflow-host[data-suggest-details='on']) .suggest-details > .monaco-scrollable-element > .body > .header > .codicon-close {
  display: none !important;
}

:is(.sql-monaco-host[data-suggest-details='on'] .monaco-editor, .sql-monaco-overflow-host[data-suggest-details='on']) .suggest-details-container {
  --dw-suggest-details-gap: 12px;
  --dw-suggest-details-ty: 0px;
  margin-left: var(--dw-suggest-details-gap);
  position: relative;
  /* 整块二级面板随选中行上下移动（箭头锚在面板上部） */
  transform: translateY(var(--dw-suggest-details-ty));
}

/* 箭头底边与二级框左边框对齐，外圈描边 + 内芯填色 */
:is(.sql-monaco-host[data-suggest-details='on'] .monaco-editor, .sql-monaco-overflow-host[data-suggest-details='on']) .suggest-details-container::before {
  content: '';
  position: absolute;
  left: 0;
  top: var(--dw-suggest-arrow-top, 24px);
  transform: translate(calc(-100% - 1px), -50%);
  border-style: solid;
  border-width: 7px 8px 7px 0;
  border-color: transparent;
  border-right-color: color-mix(in srgb, var(--vscode-editorSuggestWidget-border, #454545) 72%, transparent);
  pointer-events: none;
  z-index: 1;
}

:is(.sql-monaco-host[data-suggest-details='on'] .monaco-editor, .sql-monaco-overflow-host[data-suggest-details='on']) .suggest-details-container::after {
  content: '';
  position: absolute;
  left: 0;
  top: var(--dw-suggest-arrow-top, 24px);
  transform: translate(-100%, -50%);
  border-style: solid;
  border-width: 6px 7px 6px 0;
  border-color: transparent;
  border-right-color: var(--vscode-editorSuggestWidget-background, #252526);
  pointer-events: none;
  z-index: 2;
}

/* 二级面板：说明标题（简洁单行） */
:is(.sql-monaco-host[data-suggest-details='on'] .monaco-editor, .sql-monaco-overflow-host[data-suggest-details='on']) .suggest-details > .monaco-scrollable-element > .body > .header > .type {
  opacity: 0.62;
  margin: 0 !important;
  padding: 6px 10px 4px !important;
  font-size: 10px;
  font-weight: normal;
  line-height: 1.35;
  white-space: normal;
  word-break: break-word;
  color: var(--vscode-editorSuggestWidget-foreground, #cccccc);
  border-bottom: 1px solid color-mix(in srgb, var(--vscode-editorSuggestWidget-border, #454545) 38%, transparent);
}

:is(.sql-monaco-host[data-suggest-details='on'] .monaco-editor, .sql-monaco-overflow-host[data-suggest-details='on']) .suggest-details.detail-and-doc > .monaco-scrollable-element > .body > .header > .type {
  padding-bottom: 4px !important;
}

/* 二级面板：字段卡片 / SQL 预览 */
:is(.sql-monaco-host[data-suggest-details='on'] .monaco-editor, .sql-monaco-overflow-host[data-suggest-details='on']) .suggest-details > .monaco-scrollable-element > .body > .docs {
  margin: 0 !important;
  padding: 8px 12px 10px !important;
  font-family: var(--vscode-font-family, system-ui, sans-serif);
  font-size: 12px;
  line-height: 1.5;
  opacity: 1;
  color: var(--vscode-editorSuggestWidget-foreground, #cccccc);
  white-space: pre-wrap;
}

:is(.sql-monaco-host[data-suggest-details='on'] .monaco-editor, .sql-monaco-overflow-host[data-suggest-details='on']) .suggest-details > .monaco-scrollable-element > .body > .docs.markdown-docs {
  padding: 8px 12px 10px !important;
  white-space: normal;
}

:is(.sql-monaco-host[data-suggest-details='on'] .monaco-editor, .sql-monaco-overflow-host[data-suggest-details='on']) .suggest-details > .monaco-scrollable-element > .body > .docs.markdown-docs > div,
:is(.sql-monaco-host[data-suggest-details='on'] .monaco-editor, .sql-monaco-overflow-host[data-suggest-details='on']) .suggest-details > .monaco-scrollable-element > .body > .docs.markdown-docs > span:not(:empty) {
  padding: 0 !important;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
}

/* 注释主标题：一眼便知 */
:is(.sql-monaco-host[data-suggest-details='on'] .monaco-editor, .sql-monaco-overflow-host[data-suggest-details='on']) .suggest-details .docs.markdown-docs strong {
  display: block;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--vscode-editorSuggestWidget-foreground, #e8eaed);
  margin: 0 0 6px;
}

/* 限定名 / 类型等 code：次要身份信息 */
:is(.sql-monaco-host[data-suggest-details='on'] .monaco-editor, .sql-monaco-overflow-host[data-suggest-details='on']) .suggest-details .docs.markdown-docs code {
  font-family: var(--monaco-monospace-font, ui-monospace, monospace);
  font-size: 11px;
  font-weight: 500;
  padding: 1px 5px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--vscode-editorSuggestWidget-foreground, #ccc) 10%, transparent);
  color: color-mix(in srgb, var(--vscode-editorSuggestWidget-foreground, #ccc) 82%, transparent);
}

:is(.sql-monaco-host[data-suggest-details='on'] .monaco-editor, .sql-monaco-overflow-host[data-suggest-details='on']) .suggest-details .docs.markdown-docs p {
  margin: 0 0 5px !important;
  opacity: 0.88;
}

:is(.sql-monaco-host[data-suggest-details='on'] .monaco-editor, .sql-monaco-overflow-host[data-suggest-details='on']) .suggest-details .docs.markdown-docs p:last-child {
  margin-bottom: 0 !important;
}

/* 片段 SQL：仍用等宽；盖过上方 sans 默认 */
:is(.sql-monaco-host[data-suggest-details='on'] .monaco-editor, .sql-monaco-overflow-host[data-suggest-details='on']) .suggest-details .monaco-tokenized-source,
:is(.sql-monaco-host[data-suggest-details='on'] .monaco-editor, .sql-monaco-overflow-host[data-suggest-details='on']) .suggest-details .monaco-tokenized-source span {
  color: inherit !important;
  font-family: var(--monaco-monospace-font, ui-monospace, monospace) !important;
  font-size: 11px !important;
  background: transparent !important;
}

/* 主滚动条样式见 monaco-overlay-scrollbar.css */

/*
 * 补全弹层：克制紧凑（无 pill、无左侧强调条）。
 * 行高只由 suggestLineHeight 控制，勿在此用 CSS 改 monaco-list-row height。
 */
:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget {
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--vscode-editorSuggestWidget-border, #3e4451) !important;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.32);
  background: var(--vscode-editorSuggestWidget-background, #2c313c) !important;
}

/* 行高交给 suggestLineHeight，禁止 !important 改 height（会虚列表错位留白） */
:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget .monaco-list-row.focused {
  background: var(--vscode-editorSuggestWidget-selectedBackground, #3a4050) !important;
}

/* 分组标题（CompletionItemKind.Text）：弱化图标与字重，避免当成可选项 */
:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget .monaco-list-row .codicon-symbol-text {
  opacity: 0.35;
  font-size: 11px !important;
}
:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget .monaco-list-row .codicon-symbol-text + .main .label-name,
:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget .monaco-list-row .suggest-icon.codicon-symbol-text ~ .main .label-name {
  font-weight: 600;
  font-size: 10px;
  letter-spacing: 0.04em;
  opacity: 0.55;
  text-transform: none;
}

:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget .monaco-list-row > .contents {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0 8px 0 4px;
  box-sizing: border-box;
}

/* 左侧图标：固定槽位，与文字垂直居中对齐 */
:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget .monaco-list-row > .contents > .icon {
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
  margin: 0 6px 0 0;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

/*
 * Monaco 行结构：.contents > .main > (.left | .right)
 * .left：名称 + signature-label（label.detail）
 * .right：details-label（label.description）+ readMore
 */
:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget .monaco-list-row .main {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  overflow: hidden;
}

:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget .monaco-list-row > .contents > .main > .left {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  align-items: center;
}

:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget .monaco-list-row > .contents > .main > .right {
  /* 勿 flex-shrink：否则长 description / 悬停 readMore 会把右侧裁成「lias pr」并抖动 */
  flex: 0 0 auto !important;
  flex-shrink: 0 !important;
  max-width: none !important;
  overflow: visible !important;
  align-items: center;
  margin-left: 10px;
}

:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget .monaco-list-row .monaco-icon-label {
  max-width: 100%;
  display: flex;
  align-items: center;
}

:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget .monaco-list-row .monaco-icon-label .label-name {
  font-weight: 500;
  letter-spacing: 0;
  line-height: 1.2;
  color: var(--vscode-editorSuggestWidget-foreground, #f5f6f8);
}

:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget .monaco-list-row .monaco-icon-label .label-name .highlight,
:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget .monaco-list-row .monaco-highlighted-label .highlight,
:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget:not(.frozen) .monaco-highlighted-label .highlight {
  color: var(--vscode-editorSuggestWidget-highlightForeground, #8cc2ff) !important;
  font-weight: inherit !important;
}

/* IconLabel 内 detail（少用）；表/列旁注走 signature-label */
:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget .monaco-list-row .monaco-icon-label .label-name .label-detail {
  margin-left: 6px;
  opacity: 0.92;
  font-weight: 500;
  font-size: 11px;
  color: #e8c547;
}

:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget .monaco-list-row .monaco-icon-label .label-description {
  display: none;
}

/* label.detail → signature-label（→ pr / (cdt) · PK） */
:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget .monaco-list-row .signature-label {
  margin-left: 6px;
  opacity: 0.92;
  font-weight: 500;
  font-size: 11px;
  color: #e8c547;
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/*
 * 右侧 description（KW / TBL / varchar…）：随内容定宽，禁止 44px 钉死裁字。
 * 悬停不改 width（覆盖 Monaco can-expand-details 规则）。
 */
:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget .monaco-list-row .details-label,
:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host)
  .suggest-widget:not(.docs-side)
  .monaco-list
  .monaco-list-row.focused:hover
  > .contents
  > .main
  > .right.can-expand-details
  > .details-label,
:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host)
  .suggest-widget.with-status-bar:not(.docs-side)
  .monaco-list
  .monaco-list-row:hover
  > .contents
  > .main
  > .right.can-expand-details
  > .details-label {
  flex: 0 0 auto !important;
  width: auto !important;
  min-width: 2.5em !important;
  /* 弹层会按内容动态加宽；此处只防止极端长类型把行撑爆 */
  max-width: 22em !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  padding: 0 0 0 10px !important;
  border: none !important;
  border-left: 1px solid color-mix(in srgb, #ffffff 14%, transparent) !important;
  border-radius: 0 !important;
  background: transparent !important;
  display: inline-flex !important;
  align-items: center;
  justify-content: flex-end;
  text-align: right;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Consolas, Menlo, monospace;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.01em;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 1 !important;
  color: #c2cad6;
  box-sizing: border-box !important;
}

:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget .monaco-list-row .details-label:empty {
  visibility: hidden;
  border-left-color: transparent !important;
}

:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget .monaco-list-row.focused .details-label {
  color: #e8ecf2;
}

:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget .monaco-list-row.focused .monaco-icon-label .label-name .label-detail,
:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget .monaco-list-row.focused .signature-label {
  opacity: 1;
  color: #f0d36a;
}

/* 有 status bar + 侧栏 docs：隐藏行内 readMore，避免悬停挤掉右侧文案 */
:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget .monaco-list-row .readMore {
  display: none !important;
  visibility: hidden !important;
  width: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
}

:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget > .suggest-status {
  border-top: 1px solid color-mix(
    in srgb,
    var(--vscode-editorSuggestWidget-border, #3e4451) 80%,
    transparent
  );
  padding: 2px 8px;
  font-size: 10px;
  line-height: 16px;
  color: var(--vscode-editorSuggestWidgetStatus-foreground, #b4bcc8);
  background: transparent;
  opacity: 1;
}

:is(.sql-monaco-host .monaco-editor, .sql-monaco-overflow-host) .suggest-widget > .suggest-status .action {
  opacity: 0.95;
}

:is(.sql-monaco-host[data-suggest-details='on'] .monaco-editor, .sql-monaco-overflow-host[data-suggest-details='on']) .suggest-details {
  border-radius: 6px;
  border: 1px solid var(--vscode-editorSuggestWidget-border, #3e4451) !important;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
  overflow: hidden;
  background: var(--vscode-editorSuggestWidget-background, #2c313c) !important;
}
</style>
