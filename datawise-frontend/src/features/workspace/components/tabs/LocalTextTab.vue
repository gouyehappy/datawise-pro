<script setup lang="ts">
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import type {WorkspaceTab} from '@/core/types'
import IconButton from '@/core/components/IconButton.vue'
import MonacoEditor from '@/core/components/MonacoEditor.vue'
import {ConfirmDialog, DwConsoleToolbar, EmptyState, UnsavedChangesDialog} from '@/core/components'
import ResizeHandle from '@/core/components/ResizeHandle.vue'
import {usePersistedSplitWidth} from '@/core/composables/usePersistedSplitWidth'
import {DwIcon} from '@/core/icons'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useLocalFilesStore} from '@/features/local-files/stores/local-files-store'
import {useLocalTextEditorShortcuts} from '@/features/workspace/composables/useLocalTextEditorShortcuts'
import {
  copyTextToClipboard,
  revealLocalInExplorer,
} from '@/features/local-files/services/local-files.service'
import {resolveLocalFileIcon} from '@/features/local-files/services/local-files-icon'
import {
  buildMarkdownOutlineTree,
  extractMarkdownOutline,
  findOutlineIdAtLine,
  renderLocalMarkdown,
} from '@/features/local-files/services/local-files-markdown'
import LocalMarkdownToc from '@/features/local-files/components/LocalMarkdownToc.vue'
import {loadLocalMarkdownAssetDataUrls} from '@/features/local-files/services/local-files-markdown-assets'
import {formatLocalJson} from '@/features/local-files/services/local-files-json'
import {fetchLocalGitLineMarks, type LocalGitLineMark} from '@/features/local-files/services/local-files-git-diff'
import {localFileRelativePath} from '@/features/local-files/services/local-files-workspace-tabs'
import {
  fileExtension,
  joinLocalPath,
  localFileBaseName,
  localFileParentPath,
  normalizeLocalPathKey,
} from '@/features/local-files/services/local-files-path'
import '@/features/local-files/styles/local-files-git-gutter.css'
import {isHttpUrl, openUrl} from '@/shared/browser/open-url'

type MarkdownViewMode = 'edit' | 'split' | 'preview'
type MonacoEditorExpose = InstanceType<typeof MonacoEditor>

const props = defineProps<{
  tab: WorkspaceTab
}>()

const {t} = useI18n()
const workspace = useWorkspaceStore()
const layout = useLayoutStore()
const explorer = useExplorerStore()
const localFiles = useLocalFilesStore()

const editorRef = ref<MonacoEditorExpose | null>(null)
const previewRef = ref<HTMLElement | null>(null)
const editorFocused = ref(false)
const gitLineMarks = ref<LocalGitLineMark[]>([])
let gitMarksToken = 0
let scrollSyncing = false
let disposeEditorScroll: (() => void) | null = null

const wordWrap = ref(false)
const editorExtraOptions = computed(() =>
  wordWrap.value ? {wordWrap: 'on' as const} : undefined,
)

const filePath = computed(() => props.tab.localFilePath?.trim() || '')
const fileName = computed(() =>
  filePath.value ? localFileBaseName(filePath.value) : (props.tab.title || ''),
)

const content = computed({
  get: () => props.tab.sql ?? '',
  set: (value: string) => {
    workspace.updateTabSql(props.tab.id, value)
  },
})

const language = computed(() => {
  const ext = fileExtension(filePath.value || props.tab.title)
  switch (ext) {
    case '.json':
      return 'json'
    case '.md':
    case '.markdown':
      return 'markdown'
    case '.xml':
    case '.html':
    case '.htm':
    case '.svg':
      return 'xml'
    case '.yml':
    case '.yaml':
      return 'yaml'
    case '.js':
    case '.jsx':
      return 'javascript'
    case '.ts':
    case '.tsx':
      return 'typescript'
    case '.css':
    case '.scss':
    case '.less':
      return 'css'
    case '.java':
      return 'java'
    case '.py':
      return 'python'
    case '.go':
      return 'go'
    case '.rs':
      return 'rust'
    case '.c':
    case '.h':
      return 'c'
    case '.cpp':
    case '.hpp':
      return 'cpp'
    case '.cs':
      return 'csharp'
    case '.php':
      return 'php'
    case '.rb':
      return 'ruby'
    case '.sh':
    case '.bash':
    case '.ps1':
    case '.bat':
    case '.cmd':
      return 'shell'
    default:
      return 'plaintext'
  }
})

const isMarkdown = computed(() => language.value === 'markdown')
const isJson = computed(() => language.value === 'json')

