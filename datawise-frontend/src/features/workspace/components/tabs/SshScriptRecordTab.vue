<script setup lang="ts">
defineOptions({name: 'SshScriptRecordTab'})

import {computed, nextTick, onMounted, ref, watch} from 'vue'
import {usePageLocalShortcuts} from '@/core/composables/usePageLocalShortcuts'
import {useI18n} from 'vue-i18n'
import IconButton from '@/core/components/IconButton.vue'
import {ConfirmDialog, DwConsoleToolbar, DwIcon, EmptyState} from '@/core/components'
import {useConfirmDialog} from '@/core/composables/useConfirmDialog'
import type {WorkspaceTab} from '@/core/types'
import SshCommandEditor from '@/features/ssh/components/SshCommandEditor.vue'
import {
  listSshScriptRecords,
  saveSshScriptRecord,
} from '@/features/ssh/services/ssh-script-records.service'
import {
  toPlainCommandText,
  toStoredCommandText,
} from '@/features/ssh/services/ssh-script-record-content.service'
import {resolveBuiltinCommandPlainText} from '@/features/ssh/services/ssh-builtin-defaults.service'
import {
  commandsToExecutableText,
  parseCommandEntries,
  resolveRecordCommands,
  serializeCommandEntries,
  type MyCommandEntry,
} from '@/features/ssh/services/ssh-my-commands.service'
import type {SshCommandItem} from '@/features/ssh/types/ssh-script-record.types'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {sshScriptRecordNodeId, sshScriptRecordsNodeId} from '@/features/explorer/services/ssh-feature-tree.service'
import {resolveApiErrorMessage} from '@/shared/api/http/api-error-message'
import {sendToSshTerminal, listSshTerminalHandles} from '@/features/terminal/services/ssh-terminal-session.service'
import {notifySshScriptRecordsChanged} from '@/features/ssh/services/ssh-script-records-events'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'

const PREVIEW_KEY = 'ssh-script-record-preview'

const props = defineProps<{ tab: WorkspaceTab }>()
const {t} = useI18n()
const layout = useLayoutStore()
const explorer = useExplorerStore()
const workspace = useWorkspaceStore()
const reloadConfirm = useConfirmDialog('danger')

const title = ref('')
const commandText = ref('')
const saving = ref(false)
const dirty = ref(false)
const ready = ref(false)
const applying = ref(false)
const lastSavedAt = ref<number | null>(null)
const loadError = ref('')
const savedTitle = ref('')
const savedCommandText = ref('')
const previewOpen = ref(readPreviewPreference())
const helpOpen = ref(false)

const parsedPreview = computed(() => parseCommandEntries(commandText.value))
const entries = computed(() => parsedPreview.value.entries)
const entryCount = computed(() => entries.value.length)
const missingNameCount = computed(() =>
    entries.value.filter((entry) => needsNamingTip(entry)).length,
)

const statusLabel = computed(() => {
  if (loadError.value) return loadError.value
  if (saving.value) return t('ssh.scriptRecord.saving')
  if (dirty.value) return t('ssh.scriptRecord.unsaved')
  if (lastSavedAt.value) return t('ssh.scriptRecord.savedAt', {time: formatTime(lastSavedAt.value)})
  return t('ssh.scriptRecord.hint')
})

const statusTone = computed(() => {
  if (loadError.value) return 'error'
  if (saving.value) return 'muted'
  if (dirty.value) return 'warn'
  return 'ok'
})

const hasEditorContext = computed(() =>
    Boolean(props.tab.connectionId && props.tab.sshScriptRecordId),
)

const canDiscard = computed(() => dirty.value && !saving.value && !applying.value)
const canSave = computed(() => dirty.value && !saving.value && !applying.value)

function readPreviewPreference(): boolean {
  try {
    const raw = localStorage.getItem(PREVIEW_KEY)
    if (raw == null) return true
    return raw === '1'
  } catch {
    return true
  }
}

function writePreviewPreference(value: boolean) {
  try {
    localStorage.setItem(PREVIEW_KEY, value ? '1' : '0')
  } catch {
    // ignore
  }
}

function togglePreview() {
  previewOpen.value = !previewOpen.value
  writePreviewPreference(previewOpen.value)
}

function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'})
}

