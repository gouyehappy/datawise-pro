<script setup lang="ts">
defineOptions({name: 'SshTerminalTab'})

import {computed, nextTick, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import SshTerminalPane from '@/features/terminal/components/SshTerminalPane.vue'
import SshQuickOpsPanel from '@/features/terminal/components/SshQuickOpsPanel.vue'
import SshConnectionProfileDialog from '@/features/ssh/components/SshConnectionProfileDialog.vue'
import IconButton from '@/core/components/IconButton.vue'
import {EmptyState, PromptDialog} from '@/core/components'
import {ContextMenuHost} from '@/core/context-menu'
import {useContextMenu} from '@/core/context-menu'
import {DwIcon} from '@/core/icons'
import type {WorkspaceTab} from '@/core/types'
import type {SshScriptRecord} from '@/features/ssh/types/ssh-script-record.types'
import type {RelatedConnectionItem} from '@/features/ssh/services/ssh-related-connections.service'
import {configApi, explorerApi} from '@/api'
import {
    sendToSshTerminal,
} from '@/features/terminal/services/ssh-terminal-session.service'
import type {SshTerminalStatus} from '@/features/terminal/services/ssh-terminal-session.service'
import {isSshAuthFailureMessage} from '@/features/terminal/services/ssh-terminal-failure'
import {buildSshTerminalContextMenu} from '@/features/terminal/constants/ssh-terminal-context-menu'
import {registerStatelessConnectorUse} from '@/features/explorer/services/register-connection-health.service'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {
    planOpenYarnApplications,
    planOpenYarnNodes,
} from '@/features/workspace/services/workspace-platform-open.service'
import {
    planOpenKafkaConsumerGroups,
    planOpenKafkaTopics,
    planOpenRedisConsole,
} from '@/features/workspace/services/workspace-stateless-open.service'
import {
    appendTerminalSelectionToScriptRecord,
    createScriptRecordFromTerminalSelection,
} from '@/features/ssh/services/ssh-terminal-snippet.service'
import {listSshScriptRecords, saveSshScriptRecord} from '@/features/ssh/services/ssh-script-records.service'
import {notifySshScriptRecordsChanged} from '@/features/ssh/services/ssh-script-records-events'
import {SSH_COMMAND_TEMPLATE} from '@/features/ssh/services/ssh-script-record-content.service'
import {createEmptySshScriptRecord} from '@/features/ssh/types/ssh-script-record.types'
import {sshScriptRecordNodeId, sshScriptRecordsNodeId} from '@/features/explorer/services/ssh-feature-tree.service'
import {resolveApiErrorMessage} from '@/shared/api/http/api-error-message'
import {
    readSshAutoReconnectEnabled,
    writeSshAutoReconnectEnabled,
} from '@/features/terminal/services/ssh-terminal-preferences.service'
import {
  hasSshTerminalFontOverride,
  SSH_TERMINAL_FONT_LIMITS,
} from '@/features/terminal/services/ssh-terminal-font.service'
import {
    readSshConnectionProfile,
    writeSshConnectionProfile,
    type SshConnectionProfile,
} from '@/features/ssh/services/ssh-connection-profile.service'
import {
    isJdbcSshTunnelEnabled,
    resolveSshTerminalEndpoint,
} from '@/features/ssh/services/ssh-jdbc-tunnel.service'
import {findRelatedConnections} from '@/features/ssh/services/ssh-related-connections.service'
import {
    buildYarnLogsCommand,
    extractFirstYarnAppId,
} from '@/features/ssh/services/ssh-yarn-bridge.service'
import '@/features/workspace/components/shared/connector-workbench.css'

const props = defineProps<{ tab: WorkspaceTab }>()
const {t} = useI18n()
const layout = useLayoutStore()
const explorer = useExplorerStore()
const workspace = useWorkspaceStore()
const terminalRef = ref<InstanceType<typeof SshTerminalPane>>()
const quickOpsRef = ref<InstanceType<typeof SshQuickOpsPanel>>()
const endpoint = ref('')
const status = ref<SshTerminalStatus>('connecting')
const statusMessage = ref('')
const contextMenu = useContextMenu<{selection: string}>()
const scriptRecords = ref<SshScriptRecord[]>([])
const savePromptOpen = ref(false)
const pendingSelection = ref('')
const searchOpen = ref(false)
const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement>()
const autoReconnect = ref(readSshAutoReconnectEnabled())
const fontSize = ref<number>(SSH_TERMINAL_FONT_LIMITS.default)
const profileDialogOpen = ref(false)
const connectionProfile = ref<SshConnectionProfile>({})
const relatedConnections = ref<RelatedConnectionItem[]>([])
const onConnectApplied = ref(false)
const contextYarnAppId = ref<string | null>(null)
const viaJdbcTunnel = ref(false)

const statusLabel = computed(() => {
  switch (status.value) {
    case 'connecting':
      return t('terminal.sshStatusConnecting')
    case 'connected':
      return t('terminal.sshStatusConnected')
    case 'disconnected':
      return t('terminal.sshStatusDisconnected')
    case 'error':
      return isSshAuthFailureMessage(statusMessage.value)
          ? t('terminal.sshStatusAuthFailed')
          : t('terminal.sshStatusError')
    default:
      return ''
  }
})

const showStatusDetail = computed(() => !!statusMessage.value && (
    status.value === 'error'
    || status.value === 'disconnected'
    || status.value === 'connecting'
    || status.value === 'connected'
))

const subtitle = computed(() => {
  if (!props.tab.connectionId) return t('terminal.sshMissingConnection')
  const note = connectionProfile.value.tabNote?.trim()
  if (note) return note
  if (endpoint.value) {
    return viaJdbcTunnel.value
        ? t('terminal.sshTunnelSubtitle', {endpoint: endpoint.value})
        : endpoint.value
  }
  return t('terminal.sshSubtitle')
})

const yarnAppsConnection = computed(() =>
    relatedConnections.value.find((item) => item.kind === 'yarn-apps') ?? null,
)

const savePromptDefault = computed(() => t('ssh.scriptRecord.terminalSnippetTitle', {
  time: new Date().toLocaleString(),
}))

let lastAuthToastAt = 0

function onStatusChange(next: SshTerminalStatus, message?: string) {
  status.value = next
  statusMessage.value = message ?? ''
  if (next === 'connected' && props.tab.connectionId) {
    registerStatelessConnectorUse(props.tab.connectionId, 'ssh', 'ok')
  }
  if (next === 'error' && isSshAuthFailureMessage(message)) {
    const now = Date.now()
    if (now - lastAuthToastAt > 8_000) {
      lastAuthToastAt = now
      layout.showToast(t('terminal.sshAuthFailedToast'))
    }
  }
}

function onQuickOpsLayoutChange() {
  // Wait for collapse/expand height to settle before reporting PTY size.
  void nextTick(() => {
    requestAnimationFrame(() => {
      terminalRef.value?.refit?.()
    })
  })
}

async function loadEndpoint() {
  if (!props.tab.connectionId) return
  connectionProfile.value = readSshConnectionProfile(props.tab.connectionId)
  try {
    const [config, catalog] = await Promise.all([
      explorerApi.fetchConnection(props.tab.connectionId),
      configApi.fetchConnectionsCatalog(),
    ])
    viaJdbcTunnel.value = isJdbcSshTunnelEnabled(config)
    endpoint.value = resolveSshTerminalEndpoint(config)
    const sshHostForRelated = viaJdbcTunnel.value
        ? config.sshHost ?? ''
        : config.host ?? ''
    relatedConnections.value = findRelatedConnections(sshHostForRelated, catalog, {
      sshConnectionId: props.tab.connectionId,
      limit: 8,
    })
  } catch {
    endpoint.value = ''
    relatedConnections.value = []
  }
}

async function applyOnConnectProfile() {
  const connectionId = props.tab.connectionId
  if (!connectionId || onConnectApplied.value || status.value !== 'connected') return
  onConnectApplied.value = true

  const profile = connectionProfile.value
  if (profile.defaultCwd?.trim()) {
    await sendToSshTerminal(connectionId, `cd ${profile.defaultCwd.trim()}\n`, {
      preferTabId: props.tab.id,
      focus: false,
    })
  }
  if (profile.onConnectCommand?.trim()) {
    const command = profile.onConnectCommand.trim()
    const mode = profile.onConnectMode ?? 'paste'
    await sendToSshTerminal(connectionId, command, {
      preferTabId: props.tab.id,
      appendNewline: mode === 'run',
      focus: true,
    })
  }
}

function openProfileDialog() {
  profileDialogOpen.value = true
}

function saveConnectionProfile(profile: SshConnectionProfile) {
  const connectionId = props.tab.connectionId
  if (!connectionId) return
  connectionProfile.value = writeSshConnectionProfile(connectionId, profile)
  layout.showSuccessToast(t('ssh.profile.saved'))
}

function saveTerminalOutput() {
  const text = terminalRef.value?.getBufferText?.() ?? ''
  if (!text.trim()) {
    layout.showErrorToast(t('terminal.sshSaveOutputEmpty'))
    return
  }
  const connectionId = props.tab.connectionId ?? 'ssh'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const blob = new Blob([text], {type: 'text/plain;charset=utf-8'})
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `ssh-${connectionId}-${stamp}.log`
  anchor.click()
  URL.revokeObjectURL(url)
  layout.showSuccessToast(t('terminal.sshSaveOutputSuccess'))
}

function clearTerminal() {
  terminalRef.value?.clear()
}

async function reconnectTerminal() {
  await terminalRef.value?.reconnect()
}

async function copySelection() {
  const ok = await terminalRef.value?.copySelection()
  if (ok) {
    layout.showSuccessToast(t('terminal.sshCopied'))
  }
}

async function pasteClipboard() {
  const ok = await terminalRef.value?.pasteFromClipboard()
  if (!ok) {
    layout.showErrorToast(t('terminal.sshPasteFailed'))
  }
}

async function refreshScriptRecordsFolder(connectionId: string) {
  const folder = explorer.findNode(sshScriptRecordsNodeId(connectionId))
  if (folder) {
    folder.meta = undefined
    folder.children = []
    await explorer.expandAndLoad(folder.id, {notify: false})
  }
  await quickOpsRef.value?.reload?.()
  notifySshScriptRecordsChanged(connectionId)
}

function openScriptRecordTab(connectionId: string, saved: SshScriptRecord) {
  workspace.openSshScriptRecord({
    connectionId,
    connectionName: explorer.findNode(connectionId)?.label ?? connectionId,
    recordId: saved.id,
    title: saved.title,
    contentHtml: saved.contentHtml,
    updatedAt: saved.updatedAt,
    explorerNodeId: sshScriptRecordNodeId(connectionId, saved.id),
  })
}

function editScriptRecord(payload: {recordId: string; title: string}) {
  const connectionId = props.tab.connectionId
  if (!connectionId) return
  workspace.openSshScriptRecord({
    connectionId,
    connectionName: explorer.findNode(connectionId)?.label ?? connectionId,
    recordId: payload.recordId,
    title: payload.title,
    explorerNodeId: sshScriptRecordNodeId(connectionId, payload.recordId),
  })
}

async function createScriptRecord() {
  const connectionId = props.tab.connectionId
  if (!connectionId) return
  try {
    const record = createEmptySshScriptRecord(
        `record-${Date.now()}`,
        t('ssh.scriptRecord.newRecord'),
    )
    record.contentHtml = SSH_COMMAND_TEMPLATE
    const saved = await saveSshScriptRecord(connectionId, record)
    await refreshScriptRecordsFolder(connectionId)
    openScriptRecordTab(connectionId, saved)
  } catch (error) {
    layout.showErrorToast(resolveApiErrorMessage(error) || t('ssh.scriptRecord.createFailed'))
  }
}

function beginSaveNewRecord(selection: string) {
  const trimmed = selection.trim()
  if (!trimmed) {
    layout.showErrorToast(t('terminal.sshSaveSelectionEmpty'))
    return
  }
  pendingSelection.value = trimmed
  savePromptOpen.value = true
}

async function confirmSaveNewRecord(title: string) {
  const connectionId = props.tab.connectionId
  const selection = pendingSelection.value
  pendingSelection.value = ''
  if (!connectionId || !selection) return
  const nextTitle = title.trim() || savePromptDefault.value
  try {
    const saved = await createScriptRecordFromTerminalSelection(connectionId, selection, nextTitle)
    await refreshScriptRecordsFolder(connectionId)
    openScriptRecordTab(connectionId, saved)
    layout.showSuccessToast(t('terminal.sshSaveSelectionSuccess'))
  } catch (error) {
    layout.showErrorToast(resolveApiErrorMessage(error) || t('terminal.sshSaveSelectionFailed'))
  }
}

async function appendSelectionToRecord(recordId: string, selection: string) {
  const connectionId = props.tab.connectionId
  if (!connectionId) return
  const trimmed = selection.trim()
  if (!trimmed) {
    layout.showErrorToast(t('terminal.sshSaveSelectionEmpty'))
    return
  }
  try {
    const saved = await appendTerminalSelectionToScriptRecord(connectionId, recordId, trimmed)
    await refreshScriptRecordsFolder(connectionId)
    openScriptRecordTab(connectionId, saved)
    layout.showSuccessToast(t('terminal.sshAppendSelectionSuccess'))
  } catch (error) {
    layout.showErrorToast(resolveApiErrorMessage(error) || t('terminal.sshAppendSelectionFailed'))
  }
}

function saveSelectionToRecord() {
  const selection = terminalRef.value?.getSelection?.() ?? ''
  beginSaveNewRecord(selection)
}

async function runQuickCommand(command: string) {
  const connectionId = props.tab.connectionId
  if (!connectionId) return
  const ok = await sendToSshTerminal(connectionId, command, {preferTabId: props.tab.id})
  if (!ok) {
    layout.showErrorToast(t('ssh.quickOps.runFailed'))
  }
}

async function pasteQuickCommand(command: string) {
  const connectionId = props.tab.connectionId
  if (!connectionId) return
  const ok = await sendToSshTerminal(connectionId, command, {
    preferTabId: props.tab.id,
    appendNewline: false,
    focus: true,
  })
  if (!ok) {
    layout.showErrorToast(t('ssh.quickOps.pasteFailed'))
  }
}

function openTerminalSearch() {
  searchOpen.value = true
  void nextTick(() => searchInputRef.value?.focus())
}

function closeTerminalSearch() {
  searchOpen.value = false
  searchQuery.value = ''
  terminalRef.value?.resetSearch?.()
  terminalRef.value?.focus?.()
}

function findNextInTerminal() {
  const query = searchQuery.value.trim()
  if (!query) return
  const ok = terminalRef.value?.findNext?.(query)
  if (!ok) {
    layout.showToast(t('terminal.sshSearchNotFound'))
  }
}

function findPreviousInTerminal() {
  const query = searchQuery.value.trim()
  if (!query) return
  const ok = terminalRef.value?.findPrevious?.(query)
  if (!ok) {
    layout.showToast(t('terminal.sshSearchNotFound'))
  }
}

function onSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (event.shiftKey) {
      findPreviousInTerminal()
      return
    }
    findNextInTerminal()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    closeTerminalSearch()
  }
}