const TOC_STORAGE_KEY = 'dw-cli-local-text-md-toc'
const MD_VIEW_STORAGE_KEY = 'dw-cli-local-text-md-view'
const LEGACY_TOC_STORAGE_KEY = 'dw.local-text.md-toc'
const LEGACY_MD_VIEW_STORAGE_KEY = 'dw.local-text.md-view'
const TOC_WIDTH_KEY = 'dw.split.local-text-md-toc'
const TOC_MIN_WIDTH = 140
const TOC_MAX_WIDTH = 360

function readLocalStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function readTocPreference(): boolean {
  const raw = readLocalStorage(TOC_STORAGE_KEY) ?? readLocalStorage(LEGACY_TOC_STORAGE_KEY)
  if (raw === '0') return false
  if (raw === '1') return true
  return true
}

function readMdViewPreference(): MarkdownViewMode {
  const raw = readLocalStorage(MD_VIEW_STORAGE_KEY) ?? readLocalStorage(LEGACY_MD_VIEW_STORAGE_KEY)
  if (raw === 'edit' || raw === 'split' || raw === 'preview') return raw
  return 'edit'
}

function persistMdViewMode(mode: MarkdownViewMode) {
  try {
    localStorage.setItem(MD_VIEW_STORAGE_KEY, mode)
    localStorage.removeItem(LEGACY_MD_VIEW_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

const mdViewMode = ref<MarkdownViewMode>(readMdViewPreference())
const showEditor = computed(() => !isMarkdown.value || mdViewMode.value !== 'preview')
const showPreview = computed(() => isMarkdown.value && mdViewMode.value !== 'edit')
const isSplit = computed(() => isMarkdown.value && mdViewMode.value === 'split')
const showMarkdownToc = ref(readTocPreference())
const tocActiveId = ref<string | null>(null)

const {width: tocWidth} = usePersistedSplitWidth({
  key: TOC_WIDTH_KEY,
  defaultWidth: 220,
  min: TOC_MIN_WIDTH,
  max: TOC_MAX_WIDTH,
})

function toggleMarkdownToc() {
  if (!isMarkdown.value) return
  showMarkdownToc.value = !showMarkdownToc.value
  try {
    localStorage.setItem(TOC_STORAGE_KEY, showMarkdownToc.value ? '1' : '0')
    localStorage.removeItem(LEGACY_TOC_STORAGE_KEY)
  } catch {
    /* ignore */
  }
  void nextTick(() => editorRef.value?.layout())
}

const markdownOutline = computed(() =>
  isMarkdown.value ? extractMarkdownOutline(content.value) : [],
)
const markdownTocNodes = computed(() => buildMarkdownOutlineTree(markdownOutline.value))
const showTocPane = computed(() => isMarkdown.value && showMarkdownToc.value)

function scrollPreviewToHeading(id: string) {
  const root = previewRef.value
  if (!root) return
  const el = root.querySelector(`#${CSS.escape(id)}`)
  if (!(el instanceof HTMLElement)) return
  el.scrollIntoView({behavior: 'smooth', block: 'start'})
}

/** Skip scroll-spy briefly after TOC click so smooth scroll does not fight the selection. */
let tocSpyPausedUntil = 0

function onTocSelect(payload: {id: string; line: number}) {
  tocActiveId.value = payload.id
  tocSpyPausedUntil = Date.now() + 600
  if (showEditor.value) {
    editorRef.value?.goToLine(payload.line)
  }
  if (showPreview.value) {
    void nextTick(() => scrollPreviewToHeading(payload.id))
  }
}

function syncTocFromEditor() {
  if (!showTocPane.value || !showEditor.value) return
  if (Date.now() < tocSpyPausedUntil) return
  const line = editorRef.value?.getVisibleTopLine?.() ?? 1
  const next = findOutlineIdAtLine(markdownOutline.value, line)
  if (next && next !== tocActiveId.value) tocActiveId.value = next
}

function syncTocFromPreview() {
  if (!showTocPane.value || !showPreview.value) return
  if (Date.now() < tocSpyPausedUntil) return
  const root = previewRef.value
  if (!root) return
  const headings = root.querySelectorAll<HTMLElement>('.lf-md [id]')
  if (!headings.length) return
  const rootTop = root.getBoundingClientRect().top
  const threshold = rootTop + 12
  let active: string | null = null
  for (const el of headings) {
    if (el.getBoundingClientRect().top <= threshold) {
      active = el.id
    } else {
      break
    }
  }
  if (!active) active = headings[0]?.id ?? null
  if (active && active !== tocActiveId.value) tocActiveId.value = active
}

const assetDataUrls = ref<Record<string, string>>({})
const assetsLoading = ref(false)
let assetLoadToken = 0
let assetLoadTimer: ReturnType<typeof setTimeout> | null = null

watch(
    () => props.tab.id,
    () => {
      // Keep global MD view preference across tabs; only reset ephemeral preview state.
      assetDataUrls.value = {}
      tocActiveId.value = null
    },
)

watch(isMarkdown, (ok) => {
  if (!ok) {
    assetDataUrls.value = {}
    tocActiveId.value = null
  }
})

async function reloadPreviewAssets() {
  if (!showPreview.value || !filePath.value) {
    assetDataUrls.value = {}
    assetsLoading.value = false
    return
  }
  const token = ++assetLoadToken
  assetsLoading.value = true
  try {
    const map = await loadLocalMarkdownAssetDataUrls(filePath.value, content.value)
    if (token !== assetLoadToken) return
    assetDataUrls.value = map
  } finally {
    if (token === assetLoadToken) assetsLoading.value = false
  }
}

function scheduleReloadPreviewAssets() {
  if (assetLoadTimer) clearTimeout(assetLoadTimer)
  assetLoadTimer = setTimeout(() => {
    assetLoadTimer = null
    void reloadPreviewAssets()
  }, 120)
}

watch(
    [showPreview, filePath, () => content.value],
    ([preview]) => {
      if (!preview) {
        assetDataUrls.value = {}
        assetsLoading.value = false
        return
      }
      scheduleReloadPreviewAssets()
    },
    {immediate: true},
)

const previewHtml = computed(() => {
  if (!showPreview.value) return ''
  const baseDir = filePath.value ? localFileParentPath(filePath.value) : null
  const assets = assetDataUrls.value
  return renderLocalMarkdown(content.value, {
    resolveUrl: (url) => {
      const trimmed = url.trim()
      if (!trimmed) return trimmed
      if (/^(https?:|mailto:|data:|#)/i.test(trimmed)) return trimmed
      if (assets[trimmed]) return assets[trimmed]
      if (!baseDir) return trimmed
      const rel = trimmed.replace(/^\.\//, '')
      if (assets[rel]) return assets[rel]
      if (assets[`./${rel}`]) return assets[`./${rel}`]
      const abs = joinLocalPath(baseDir, rel)
      if (assets[abs]) return assets[abs]
      if (assets[normalizeLocalPathKey(abs)]) return assets[normalizeLocalPathKey(abs)]
      return assets[trimmed] || ''
    },
  })
})

const fileIcon = computed(() =>
  resolveLocalFileIcon({name: fileName.value, isDirectory: false}),
)

const dirty = computed(() => workspace.isTabDirty(props.tab.id))

function onEditorFocus() {
  editorFocused.value = true
}

function onEditorBlur() {
  editorFocused.value = false
}

const revealLabel = computed(() => {
  const ua = navigator.platform || ''
  if (/Mac/i.test(ua)) return t('explorer.localFiles.revealInFinder')
  if (/Win/i.test(ua)) return t('explorer.localFiles.revealInExplorer')
  return t('explorer.localFiles.revealInFileManager')
})

function setMarkdownView(mode: MarkdownViewMode) {
  if (!isMarkdown.value) return
  mdViewMode.value = mode
  persistMdViewMode(mode)
}

function previewScrollRatio(): number {
  const el = previewRef.value
  if (!el) return 0
  const max = el.scrollHeight - el.clientHeight
  if (max <= 0) return 0
  return Math.min(1, Math.max(0, el.scrollTop / max))
}

function applyPreviewScrollRatio(ratio: number) {
  const el = previewRef.value
  if (!el) return
  const max = el.scrollHeight - el.clientHeight
  if (max <= 0) return
  el.scrollTop = Math.min(1, Math.max(0, ratio)) * max
}

function syncPreviewFromEditor() {
  if (!isSplit.value || scrollSyncing) return
  scrollSyncing = true
  applyPreviewScrollRatio(editorRef.value?.getScrollRatio() ?? 0)
  requestAnimationFrame(() => {
    scrollSyncing = false
  })
}

function syncEditorFromPreview() {
  if (!isSplit.value || scrollSyncing) return
  scrollSyncing = true
  editorRef.value?.setScrollRatio(previewScrollRatio())
  requestAnimationFrame(() => {
    scrollSyncing = false
  })
}

function bindEditorScrollSpy() {
  disposeEditorScroll?.()
  disposeEditorScroll = null
  const editor = editorRef.value
  if (!editor) return
  disposeEditorScroll = editor.onDidScroll(() => {
    if (isSplit.value) syncPreviewFromEditor()
    syncTocFromEditor()
  })
  if (isSplit.value) {
    void nextTick(() => {
      editor.layout()
      syncPreviewFromEditor()
    })
  }
  syncTocFromEditor()
}

watch(isSplit, () => {
  bindEditorScrollSpy()
})

watch(showTocPane, () => {
  bindEditorScrollSpy()
})

watch(editorRef, () => {
  bindEditorScrollSpy()
})

watch(previewHtml, () => {
  if (isSplit.value) {
    void nextTick(() => syncPreviewFromEditor())
  }
  void nextTick(() => syncTocFromPreview())
})

watch(markdownOutline, () => {
  syncTocFromEditor()
  syncTocFromPreview()
})

function onPreviewScroll() {
  if (isSplit.value) syncEditorFromPreview()
  syncTocFromPreview()
}

function formatJson() {
  if (!isJson.value) return
  try {
    content.value = formatLocalJson(content.value)
    layout.showSuccessToast(t('explorer.localFiles.jsonFormatted'))
  } catch {
    layout.showErrorToast(t('explorer.localFiles.jsonFormatFailed'))
  }
}

async function save() {
  await workspace.saveDirtyTab(props.tab.id)
  void refreshGitLineMarks()
}

/** Markdown preview links must follow Settings — open links (CEF often ignores JS alone for target=_blank). */
function onPreviewLinkClick(event: MouseEvent) {
  if (event.button !== 0) return
  const target = event.target
  if (!(target instanceof Element)) return
  const anchor = target.closest('a[href]')
  if (!(anchor instanceof HTMLAnchorElement)) return
  const href = anchor.href?.trim() || ''
  if (!isHttpUrl(href)) return
  // In-doc heading jumps (#id)
  if (href.startsWith(window.location.origin) && href.includes('#')) return
  event.preventDefault()
  event.stopPropagation()
  void openUrl(href)
}

const {
  deleteConfirm,
  unsavedCloseOpen,
  unsavedCloseTitle,
  unsavedCloseMessage,
  resolveUnsavedClose,
  saveShortcutTitle,
  openShortcutTitle,
  deleteShortcutTitle,
  openFile,
  deleteFile,
} = useLocalTextEditorShortcuts({
  tabId: props.tab.id,
  save,
  filePath,
  fileName,
  dirty,
  editorFocused,
})

function countContentLines(text: string): number {
  if (!text) return 0
  let lines = 1
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) lines += 1
  }
  return lines
}

async function refreshGitLineMarks() {
  const path = filePath.value
  if (!path) {
    gitLineMarks.value = []
    return
  }
  const token = ++gitMarksToken
  const marks = await fetchLocalGitLineMarks(path, countContentLines(content.value))
  if (token !== gitMarksToken) return
  gitLineMarks.value = marks
}

function onWindowFocus() {
  void refreshGitLineMarks()
}

async function copyPath() {
  if (!filePath.value) return
  try {
    await copyTextToClipboard(filePath.value)
    layout.showSuccessToast(t('explorer.localFiles.copyPathDone'))
  } catch {
    layout.showErrorToast(t('explorer.localFiles.copyPathFailed'))
  }
}

async function copyRelativePath() {
  if (!filePath.value) return
  const root = localFiles.rootPath
  if (!root) {
    layout.showErrorToast(t('explorer.localFiles.noRoot'))
    return
  }
  const relative = localFileRelativePath(root, filePath.value)
  if (!relative) {
    layout.showErrorToast(t('explorer.localFiles.copyRelativePathFailed'))
    return
  }
  try {
    await copyTextToClipboard(relative)
    layout.showSuccessToast(t('explorer.localFiles.copyRelativePathDone'))
  } catch {
    layout.showErrorToast(t('explorer.localFiles.copyPathFailed'))
  }
}

function toggleWordWrap() {
  wordWrap.value = !wordWrap.value
}

async function reveal() {
  if (!filePath.value) return
  try {
    await revealLocalInExplorer(filePath.value)
  } catch {
    layout.showErrorToast(t('explorer.localFiles.revealFailed'))
  }
}

async function locate() {
  if (!filePath.value) return
  // Single entry: panel-mode rules + project vs local disk live in explorer-toolbar.actions
  const {runExplorerLocate} = await import('@/features/explorer/services/explorer-toolbar.actions')
  await runExplorerLocate()
}

watch(
    () => [filePath.value, props.tab.id] as const,
    () => {
      void refreshGitLineMarks()
    },
    {immediate: true},
)

/** Sticky shell keeps this pane mounted while hidden; relayout Monaco when it becomes the main tab again. */
watch(
    () => workspace.activeTabId === props.tab.id,
    (active) => {
      if (!active) return
      void nextTick(() => {
        editorRef.value?.layout()
      })
    },
)

watch(
    () => workspace.tabActivateRefreshSeq[props.tab.id] ?? 0,
    (seq, prev) => {
      if (!seq || seq === prev) return
      void nextTick(() => {
        editorRef.value?.layout()
      })
    },
)

onMounted(() => {
  window.addEventListener('focus', onWindowFocus)
  void refreshGitLineMarks()
})

onUnmounted(() => {
  window.removeEventListener('focus', onWindowFocus)
  gitMarksToken += 1
  disposeEditorScroll?.()
  disposeEditorScroll = null
  if (assetLoadTimer) clearTimeout(assetLoadTimer)
})
</script>

<script lang="ts">
export default {
  name: 'LocalTextTab',
}
</script>

<template>
  <section class="local-text-tab">
    <DwConsoleToolbar class="local-text-tab__chrome">
      <template #start>
      <div class="dw-console-actions dw-btn-group">
        <IconButton
            :disabled="!dirty"
            :title="saveShortcutTitle"
            :aria-label="saveShortcutTitle"
            @click="save"
        >
          <DwIcon class="dw-console-glyph" name="save" fit/>
        </IconButton>
        <IconButton
            :title="openShortcutTitle"
            :aria-label="openShortcutTitle"
            @click="openFile"
        >
          <DwIcon class="dw-console-glyph" name="open" fit/>
        </IconButton>
        <IconButton
            :title="deleteShortcutTitle"
            :aria-label="deleteShortcutTitle"
            :disabled="!filePath"
            @click="deleteFile"
        >
          <DwIcon class="dw-console-glyph" name="delete" fit/>
        </IconButton>
        <template v-if="isMarkdown">
          <IconButton
              :title="t('explorer.localFiles.markdownEdit')"
              :aria-label="t('explorer.localFiles.markdownEdit')"
              :active="mdViewMode === 'edit'"
              @click="setMarkdownView('edit')"
          >
            <DwIcon class="dw-console-glyph" name="editor" fit/>
          </IconButton>
          <IconButton
              :title="t('explorer.localFiles.markdownSplit')"
              :aria-label="t('explorer.localFiles.markdownSplit')"
              :active="mdViewMode === 'split'"
              @click="setMarkdownView('split')"
          >
            <DwIcon class="dw-console-glyph" name="layout" fit/>
          </IconButton>
          <IconButton
              :title="t('explorer.localFiles.markdownPreview')"
              :aria-label="t('explorer.localFiles.markdownPreview')"
              :active="mdViewMode === 'preview'"
              @click="setMarkdownView('preview')"
          >
            <DwIcon class="dw-console-glyph" name="settings-knowledge" fit/>
          </IconButton>
        </template>
        <IconButton
            v-if="isJson"
            :title="t('explorer.localFiles.formatJson')"
            :aria-label="t('explorer.localFiles.formatJson')"
            @click="formatJson"
        >
          <DwIcon class="dw-console-glyph" name="format" fit/>
        </IconButton>
        <span class="dw-console-divider" aria-hidden="true"/>
        <IconButton
            :title="t('explorer.locate')"
            :aria-label="t('explorer.locate')"
            :disabled="!filePath"
            @click="locate"
        >
          <DwIcon class="dw-console-glyph" name="locate" fit/>
        </IconButton>
        <IconButton
            :title="revealLabel"
            :aria-label="revealLabel"
            :disabled="!filePath"
            @click="reveal"
        >
          <DwIcon class="dw-console-glyph" name="open" fit/>
        </IconButton>
        <IconButton
            :title="t('explorer.localFiles.copyPath')"
            :aria-label="t('explorer.localFiles.copyPath')"
            :disabled="!filePath"
            @click="copyPath"
        >
          <DwIcon class="dw-console-glyph" name="copy" fit/>
        </IconButton>
        <IconButton
            :title="t('explorer.localFiles.copyRelativePath')"
            :aria-label="t('explorer.localFiles.copyRelativePath')"
            :disabled="!filePath"
            @click="copyRelativePath"
        >
          <DwIcon class="dw-console-glyph" name="link" fit/>
        </IconButton>
        <IconButton
            :title="t('explorer.localFiles.wordWrap')"
            :aria-label="t('explorer.localFiles.wordWrap')"
            :active="wordWrap"
            @click="toggleWordWrap"
        >
          <DwIcon class="dw-console-glyph" name="format" fit/>
        </IconButton>
      </div>
      </template>

      <template #context>
      <div class="local-text-tab__meta" :title="filePath || fileName">
        <span
            class="local-text-tab__file-icon"
            :class="`tone-${fileIcon.tone}`"
            aria-hidden="true"
        >
          <DwIcon :name="fileIcon.icon" size="md" :stroke-width="1.55"/>
        </span>
        <span class="local-text-tab__name">{{ fileName }}</span>
        <span
            v-if="dirty"
            class="local-text-tab__dirty"
            :title="t('explorer.localFiles.unsaved')"
        >●</span>
        <span v-if="filePath" class="local-text-tab__path">{{ filePath }}</span>
      </div>
      </template>
    </DwConsoleToolbar>

    <div
        class="local-text-tab__workspace"
        :class="{
          'has-toc': showTocPane,
          'toc-collapsed': isMarkdown && !showMarkdownToc,
        }"
    >
      <aside
          v-show="showTocPane"
          class="local-text-tab__toc-pane"
          :style="{ width: `${tocWidth}px` }"
      >
        <LocalMarkdownToc
            :nodes="markdownTocNodes"
            :active-id="tocActiveId"
            @select="onTocSelect"
        />
        <ResizeHandle
            v-model="tocWidth"
            :min="TOC_MIN_WIDTH"
            :max="TOC_MAX_WIDTH"
            variant="ghost"
            class="local-text-tab__toc-handle"
        />
        <!-- Seam toggle: folds the outline column without covering the editor -->
        <button
            type="button"
            class="local-text-tab__toc-edge is-open"
            :title="t('explorer.localFiles.markdownTocCollapse')"
            :aria-label="t('explorer.localFiles.markdownTocCollapse')"
            @click="toggleMarkdownToc"
        >
          <DwIcon name="chevron-left" size="xs" :stroke-width="2.2"/>
        </button>
      </aside>
      <div
          class="local-text-tab__body"
          :class="{ 'is-split': isSplit }"
      >
        <button
            v-if="isMarkdown && !showMarkdownToc"
            type="button"
            class="local-text-tab__toc-edge is-closed"
            :title="t('explorer.localFiles.markdownTocExpand')"
            :aria-label="t('explorer.localFiles.markdownTocExpand')"
            @click="toggleMarkdownToc"
        >
          <DwIcon name="list" size="sm" :stroke-width="1.85"/>
          <DwIcon name="chevron-right" size="xs" :stroke-width="2.2"/>
        </button>
        <div v-show="showEditor" class="local-text-tab__editor">
          <MonacoEditor
              ref="editorRef"
              v-model="content"
              :language="language"
              :extra-options="editorExtraOptions"
              :git-line-marks="gitLineMarks"
              @focus="onEditorFocus"
              @blur="onEditorBlur"
          />
        </div>
        <div
            v-show="showPreview"
            ref="previewRef"
            class="local-text-tab__preview"
            :class="{ 'is-loading-assets': assetsLoading }"
            tabindex="0"
            @scroll.passive="onPreviewScroll"
            @click.capture="onPreviewLinkClick"
        >
          <p v-if="assetsLoading" class="local-text-tab__preview-loading">
            {{ t('explorer.localFiles.markdownPreviewLoading') }}
          </p>
          <article
              v-if="previewHtml"
              class="lf-md"
              v-html="previewHtml"
          />
          <EmptyState
              v-else-if="!assetsLoading"
              class="local-text-tab__preview-empty"
              embedded
              compact
              :title="t('explorer.localFiles.markdownPreviewEmpty')"
          />
        </div>
      </div>
    </div>

    <ConfirmDialog
        :open="deleteConfirm.open.value"
        :title="deleteConfirm.title.value"
        :message="deleteConfirm.message.value"
        :confirm-label="deleteConfirm.confirmLabel.value"
        :confirm-variant="deleteConfirm.confirmVariant.value"
        :confirm-loading="deleteConfirm.confirmLoading.value"
        @update:open="deleteConfirm.onOpenUpdate"
        @confirm="deleteConfirm.onConfirm"
    />
    <UnsavedChangesDialog
        :open="unsavedCloseOpen"
        :title="unsavedCloseTitle"
        :message="unsavedCloseMessage"
        @update:open="(open) => { if (!open) resolveUnsavedClose('cancel') }"
        @save="resolveUnsavedClose('save')"
        @discard="resolveUnsavedClose('discard')"
        @cancel="resolveUnsavedClose('cancel')"
    />
  </section>
</template>

<style scoped>
.local-text-tab {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--dw-bg-editor);
}

.local-text-tab__chrome {
  flex-shrink: 0;
  gap: var(--dw-space-4);
  border-bottom: 1px solid var(--dw-border-light);
}

.local-text-tab__meta {
  display: flex;
  align-items: center;
  gap: var(--dw-space-2);
  min-width: 0;
  flex: 1;
  justify-content: flex-end;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
  line-height: 1.2;
}

.local-text-tab__file-icon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
}

.local-text-tab__file-icon.tone-sql { color: var(--dw-primary); }
.local-text-tab__file-icon.tone-markdown { color: var(--mp-tone-indigo); }
.local-text-tab__file-icon.tone-json { color: var(--mp-tone-amber); }
.local-text-tab__file-icon.tone-data { color: color-mix(in srgb, var(--mp-tone-sky) 70%, var(--dw-text-secondary)); }
.local-text-tab__file-icon.tone-sheet { color: var(--mp-tone-emerald); }
.local-text-tab__file-icon.tone-log { color: var(--dw-text-secondary); }
.local-text-tab__file-icon.tone-config { color: color-mix(in srgb, var(--dw-text-muted) 55%, var(--mp-tone-amber)); }
.local-text-tab__file-icon.tone-script { color: var(--mp-tone-emerald); }
.local-text-tab__file-icon.tone-code { color: var(--mp-tone-sky); }
.local-text-tab__file-icon.tone-text,
.local-text-tab__file-icon.tone-file { color: var(--dw-text-muted); }

.local-text-tab__name {
  flex-shrink: 0;
  max-width: 28ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dw-text);
  font-weight: 600;
}