function markDirty() {
  if (applying.value || !ready.value || saving.value) return
  dirty.value = true
  workspace.setSshScriptDirty(props.tab.id, true)
}

function resolveContentText(options: {
  contentHtml?: string
  commands?: SshCommandItem[]
  recordId?: string
}): string {
  const fromStored = toPlainCommandText(options.contentHtml ?? '')
  if (fromStored.trim()) return fromStored
  if (options.commands?.some((item) => !!item.command?.trim())) {
    return serializeCommandEntries(options.commands).trimEnd()
  }
  if (options.recordId) {
    const builtin = resolveBuiltinCommandPlainText(options.recordId)
    if (builtin) return builtin.trimEnd()
  }
  return ''
}

async function applyRecordState(next: {
  title: string
  contentHtml: string
  commands?: SshCommandItem[]
  updatedAt?: number
  recordId?: string
}) {
  applying.value = true
  ready.value = false
  title.value = next.title
  commandText.value = resolveContentText({
    contentHtml: next.contentHtml,
    commands: next.commands,
    recordId: next.recordId ?? props.tab.sshScriptRecordId,
  })
  savedTitle.value = title.value
  savedCommandText.value = commandText.value
  props.tab.title = next.title
  props.tab.sshScriptRecordTitle = next.title
  props.tab.sshScriptRecordHtml = toStoredCommandText(commandText.value) || toPlainCommandText(next.contentHtml)
  props.tab.sshScriptRecordUpdatedAt = next.updatedAt
  lastSavedAt.value = next.updatedAt ?? null
  dirty.value = false
  workspace.setSshScriptDirty(props.tab.id, false)
  loadError.value = ''
  ready.value = true
  await nextTick()
  applying.value = false
}

async function reloadFromServer() {
  const connectionId = props.tab.connectionId
  const recordId = props.tab.sshScriptRecordId
  if (!connectionId || !recordId) {
    loadError.value = t('ssh.scriptRecord.missingContext')
    return
  }
  if (dirty.value) {
    const confirmed = await reloadConfirm.ask({
      title: t('ssh.scriptRecord.reloadDirtyTitle'),
      message: t('ssh.scriptRecord.reloadDirtyMessage'),
      confirmLabel: t('ssh.scriptRecord.reload'),
      confirmVariant: 'danger',
    })
    if (!confirmed) return
  }
  try {
    const records = await listSshScriptRecords(connectionId)
    const record = records.find((item) => item.id === recordId)
    if (!record) {
      loadError.value = t('ssh.scriptRecord.loadFailed')
      return
    }
    await applyRecordState({
      title: record.title,
      contentHtml: record.contentHtml ?? '',
      commands: resolveRecordCommands(record),
      updatedAt: record.updatedAt,
      recordId: record.id,
    })
  } catch (error) {
    loadError.value = resolveApiErrorMessage(error)
  }
}

function discardChanges() {
  if (!canDiscard.value) return
  applying.value = true
  title.value = savedTitle.value
  commandText.value = savedCommandText.value
  props.tab.title = savedTitle.value.trim() || t('ssh.scriptRecord.untitled')
  props.tab.sshScriptRecordTitle = savedTitle.value
  props.tab.sshScriptRecordHtml = toStoredCommandText(savedCommandText.value)
  dirty.value = false
  workspace.setSshScriptDirty(props.tab.id, false)
  loadError.value = ''
  void nextTick(() => {
    applying.value = false
  })
}

function resolveExecutablePayload(subset?: MyCommandEntry[]): string {
  if (subset?.length) {
    return subset.map((entry) => entry.command.trim()).filter(Boolean).join('\n')
  }
  return commandsToExecutableText(parseCommandEntries(commandText.value).commands)
}

async function copyRecordText() {
  const payload = resolveExecutablePayload()
  if (!payload.trim()) {
    loadError.value = t('ssh.scriptRecord.sendEmpty')
    return
  }
  try {
    await navigator.clipboard.writeText(payload)
    loadError.value = ''
    layout.showSuccessToast(t('ssh.scriptRecord.copied'))
  } catch {
    layout.showErrorToast(t('ssh.scriptRecord.copyFailed'))
  }
}