const fontOverrideActive = ref(hasSshTerminalFontOverride())

function syncFontSizeFromTerminal() {
  fontSize.value = terminalRef.value?.getFontSize?.() ?? fontSize.value
  fontOverrideActive.value = hasSshTerminalFontOverride()
}

function decreaseFontSize() {
  terminalRef.value?.changeFontSize?.(-1)
  syncFontSizeFromTerminal()
}

function increaseFontSize() {
  terminalRef.value?.changeFontSize?.(1)
  syncFontSizeFromTerminal()
}

function resetFontSize() {
  terminalRef.value?.resetFontSize?.()
  syncFontSizeFromTerminal()
}

function toggleAutoReconnect() {
  autoReconnect.value = !autoReconnect.value
  writeSshAutoReconnectEnabled(autoReconnect.value)
  layout.showToast(autoReconnect.value
      ? t('terminal.sshAutoReconnectOn')
      : t('terminal.sshAutoReconnectOff'))
}

async function copyTerminalBuffer() {
  const ok = await terminalRef.value?.copyBuffer?.()
  if (ok) {
    layout.showSuccessToast(t('terminal.sshBufferCopied'))
    return
  }
  layout.showErrorToast(t('terminal.sshBufferCopyFailed'))
}

function openRelatedConnection(item: RelatedConnectionItem) {
  const label = item.label
  switch (item.kind) {
    case 'yarn-apps':
      workspace.openWithPlan(
        planOpenYarnApplications,
        {connectionId: item.connectionId, connectionName: label},
        'yarn',
      )
      return
    case 'yarn-nodes':
      workspace.openWithPlan(
        planOpenYarnNodes,
        {connectionId: item.connectionId, connectionName: label},
        'yarn',
      )
      return
    case 'kafka-topics':
      workspace.openWithPlan(
        planOpenKafkaTopics,
        {connectionId: item.connectionId, connectionName: label},
        'kafka',
      )
      return
    case 'kafka-consumer-groups':
      workspace.openWithPlan(
        planOpenKafkaConsumerGroups,
        {connectionId: item.connectionId, connectionName: label},
        'kafka',
      )
      return
    case 'redis-console':
      workspace.openWithPlan(
        planOpenRedisConsole,
        {connectionId: item.connectionId, connectionName: label},
        'redis',
      )
      return
    case 'sql-console':
      void workspace.openConsole({connectionId: item.connectionId, connectionName: label})
  }
}

