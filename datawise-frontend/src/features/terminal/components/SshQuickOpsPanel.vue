<script setup lang="ts">
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import type {RelatedConnectionItem} from '@/features/ssh/services/ssh-related-connections.service'
import {listSshScriptRecords} from '@/features/ssh/services/ssh-script-records.service'
import {
    filterMyCommandGroups,
    parseMyCommandGroups,
    resolveEntryAction,
    sortMyCommandGroups,
    type MyCommandGroup,
} from '@/features/ssh/services/ssh-my-commands.service'
import {
    readPinnedScriptRecordIds,
    togglePinnedScriptRecordId,
} from '@/features/ssh/services/ssh-quick-ops-pins.service'
import {
    commandNeedsParams,
    extractCommandParams,
    resolveCommandTemplate,
} from '@/features/ssh/services/ssh-command-params.service'
import {
    pushCommandHistory,
    readCommandHistory,
} from '@/features/ssh/services/ssh-command-history.service'
import {
    buildSshOpsOverview,
} from '@/features/ssh/services/ssh-ops-overview.service'
import SshCommandParamsDialog from '@/features/ssh/components/SshCommandParamsDialog.vue'
import {configApi, explorerApi} from '@/api'
import {findRelatedConnections} from '@/features/ssh/services/ssh-related-connections.service'
import {
    isJdbcSshTunnelEnabled,
} from '@/features/ssh/services/ssh-jdbc-tunnel.service'
import {onSshScriptRecordsChanged} from '@/features/ssh/services/ssh-script-records-events'
import {EmptyState} from '@/core/components'
import {DwIcon} from '@/core/icons'

const MY_GROUPS_PREVIEW = 12
const HISTORY_PREVIEW = 6
const COLLAPSED_KEY = 'ssh-quick-ops-collapsed'

const props = defineProps<{
  connectionId: string
  terminalTabId: string
}>()

const emit = defineEmits<{
  runCommand: [command: string]
  pasteCommand: [command: string]
  openRelated: [item: RelatedConnectionItem]
  editRecord: [payload: {recordId: string; title: string}]
  createRecord: []
  manageRecords: []
  layoutChange: []
}>()

const {t} = useI18n()
const collapsed = ref(readCollapsedPreference())
const myGroupsExpanded = ref(false)
const expandedGroupId = ref<string | null>(null)
const commandGroups = ref<MyCommandGroup[]>([])
const relatedConnections = ref<RelatedConnectionItem[]>([])
const sshHost = ref('')
const searchQuery = ref('')
const pinnedIds = ref<string[]>([])
const commandHistory = ref<string[]>([])
const paramsDialogOpen = ref(false)
const pendingParams = ref<string[]>([])
const pendingCommand = ref<{command: string; mode: 'run' | 'paste'} | null>(null)
const panelRef = ref<HTMLElement>()

const filteredGroups = computed(() =>
    filterMyCommandGroups(commandGroups.value, searchQuery.value),
)

const myGroupsOverflow = computed(() =>
    Math.max(0, filteredGroups.value.length - MY_GROUPS_PREVIEW),
)

const visibleGroups = computed(() => {
  if (myGroupsExpanded.value || filteredGroups.value.length <= MY_GROUPS_PREVIEW) {
    return filteredGroups.value
  }
  return filteredGroups.value.slice(0, MY_GROUPS_PREVIEW)
})

const expandedGroup = computed(() =>
    filteredGroups.value.find((group) => group.id === expandedGroupId.value) ?? null,
)

const opsOverview = computed(() => buildSshOpsOverview(sshHost.value, relatedConnections.value))

const collapsedSummary = computed(() => {
  const parts: string[] = []
  if (opsOverview.value.host) {
    parts.push(opsOverview.value.host)
  }
  if (commandGroups.value.length > 0) {
    parts.push(t('ssh.quickOps.summaryCommands', {count: commandGroups.value.length}))
  }
  if (relatedConnections.value.length > 0) {
    parts.push(t('ssh.quickOps.summaryRelated', {count: relatedConnections.value.length}))
  }
  return parts.join(' · ')
})