async function waitForTerminalHandle(connectionId: string, attempts = 25): Promise<boolean> {
  for (let index = 0; index < attempts; index += 1) {
    if (listSshTerminalHandles(connectionId).length > 0) return true
    await new Promise((resolve) => window.setTimeout(resolve, 200))
  }
  return false
}

async function sendPayloadToTerminal(payload: string, options?: {appendNewline?: boolean}) {
  const connectionId = props.tab.connectionId
  if (!connectionId) return
  if (!payload.trim()) {
    loadError.value = t('ssh.scriptRecord.sendEmpty')
    return
  }
  loadError.value = ''
  if (!listSshTerminalHandles(connectionId).length) {
    workspace.openSshTerminal({
      connectionId,
      connectionName: explorer.findNode(connectionId)?.label,
      explorerNodeId: connectionId,
    })
    const terminalReady = await waitForTerminalHandle(connectionId)
    if (!terminalReady) {
      loadError.value = t('ssh.scriptRecord.sendFailed')
      return
    }
  }
  const ok = await sendToSshTerminal(connectionId, payload, {
    appendNewline: options?.appendNewline ?? false,
    focus: true,
  })
  if (ok) {
    layout.showSuccessToast(
        options?.appendNewline === false
            ? t('ssh.scriptRecord.sentToTerminal')
            : t('ssh.scriptRecord.sentRunToTerminal'),
    )
    return
  }
  loadError.value = t('ssh.scriptRecord.sendFailed')
}

async function sendToTerminal() {
  await sendPayloadToTerminal(resolveExecutablePayload(), {appendNewline: false})
}

async function sendEntry(entry: MyCommandEntry) {
  const run = entry.mode === 'run'
  await sendPayloadToTerminal(entry.command, {appendNewline: run})
}

function previewEntryHint(entry: MyCommandEntry): string {
  const mode = entry.mode === 'run'
      ? t('ssh.scriptRecord.previewModeRun')
      : t('ssh.scriptRecord.previewModePaste')
  const parts = [mode, previewName(entry)]
  const desc = previewDesc(entry)
  if (desc) parts.push(desc)
  if (previewShowsCommand(entry)) parts.push(entry.command)
  return parts.join('\n')
}

function hasHumanTitle(entry: MyCommandEntry): boolean {
  const label = entry.label.trim()
  return Boolean(label && label !== entry.command.trim())
}

function previewName(entry: MyCommandEntry): string {
  if (hasHumanTitle(entry)) return entry.label.trim()
  const description = entry.description?.trim()
  if (description) return description
  return entry.command.trim()
}

function previewDesc(entry: MyCommandEntry): string | null {
  const description = entry.description?.trim()
  if (!description) return null
  if (previewName(entry) === description) return null
  return description
}

function previewShowsCommand(entry: MyCommandEntry): boolean {
  return previewName(entry) !== entry.command.trim()
}

function needsNamingTip(entry: MyCommandEntry): boolean {
  return !hasHumanTitle(entry) && !entry.description?.trim()
}

async function copyEntry(entry: MyCommandEntry, event: MouseEvent) {
  event.stopPropagation()
  try {
    await navigator.clipboard.writeText(entry.command)
    layout.showSuccessToast(t('ssh.scriptRecord.copiedEntry'))
  } catch {
    layout.showErrorToast(t('ssh.scriptRecord.copyFailed'))
  }
}

async function refreshAfterSave(connectionId: string, recordId: string, title: string) {
  const treeNode = explorer.findNode(sshScriptRecordNodeId(connectionId, recordId))
  if (treeNode) {
    treeNode.label = title
  }
  const folder = explorer.findNode(sshScriptRecordsNodeId(connectionId))
  if (folder) {
    folder.meta = undefined
    folder.children = []
    await explorer.expandAndLoad(folder.id, {notify: false})
  } else {
    explorer.touchTree()
  }
  notifySshScriptRecordsChanged(connectionId)
}

