<script setup lang="ts">
import {computed, defineAsyncComponent, nextTick, ref, useSlots, watch} from 'vue'
import type {editor as MonacoEditorNS} from 'monaco-editor'
import {AppModal} from '@datawise/overlays'
import {DwIcon} from '@datawise/icons'
import {IconButton} from '@datawise/ui'
import {useCodeClipboard} from '../clipboard'
import {useCodeI18n} from '../code-i18n'
import {
  codeLanguageLabel,
  resolveCodeLanguage,
} from '../resolve-code-language'
import '../styles/content-viewer-modal.css'

/** Keep Monaco off the critical path — load only when the viewer mounts. */
const DwMonacoEditor = defineAsyncComponent(() => import('./DwMonacoEditor.vue'))

const props = withDefaults(
  defineProps<{
    content: string
    title?: string
    subtitle?: string
    /** Explicit Monaco language id */
    language?: string | null
    /** Content-type / product type hint */
    typeHint?: string | null
    /** File name or dataId for extension sniffing */
    filename?: string | null
    loading?: boolean
    emptyText?: string
    card?: boolean
    /** Force dark editor chrome (default true) */
    dark?: boolean
    readonly?: boolean
    /**
     * `monaco` (default) uses peer monaco-editor; `pre` is a lightweight fallback
     * when Monaco is unavailable or undesired.
     */
    engine?: 'monaco' | 'pre'
    /** Optional theme override for Monaco (default `vs-dark` when `dark`). */
    forceTheme?: string
  }>(),
  {
    content: '',
    loading: false,
    card: true,
    dark: true,
    readonly: true,
    engine: 'monaco',
  },
)

const emit = defineEmits<{
  'update:content': [value: string]
  copied: [ok: boolean]
}>()

const t = useCodeI18n()
const clipboard = useCodeClipboard()
const slots = useSlots()
const copyBusy = ref(false)
const expanded = ref(false)
const panelEditorRef = ref<{layout?: () => void} | null>(null)
const modalEditorRef = ref<{layout?: () => void} | null>(null)

const hasContent = computed(() => Boolean(props.content?.trim()))
const showEditor = computed(() => hasContent.value || !props.readonly)
const useMonaco = computed(() => props.engine === 'monaco')

function onContentInput(value: string) {
  if (props.readonly) return
  emit('update:content', value)
}

const resolvedLanguage = computed(() =>
  resolveCodeLanguage({
    language: props.language,
    typeHint: props.typeHint,
    filename: props.filename,
    content: props.content,
  }),
)

const languageBadge = computed(() => codeLanguageLabel(resolvedLanguage.value))

const resolvedForceTheme = computed(() => {
  if (props.forceTheme) return props.forceTheme
  return props.dark ? 'vs-dark' : undefined
})

const editorOptions: MonacoEditorNS.IStandaloneEditorConstructionOptions = {
  minimap: {enabled: false},
  wordWrap: 'on',
  lineNumbers: 'on',
  glyphMargin: false,
  folding: true,
  renderLineHighlight: 'line',
  scrollBeyondLastLine: false,
  scrollbar: {
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
  },
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  wordBasedSuggestions: 'off',
  parameterHints: {enabled: false},
  hover: {enabled: true},
  links: true,
}

async function copyContent() {
  if (!hasContent.value || copyBusy.value) return
  copyBusy.value = true
  try {
    const ok = await clipboard.writeText(props.content)
    emit('copied', ok)
  } finally {
    copyBusy.value = false
  }
}

async function openFullscreen() {
  expanded.value = true
  await nextTick()
  requestAnimationFrame(() => modalEditorRef.value?.layout?.())
}

function closeFullscreen() {
  expanded.value = false
  nextTick(() => panelEditorRef.value?.layout?.())
}

watch(expanded, async (open) => {
  if (!open) return
  await nextTick()
  requestAnimationFrame(() => modalEditorRef.value?.layout?.())
})