const visibleHistory = computed(() => commandHistory.value.slice(0, HISTORY_PREVIEW))

/** First 9 visible groups for Alt+1..9 quick fire. */
const hotkeyGroups = computed(() => visibleGroups.value.slice(0, 9))

function readCollapsedPreference(): boolean {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    // Default collapsed so the SSH pane keeps full height (more PTY rows).
    if (raw == null) return true
    return raw === '1'
  } catch {
    return true
  }
}

function writeCollapsedPreference(value: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0')
  } catch {
    // ignore
  }
}

function toggleCollapsed() {
  collapsed.value = !collapsed.value
  writeCollapsedPreference(collapsed.value)
  if (collapsed.value) {
    expandedGroupId.value = null
  } else {
    void nextTick(() => panelRef.value?.focus())
  }
  emit('layoutChange')
}

async function loadPanelData() {
  if (!props.connectionId) return
  pinnedIds.value = readPinnedScriptRecordIds(props.connectionId)
  commandHistory.value = readCommandHistory(props.connectionId)
  try {
    const [config, catalog, records] = await Promise.all([
      explorerApi.fetchConnection(props.connectionId),
      configApi.fetchConnectionsCatalog(),
      listSshScriptRecords(props.connectionId),
    ])
    sshHost.value = isJdbcSshTunnelEnabled(config)
        ? config.sshHost ?? ''
        : config.host ?? ''
    commandGroups.value = parseMyCommandGroups(
        records,
        t('ssh.scriptRecord.untitled'),
        pinnedIds.value,
    )
    relatedConnections.value = findRelatedConnections(sshHost.value, catalog, {
      sshConnectionId: props.connectionId,
      limit: 8,
    })
    if (expandedGroupId.value && !commandGroups.value.some((group) => group.id === expandedGroupId.value)) {
      expandedGroupId.value = null
    }
  } catch {
    commandGroups.value = []
    relatedConnections.value = []
    expandedGroupId.value = null
  }
}

function dispatchCommand(command: string, mode: 'run' | 'paste') {
  if (mode === 'run') {
    emit('runCommand', command)
    return
  }
  emit('pasteCommand', command)
}

function finishCommand(command: string, mode: 'run' | 'paste') {
  commandHistory.value = pushCommandHistory(props.connectionId, command)
  dispatchCommand(command, mode)
}

function requestCommand(command: string, mode: 'run' | 'paste') {
  if (commandNeedsParams(command)) {
    pendingCommand.value = {command, mode}
    pendingParams.value = extractCommandParams(command)
    paramsDialogOpen.value = true
    return
  }
  finishCommand(command, mode)
}

function onParamsConfirm(values: Record<string, string>) {
  const pending = pendingCommand.value
  pendingCommand.value = null
  if (!pending) return
  finishCommand(resolveCommandTemplate(pending.command, values), pending.mode)
}

function onHistoryClick(command: string) {
  requestCommand(command, 'paste')
}

function groupHint(group: MyCommandGroup): string {
  if (group.multi) {
    return t('ssh.quickOps.myGroupHint', {count: group.entries.length})
  }
  const entry = group.entries[0]
  if (!entry) return group.title
  const action = resolveEntryAction(entry, group)
  const prefix = action === 'run' ? t('ssh.quickOps.runHint') : t('ssh.quickOps.pasteHint')
  return `${prefix}\n${entry.command}`
}

function entryHint(group: MyCommandGroup, entry: MyCommandGroup['entries'][number]): string {
  const action = resolveEntryAction(entry, group)
  const prefix = action === 'run' ? t('ssh.quickOps.runHint') : t('ssh.quickOps.pasteHint')
  const description = entry.description?.trim()
  return description
      ? `${prefix}\n${description}\n${entry.command}`
      : `${prefix}\n${entry.command}`
}