.local-text-tab__dirty {
  flex-shrink: 0;
  font-size: var(--dw-font-size-badge);
  line-height: 1;
  color: var(--dw-primary);
}

.local-text-tab__path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.local-text-tab__workspace {
  position: relative;
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: stretch;
}

.local-text-tab__toc-pane {
  position: relative;
  flex: 0 0 auto;
  min-width: 0;
  min-height: 0;
  overflow: visible;
  box-shadow: inset -1px 0 0 color-mix(in srgb, var(--dw-border-light) 50%, transparent);
}

.local-text-tab__toc-handle {
  position: absolute;
  top: 0;
  right: -3px;
  bottom: 0;
  z-index: var(--dw-z-raised);
  width: 6px !important;
  margin: 0;
  cursor: col-resize;
  touch-action: none;
}

.local-text-tab__toc-handle:hover,
.local-text-tab__toc-handle.dragging {
  background: color-mix(in srgb, var(--dw-primary) 32%, transparent);
}

.local-text-tab__body {
  position: relative;
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/*
 * Seam edge control — lives on the column boundary so it never covers
 * Monaco text. Open: chevron on TOC right edge. Closed: list chip on body left.
 */
.local-text-tab__toc-edge {
  position: absolute;
  z-index: calc(var(--dw-z-raised) + 1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--dw-border-light) 75%, transparent);
  background: color-mix(in srgb, var(--dw-bg-panel) 92%, var(--dw-bg-editor));
  color: var(--dw-text-muted);
  cursor: pointer;
  box-shadow: var(--dw-shadow-sm);
  transition:
      color var(--dw-duration-fast) var(--dw-ease),
      background var(--dw-duration-fast) var(--dw-ease),
      border-color var(--dw-duration-fast) var(--dw-ease),
      box-shadow var(--dw-duration-fast) var(--dw-ease);
}