async function manageScriptRecords() {
  const connectionId = props.tab.connectionId
  if (!connectionId) return
  await explorer.locateNode(sshScriptRecordsNodeId(connectionId))
  layout.showToast(t('ssh.quickOps.manageRecordsHint'))
}

async function onTerminalContextMenu(event: MouseEvent) {
  const connectionId = props.tab.connectionId
  const selection = terminalRef.value?.getSelection?.() ?? ''
  contextYarnAppId.value = extractFirstYarnAppId(selection)
  if (connectionId) {
    try {
      scriptRecords.value = await listSshScriptRecords(connectionId)
    } catch {
      scriptRecords.value = []
    }
  } else {
    scriptRecords.value = []
  }
  contextMenu.open(event, buildSshTerminalContextMenu(t, {
    hasSelection: !!selection.trim(),
    records: scriptRecords.value,
    yarnAppId: contextYarnAppId.value,
    hasYarnConnection: !!yarnAppsConnection.value,
  }), {selection})
}

function openYarnAppFromSelection(appId: string) {
  const yarn = yarnAppsConnection.value
  if (!yarn) {
    layout.showErrorToast(t('ssh.yarnBridge.noYarnConnection'))
    return
  }
  workspace.openWithPlan(
    planOpenYarnApplications,
    {
      connectionId: yarn.connectionId,
      connectionName: yarn.label,
      yarnAppFilterId: appId,
    },
    'yarn',
  )
}