defineExpose({
  openFullscreen,
  closeFullscreen,
})
</script>

<template>
  <div
      class="dw-code-viewer"
      :class="{
        'dw-code-viewer--card': card,
        'dw-code-viewer--dark': dark,
        'is-loading': loading,
      }"
  >
    <header class="dw-code-viewer__head">
      <div class="dw-code-viewer__titles">
        <strong v-if="title" class="dw-code-viewer__title">{{ title }}</strong>
        <span class="dw-code-viewer__lang">{{ languageBadge }}</span>
        <span v-if="subtitle" class="dw-code-viewer__subtitle">{{ subtitle }}</span>
      </div>
      <div class="dw-code-viewer__actions">
        <slot name="actions"/>
        <IconButton
            size="sm"
            class="dw-code-viewer__icon-btn"
            :title="t('common.codeViewer.copy')"
            :disabled="!hasContent || loading || copyBusy"
            @click="copyContent"
        >
          <DwIcon name="copy" size="sm"/>
        </IconButton>
        <IconButton
            size="sm"
            class="dw-code-viewer__icon-btn"
            :title="t('common.codeViewer.expand')"
            :disabled="loading"
            @click="openFullscreen"
        >
          <DwIcon name="fullscreen" size="sm"/>
        </IconButton>
      </div>
    </header>

    <div class="dw-code-viewer__body">
      <div v-if="loading" class="dw-code-viewer__overlay">
        {{ t('common.codeViewer.loading') }}
      </div>
      <div v-else-if="!showEditor" class="dw-code-viewer__empty">
        {{ emptyText || t('common.codeViewer.empty') }}
      </div>
      <DwMonacoEditor
          v-else-if="useMonaco"
          ref="panelEditorRef"
          :model-value="content ?? ''"
          :language="resolvedLanguage"
          :readonly="readonly"
          :force-theme="resolvedForceTheme"
          :extra-options="editorOptions"
          @update:model-value="onContentInput"
      />
      <pre v-else class="dw-code-viewer__pre">{{ content }}</pre>
    </div>
  </div>

  <AppModal
      :open="expanded"
      :title="title || t('common.codeViewer.expandTitle')"
      :subtitle="subtitle"
      width="min(1280px, 98vw)"
      max-height="min(94vh, 980px)"
      close-on-backdrop
      auto-focus="close"
      @close="closeFullscreen"
  >
    <template #header-actions>
      <span class="dw-code-viewer__lang">{{ languageBadge }}</span>
      <div class="dw-code-viewer__actions">
        <template v-if="slots.actions">
          <component :is="{ render: () => slots.actions?.() }"/>
        </template>
        <IconButton
            size="sm"
            class="dw-code-viewer__icon-btn"
            :title="t('common.codeViewer.copy')"
            :disabled="!hasContent || copyBusy"
            @click="copyContent"
        >
          <DwIcon name="copy" size="sm"/>
        </IconButton>
      </div>
    </template>

    <div
        class="dw-code-viewer__modal dw-content-viewer-modal"
        :class="{ 'dw-code-viewer__modal--dark': dark }"
    >
      <div class="dw-code-viewer__modal-body dw-content-viewer-modal__surface">
        <div v-if="!showEditor" class="dw-code-viewer__empty">
          {{ emptyText || t('common.codeViewer.empty') }}
        </div>
        <DwMonacoEditor
            v-else-if="useMonaco"
            ref="modalEditorRef"
            :model-value="content ?? ''"
            :language="resolvedLanguage"
            :readonly="readonly"
            :force-theme="resolvedForceTheme"
            :extra-options="editorOptions"
            @update:model-value="onContentInput"
        />
        <pre v-else class="dw-code-viewer__pre">{{ content }}</pre>
      </div>
    </div>
  </AppModal>
</template>

<style scoped>
.dw-code-viewer {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  gap: 0;
}

.dw-code-viewer--card {
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-panel);
  padding: 0;
  overflow: hidden;
}