.local-text-tab__toc-edge:hover {
  color: var(--dw-primary);
  border-color: color-mix(in srgb, var(--dw-primary) 40%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-primary) 10%, var(--dw-bg-panel));
  box-shadow: 0 1px 4px color-mix(in srgb, var(--dw-primary) 18%, transparent);
}

.local-text-tab__toc-edge.is-open {
  top: 4px;
  right: 0;
  width: 18px;
  height: 24px;
  transform: translateX(50%);
  border-radius: var(--dw-radius-pill);
}

.local-text-tab__toc-edge.is-closed {
  top: 8px;
  left: 0;
  height: 28px;
  padding: 0 8px 0 6px;
  gap: 2px;
  border-radius: 0 var(--dw-control-radius) var(--dw-control-radius) 0;
  border-left: 0;
}

.local-text-tab__body.is-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
}

.local-text-tab__editor {
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.local-text-tab__body.is-split .local-text-tab__editor,
.local-text-tab__body.is-split .local-text-tab__preview {
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.local-text-tab__body.is-split .local-text-tab__preview {
  border-left: 1px solid var(--dw-border-light);
  overflow: auto;
}

@media (max-width: 720px) {
  .local-text-tab__body.is-split {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  }

  .local-text-tab__body.is-split .local-text-tab__preview {
    border-left: 0;
    border-top: 1px solid var(--dw-border-light);
  }
}

.local-text-tab__preview {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  padding: var(--dw-space-6) var(--dw-space-8);
  background: var(--dw-bg);
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--dw-scrollbar-thumb) var(--dw-scrollbar-track);
}

.local-text-tab__body.is-split .local-text-tab__editor {
  /* Monaco 自带滚动条；与预览 gutter 对齐 */
  scrollbar-gutter: stable;
}

.local-text-tab__preview-empty {
  margin: 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
}

.local-text-tab__preview-loading {
  margin: 0 0 var(--dw-space-4);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.local-text-tab__preview.is-loading-assets .lf-md {
  opacity: 0.72;
}

.lf-md {
  max-width: 52rem;
  margin: 0 auto;
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
  line-height: 1.65;
}

.lf-md :deep(.lf-md__h) {
  margin: 1.25em 0 0.5em;
  scroll-margin-top: var(--dw-space-4);
  font-weight: 650;
  line-height: 1.3;
  color: var(--dw-text);
}

.lf-md :deep(h1.lf-md__h) { font-size: var(--dw-text-display-sm); }
.lf-md :deep(h2.lf-md__h) { font-size: var(--dw-text-3xl); }
.lf-md :deep(h3.lf-md__h) { font-size: var(--dw-text-2xl); }
.lf-md :deep(h4.lf-md__h),
.lf-md :deep(h5.lf-md__h),
.lf-md :deep(h6.lf-md__h) { font-size: var(--dw-text-xl); }

.lf-md :deep(.lf-md__p) {
  margin: 0 0 0.85em;
}

.lf-md :deep(.lf-md__list) {
  margin: 0 0 0.85em;
  padding-left: 1.35em;
}

.lf-md :deep(.lf-md__list li) {
  margin: 0.2em 0;
}

.lf-md :deep(.lf-md__quote) {
  margin: 0 0 0.85em;
  padding: 0.35em 0 0.35em 0.9em;
  border-left: 3px solid color-mix(in srgb, var(--dw-primary) 45%, var(--dw-border));
  color: var(--dw-text-secondary);
}

.lf-md :deep(.lf-md__hr) {
  margin: 1.25em 0;
  border: 0;
  border-top: 1px solid var(--dw-border-light);
}

.lf-md :deep(.lf-md__code) {
  margin: 0 0 0.95em;
  padding: var(--dw-space-3) var(--dw-space-4);
  overflow: auto;
  border-radius: var(--dw-control-radius);
  background: color-mix(in srgb, var(--dw-bg-panel) 70%, var(--dw-bg-editor));
  border: 1px solid var(--dw-border-light);
  font-size: 0.92em;
  line-height: 1.45;
}

.lf-md :deep(code) {
  font-family: var(--dw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 0.92em;
}

.lf-md :deep(.lf-md__p code),
.lf-md :deep(.lf-md__list code),
.lf-md :deep(.lf-md__quote code),
.lf-md :deep(.lf-md__h code) {
  padding: 0.1em 0.35em;
  border-radius: var(--dw-radius-xs);
  background: color-mix(in srgb, var(--dw-text) 6%, transparent);
}

.lf-md :deep(a) {
  color: var(--dw-primary);
  text-decoration: none;
}

.lf-md :deep(a:hover) {
  text-decoration: underline;
}

.lf-md :deep(.lf-md__table-wrap) {
  margin: 0 0 0.95em;
  overflow: auto;
}

.lf-md :deep(.lf-md__table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95em;
}

.lf-md :deep(.lf-md__table th),
.lf-md :deep(.lf-md__table td) {
  padding: 0.4em 0.65em;
  border: 1px solid var(--dw-border-light);
  text-align: left;
}

.lf-md :deep(.lf-md__table th) {
  background: color-mix(in srgb, var(--dw-bg-panel) 80%, transparent);
  font-weight: 600;
}

.lf-md :deep(.lf-md__html) {
  margin: 0 0 0.85em;
}

.lf-md :deep(.lf-md__html:last-child) {
  margin-bottom: 0;
}

.lf-md :deep([align='center']) {
  text-align: center;
}

.lf-md :deep(img),
.lf-md :deep(.lf-md__img) {
  max-width: 100%;
  height: auto;
  border-radius: var(--dw-control-radius);
}

.lf-md :deep(p img),
.lf-md :deep(div img) {
  vertical-align: middle;
}
</style>