async function pasteYarnLogsFromSelection(appId: string) {
  const connectionId = props.tab.connectionId
  if (!connectionId) return
  const command = buildYarnLogsCommand(appId)
  const ok = await sendToSshTerminal(connectionId, command, {
    preferTabId: props.tab.id,
    focus: true,
  })
  if (!ok) {
    layout.showErrorToast(t('ssh.quickOps.pasteFailed'))
  }
}

function onContextMenuSelect(id: string) {
  const selection = contextMenu.target.value?.selection ?? terminalRef.value?.getSelection?.() ?? ''
  if (id === 'copy-selection') {
    void copySelection()
    return
  }
  if (id === 'paste') {
    void pasteClipboard()
    return
  }
  if (id === 'save-new-record') {
    beginSaveNewRecord(selection)
    return
  }
  if (id === 'clear') {
    clearTerminal()
    return
  }
  if (id === 'open-yarn-app') {
    const appId = contextYarnAppId.value
    if (appId) openYarnAppFromSelection(appId)
    return
  }
  if (id === 'paste-yarn-logs') {
    const appId = contextYarnAppId.value
    if (appId) void pasteYarnLogsFromSelection(appId)
    return
  }
  if (id.startsWith('append-record:')) {
    const recordId = id.slice('append-record:'.length)
    void appendSelectionToRecord(recordId, selection)
  }
}