function onGroupClick(group: MyCommandGroup) {
  if (group.multi) {
    expandedGroupId.value = expandedGroupId.value === group.id ? null : group.id
    return
  }
  const entry = group.entries[0]
  if (!entry) return
  requestCommand(entry.command, resolveEntryAction(entry, group))
}

function onEntryClick(group: MyCommandGroup, entry: MyCommandGroup['entries'][number]) {
  requestCommand(entry.command, resolveEntryAction(entry, group))
  expandedGroupId.value = null
}

function togglePin(group: MyCommandGroup, event: MouseEvent) {
  event.stopPropagation()
  pinnedIds.value = togglePinnedScriptRecordId(props.connectionId, group.id)
  commandGroups.value = sortMyCommandGroups(
      commandGroups.value.map((item) => ({
        ...item,
        pinned: pinnedIds.value.includes(item.id),
      })),
  )
}

function editRecord(group: MyCommandGroup, event?: MouseEvent) {
  event?.stopPropagation()
  emit('editRecord', {recordId: group.id, title: group.title})
}

function openRelated(item: RelatedConnectionItem) {
  emit('openRelated', item)
}

function manageRecords() {
  emit('manageRecords')
}

function createRecord() {
  emit('createRecord')
}

function onDocumentPointerDown(event: MouseEvent) {
  if (!expandedGroupId.value) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (panelRef.value?.contains(target)) return
  expandedGroupId.value = null
}

function onPanelKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && expandedGroupId.value) {
    event.preventDefault()
    expandedGroupId.value = null
    return
  }
  if (collapsed.value) return
  if (!(event.altKey || event.metaKey) || event.ctrlKey || event.shiftKey) return
  const digit = event.key >= '1' && event.key <= '9' ? Number(event.key) : 0
  if (!digit) return
  const group = hotkeyGroups.value[digit - 1]
  if (!group) return
  event.preventDefault()
  event.stopPropagation()
  onGroupClick(group)
}

let stopRecordsListener: (() => void) | null = null

onMounted(() => {
  void loadPanelData()
  document.addEventListener('pointerdown', onDocumentPointerDown)
  stopRecordsListener = onSshScriptRecordsChanged((connectionId) => {
    if (connectionId === props.connectionId) {
      void loadPanelData()
    }
  })
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  stopRecordsListener?.()
  stopRecordsListener = null
})

watch(() => props.connectionId, () => {
  myGroupsExpanded.value = false
  expandedGroupId.value = null
  searchQuery.value = ''
  void loadPanelData()
})

watch(searchQuery, (query) => {
  if (!query.trim()) return
  const groups = filteredGroups.value
  if (groups.length === 1 && groups[0]?.multi) {
    expandedGroupId.value = groups[0].id
  }
})

defineExpose({
  reload: loadPanelData,
})
</script>

