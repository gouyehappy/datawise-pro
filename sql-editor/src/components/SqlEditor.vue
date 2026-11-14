<script setup lang="ts">
import {computed, inject, onMounted, onUnmounted, ref, toRef, unref, watch, nextTick} from 'vue'
import type * as monaco from 'monaco-editor'
import SqlMonacoHost from './SqlMonacoHost.vue'
import SqlEditorHintBar from './SqlEditorHintBar.vue'
import SqlEditorAiBar from './SqlEditorAiBar.vue'
import SqlEditorSettingsDrawer from './SqlEditorSettingsDrawer.vue'
import {
  SQL_EDITOR_CONFIG_KEY,
  SQL_EDITOR_RUNTIME_KEY,
  SQL_EDITOR_SHORTCUTS_CONTROLLER_KEY,
} from '@sql-editor/config/injection'
import {
  sqlEditorSettingsVersion,
  getSqlEditorShowHintBar,
} from '@sql-editor/config/snippets/cache'
import {ensureSqlEditorSetup} from '@sql-editor/setup'
import {
  createSqlEditorRuntime,
  getDefaultSqlEditorRuntime,
  setActiveSqlEditorRuntime,
} from '@sql-editor/runtime/sql-editor-runtime'
import {resolveSqlDialectFile} from '@sql-editor/completion/dialect-aliases'
import {useSqlIntelliSense} from '@sql-editor/composables/useSqlIntelliSense'
import {useSqlEditorHints} from '@sql-editor/composables/useSqlEditorHints'
import {useSqlEditorI18n} from '@sql-editor/composables/useSqlEditorI18n'
import {readPersonalSqlEditorLayer, writePersonalSqlEditorLayer} from '@sql-editor/settings/personal-storage'
import {patchPersonalSqlEditorLayer} from '@sql-editor/settings/personal-layer-mutations'
import {schemaFingerprint, clearAnalysisCache} from '@sql-editor/completion/analysis-cache'
import {runSqlEditorAiAction} from '@sql-editor/ai/generate-sql'
import {
  aiActionAllowsEmptyPrompt,
  resolveAiDefaultPrompt,
  type SqlEditorAiAction,
} from '@sql-editor/ai/actions'
import {isSqlEditorAiReady, isSqlEditorAiCompletionEnabled} from '@sql-editor/ai/settings'
import type {
  SqlEditorExpose,
  SqlEditorGlobalConfig,
  SqlEditorSchema,
  SqlQuickAction,
  SqlGutterStatementPayload,
  SqlSchemaProvider
} from '@sql-editor/types'
import {resolveSqlTablePeekAtOffset, type SqlTablePeekPayload} from '@sql-editor/utils/sql-table-peek'
import {
    isSqlEditorThemeHostManaged,
    resolveSqlEditorTheme,
} from '@sql-editor/utils/resolve-editor-theme'

type SqlMonacoHostInstance = InstanceType<typeof SqlMonacoHost> & SqlEditorExpose
type SqlEditorAiBarInstance = InstanceType<typeof SqlEditorAiBar>

const props = withDefaults(
    defineProps<{
      readonly?: boolean
      /** 设置页预览：不响应内容变更与右键，且不写入全局补全上下文 */
      preview?: boolean
      /**
       * 强制覆盖提示条显隐；未传时必须跟 cache（showHintBar）。
       * 注意：Vue 对 Boolean prop 未传会落成 false，故默认显式 undefined。
       */
      showHintBar?: boolean
      /** 提示条右侧设置按钮 */
      showSettingsButton?: boolean
      /** 静态 schema（无数据源时也可补全） */
      schema?: SqlEditorSchema
      /** 动态 schema：连接 + 库 + provider */
      connectionId?: string
      databaseName?: string
      schemaProvider?: SqlSchemaProvider
      /** Data source type → keyword config (mysql / postgresql …) */
      dialect?: string
      /** Override injected Monaco theme */
      theme?: string
      /** 覆盖宿主注入的 Monaco 选项 */
      monacoOptions?: monaco.editor.IStandaloneEditorConstructionOptions
    }>(),
    {
      showSettingsButton: true,
      // 防止 Boolean 缺省 false 把 cache 里的 showHintBar:true 盖掉
      showHintBar: undefined,
    },
)

const sql = defineModel<string>({required: true})

const emit = defineEmits<{
  contextmenu: [payload: { x: number; y: number; selectedText: string }]
  'run-statement': [payload: SqlGutterStatementPayload]
  'open-table': [payload: SqlTablePeekPayload]
}>()