async function saveRecord(options?: {notify?: boolean}): Promise<boolean> {
  const connectionId = props.tab.connectionId
  const recordId = props.tab.sshScriptRecordId
  if (!connectionId || !recordId || saving.value || applying.value) return false
  const stored = toStoredCommandText(commandText.value)
  const parsed = parseCommandEntries(stored)
  const nextTitle = title.value.trim() || t('ssh.scriptRecord.untitled')
  saving.value = true
  try {
    const saved = await saveSshScriptRecord(connectionId, {
      id: recordId,
      title: nextTitle,
      contentHtml: stored,
      commands: parsed.commands,
      updatedAt: Date.now(),
    })
    await applyRecordState({
      title: saved.title,
      contentHtml: saved.contentHtml ?? '',
      commands: resolveRecordCommands(saved),
      updatedAt: saved.updatedAt,
      recordId: saved.id,
    })
    await refreshAfterSave(connectionId, recordId, saved.title)
    if (options?.notify !== false) {
      layout.showSuccessToast(t('ssh.scriptRecord.saveSuccess'))
    }
    return true
  } catch (error) {
    loadError.value = resolveApiErrorMessage(error) || t('ssh.scriptRecord.saveFailed')
    layout.showErrorToast(loadError.value)
    return false
  } finally {
    saving.value = false
  }
}

watch(title, () => {
  if (applying.value) return
  props.tab.title = title.value.trim() || t('ssh.scriptRecord.untitled')
  props.tab.sshScriptRecordTitle = title.value
  markDirty()
})

watch(commandText, () => {
  if (applying.value) return
  props.tab.sshScriptRecordHtml = toStoredCommandText(commandText.value)
  markDirty()
})

usePageLocalShortcuts(`ssh-script-record:${props.tab.id}`, {
  isActive: () => layout.isDatabaseModule && workspace.activeTabId === props.tab.id,
  keys: () => ({
    'Ctrl+S': () => {
      if (!canSave.value) return
      void saveRecord({notify: true})
    },
  }),
})

onMounted(() => {
  const initialStored = props.tab.sshScriptRecordHtml ?? ''
  const initialTitle = props.tab.sshScriptRecordTitle || props.tab.title || ''
  if (initialTitle || initialStored || props.tab.sshScriptRecordId) {
    void applyRecordState({
      title: initialTitle || t('ssh.scriptRecord.untitled'),
      contentHtml: initialStored,
      updatedAt: props.tab.sshScriptRecordUpdatedAt,
      recordId: props.tab.sshScriptRecordId,
    })
  }
  void reloadFromServer()
})
</script>