onMounted(() => {
  void loadEndpoint()
  syncFontSizeFromTerminal()
  terminalRef.value?.focus()
})

watch(searchQuery, () => {
  terminalRef.value?.resetSearch?.()
})

watch(status, (next) => {
  if (next === 'disconnected' || next === 'error') {
    onConnectApplied.value = false
  }
  if (next === 'connected') {
    void applyOnConnectProfile()
  }
})
</script>

<template>
  <!--
    配方：wb-terminal（SSH 满高 + 工具条头；不强制 WorkbenchListPage）
    AURA-X: [Modify] - 标注配方；chrome/pane 硬编码 → token
    Protection: 功能完整性已验证，无简化行为
    人格: [@前端艺术家]
  -->
  <div class="ssh-terminal-tab dw-workbench-page dw-workbench-page--terminal" data-wb-recipe="wb-terminal">
    <header class="connector-workbench__head ssh-terminal-tab__head">
      <div class="connector-workbench__identity">
        <DwIcon name="terminal" size="sm" class="ssh-terminal-tab__icon"/>
        <span class="connector-workbench__endpoint" :title="tab.title">{{ tab.title }}</span>
        <span class="connector-workbench__badge" :class="`is-${status}`">{{ statusLabel }}</span>
        <span
            v-if="showStatusDetail"
            class="connector-workbench__muted"
            :title="statusMessage"
        >{{ statusMessage }}</span>
        <span
            v-else-if="subtitle"
            class="connector-workbench__muted"
            :title="subtitle"
        >{{ subtitle }}</span>
      </div>
      <div class="connector-workbench__actions ssh-terminal-tab__actions">
        <IconButton
            size="sm"
            :title="autoReconnect ? t('terminal.sshAutoReconnectOn') : t('terminal.sshAutoReconnectOff')"
            :class="{'is-active': autoReconnect}"
            @click="toggleAutoReconnect"
        >
          <DwIcon name="link" size="sm" :stroke-width="1.5"/>
        </IconButton>
        <IconButton
            v-if="status === 'disconnected' || status === 'error' || status === 'connecting'"
            size="sm"
            :title="t('terminal.sshReconnect')"
            @click="reconnectTerminal"
        >
          <DwIcon name="refresh" size="sm" :stroke-width="1.5"/>
        </IconButton>
        <IconButton size="sm" :title="t('ssh.profile.title')" @click="openProfileDialog">
          <DwIcon name="settings-profile" size="sm" :stroke-width="1.5"/>
        </IconButton>
        <span class="ssh-terminal-tab__divider" aria-hidden="true"/>
        <IconButton size="sm" :title="t('terminal.sshSearch')" @click="openTerminalSearch">
          <DwIcon name="search" size="sm" :stroke-width="1.5"/>
        </IconButton>
        <IconButton
            size="sm"
            :title="t('terminal.sshFontDecrease')"
            :disabled="fontSize <= SSH_TERMINAL_FONT_LIMITS.min"
            @click="decreaseFontSize"
        >
          <span class="ssh-terminal-tab__font-btn">A-</span>
        </IconButton>
        <IconButton
            size="sm"
            :title="t('terminal.sshFontIncrease')"
            :disabled="fontSize >= SSH_TERMINAL_FONT_LIMITS.max"
            @click="increaseFontSize"
        >
          <span class="ssh-terminal-tab__font-btn">A+</span>
        </IconButton>
        <IconButton
            v-if="fontOverrideActive"
            size="sm"
            :title="t('terminal.sshFontReset')"
            @click="resetFontSize"
        >
          <span class="ssh-terminal-tab__font-btn">A</span>
        </IconButton>
        <span class="ssh-terminal-tab__divider" aria-hidden="true"/>
        <IconButton size="sm" :title="t('terminal.sshCopySelection')" @click="copySelection">
          <DwIcon name="copy" size="sm" :stroke-width="1.5"/>
        </IconButton>
        <IconButton size="sm" :title="t('terminal.sshPaste')" @click="pasteClipboard">
          <DwIcon name="menu-import" size="sm" :stroke-width="1.5"/>
        </IconButton>
        <IconButton size="sm" :title="t('terminal.sshSaveSelection')" @click="saveSelectionToRecord">
          <DwIcon name="bookmark" size="sm" :stroke-width="1.5"/>
        </IconButton>
        <span class="ssh-terminal-tab__divider" aria-hidden="true"/>
        <IconButton size="sm" :title="t('terminal.sshCopyBuffer')" @click="copyTerminalBuffer">
          <DwIcon name="file" size="sm" :stroke-width="1.5"/>
        </IconButton>
        <IconButton size="sm" :title="t('terminal.sshSaveOutput')" @click="saveTerminalOutput">
          <DwIcon name="save-as" size="sm" :stroke-width="1.5"/>
        </IconButton>
        <IconButton size="sm" :title="t('terminal.clear')" @click="clearTerminal">
          <DwIcon name="delete" size="sm" :stroke-width="1.5"/>
        </IconButton>
      </div>
    </header>

    <div class="ssh-terminal-tab__main dw-workbench-page__body">
    <div v-if="searchOpen" class="ssh-terminal-tab__search">
      <input
          ref="searchInputRef"
          v-model="searchQuery"
          type="search"
          class="ssh-terminal-tab__search-input"
          :placeholder="t('terminal.sshSearchPlaceholder')"
          @keydown="onSearchKeydown"
      >
      <button type="button" class="ssh-terminal-tab__search-btn" @click="findPreviousInTerminal">
        {{ t('terminal.sshSearchPrev') }}
      </button>
      <button type="button" class="ssh-terminal-tab__search-btn" @click="findNextInTerminal">
        {{ t('terminal.sshSearchNext') }}
      </button>
      <button type="button" class="ssh-terminal-tab__search-btn ssh-terminal-tab__search-btn--ghost" @click="closeTerminalSearch">
        {{ t('common.close') }}
      </button>
    </div>

    <SshTerminalPane
        v-if="tab.connectionId"
        ref="terminalRef"
        :connection-id="tab.connectionId"
        :tab-id="tab.id"
        :tab-label="tab.title"
        :auto-reconnect="autoReconnect"
        class="ssh-terminal-tab__body dw-workbench-terminal"
        @status-change="onStatusChange"
        @save-selection="saveSelectionToRecord"
        @context-menu="onTerminalContextMenu"
        @open-search="openTerminalSearch"
    />
    <EmptyState
        v-else
        embedded
        compact
        class="ssh-terminal-tab__empty"
        :title="t('terminal.sshMissingConnection')"
    />

    <SshQuickOpsPanel
        v-if="tab.connectionId"
        ref="quickOpsRef"
        :connection-id="tab.connectionId"
        :terminal-tab-id="tab.id"
        @run-command="runQuickCommand"
        @paste-command="pasteQuickCommand"
        @open-related="openRelatedConnection"
        @edit-record="editScriptRecord"
        @create-record="createScriptRecord"
        @manage-records="manageScriptRecords"
        @layout-change="onQuickOpsLayoutChange"
    />
    </div>

    <ContextMenuHost
        :visible="contextMenu.visible.value"
        :items="contextMenu.items.value"
        :x="contextMenu.pos.value.x"
        :y="contextMenu.pos.value.y"
        @select="onContextMenuSelect"
        @close="contextMenu.close"
    />

    <PromptDialog
        v-model:open="savePromptOpen"
        :title="t('terminal.sshSaveSelectionNew')"
        :label="t('ssh.scriptRecord.saveSelectionPrompt')"
        :default-value="savePromptDefault"
        :confirm-label="t('ssh.scriptRecord.save')"
        @confirm="confirmSaveNewRecord"
    />

    <SshConnectionProfileDialog
        v-model:open="profileDialogOpen"
        :title="t('ssh.profile.title')"
        :subtitle="t('ssh.profile.subtitle')"
        :profile="connectionProfile"
        :confirm-label="t('common.save')"
        :cancel-label="t('common.cancel')"
        :tab-note-label="t('ssh.profile.tabNote')"
        :on-connect-label="t('ssh.profile.onConnectCommand')"
        :on-connect-mode-label="t('ssh.profile.onConnectMode')"
        :default-cwd-label="t('ssh.profile.defaultCwd')"
        :run-mode-label="t('ssh.quickOps.runHint')"
        :paste-mode-label="t('ssh.quickOps.pasteHint')"
        @confirm="saveConnectionProfile"
    />
  </div>