<template>
  <section
      ref="panelRef"
      class="ssh-quick-ops"
      :class="{'is-collapsed': collapsed}"
      tabindex="0"
      @keydown="onPanelKeydown"
  >
    <header class="ssh-quick-ops__head">
      <button
          type="button"
          class="ssh-quick-ops__toggle"
          :aria-expanded="!collapsed"
          :title="t('ssh.quickOps.hint')"
          @click="toggleCollapsed"
      >
        <span class="ssh-quick-ops__chevron" :class="{'is-expanded': !collapsed}" aria-hidden="true">
          <DwIcon name="chevron-right" size="sm" :stroke-width="2"/>
        </span>
        <span class="ssh-quick-ops__title">{{ t('ssh.quickOps.title') }}</span>
        <span v-if="collapsed && collapsedSummary" class="ssh-quick-ops__summary">{{ collapsedSummary }}</span>
      </button>

      <div v-if="!collapsed" class="ssh-quick-ops__head-tools">
        <div class="ssh-quick-ops__search">
          <DwIcon name="search" size="sm" :stroke-width="1.8"/>
          <input
              v-model="searchQuery"
              type="search"
              class="ssh-quick-ops__search-input"
              :placeholder="t('ssh.quickOps.searchPlaceholder')"
          >
        </div>
        <button
            type="button"
            class="ssh-quick-ops__manage ssh-quick-ops__manage--primary"
            :title="t('ssh.quickOps.newRecord')"
            @click="createRecord"
        >
          {{ t('ssh.quickOps.newRecord') }}
        </button>
        <button type="button" class="ssh-quick-ops__manage" @click="manageRecords">
          {{ t('ssh.quickOps.manageRecords') }}
        </button>
      </div>
    </header>

    <div v-if="!collapsed" class="ssh-quick-ops__body">
      <div class="ssh-quick-ops__chips ssh-quick-ops__chips--groups">
        <button
            v-for="(group, groupIndex) in visibleGroups"
            :key="group.id"
            type="button"
            class="ssh-quick-ops__chip"
            :class="{
              'is-active': group.multi && expandedGroupId === group.id,
              'is-folder': group.multi,
              'is-run': !group.multi && group.mode === 'run',
              'is-pinned': group.pinned,
            }"
            :title="groupHint(group)"
            @click="onGroupClick(group)"
            @dblclick="editRecord(group, $event)"
        >
          <span
              v-if="groupIndex < 9"
              class="ssh-quick-ops__hotkey"
              :title="t('ssh.quickOps.hotkeyHint', {n: groupIndex + 1})"
          >{{ groupIndex + 1 }}</span>
          <span
              class="ssh-quick-ops__pin"
              :class="{'is-active': group.pinned}"
              :title="group.pinned ? t('ssh.quickOps.unpin') : t('ssh.quickOps.pin')"
              @click="togglePin(group, $event)"
          >
            <DwIcon name="star" size="xs" :stroke-width="1.8"/>
          </span>
          <span class="ssh-quick-ops__chip-label">{{ group.title }}</span>
          <span v-if="group.builtIn" class="ssh-quick-ops__tag">{{ t('ssh.quickOps.builtinTag') }}</span>
          <span v-if="group.multi" class="ssh-quick-ops__badge">{{ group.entries.length }}</span>
          <span
              class="ssh-quick-ops__edit"
              :title="t('ssh.quickOps.editRecord')"
              @click="editRecord(group, $event)"
          >
            <DwIcon name="edit" size="xs" :stroke-width="1.8"/>
          </span>
          <span v-if="group.multi" class="ssh-quick-ops__folder-chevron" :class="{'is-open': expandedGroupId === group.id}">
            <DwIcon name="chevron-down" size="xs" :stroke-width="2"/>
          </span>
          <span
              v-else-if="resolveEntryAction(group.entries[0]!, group) === 'run'"
              class="ssh-quick-ops__action-mark"
              aria-hidden="true"
          >▶</span>
        </button>

        <button
            v-if="myGroupsOverflow > 0 && !myGroupsExpanded"
            type="button"
            class="ssh-quick-ops__chip ssh-quick-ops__chip--more"
            @click="myGroupsExpanded = true"
        >
          {{ t('ssh.quickOps.showMoreMyCommands', {count: myGroupsOverflow}) }}
        </button>
        <button
            v-if="myGroupsExpanded && filteredGroups.length > MY_GROUPS_PREVIEW"
            type="button"
            class="ssh-quick-ops__chip ssh-quick-ops__chip--ghost"
            @click="myGroupsExpanded = false"
        >
          {{ t('ssh.quickOps.collapseMyCommands') }}
        </button>
        <EmptyState
            v-if="!filteredGroups.length"
            embedded
            compact
            bordered
            class="ssh-quick-ops__empty"
            :title="searchQuery ? t('ssh.quickOps.searchEmpty') : t('ssh.quickOps.commandsEmpty')"
        />
      </div>

      <Transition name="ssh-quick-ops-expand">
        <div v-if="expandedGroup" class="ssh-quick-ops__entries">
          <div class="ssh-quick-ops__entries-head">
            <span class="ssh-quick-ops__entries-label">{{ expandedGroup.title }}</span>
            <button
                type="button"
                class="ssh-quick-ops__entries-edit"
                @click="editRecord(expandedGroup)"
            >
              {{ t('ssh.quickOps.editRecord') }}
            </button>
          </div>
          <div class="ssh-quick-ops__entries-list">
            <button
                v-for="(entry, index) in expandedGroup.entries"
                :key="`${expandedGroup.id}-${index}`"
                type="button"
                class="ssh-quick-ops__entry"
                :class="{'is-run': resolveEntryAction(entry, expandedGroup) === 'run'}"
                :title="entryHint(expandedGroup, entry)"
                @click="onEntryClick(expandedGroup, entry)"
            >
              <span v-if="resolveEntryAction(entry, expandedGroup) === 'run'" class="ssh-quick-ops__action-mark">▶</span>
              <span class="ssh-quick-ops__entry-text">
                <span class="ssh-quick-ops__entry-label">{{ entry.label }}</span>
                <span v-if="entry.description?.trim()" class="ssh-quick-ops__entry-desc">{{ entry.description }}</span>
              </span>
            </button>
          </div>
        </div>
      </Transition>

      <div v-if="relatedConnections.length" class="ssh-quick-ops__related">
        <span class="ssh-quick-ops__section-label">{{ t('ssh.quickOps.related') }}</span>
        <div class="ssh-quick-ops__chips ssh-quick-ops__chips--related">
          <button
              v-for="item in relatedConnections"
              :key="`${item.connectionId}:${item.kind}`"
              type="button"
              class="ssh-quick-ops__chip ssh-quick-ops__chip--related"
              @click="openRelated(item)"
          >
            {{ item.label }} · {{ t(item.kindLabelKey) }}
          </button>
        </div>
      </div>

      <div v-if="visibleHistory.length" class="ssh-quick-ops__history">
        <span class="ssh-quick-ops__section-label">{{ t('ssh.quickOps.history') }}</span>
        <div class="ssh-quick-ops__chips ssh-quick-ops__chips--history">
          <button
              v-for="(command, index) in visibleHistory"
              :key="`${index}-${command.slice(0, 24)}`"
              type="button"
              class="ssh-quick-ops__chip ssh-quick-ops__chip--history"
              :title="command"
              @click="onHistoryClick(command)"
          >
            {{ command.length > 36 ? `${command.slice(0, 35)}…` : command }}
          </button>
        </div>
      </div>
    </div>

    <SshCommandParamsDialog
        v-model:open="paramsDialogOpen"
        :title="t('ssh.params.title')"
        :subtitle="t('ssh.params.subtitle')"
        :params="pendingParams"
        :confirm-label="t('ssh.params.confirm')"
        :cancel-label="t('common.cancel')"
        :required-message="t('ssh.params.required')"
        @confirm="onParamsConfirm"
    />
  </section>