<template>
  <section class="ssh-script-record-tab">
    <DwConsoleToolbar class="ssh-script-record-tab__chrome">
      <template #start>
      <div class="dw-console-actions dw-btn-group">
        <IconButton
            :disabled="!canSave"
            :title="t('ssh.scriptRecord.saveShortcut')"
            :aria-label="t('ssh.scriptRecord.saveShortcut')"
            @click="saveRecord({notify: true})"
        >
          <DwIcon class="dw-console-glyph" name="save" fit/>
        </IconButton>
        <IconButton
            :disabled="!canDiscard"
            :title="t('ssh.scriptRecord.discard')"
            :aria-label="t('ssh.scriptRecord.discard')"
            @click="discardChanges"
        >
          <DwIcon class="dw-console-glyph" name="rollback" fit/>
        </IconButton>
        <span class="dw-console-divider" aria-hidden="true"/>
        <IconButton
            class="console-run-btn"
            :title="t('ssh.scriptRecord.sendToTerminal')"
            :aria-label="t('ssh.scriptRecord.sendToTerminal')"
            @click="sendToTerminal"
        >
          <DwIcon class="dw-console-glyph" name="console" fit/>
        </IconButton>
        <IconButton
            :title="t('ssh.scriptRecord.copyText')"
            :aria-label="t('ssh.scriptRecord.copyText')"
            @click="copyRecordText"
        >
          <DwIcon class="dw-console-glyph" name="copy" fit/>
        </IconButton>
        <span class="dw-console-divider" aria-hidden="true"/>
        <IconButton
            :active="previewOpen"
            :title="t('ssh.scriptRecord.previewToggle')"
            :aria-label="t('ssh.scriptRecord.previewToggle')"
            @click="togglePreview"
        >
          <DwIcon class="dw-console-glyph" name="layout" fit/>
        </IconButton>
        <IconButton
            :active="helpOpen"
            :title="t('ssh.scriptRecord.commandFormatTitle')"
            :aria-label="t('ssh.scriptRecord.commandFormatTitle')"
            @click="helpOpen = !helpOpen"
        >
          <DwIcon class="dw-console-glyph" name="help" fit/>
        </IconButton>
        <IconButton
            :disabled="saving"
            :title="t('ssh.scriptRecord.reload')"
            :aria-label="t('ssh.scriptRecord.reload')"
            @click="reloadFromServer"
        >
          <DwIcon class="dw-console-glyph" name="refresh" fit/>
        </IconButton>
      </div>
      </template>

      <template #context>
      <div class="ssh-script-record-tab__meta">
        <DwIcon name="editor" size="md" :stroke-width="1.55" class="ssh-script-record-tab__meta-icon"/>
        <input
            v-model="title"
            class="ssh-script-record-tab__title"
            :placeholder="t('ssh.scriptRecord.titlePlaceholder')"
            :aria-label="t('ssh.scriptRecord.titlePlaceholder')"
        >
        <span
            v-if="dirty"
            class="ssh-script-record-tab__dirty"
            :title="t('ssh.scriptRecord.saveShortcut')"
        >●</span>
      </div>
      </template>
    </DwConsoleToolbar>

    <Transition name="ssh-script-help">
      <div v-if="helpOpen" class="ssh-script-record-tab__help">
        <p>{{ t('ssh.scriptRecord.commandFormatHint') }}</p>
        <div class="ssh-script-record-tab__help-chips" aria-hidden="true">
          <code>@run</code>
          <code>@paste</code>
          <code># 标题 :: 说明</code>
          <code>## comment</code>
        </div>
      </div>
    </Transition>

    <div
        class="ssh-script-record-tab__body"
        :class="{'is-split': previewOpen && hasEditorContext}"
    >
      <div class="ssh-script-record-tab__editor">
        <SshCommandEditor
            v-if="hasEditorContext"
            v-model="commandText"
            :placeholder="t('ssh.scriptRecord.editorPlaceholder')"
        />
        <EmptyState
            v-else
            embedded
            compact
            class="ssh-script-record-tab__empty"
            :title="t('ssh.scriptRecord.missingContext')"
        />
      </div>

      <aside
          v-if="previewOpen && hasEditorContext"
          class="ssh-script-record-tab__preview"
          :aria-label="t('ssh.scriptRecord.preview')"
      >
        <header class="ssh-script-record-tab__preview-head">
          <div class="ssh-script-record-tab__preview-head-main">
            <span>{{ t('ssh.scriptRecord.preview') }}</span>
            <span v-if="entryCount" class="ssh-script-record-tab__preview-count">
              {{ t('ssh.scriptRecord.entryCount', {count: entryCount}) }}
            </span>
          </div>
          <span class="ssh-script-record-tab__preview-legend" aria-hidden="true">
            <span class="is-run">{{ t('ssh.scriptRecord.previewModeRun') }}</span>
            <span class="is-paste">{{ t('ssh.scriptRecord.previewModePaste') }}</span>
          </span>
        </header>

        <div v-if="entries.length" class="ssh-script-record-tab__preview-list">
          <div
              v-for="(entry, index) in entries"
              :key="`${index}-${entry.command.slice(0, 24)}`"
              class="ssh-script-record-tab__preview-item"
              :class="entry.mode === 'run' ? 'is-run' : 'is-paste'"
          >
            <button
                type="button"
                class="ssh-script-record-tab__preview-main"
                :title="previewEntryHint(entry)"
                @click="sendEntry(entry)"
            >
              <span class="ssh-script-record-tab__preview-rail" aria-hidden="true"/>
              <span class="ssh-script-record-tab__preview-text">
                <span class="ssh-script-record-tab__preview-top">
                  <span class="ssh-script-record-tab__preview-name">{{ previewName(entry) }}</span>
                  <span class="ssh-script-record-tab__preview-kind">
                    {{ entry.mode === 'run' ? t('ssh.scriptRecord.previewModeRun') : t('ssh.scriptRecord.previewModePaste') }}
                  </span>
                </span>
                <span
                    v-if="previewDesc(entry)"
                    class="ssh-script-record-tab__preview-desc"
                >{{ previewDesc(entry) }}</span>
                <code
                    v-if="previewShowsCommand(entry)"
                    class="ssh-script-record-tab__preview-cmd"
                >{{ entry.command }}</code>
              </span>
            </button>
            <button
                type="button"
                class="ssh-script-record-tab__preview-copy"
                :title="t('ssh.scriptRecord.copyEntry')"
                @click="copyEntry(entry, $event)"
            >
              <DwIcon name="copy" size="sm" :stroke-width="1.7"/>
            </button>
          </div>
        </div>
        <EmptyState
            v-else
            embedded
            compact
            class="ssh-script-record-tab__preview-empty"
            :title="t('ssh.scriptRecord.previewEmpty')"
        />
        <p
            v-if="entries.length && missingNameCount"
            class="ssh-script-record-tab__preview-tip"
        >
          {{ t('ssh.scriptRecord.previewDescTip', {count: missingNameCount}) }}
        </p>
      </aside>
    </div>

    <footer class="ssh-script-record-tab__status" :class="`is-${statusTone}`">
      <span class="ssh-script-record-tab__status-dot" aria-hidden="true"/>
      <span class="ssh-script-record-tab__status-text">{{ statusLabel }}</span>
      <span v-if="entryCount" class="ssh-script-record-tab__status-side">
        {{ t('ssh.scriptRecord.previewClickHint') }}
      </span>
    </footer>

    <ConfirmDialog
        :open="reloadConfirm.open.value"
        :title="reloadConfirm.title.value"
        :message="reloadConfirm.message.value"
        :confirm-label="reloadConfirm.confirmLabel.value"
        :confirm-variant="reloadConfirm.confirmVariant.value"
        :confirm-loading="reloadConfirm.confirmLoading.value"
        @update:open="reloadConfirm.onOpenUpdate"
        @confirm="reloadConfirm.onConfirm"
    />
  </section>