</template>

<style scoped>
.ssh-terminal-tab {
  min-height: 0;
  min-width: 0;
}

.ssh-terminal-tab__icon {
  flex-shrink: 0;
  color: var(--dw-primary);
}

.ssh-terminal-tab__actions {
  flex-wrap: nowrap;
}

.ssh-terminal-tab__divider {
  width: 1px;
  height: 1rem;
  margin: 0 0.15rem;
  background: var(--dw-border);
}

.ssh-terminal-tab__font-btn {
  font-size: var(--dw-text-xs);
  font-weight: 700;
  line-height: 1;
}

.ssh-terminal-tab__search {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  flex-shrink: 0;
  padding: var(--dw-space-2) var(--dw-space-4);
  border-bottom: 1px solid var(--dw-border-light);
  background: color-mix(in srgb, var(--dw-bg-panel) 70%, var(--dw-bg-editor));
}

.ssh-terminal-tab__search-input {
  flex: 1;
  min-width: 0;
  padding: var(--dw-space-1) var(--dw-space-4);
  border: 1px solid color-mix(in srgb, var(--dw-border) 80%, transparent);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg);
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
  outline: none;
}

.ssh-terminal-tab__search-btn {
  padding: var(--dw-space-1) var(--dw-space-4);
  border: 1px solid color-mix(in srgb, var(--dw-border) 80%, transparent);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg);
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
  cursor: pointer;
}

.ssh-terminal-tab__search-btn--ghost {
  color: var(--dw-text-muted);
  background: transparent;
}

.ssh-terminal-tab__body {
  flex: 1;
  min-height: var(--dw-wb-pane-min-height);
  min-width: 0;
}

.ssh-terminal-tab__empty {
  flex: 1;
}
</style>
