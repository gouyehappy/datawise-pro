<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import type * as monaco from 'monaco-editor'
import MonacoEditor from '@/core/components/MonacoEditor.vue'
import {SSH_COMMAND_TEMPLATE} from '@/features/ssh/services/ssh-script-record-content.service'
import {
  ensureSshCommandMonacoLanguage,
  SSH_COMMAND_MONACO_LANGUAGE,
} from '@/features/ssh/services/ssh-command-monaco.language'
import {resolveScaledTerminalFontSize} from '@/shared/config/terminal-font-size'

ensureSshCommandMonacoLanguage()

const model = defineModel<string>({default: ''})

const props = defineProps<{
  placeholder?: string
  readonly?: boolean
}>()

const {t} = useI18n()

const shellFontSize = resolveScaledTerminalFontSize()

const editorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
  minimap: {enabled: false},
  wordWrap: 'on',
  lineNumbers: 'on',
  glyphMargin: false,
  folding: false,
  renderLineHighlight: 'line',
  padding: {top: 12, bottom: 12},
  fontSize: shellFontSize,
  lineHeight: Math.round(shellFontSize * 1.7),
  scrollbar: {
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
  },
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  overviewRulerBorder: false,
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  wordBasedSuggestions: 'off',
  parameterHints: {enabled: false},
  ariaLabel: props.placeholder || 'SSH quick commands',
}

function appendBlock(block: string) {
  const current = model.value ?? ''
  model.value = current.trim()
      ? `${current.replace(/\s+$/, '')}\n\n${block}`
      : block
}

function insertRunSection() {
  appendBlock(t('ssh.scriptRecord.insertRunBlock'))
}

function insertPasteSection() {
  appendBlock(t('ssh.scriptRecord.insertPasteBlock'))
}

function insertDescribed() {
  appendBlock(t('ssh.scriptRecord.insertDescribedBlock'))
}

function insertTemplate() {
  appendBlock(SSH_COMMAND_TEMPLATE)
}
</script>

<template>
  <div class="ssh-command-editor">
    <div class="ssh-command-editor__rail">
      <span class="ssh-command-editor__rail-label">{{ t('ssh.scriptRecord.insertSnippet') }}</span>
      <div class="ssh-command-editor__chips">
        <button type="button" class="ssh-command-editor__chip is-run" @click="insertRunSection">
          @run
        </button>
        <button type="button" class="ssh-command-editor__chip is-paste" @click="insertPasteSection">
          @paste
        </button>
        <button type="button" class="ssh-command-editor__chip" @click="insertDescribed">
          {{ t('ssh.scriptRecord.insertDescribed') }}
        </button>
        <button type="button" class="ssh-command-editor__chip" @click="insertTemplate">
          {{ t('ssh.scriptRecord.insertTemplate') }}
        </button>
      </div>
    </div>

    <div class="ssh-command-editor__monaco" :class="{'is-readonly': props.readonly}">
      <MonacoEditor
          v-model="model"
          :language="SSH_COMMAND_MONACO_LANGUAGE"
          :readonly="props.readonly"
          :extra-options="editorOptions"
      />
    </div>
  </div>
</template>

<style scoped>
.ssh-command-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.ssh-command-editor__rail {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
  flex-shrink: 0;
  min-height: var(--dw-density-md);
  padding: 0 var(--dw-space-4);
  border-bottom: 1px solid var(--dw-border-light);
  background: color-mix(in srgb, var(--dw-bg-panel) 55%, var(--dw-bg-editor));
}

.ssh-command-editor__rail-label {
  flex-shrink: 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
}

.ssh-command-editor__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-gap-sm);
  min-width: 0;
}

.ssh-command-editor__chip {
  border: 1px solid color-mix(in srgb, var(--dw-border) 80%, transparent);
  border-radius: var(--dw-control-radius-sm);
  padding: 2px 8px;
  background: var(--dw-bg);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  line-height: 1.4;
  cursor: pointer;
  transition:
      border-color var(--dw-duration-fast) var(--dw-ease),
      background var(--dw-duration-fast) var(--dw-ease),
      color var(--dw-duration-fast) var(--dw-ease);
}

.ssh-command-editor__chip:hover {
  color: var(--dw-text);
  border-color: color-mix(in srgb, var(--dw-primary) 35%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-primary) 7%, var(--dw-bg));
}

.ssh-command-editor__chip.is-run:hover {
  border-color: color-mix(in srgb, var(--dw-success) 40%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-success) 8%, var(--dw-bg));
  color: var(--dw-success);
}

.ssh-command-editor__chip.is-paste:hover {
  border-color: color-mix(in srgb, var(--dw-info) 40%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-info) 8%, var(--dw-bg));
  color: var(--dw-info);
}

.ssh-command-editor__monaco {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--dw-bg-editor);
}

.ssh-command-editor__monaco.is-readonly {
  opacity: 0.75;
}
</style>