const sharedRuntime = inject(SQL_EDITOR_RUNTIME_KEY, getDefaultSqlEditorRuntime())
const globalConfig = inject(SQL_EDITOR_CONFIG_KEY, null as SqlEditorGlobalConfig | null)
const shortcutsController = inject(SQL_EDITOR_SHORTCUTS_CONTROLLER_KEY, null)
/** Preview shares global runtime; console tabs use isolated instances */
const runtime = props.preview
    ? sharedRuntime
    : createSqlEditorRuntime({
      snippetLayers: {
        external: sharedRuntime.getSnippetLayers().external,
        personal: readPersonalSqlEditorLayer(),
      },
    })

const settingsOpen = ref(false)
const aiGenerating = ref(false)
const aiError = ref('')
const aiSuccess = ref(false)
const aiBarOpen = ref(false)
const aiBarRef = ref<SqlEditorAiBarInstance>()
const aiSelectionActive = ref(false)
let aiAbortController: AbortController | null = null
let aiSuccessTimer = 0

const editorRef = ref<SqlMonacoHostInstance>()
const cursorOffset = ref(0)
/** HintBar 专用：rAF 合并光标更新，避免每像素触发重算 */
const hintCursorOffset = ref(0)
let hintCursorRaf = 0
let completionSyncRaf = 0
const ownsGlobalCompletion = ref(false)
const {locale: editorLocale, t: sqlEditorT} = useSqlEditorI18n()

const dialectLabel = computed(() => resolveSqlDialectFile(props.dialect)?.toUpperCase())

const effectiveTheme = computed(() => {
  void sqlEditorSettingsVersion.value
  return resolveSqlEditorTheme({
    personalTheme: runtime.getEffectiveSettings().theme,
    hostTheme: globalConfig?.theme !== undefined ? unref(globalConfig.theme) : undefined,
    propTheme: props.theme,
    hostManaged: isSqlEditorThemeHostManaged(globalConfig),
  })
})

const resolvedMonacoOptions = computed((): monaco.editor.IStandaloneEditorConstructionOptions => {
  void sqlEditorSettingsVersion.value
  if (props.monacoOptions) return props.monacoOptions
  const injected = globalConfig?.monacoOptions
  return typeof injected === 'function' ? injected() : {}
})

/**
 * 与 formatAsYouType 同一消费模型：默认只读全局 cache。
 * 仅当父组件显式传入 showHintBar 时才覆盖（未传 ≠ false，见 props 默认 undefined）。
 */
const hintBarEnabled = computed(() => {
  void sqlEditorSettingsVersion.value
  if (props.preview) return true
  if (typeof props.showHintBar === 'boolean') return props.showHintBar
  return getSqlEditorShowHintBar()
})

/** 本 tab runtime 的 personal 与 LS 对齐（不单独写 cache；发布由 sync / App controller 负责） */
function alignTabPersonalFromStorage() {
  runtime.setSnippetLayers({
    ...runtime.getSnippetLayers(),
    personal: readPersonalSqlEditorLayer(),
  })
}

/** 提示条隐藏：走与设置抽屉相同的 controller 写路径 */
function setHintBarVisible(visible: boolean) {
  if (props.preview) return
  if (shortcutsController) {
    shortcutsController.patchSettings({showHintBar: visible})
    return
  }
  // 无宿主 controller（包内预览）：LS + 本 tab sync → cache
  const personal = patchPersonalSqlEditorLayer(readPersonalSqlEditorLayer(), {showHintBar: visible})
  writePersonalSqlEditorLayer(personal)
  runtime.setSnippetLayers({...runtime.getSnippetLayers(), personal})
  runtime.sync()
}

const staticSchemaRef = computed(() => props.schema)

const {schema, loading} = useSqlIntelliSense({
  sql,
  schema: staticSchemaRef,
  connectionId: toRef(props, 'connectionId'),
  databaseName: toRef(props, 'databaseName'),
  schemaProvider: props.schemaProvider,
})

const aiSettings = computed(() => {
  void sqlEditorSettingsVersion.value
  return runtime.getEffectiveSettings().ai
})

const aiReady = computed(() => isSqlEditorAiReady(aiSettings.value))
const aiCompletionReady = computed(() => isSqlEditorAiCompletionEnabled(aiSettings.value))