</template>

<style scoped>
.ssh-quick-ops {
  flex-shrink: 0;
  border: none;
  border-top: 1px solid var(--dw-border-light);
  border-radius: 0;
  background: color-mix(in srgb, var(--dw-bg-panel) 72%, var(--dw-bg-editor));
  box-shadow: none;
  max-height: min(200px, 26vh);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  outline: none;
}

.ssh-quick-ops.is-collapsed {
  max-height: none;
}

.ssh-quick-ops__head {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-md);
  padding: var(--dw-space-2) var(--dw-space-4);
  min-height: var(--dw-control-h-sm);
  flex-shrink: 0;
}

.ssh-quick-ops.is-collapsed .ssh-quick-ops__head {
  padding: var(--dw-space-1) var(--dw-space-4);
  min-height: var(--dw-density-sm);
}

.ssh-quick-ops__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  flex-shrink: 0;
}

.ssh-quick-ops__head-tools {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
  min-width: 0;
  flex: 1;
}

.ssh-quick-ops__chevron {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: var(--dw-icon-size-md);
  height: var(--dw-icon-size-md);
  color: var(--dw-text-muted);
  transition: transform var(--dw-duration) var(--dw-ease);
}

.ssh-quick-ops__chevron.is-expanded {
  transform: rotate(90deg);
}