.dw-code-viewer--dark.dw-code-viewer--card {
  border-color: var(--dw-terminal-border);
  background: var(--dw-terminal-bg);
}

.dw-code-viewer__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
  min-height: 32px;
  padding: 4px 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--dw-on-accent) 8%, transparent);
}

.dw-code-viewer:not(.dw-code-viewer--dark) .dw-code-viewer__head {
  border-bottom-color: var(--dw-border-light);
}

.dw-code-viewer__titles {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
  overflow: hidden;
}

.dw-code-viewer__title {
  font-size: var(--dw-text-sm);
  font-weight: 600;
  color: var(--dw-text);
  white-space: nowrap;
  flex-shrink: 0;
}

.dw-code-viewer--dark .dw-code-viewer__title {
  color: color-mix(in srgb, var(--dw-on-accent) 90%, var(--dw-terminal-fg));
}

.dw-code-viewer__lang {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 7px;
  border-radius: var(--dw-radius-pill);
  font-size: var(--dw-font-size-badge);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--dw-info);
  background: color-mix(in srgb, var(--dw-primary) 22%, transparent);
  border: 1px solid color-mix(in srgb, var(--dw-info) 35%, transparent);
  flex-shrink: 0;
  white-space: nowrap;
}

.dw-code-viewer__subtitle {
  margin: 0;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.dw-code-viewer__actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  margin-left: auto;
}

.dw-code-viewer__icon-btn {
  color: var(--dw-terminal-fg);
}

.dw-code-viewer__actions :deep(.dw-code-viewer__icon-btn) {
  color: var(--dw-terminal-fg);
}

.dw-code-viewer__icon-btn:hover:not(:disabled) {
  color: var(--dw-on-accent);
  background: color-mix(in srgb, var(--dw-on-accent) 10%, transparent);
}

.dw-code-viewer:not(.dw-code-viewer--dark) .dw-code-viewer__icon-btn {
  color: var(--dw-text-secondary);
}

.dw-code-viewer:not(.dw-code-viewer--dark) .dw-code-viewer__actions :deep(.dw-code-viewer__icon-btn) {
  color: var(--dw-text-secondary);
}

.dw-code-viewer:not(.dw-code-viewer--dark) .dw-code-viewer__icon-btn:hover:not(:disabled) {
  color: var(--dw-text);
  background: var(--dw-surface-hover, rgba(0, 0, 0, 0.04));
}

.dw-code-viewer__body {
  position: relative;
  flex: 1;
  min-height: 160px;
  border-radius: 0;
  overflow: hidden;
  background: var(--dw-terminal-input-bg);
}

.dw-code-viewer:not(.dw-code-viewer--dark) .dw-code-viewer__body {
  background: var(--dw-bg-editor);
}

.dw-code-viewer__overlay,
.dw-code-viewer__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  height: 100%;
  padding: 12px;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
}

.dw-code-viewer__pre {
  margin: 0;
  min-height: 160px;
  height: 100%;
  overflow: auto;
  padding: 10px 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--dw-text-sm);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--dw-terminal-fg);
}

.dw-code-viewer:not(.dw-code-viewer--dark) .dw-code-viewer__pre {
  color: var(--dw-text);
}

.dw-code-viewer__body :deep(.dw-monaco-host) {
  min-height: 160px;
  height: 100%;
}

.dw-code-viewer__modal {
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 1;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: var(--dw-terminal-bg);
}

.dw-code-viewer__modal-body {
  flex: 1;
  min-height: 0;
  border-radius: 0;
  overflow: hidden;
  background: var(--dw-terminal-input-bg);
  border: none;
}

.dw-code-viewer__modal:not(.dw-code-viewer__modal--dark) .dw-code-viewer__modal-body {
  background: var(--dw-bg-editor);
}

.dw-code-viewer__modal-body :deep(.dw-monaco-host) {
  height: 100%;
  min-height: 0;
}
</style>