const {contextInfo, statementLabel} = useSqlEditorHints(
    sql,
    hintCursorOffset,
    schema,
    editorLocale,
    toRef(props, 'dialect'),
    aiCompletionReady,
    aiSelectionActive,
)

const editorKeybindings = computed(() => {
  void sqlEditorSettingsVersion.value
  return runtime.getEffectiveSettings().keybindings
})

const aiShortcutLabel = computed(() => {
  void sqlEditorSettingsVersion.value
  const binding = editorKeybindings.value.find(
      (item) => item.command === 'sqlEditor.toggleAi' && item.enabled !== false,
  )
  return binding?.keys ?? 'Ctrl+Shift+I'
})

function openSettingsDrawer(): boolean {
  if (props.preview) return false
  settingsOpen.value = true
  return true
}

const editorCustomHandlers = {
  'sqlEditor.toggleAi': () => toggleAiBar(),
  'sqlEditor.openSettings': () => openSettingsDrawer(),
}

function pushCompletionContext() {
  if (props.preview) return
  clearAnalysisCache()
  runtime.setSchema(schema.value)
  runtime.setDialect(props.dialect)
  // 发布前用 LS 对齐本 tab，避免旧内存 personal 盖掉抽屉刚写入的开关
  alignTabPersonalFromStorage()
  runtime.sync()
  setActiveSqlEditorRuntime(runtime, {sync: false})
  ownsGlobalCompletion.value = true
}

function scheduleCompletionSync() {
  if (completionSyncRaf) return
  completionSyncRaf = requestAnimationFrame(() => {
    pushCompletionContext()
    completionSyncRaf = 0
  })
}

onMounted(() => {
  ensureSqlEditorSetup()
  pushCompletionContext()
  if (!props.preview) {
    runtime.setAiAssistHandler((payload) => triggerAiAssist(payload))
  }
})

onUnmounted(() => {
  if (hintCursorRaf) cancelAnimationFrame(hintCursorRaf)
  if (completionSyncRaf) cancelAnimationFrame(completionSyncRaf)
  if (aiSuccessTimer) window.clearTimeout(aiSuccessTimer)
  aiAbortController?.abort()
  if (!props.preview) {
    runtime.setAiAssistHandler(null)
  }
  if (ownsGlobalCompletion.value) {
    ownsGlobalCompletion.value = false
  }
  if (!props.preview) {
    runtime.dispose()
  }
})

watch(
    () => schemaFingerprint(schema.value.tables, schema.value.columns, schema.value.tableComments),
    () => {
      scheduleCompletionSync()
      editorRef.value?.refreshColumnDiagnostics?.()
    },
)

watch(
    () => props.dialect,
    () => scheduleCompletionSync(),
)

watch(
    () => [props.connectionId, props.databaseName] as const,
    () => scheduleCompletionSync(),
)

watch(editorLocale, () => scheduleCompletionSync())

watch(
    () => sqlEditorSettingsVersion.value,
    () => {
      if (props.preview) return
      runtime.setSnippetLayers({
        ...runtime.getSnippetLayers(),
        personal: readPersonalSqlEditorLayer(),
        external: sharedRuntime.getSnippetLayers().external,
      })
      // App controller 已发布 cache；各 tab 只对齐本地 runtime，不再二次写入
      runtime.sync({publishLayers: false})
    },
)

function syncAiSelectionState() {
  const selected = getSelectedText().trim()
  aiSelectionActive.value = Boolean(selected)
  if (!props.preview) runtime.setSelectedText(selected)
}

function onCursorChange(payload: { offset: number }) {
  cursorOffset.value = payload.offset
  if (aiBarOpen.value) syncAiSelectionState()
  if (hintCursorRaf) cancelAnimationFrame(hintCursorRaf)
  hintCursorRaf = requestAnimationFrame(() => {
    hintCursorOffset.value = payload.offset
    hintCursorRaf = 0
  })
}

function getSelectedText() {
  return editorRef.value?.getSelectedText() ?? ''
}

function getExecutableSql() {
  return editorRef.value?.getExecutableSql() ?? sql.value
}

function formatDocument() {
  return editorRef.value?.formatDocument() ?? false
}

function foldAll() {
  editorRef.value?.foldAll()
}

function unfoldAll() {
  editorRef.value?.unfoldAll()
}

function formatSelection() {
  return editorRef.value?.formatSelection() ?? false
}

function layout() {
  editorRef.value?.layout()
}

