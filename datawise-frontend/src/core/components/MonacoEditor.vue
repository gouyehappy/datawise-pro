<script setup lang="ts">
/**
 * Thin host wrapper around `@datawise/code` `DwMonacoEditor`.
 * Appearance via `registerCodeEditorHost` → `configureCodeEditorHost`.
 * SQL format stays host-side (`formatText` → `@datawise/sql-editor`).
 */
import {computed, onBeforeMount, ref} from 'vue'
import type * as monaco from 'monaco-editor'
import {DwMonacoEditor, type GitLineMark} from '@datawise/code'
import {formatSql} from '@datawise/sql-editor/utils/format'
import type {EditorThemeId} from '@/shared/config/editor-presets'
import type {LocalGitLineMark} from '@/shared/editor/git-line-marks'
import {ensureMonacoThemes} from '@/shared/config/monaco-editor-appearance'
import '@/styles/editor-minimap.css'
import '@datawise/sql-editor/styles/monaco-overlay-scrollbar.css'

type MonacoEditorExpose = {
  getSelectedText: () => string
  getExecutableSql: () => string
  getExecutableText: () => string
  formatDocument: () => boolean
  formatSelection: () => boolean
  layout: () => void
  getScrollRatio: () => number
  setScrollRatio: (ratio: number) => void
  onDidScroll: (listener: () => void) => () => void
  goToLine: (lineNumber: number) => void
  getVisibleTopLine: () => number
  setGitLineMarks: (marks: GitLineMark[] | null | undefined) => void
  clearGitLineMarks: () => void
  hasFocus: () => boolean
}

const props = defineProps<{
  modelValue: string
  language?: string
  readonly?: boolean
  /** 设置页预览：不响应右键菜单 */
  preview?: boolean
  /** 覆盖/追加 Monaco 选项（如 SQL 工程师模式） */
  extraOptions?: monaco.editor.IStandaloneEditorConstructionOptions
  /** 强制主题（如代码只读预览用 one-dark）；卸载时恢复用户主题 */
  forceTheme?: EditorThemeId
  /** Git gutter marks; re-applied after setValue (which clears decorations). */
  gitLineMarks?: LocalGitLineMark[] | null
}>()

defineEmits<{
  'update:modelValue': [value: string]
  contextmenu: [payload: {x: number; y: number; selectedText: string}]
  'cursor-change': [payload: {lineNumber: number; column: number; offset: number}]
  focus: []
  blur: []
}>()

const editorRef = ref<MonacoEditorExpose | null>(null)

/** PERF-03: themes are no longer registered at AppShell boot — ensure before first paint. */
onBeforeMount(() => {
  void ensureMonacoThemes()
})

/** Preserve host default language `sql` (package default is plaintext). */
const resolvedLanguage = computed(() => props.language ?? 'sql')

/** SQL-only formatter — omit for other languages so format* return false. */
const formatText = computed(() => {
  if (resolvedLanguage.value.toLowerCase() !== 'sql') return undefined
  return (text: string) => formatSql(text)
})

defineExpose({
  getSelectedText: () => editorRef.value?.getSelectedText() ?? '',
  getExecutableSql: () =>
    editorRef.value?.getExecutableSql?.() ?? editorRef.value?.getExecutableText?.() ?? '',
  getExecutableText: () => editorRef.value?.getExecutableText?.() ?? '',
  formatDocument: () => editorRef.value?.formatDocument() ?? false,
  formatSelection: () => editorRef.value?.formatSelection() ?? false,
  layout: () => editorRef.value?.layout(),
  getScrollRatio: () => editorRef.value?.getScrollRatio() ?? 0,
  setScrollRatio: (ratio: number) => editorRef.value?.setScrollRatio(ratio),
  onDidScroll: (listener: () => void) => editorRef.value?.onDidScroll(listener) ?? (() => {}),
  goToLine: (lineNumber: number) => editorRef.value?.goToLine(lineNumber),
  getVisibleTopLine: () => editorRef.value?.getVisibleTopLine() ?? 1,
  setGitLineMarks: (marks: LocalGitLineMark[] | null | undefined) =>
    editorRef.value?.setGitLineMarks(marks),
  clearGitLineMarks: () => editorRef.value?.clearGitLineMarks(),
  hasFocus: () => editorRef.value?.hasFocus() ?? false,
})
</script>

<template>
  <DwMonacoEditor
      ref="editorRef"
      :model-value="modelValue"
      :language="resolvedLanguage"
      :readonly="readonly"
      :preview="preview"
      :extra-options="extraOptions"
      :force-theme="forceTheme"
      :git-line-marks="gitLineMarks"
      :format-text="formatText"
      @update:model-value="$emit('update:modelValue', $event)"
      @contextmenu="$emit('contextmenu', $event)"
      @cursor-change="$emit('cursor-change', $event)"
      @focus="$emit('focus')"
      @blur="$emit('blur')"
  />
</template>