</template>

<style scoped>
.ssh-script-record-tab {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--dw-bg-editor);
}

.ssh-script-record-tab__chrome {
  flex-shrink: 0;
  gap: var(--dw-space-4);
  border-bottom: 1px solid var(--dw-border-light);
}

.ssh-script-record-tab__meta {
  display: flex;
  align-items: center;
  gap: var(--dw-space-2);
  min-width: 0;
  flex: 1;
  justify-content: flex-end;
}

.ssh-script-record-tab__meta-icon {
  flex-shrink: 0;
  color: var(--mp-tone-emerald);
}

.ssh-script-record-tab__title {
  min-width: 0;
  max-width: 36ch;
  width: 100%;
  border: 1px solid transparent;
  border-radius: var(--dw-control-radius-sm);
  padding: 2px 8px;
  background: transparent;
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
  font-weight: 600;
  line-height: 1.4;
  outline: none;
  transition: border-color var(--dw-duration-fast) var(--dw-ease), background var(--dw-duration-fast) var(--dw-ease);
}

.ssh-script-record-tab__title:hover {
  background: color-mix(in srgb, var(--dw-text) 4%, transparent);
}

.ssh-script-record-tab__title:focus {
  border-color: color-mix(in srgb, var(--dw-primary) 45%, var(--dw-border));
  background: var(--dw-bg);
}

.ssh-script-record-tab__title::placeholder {
  color: var(--dw-text-muted);
  font-weight: 500;
}

.ssh-script-record-tab__dirty {
  flex-shrink: 0;
  font-size: var(--dw-font-size-badge);
  line-height: 1;
  color: var(--dw-warning);
  opacity: 0.9;
}

.ssh-script-record-tab__help {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
  padding: var(--dw-space-3) var(--dw-console-chrome-inset);
  border-bottom: 1px solid var(--dw-border-light);
  background: color-mix(in srgb, var(--dw-info) 6%, var(--dw-bg-editor));
}

.ssh-script-record-tab__help p {
  margin: 0;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-relaxed);
  white-space: pre-line;
}

.ssh-script-record-tab__help-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-sm);
}