function insertTextAtCursor(text: string) {
  editorRef.value?.insertTextAtCursor(text)
}

function goToLine(lineNumber: number, highlight = true) {
  editorRef.value?.goToLine(lineNumber, highlight)
}

function clearErrorLine() {
  editorRef.value?.clearErrorLine()
}

function resolveTablePeek(sqlText: string, offset: number): SqlTablePeekPayload | null {
  if (props.preview) return null
  return resolveSqlTablePeekAtOffset(sqlText, offset, schema.value)
}

function onAliasClick(alias: string) {
  insertTextAtCursor(`${alias}.`)
}

function onQuickAction(action: SqlQuickAction) {
  if (action.aiAction) {
    triggerAiAssist(action.aiAction, action.aiPrompt ?? '')
    return
  }
  if (action.snippet) {
    editorRef.value?.insertSnippetAtCursor(action.insertText)
  } else {
    editorRef.value?.insertTextAtCursor(action.insertText)
  }
  if (action.triggerSuggest) {
    editorRef.value?.triggerSuggest()
  }
}

function formatAiError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return ''
  if (error instanceof Error) return error.message.slice(0, 240)
  return String(error).slice(0, 240)
}

function toggleAiBar(): boolean {
  if (!aiReady.value) return false
  if (aiGenerating.value) {
    aiBarOpen.value = true
    syncAiSelectionState()
    void nextTick(() => aiBarRef.value?.focus())
    return true
  }
  aiBarOpen.value = !aiBarOpen.value
  if (aiBarOpen.value) {
    syncAiSelectionState()
    void nextTick(() => aiBarRef.value?.focus())
  } else {
    aiError.value = ''
  }
  return true
}

function closeAiBar() {
  if (aiGenerating.value) return
  aiBarOpen.value = false
  aiError.value = ''
}

function clearAiSuccessFlash() {
  aiSuccess.value = false
  if (aiSuccessTimer) {
    window.clearTimeout(aiSuccessTimer)
    aiSuccessTimer = 0
  }
}

function flashAiSuccess() {
  clearAiSuccessFlash()
  aiSuccess.value = true
  aiSuccessTimer = window.setTimeout(() => {
    aiSuccess.value = false
    aiSuccessTimer = 0
  }, 2400)
}

function onAiCancel() {
  aiAbortController?.abort()
}

const aiHasSelection = computed(() => aiSelectionActive.value)
const aiHasSql = computed(() => Boolean(sql.value.trim()))

function shouldOpenAiBarFirst(action: SqlEditorAiAction, prompt: string): boolean {
  if (prompt.trim()) return false
  return action === 'generate' || action === 'mock' || action === 'fix'
}

function triggerAiAssist(
    actionOrPayload: SqlEditorAiAction | { action: SqlEditorAiAction; prompt?: string },
    promptArg = '',
) {
  if (!aiReady.value || aiGenerating.value) return
  const action = typeof actionOrPayload === 'string' ? actionOrPayload : actionOrPayload.action
  const prompt = typeof actionOrPayload === 'string' ? promptArg : (actionOrPayload.prompt ?? '')
  syncAiSelectionState()
  aiBarOpen.value = true
  aiError.value = ''
  if (shouldOpenAiBarFirst(action, prompt)) {
    void nextTick(() => aiBarRef.value?.prepare(action, prompt))
    return
  }
  void onAiSubmit(action, prompt)
}

async function onAiSubmit(action: SqlEditorAiAction, userPrompt: string) {
  if (!aiReady.value || aiGenerating.value) return

  const selection = getSelectedText().trim()
  const hasSqlContext = Boolean(selection || sql.value.trim())
  let prompt = userPrompt.trim()
  if (!prompt) {
    if (aiActionAllowsEmptyPrompt(action)) {
      prompt = resolveAiDefaultPrompt(action, editorLocale.value)
    } else {
      aiError.value = sqlEditorT('hintbar.ai_prompt_required')
      return
    }
  }

  if ((action === 'explain' || action === 'optimize') && !hasSqlContext) {
    aiError.value = sqlEditorT('hintbar.ai_need_sql')
    return
  }

  aiBarOpen.value = true
  aiError.value = ''
  clearAiSuccessFlash()
  aiAbortController?.abort()
  aiAbortController = new AbortController()
  aiGenerating.value = true
  try {
    const result = await runSqlEditorAiAction({
      ai: aiSettings.value,
      action,
      prompt,
      dialect: props.dialect,
      schema: schema.value,
      currentSql: sql.value,
      selection: selection || undefined,
      locale: editorLocale.value,
      signal: aiAbortController.signal,
    })
    editorRef.value?.applyAiActionResult(action, prompt, result)
    flashAiSuccess()
  } catch (error) {
    const message = formatAiError(error)
    if (message) aiError.value = message
  } finally {
    aiGenerating.value = false
    aiAbortController = null
  }
}