.ssh-quick-ops__title {
  flex-shrink: 0;
}

.ssh-quick-ops__summary {
  min-width: 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 400;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ssh-quick-ops__empty {
  margin: 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
}

.ssh-quick-ops__body {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-sm);
  padding: 0 var(--dw-space-4) var(--dw-space-3);
  min-height: 0;
  overflow: auto;
}

.ssh-quick-ops__search {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  flex: 1;
  min-width: 0;
  padding: var(--dw-space-1) var(--dw-space-4);
  border: 1px solid color-mix(in srgb, var(--dw-border) 80%, transparent);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg);
  color: var(--dw-text-muted);
}

.ssh-quick-ops__search-input {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
  outline: none;
}

.ssh-quick-ops__manage {
  flex-shrink: 0;
  padding: var(--dw-space-1) var(--dw-space-4);
  border: 1px solid color-mix(in srgb, var(--dw-border) 80%, transparent);
  border-radius: var(--dw-control-radius);
  background: transparent;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
  cursor: pointer;
}

.ssh-quick-ops__manage:hover {
  color: var(--dw-text);
  border-color: color-mix(in srgb, var(--dw-primary) 35%, var(--dw-border));
}

.ssh-quick-ops__hotkey {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 12px;
  height: 12px;
  padding: 0 2px;
  border-radius: var(--dw-radius-xs);
  color: var(--dw-text-muted);
  font-size: var(--dw-font-size-badge);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  opacity: 0.35;
}

.ssh-quick-ops__chip:hover .ssh-quick-ops__hotkey,
.ssh-quick-ops:focus-within .ssh-quick-ops__hotkey {
  opacity: 0.75;
}

.ssh-quick-ops__manage--primary {
  color: var(--dw-text-secondary);
  border-color: color-mix(in srgb, var(--dw-border) 80%, transparent);
  background: transparent;
}

.ssh-quick-ops__manage--primary:hover {
  color: var(--dw-primary);
  border-color: color-mix(in srgb, var(--dw-primary) 35%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-primary) 8%, transparent);
}

.ssh-quick-ops__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-sm);
  min-width: 0;
}

.ssh-quick-ops__related,
.ssh-quick-ops__history {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-sm);
  padding-top: var(--dw-space-1);
  border-top: 1px solid color-mix(in srgb, var(--dw-border) 55%, transparent);
}

.ssh-quick-ops__section-label {
  font-size: var(--dw-text-xs);
  font-weight: 600;
  color: var(--dw-text-muted);
}

.ssh-quick-ops__entries {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-sm);
  min-width: 0;
  padding: var(--dw-space-2) var(--dw-space-3);
  border-radius: var(--dw-control-radius);
  background: color-mix(in srgb, var(--dw-info) 6%, var(--dw-bg));
  border-left: 3px solid var(--dw-info);
}

.ssh-quick-ops__entries-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
}

.ssh-quick-ops__entries-label {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  white-space: nowrap;
}

.ssh-quick-ops__entries-edit {
  border: none;
  background: transparent;
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  cursor: pointer;
  padding: 0;
}

.ssh-quick-ops__entries-edit:hover {
  text-decoration: underline;
}

.ssh-quick-ops__entries-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-sm);
  min-width: 0;
}

.ssh-quick-ops__entry {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-xs);
  max-width: 320px;
  padding: var(--dw-space-1) 9px;
  border: 1px solid color-mix(in srgb, var(--dw-info) 22%, var(--dw-border));
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg);
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-snug);
  cursor: pointer;
}

.ssh-quick-ops__entry-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  text-align: left;
}

.ssh-quick-ops__entry-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ssh-quick-ops__entry-desc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.ssh-quick-ops__entry:hover {
  border-color: var(--dw-info);
  background: color-mix(in srgb, var(--dw-info) 10%, var(--dw-bg));
}