.ssh-script-record-tab__help-chips code {
  padding: 1px 7px;
  border-radius: var(--dw-control-radius-sm);
  background: color-mix(in srgb, var(--dw-text) 6%, transparent);
  color: var(--dw-text);
  font-size: var(--dw-text-xs);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.ssh-script-record-tab__body {
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.ssh-script-record-tab__body.is-split .ssh-script-record-tab__editor {
  flex: 1.35;
  border-right: none;
}

.ssh-script-record-tab__editor {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.ssh-script-record-tab__preview {
  display: flex;
  flex-direction: column;
  flex: 0 0 min(340px, 38%);
  min-width: 240px;
  min-height: 0;
  background: color-mix(in srgb, var(--dw-bg-panel) 55%, var(--dw-bg-editor));
  border-left: 1px solid var(--dw-border-light);
}

.ssh-script-record-tab__preview-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
  padding: var(--dw-space-3) var(--dw-space-4) var(--dw-space-2);
}

.ssh-script-record-tab__preview-head-main {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--dw-gap);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  font-weight: 600;
}

.ssh-script-record-tab__preview-count {
  color: var(--dw-text-muted);
  font-weight: 400;
}

.ssh-script-record-tab__preview-legend {
  display: flex;
  gap: var(--dw-gap-md);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-2xs);
  font-weight: 500;
}

.ssh-script-record-tab__preview-legend .is-run::before,
.ssh-script-record-tab__preview-legend .is-paste::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 5px;
  border-radius: 50%;
  vertical-align: 0.05em;
}

.ssh-script-record-tab__preview-legend .is-run::before {
  background: var(--dw-success);
}

.ssh-script-record-tab__preview-legend .is-paste::before {
  background: color-mix(in srgb, var(--dw-info) 75%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--dw-info) 35%, transparent);
}

.ssh-script-record-tab__preview-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 2px var(--dw-space-3) var(--dw-space-3);
  overflow: auto;
  min-height: 0;
}

.ssh-script-record-tab__preview-item {
  display: flex;
  align-items: stretch;
  gap: 2px;
  min-width: 0;
  border-radius: var(--dw-panel-radius);
  background: color-mix(in srgb, var(--dw-bg) 88%, transparent);
  border: 1px solid color-mix(in srgb, var(--dw-border) 55%, transparent);
  overflow: hidden;
  transition:
      border-color var(--dw-duration-fast) var(--dw-ease),
      background var(--dw-duration-fast) var(--dw-ease);
}

.ssh-script-record-tab__preview-item:hover {
  border-color: color-mix(in srgb, var(--dw-border) 90%, var(--dw-text));
  background: var(--dw-bg);
}

.ssh-script-record-tab__preview-item.is-run:hover {
  border-color: color-mix(in srgb, var(--dw-success) 28%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-success) 5%, var(--dw-bg));
}

.ssh-script-record-tab__preview-item.is-paste:hover {
  border-color: color-mix(in srgb, var(--dw-info) 28%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-info) 5%, var(--dw-bg));
}

.ssh-script-record-tab__preview-main {
  display: flex;
  align-items: stretch;
  gap: 0;
  flex: 1;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--dw-text);
  text-align: left;
  cursor: pointer;
}

.ssh-script-record-tab__preview-rail {
  flex-shrink: 0;
  width: 3px;
  background: color-mix(in srgb, var(--dw-info) 55%, transparent);
}

.ssh-script-record-tab__preview-item.is-run .ssh-script-record-tab__preview-rail {
  background: var(--dw-success);
}

.ssh-script-record-tab__preview-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
  padding: 9px 8px 9px 10px;
}

.ssh-script-record-tab__preview-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--dw-gap-sm);
  min-width: 0;
}

.ssh-script-record-tab__preview-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--dw-text-sm);
  font-weight: 600;
  line-height: 1.35;
}

.ssh-script-record-tab__preview-kind {
  flex-shrink: 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-2xs);
  font-weight: 500;
  letter-spacing: 0.02em;
}

.ssh-script-record-tab__preview-item.is-run .ssh-script-record-tab__preview-kind {
  color: color-mix(in srgb, var(--dw-success) 75%, var(--dw-text-muted));
}

.ssh-script-record-tab__preview-item.is-paste .ssh-script-record-tab__preview-kind {
  color: color-mix(in srgb, var(--dw-info) 70%, var(--dw-text-muted));
}

.ssh-script-record-tab__preview-desc {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
  line-height: 1.4;
  white-space: normal;
}