defineExpose<SqlEditorExpose>({
  getSelectedText,
  getExecutableSql,
  getCurrentLineSql: () => editorRef.value?.getCurrentLineSql() ?? '',
  getCurrentLineNumber: () => editorRef.value?.getCurrentLineNumber() ?? null,
  getSelectionStartLine: () => editorRef.value?.getSelectionStartLine() ?? null,
  formatDocument,
  formatSelection,
  foldAll,
  unfoldAll,
  layout,
  insertTextAtCursor,
  insertSnippetAtCursor: (snippet) => editorRef.value?.insertSnippetAtCursor(snippet),
  insertAiGeneratedSql: (prompt, generatedSql) => editorRef.value?.insertAiGeneratedSql(prompt, generatedSql),
  triggerSuggest: () => editorRef.value?.triggerSuggest(),
  goToLine,
  clearErrorLine,
  setErrorLine: (line) => editorRef.value?.setErrorLine(line ?? null),
  refreshColumnDiagnostics: () => editorRef.value?.refreshColumnDiagnostics?.(),
  openSettings: () => openSettingsDrawer(),
})
</script>

<template>
  <div
      class="sql-editor"
      :class="{ 'is-ai-generating': aiGenerating }"
      :data-hint-bar="hintBarEnabled ? 'on' : 'off'"
  >
    <template v-if="hintBarEnabled && !preview">
      <SqlEditorHintBar
          :context-info="contextInfo"
          :statement-label="statementLabel"
          :dialect-label="dialectLabel"
          :theme="effectiveTheme"
          :loading="loading"
          :show-settings="showSettingsButton"
          @alias-click="onAliasClick"
          @quick-action="onQuickAction"
          @open-settings="settingsOpen = true"
          @hide-hint-bar="setHintBarVisible(false)"
      />
      <SqlEditorAiBar
          v-if="aiReady && (aiBarOpen || aiGenerating)"
          ref="aiBarRef"
          :generating="aiGenerating"
          :error="aiError"
          :success="aiSuccess"
          :dialect-label="dialectLabel"
          :shortcut-label="aiShortcutLabel"
          :has-selection="aiHasSelection"
          :has-sql="aiHasSql"
          @submit="onAiSubmit"
          @cancel="onAiCancel"
          @dismiss-error="aiError = ''"
          @close="closeAiBar"
      />
    </template>
    <div class="sql-editor-surface">
      <SqlMonacoHost
          ref="editorRef"
          v-model="sql"
          :readonly="readonly"
          :preview="preview"
          :theme="effectiveTheme"
          :monaco-options="resolvedMonacoOptions"
          :keybindings="editorKeybindings"
          :custom-handlers="editorCustomHandlers"
          :run-gutter-hint="sqlEditorT('editor.run_gutter_hint')"
          :table-peek-hint="sqlEditorT('editor.table_peek_hint')"
          :resolve-table-peek="resolveTablePeek"
          @contextmenu="emit('contextmenu', $event)"
          @cursor-change="onCursorChange"
          @focus="pushCompletionContext"
          @run-statement="emit('run-statement', $event)"
          @open-table="emit('open-table', $event)"
      />
      <SqlEditorSettingsDrawer
          v-if="!preview"
          v-model:open="settingsOpen"
          :runtime="runtime"
          :dialect="dialect"
          :theme="effectiveTheme"
      />
    </div>
  </div>
</template>

<style scoped>
.sql-editor {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 120px;
}

.sql-editor-surface {
  position: relative;
  flex: 1;
  min-height: 0;
}

.sql-editor.is-ai-generating .sql-editor-surface::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: color-mix(in srgb, #7c3aed 4%, transparent);
  animation: sql-editor-ai-overlay 1.4s ease-in-out infinite;
  z-index: 2;
}

@keyframes sql-editor-ai-overlay {
  0%, 100% {
    opacity: 0.35;
  }
  50% {
    opacity: 0.7;
  }
}

.sql-editor-surface :deep(.sql-monaco-shell) {
  height: 100%;
}
</style>