.ssh-quick-ops__entry.is-run {
  border-color: color-mix(in srgb, var(--dw-success) 30%, var(--dw-border));
}

.ssh-quick-ops__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-xs);
  max-width: 220px;
  padding: var(--dw-space-1) 9px;
  border: 1px solid color-mix(in srgb, var(--dw-border) 80%, transparent);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg);
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-snug);
  white-space: nowrap;
  cursor: pointer;
}

.ssh-quick-ops__chip-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.ssh-quick-ops__chip:hover {
  border-color: color-mix(in srgb, var(--dw-primary) 40%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-primary) 8%, var(--dw-bg));
}

.ssh-quick-ops__chip.is-run {
  border-color: color-mix(in srgb, var(--dw-success) 28%, var(--dw-border));
}

.ssh-quick-ops__chip.is-pinned {
  border-color: color-mix(in srgb, var(--dw-warning) 35%, var(--dw-border));
}

.ssh-quick-ops__chip.is-active {
  border-color: var(--dw-info);
  background: color-mix(in srgb, var(--dw-info) 14%, var(--dw-bg));
}

.ssh-quick-ops__chip.is-folder {
  padding-right: var(--dw-space-3);
}

.ssh-quick-ops__pin,
.ssh-quick-ops__edit {
  display: inline-flex;
  flex-shrink: 0;
  color: var(--dw-text-muted);
  opacity: 0;
  transition: opacity var(--dw-duration-fast) var(--dw-ease);
}

.ssh-quick-ops__pin.is-active,
.ssh-quick-ops__chip:hover .ssh-quick-ops__pin,
.ssh-quick-ops__chip:focus-visible .ssh-quick-ops__pin,
.ssh-quick-ops__chip:hover .ssh-quick-ops__edit,
.ssh-quick-ops__chip:focus-visible .ssh-quick-ops__edit {
  opacity: 1;
}

.ssh-quick-ops__pin.is-active {
  color: var(--mp-tone-amber);
}

.ssh-quick-ops__edit:hover {
  color: var(--dw-primary);
}

.ssh-quick-ops__tag {
  flex-shrink: 0;
  padding: 0 var(--dw-space-2);
  border-radius: var(--dw-control-radius-sm);
  background: color-mix(in srgb, var(--dw-text-muted) 10%, transparent);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
}

.ssh-quick-ops__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--dw-icon-size-menu);
  height: var(--dw-icon-size-menu);
  padding: 0 var(--dw-space-2);
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-info) 16%, transparent);
  color: var(--dw-info-fg);
  font-size: var(--dw-text-xs);
  font-weight: 700;
}

.ssh-quick-ops__folder-chevron {
  display: inline-flex;
  color: var(--dw-text-muted);
  transition: transform var(--dw-duration) var(--dw-ease);
}

.ssh-quick-ops__folder-chevron.is-open {
  transform: rotate(180deg);
}

.ssh-quick-ops__action-mark {
  flex-shrink: 0;
  color: var(--dw-success);
  font-size: var(--dw-text-2xs);
  line-height: 1;
}

.ssh-quick-ops__chip--more {
  border-style: dashed;
  color: var(--dw-primary);
  background: color-mix(in srgb, var(--dw-primary) 6%, var(--dw-bg));
}

.ssh-quick-ops__chip--related {
  border-color: color-mix(in srgb, var(--dw-success) 24%, var(--dw-border));
}

.ssh-quick-ops__chip--history {
  max-width: 240px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--dw-text-xs);
}

.ssh-quick-ops__chip--ghost {
  color: var(--dw-text-muted);
  background: transparent;
}

.ssh-quick-ops-expand-enter-active,
.ssh-quick-ops-expand-leave-active {
  transition: opacity var(--dw-duration) var(--dw-ease), transform var(--dw-duration) var(--dw-ease);
}

.ssh-quick-ops-expand-enter-from,
.ssh-quick-ops-expand-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