.ssh-script-record-tab__preview-cmd {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  line-height: 1.35;
  white-space: normal;
  word-break: break-all;
}

.ssh-script-record-tab__preview-copy {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  border: none;
  border-left: 1px solid transparent;
  background: transparent;
  color: var(--dw-text-muted);
  cursor: pointer;
  opacity: 0;
  transition:
      opacity var(--dw-duration-fast) var(--dw-ease),
      color var(--dw-duration-fast) var(--dw-ease),
      background var(--dw-duration-fast) var(--dw-ease),
      border-color var(--dw-duration-fast) var(--dw-ease);
}

.ssh-script-record-tab__preview-item:hover .ssh-script-record-tab__preview-copy {
  opacity: 1;
  border-left-color: color-mix(in srgb, var(--dw-border) 60%, transparent);
}

.ssh-script-record-tab__preview-copy:hover {
  color: var(--dw-text);
  background: color-mix(in srgb, var(--dw-text) 6%, transparent);
}

.ssh-script-record-tab__preview-tip {
  flex-shrink: 0;
  margin: 0;
  padding: var(--dw-space-2) var(--dw-space-4) var(--dw-space-3);
  border-top: 1px solid color-mix(in srgb, var(--dw-border) 50%, transparent);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: 1.45;
}

.ssh-script-record-tab__preview-copy {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  border: none;
  border-radius: var(--dw-control-radius);
  background: transparent;
  color: var(--dw-text-muted);
  cursor: pointer;
  opacity: 0;
  transition:
      opacity var(--dw-duration-fast) var(--dw-ease),
      color var(--dw-duration-fast) var(--dw-ease),
      background var(--dw-duration-fast) var(--dw-ease);
}

.ssh-script-record-tab__preview-item:hover .ssh-script-record-tab__preview-copy {
  opacity: 1;
}

.ssh-script-record-tab__preview-copy:hover {
  color: var(--dw-text);
  background: color-mix(in srgb, var(--dw-text) 8%, transparent);
}

.ssh-script-record-tab__preview-empty,
.ssh-script-record-tab__empty {
  padding: var(--dw-space-6) var(--dw-space-4);
}

.ssh-script-record-tab__status {
  display: flex;
  align-items: center;
  gap: var(--dw-space-2);
  flex-shrink: 0;
  min-height: var(--dw-density-sm);
  padding: 0 var(--dw-console-chrome-inset);
  border-top: 1px solid var(--dw-border-light);
  background: color-mix(in srgb, var(--dw-bg-panel) 55%, var(--dw-bg-editor));
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.ssh-script-record-tab__status-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--dw-text-muted);
  opacity: 0.45;
}

.ssh-script-record-tab__status.is-warn {
  color: var(--dw-warning);
}

.ssh-script-record-tab__status.is-warn .ssh-script-record-tab__status-dot {
  background: var(--dw-warning);
  opacity: 1;
}

.ssh-script-record-tab__status.is-error {
  color: var(--dw-danger);
}

.ssh-script-record-tab__status.is-error .ssh-script-record-tab__status-dot {
  background: var(--dw-danger);
  opacity: 1;
}

.ssh-script-record-tab__status.is-ok .ssh-script-record-tab__status-dot {
  background: var(--dw-success);
  opacity: 0.7;
}

.ssh-script-record-tab__status-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ssh-script-record-tab__status-side {
  margin-left: auto;
  color: var(--dw-text-muted);
  opacity: 0.7;
}

.ssh-script-help-enter-active,
.ssh-script-help-leave-active {
  transition: opacity var(--dw-duration) var(--dw-ease), transform var(--dw-duration) var(--dw-ease);
}

.ssh-script-help-enter-from,
.ssh-script-help-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 900px) {
  .ssh-script-record-tab__body.is-split {
    flex-direction: column;
  }

  .ssh-script-record-tab__body.is-split .ssh-script-record-tab__editor {
    border-right: none;
    border-bottom: 1px solid var(--dw-border-light);
    flex: 1;
    min-height: 45%;
  }

  .ssh-script-record-tab__preview {
    flex: 0 0 42%;
    min-width: 0;
  }

  .ssh-script-record-tab__title {
    max-width: 22ch;
  }

  .ssh-script-record-tab__status-side {
    display: none;
  }
}
</style>
