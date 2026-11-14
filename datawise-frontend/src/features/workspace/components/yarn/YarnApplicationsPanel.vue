<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwInlineAlert, DwMultiSelect, DwInput, DwSplitPane, EmptyState, ConfirmDialog} from '@/core/components'
import type {SelectOption} from '@/core/components/select.types'
import {configApi, explorerApi} from '@/api'
import type {YarnAppDetail, YarnAppSummary, YarnQueueSummary} from '@/features/explorer/services/yarn-applications.service'
import {
    formatYarnDuration,
    formatYarnMemory,
    formatYarnStateFilter,
    formatYarnTimestamp,
    isYarnAppKillable,
    YARN_APP_STATE_OPTIONS,
} from '@/features/explorer/services/yarn-applications.service'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {
    buildYarnLogsCommand,
    findSshConnectionForHost,
} from '@/features/ssh/services/ssh-yarn-bridge.service'
import {sendToSshTerminal} from '@/features/terminal/services/ssh-terminal-session.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import '@/features/workspace/components/shared/connector-browse-panel.css'

const props = defineProps<{
  connectionId: string
  initialAppId?: string
}>()

const {t} = useI18n()
const workspace = useWorkspaceStore()
const layout = useLayoutStore()

const stateFilter = ref<string[]>(['RUNNING'])
const userFilter = ref('')
const queueFilter = ref('')
const apps = ref<YarnAppSummary[]>([])
const selectedApp = ref<YarnAppDetail | null>(null)
const loading = ref(false)
const detailLoading = ref(false)
const mutationLoading = ref(false)
const error = ref<string | null>(null)
const queueOptions = ref<YarnQueueSummary[]>([])
const moveQueueInput = ref('')
const killDiagnostics = ref('')
const killConfirmOpen = ref(false)

const canKillSelected = computed(() => isYarnAppKillable(selectedApp.value?.state))

const stateOptions = computed<SelectOption[]>(() =>
    YARN_APP_STATE_OPTIONS.map((state) => ({value: state, label: state})),
)

const selectedAmHost = computed(() => selectedApp.value?.amHostHttpAddress ?? '')

const statusText = computed(() => {
  if (loading.value) return t('explorer.yarnApps.loading')
  return t('explorer.yarnApps.status', {count: apps.value.length})
})

async function loadApps() {
  if (!props.connectionId) return
  loading.value = true
  error.value = null
  selectedApp.value = null
  try {
    const result = await explorerApi.fetchYarnApplications(props.connectionId, {
      state: formatYarnStateFilter(stateFilter.value),
      user: userFilter.value.trim() || undefined,
      queue: queueFilter.value.trim() || undefined,
      limit: 200,
    })
    apps.value = result.apps
    await selectInitialAppIfNeeded()
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.yarnApps.loadFailed')
    apps.value = []
  } finally {
    loading.value = false
  }
}

async function selectApp(app: YarnAppSummary) {
  if (!props.connectionId || !app.id) return
  detailLoading.value = true
  killDiagnostics.value = ''
  moveQueueInput.value = app.queue ?? ''
  try {
    const detail = await explorerApi.fetchYarnApplicationDetail(props.connectionId, app.id)
    selectedApp.value = detail
    moveQueueInput.value = detail.queue ?? moveQueueInput.value
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.yarnApps.detailFailed')
  } finally {
    detailLoading.value = false
  }
}

async function loadQueueOptions() {
  if (!props.connectionId) return
  try {
    const result = await explorerApi.fetchYarnQueues(props.connectionId)
    queueOptions.value = result.queues
  } catch {
    queueOptions.value = []
  }
}

async function requestKillSelectedApp() {
  if (!props.connectionId || !selectedApp.value?.id || !canKillSelected.value) return
  killConfirmOpen.value = true
}

async function killSelectedApp() {
  if (!props.connectionId || !selectedApp.value?.id || !canKillSelected.value) return
  killConfirmOpen.value = false
  mutationLoading.value = true
  error.value = null
  try {
    await explorerApi.killYarnApplication(
        props.connectionId,
        selectedApp.value.id,
        killDiagnostics.value.trim() ? {diagnostics: killDiagnostics.value.trim()} : undefined,
    )
    await loadApps()
    if (selectedApp.value?.id) {
      selectedApp.value = await explorerApi.fetchYarnApplicationDetail(
          props.connectionId,
          selectedApp.value.id,
      )
    }
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.yarnApps.killFailed')
  } finally {
    mutationLoading.value = false
  }
}

async function moveSelectedApp() {
  if (!props.connectionId || !selectedApp.value?.id) return
  const appId = selectedApp.value.id
  const queue = moveQueueInput.value.trim()
  if (!queue) return
  mutationLoading.value = true
  error.value = null
  try {
    await explorerApi.moveYarnApplicationQueue(
        props.connectionId,
        appId,
        {queue},
    )
    await loadApps()
    const detail = await explorerApi.fetchYarnApplicationDetail(props.connectionId, appId)
    selectedApp.value = detail
    moveQueueInput.value = detail.queue ?? queue
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.yarnApps.moveQueueFailed')
  } finally {
    mutationLoading.value = false
  }
}

function refresh() {
  loadApps()
}

async function selectInitialAppIfNeeded() {
  const appId = props.initialAppId?.trim()
  if (!appId) return
  const match = apps.value.find((app) => app.id === appId)
  if (match) {
    await selectApp(match)
  }
}

async function openSshForSelectedApp() {
  if (!selectedApp.value?.id) return
  try {
    const catalog = await configApi.fetchConnectionsCatalog()
    const host = selectedAmHost.value || catalog.connections.find((entry) => entry.id === props.connectionId)?.config.host
    const ssh = findSshConnectionForHost(host ?? '', catalog)
    if (!ssh) {
      layout.showErrorToast(t('ssh.yarnBridge.noSshConnection'))
      return
    }
    workspace.openSshTerminal({
      connectionId: ssh.connectionId,
      connectionName: ssh.label,
    })
  } catch (error) {
    layout.showErrorToast(resolveCaughtApiErrorMessage(error, t, 'ssh.yarnBridge.openSshFailed'))
  }
}

async function pasteYarnLogsForSelectedApp() {
  if (!selectedApp.value?.id) return
  try {
    const catalog = await configApi.fetchConnectionsCatalog()
    const host = selectedAmHost.value || catalog.connections.find((entry) => entry.id === props.connectionId)?.config.host
    const ssh = findSshConnectionForHost(host ?? '', catalog)
    if (!ssh) {
      layout.showErrorToast(t('ssh.yarnBridge.noSshConnection'))
      return
    }
    workspace.openSshTerminal({
      connectionId: ssh.connectionId,
      connectionName: ssh.label,
    })
    const command = buildYarnLogsCommand(selectedApp.value.id)
    const ok = await sendToSshTerminal(ssh.connectionId, command, {focus: true})
    if (!ok) {
      layout.showErrorToast(t('ssh.quickOps.pasteFailed'))
    }
  } catch (error) {
    layout.showErrorToast(resolveCaughtApiErrorMessage(error, t, 'ssh.yarnBridge.pasteLogsFailed'))
  }
}

defineExpose({refresh})

onMounted(() => {
  loadApps()
  loadQueueOptions()
})
watch(() => props.connectionId, () => {
  loadApps()
  loadQueueOptions()
})

watch(() => props.initialAppId, () => {
  void selectInitialAppIfNeeded()
})
</script>

<template>
  <div class="connector-browse-panel connector-workbench-pane yarn-apps-panel">
    <DwInlineAlert v-if="error" density="banner" variant="error" :message="error"/>

    <div class="connector-browse-panel__body">
      <div class="connector-browse-panel__pane">
        <div class="connector-list">
          <div class="yarn-apps-panel__toolbar connector-list__filters">
      <!-- div not label: DwMultiSelect uses a button trigger; label would re-activate it and close the menu -->
      <div class="yarn-apps-panel__field">
        <span>{{ t('explorer.yarnApps.state') }}</span>
        <DwMultiSelect
            v-model="stateFilter"
            size="sm"
            :options="stateOptions"
            :placeholder="t('explorer.yarnApps.allStates')"
        />
      </div>
      <label class="yarn-apps-panel__field">
        <span>{{ t('explorer.yarnApps.user') }}</span>
        <DwInput
            v-model="userFilter"
            variant="sm"
            type="text"
            :placeholder="t('explorer.yarnApps.userPlaceholder')"
            @keydown.enter.prevent="loadApps"
        />
      </label>
      <label class="yarn-apps-panel__field">
        <span>{{ t('explorer.yarnApps.queue') }}</span>
        <DwInput
            v-model="queueFilter"
            variant="sm"
            type="text"
            :placeholder="t('explorer.yarnApps.queuePlaceholder')"
            @keydown.enter.prevent="loadApps"
        />
      </label>
      <div class="yarn-apps-panel__field yarn-apps-panel__field--action">
        <span aria-hidden="true">&nbsp;</span>
        <DwButton
            variant="secondary"
            size="sm"
            class="yarn-apps-panel__apply"
            :loading="loading"
            @click="loadApps"
        >
          {{ t('explorer.yarnApps.applyFilters') }}
        </DwButton>
      </div>
    </div>

    <DwSplitPane
        v-if="apps.length"
        class="yarn-apps-panel__body"
        storage-key="dw.split.yarn-apps"
        :default-width="480"
        :min-width="280"
        :max-width="800"
        :end-min-width="260"
        :stack-below="900"
        start-class="connector-list__scroll yarn-apps-panel__table-wrap"
        end-class="yarn-apps-panel__detail"
    >
      <template #start>
        <table class="connector-browse-panel__table">
          <thead>
            <tr>
              <th>{{ t('explorer.yarnApps.columns.id') }}</th>
              <th>{{ t('explorer.yarnApps.columns.name') }}</th>
              <th>{{ t('explorer.yarnApps.columns.user') }}</th>
              <th>{{ t('explorer.yarnApps.columns.queue') }}</th>
              <th>{{ t('explorer.yarnApps.columns.state') }}</th>
              <th>{{ t('explorer.yarnApps.columns.type') }}</th>
              <th>{{ t('explorer.yarnApps.columns.progress') }}</th>
              <th>{{ t('explorer.yarnApps.columns.elapsed') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
                v-for="app in apps"
                :key="app.id ?? app.name ?? Math.random()"
                class="is-clickable"
                :class="{ 'is-selected': selectedApp?.id === app.id }"
                @click="selectApp(app)"
            >
              <td>{{ app.id ?? '—' }}</td>
              <td>{{ app.name ?? '—' }}</td>
              <td>{{ app.user ?? '—' }}</td>
              <td>{{ app.queue ?? '—' }}</td>
              <td><span class="yarn-apps-panel__badge">{{ app.state ?? '—' }}</span></td>
              <td>{{ app.applicationType ?? '—' }}</td>
              <td>{{ app.progress?.toFixed?.(1) ?? 0 }}%</td>
              <td>{{ formatYarnDuration(app.elapsedTime) }}</td>
            </tr>
          </tbody>
        </table>
      </template>

      <template #end>
      <template v-if="selectedApp">
        <div class="connector-list__foot connector-list__foot--head">
          <strong>{{ t('explorer.yarnApps.detailTitle') }}</strong>
        </div>
        <div class="yarn-apps-panel__detail-body">
          <dl>
            <div><dt>ID</dt><dd>{{ selectedApp.id ?? '—' }}</dd></div>
            <div><dt>{{ t('explorer.yarnApps.columns.name') }}</dt><dd>{{ selectedApp.name ?? '—' }}</dd></div>
            <div><dt>{{ t('explorer.yarnApps.columns.state') }}</dt><dd>{{ selectedApp.state ?? '—' }}</dd></div>
            <div><dt>{{ t('explorer.yarnApps.columns.type') }}</dt><dd>{{ selectedApp.applicationType ?? '—' }}</dd></div>
            <div><dt>{{ t('explorer.yarnApps.started') }}</dt><dd>{{ formatYarnTimestamp(selectedApp.startedTime) }}</dd></div>
            <div><dt>{{ t('explorer.yarnApps.memory') }}</dt><dd>{{ formatYarnMemory(selectedApp.allocatedMb) }}</dd></div>
            <div><dt>{{ t('explorer.yarnApps.vcores') }}</dt><dd>{{ selectedApp.allocatedVCores ?? 0 }}</dd></div>
            <div v-if="selectedApp.trackingUrl">
              <dt>Tracking</dt>
              <dd><a :href="selectedApp.trackingUrl" target="_blank" rel="noreferrer">{{ selectedApp.trackingUrl }}</a></dd>
            </div>
            <div v-if="selectedApp.diagnostics">
              <dt>{{ t('explorer.yarnApps.diagnostics') }}</dt>
              <dd class="yarn-apps-panel__diagnostics">{{ selectedApp.diagnostics }}</dd>
            </div>
          </dl>
          <p v-if="detailLoading" class="yarn-apps-panel__detail-loading">{{ t('explorer.yarnApps.loadingDetail') }}</p>

          <div class="yarn-apps-panel__actions">
            <DwButton size="sm" variant="secondary" :disabled="!selectedApp?.id" @click="openSshForSelectedApp">
              {{ t('ssh.yarnBridge.openSshTerminal') }}
            </DwButton>
            <DwButton size="sm" variant="secondary" :disabled="!selectedApp?.id" @click="pasteYarnLogsForSelectedApp">
              {{ t('ssh.yarnBridge.pasteYarnLogs') }}
            </DwButton>
          </div>

          <div class="yarn-apps-panel__ops">
            <label class="yarn-apps-panel__field">
              <span>{{ t('explorer.yarnApps.moveQueue') }}</span>
              <div class="yarn-apps-panel__ops-row">
                <DwInput
                    v-model="moveQueueInput"
                    variant="sm"
                    type="text"
                    list="yarn-queue-options"
                    :placeholder="t('explorer.yarnApps.moveQueuePlaceholder')"
                />
                <datalist id="yarn-queue-options">
                  <option v-for="queue in queueOptions" :key="queue.name ?? ''" :value="queue.name ?? ''" />
                </datalist>
                <DwButton
                    size="sm"
                    variant="secondary"
                    class="yarn-apps-panel__apply"
                    :disabled="mutationLoading || !moveQueueInput.trim()"
                    @click="moveSelectedApp"
                >
                  {{ t('explorer.yarnApps.moveQueueAction') }}
                </DwButton>
              </div>
            </label>

            <label class="yarn-apps-panel__field">
              <span>{{ t('explorer.yarnApps.killReason') }}</span>
              <div class="yarn-apps-panel__ops-row">
                <DwInput
                    v-model="killDiagnostics"
                    variant="sm"
                    type="text"
                    :placeholder="t('explorer.yarnApps.killReasonPlaceholder')"
                />
                <DwButton
                    size="sm"
                    variant="danger"
                    class="yarn-apps-panel__apply"
                    :disabled="mutationLoading || !canKillSelected"
                    @click="requestKillSelectedApp"
                >
                  {{ t('explorer.yarnApps.killAction') }}
                </DwButton>
              </div>
            </label>
          </div>
        </div>
      </template>
      <div v-else class="yarn-apps-panel__detail-body">
        <p class="yarn-apps-panel__detail-loading">{{ t('explorer.yarnApps.detailTitle') }}</p>
      </div>
      </template>
    </DwSplitPane>
    <EmptyState v-else-if="!loading" :title="t('explorer.yarnApps.empty')" />
    <div class="connector-list__foot">{{ statusText }}</div>
        </div>
      </div>
    </div>
  </div>

  <ConfirmDialog
      v-model:open="killConfirmOpen"
      :title="t('explorer.yarnApps.killAction')"
      :message="t('explorer.yarnApps.killConfirm', {id: selectedApp?.id ?? ''})"
      :confirm-label="t('explorer.yarnApps.killAction')"
      :confirm-loading="mutationLoading"
      confirm-variant="danger"
      @confirm="killSelectedApp"
  />
</template>

<style scoped>
.yarn-apps-panel {
  min-height: 0;
  height: 100%;
}

.yarn-apps-panel__toolbar {
  grid-template-columns: minmax(8rem, 1.1fr) minmax(7rem, 1fr) minmax(7rem, 1fr) auto;
  align-items: end;
}

.yarn-apps-panel__field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.yarn-apps-panel__field--action {
  align-self: end;
}

.yarn-apps-panel__body {
  flex: 1;
  min-height: 0;
}

:deep(.yarn-apps-panel__detail) {
  border-left: 1px solid var(--dw-border);
  border-radius: 0;
  box-shadow: none;
  background: var(--dw-bg-panel);
}

:deep(.yarn-apps-panel__table-wrap) {
  min-height: 0;
  overflow: auto;
  border: none;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
}

.yarn-apps-panel__badge {
  display: inline-block;
  padding: 0.1rem 0.45rem;
  border-radius: var(--dw-wb-control-radius);
  background: color-mix(in srgb, var(--dw-accent) 15%, transparent);
  font-size: var(--dw-text-xs);
  font-weight: 600;
}

.yarn-apps-panel__field :deep(.dw-select),
.yarn-apps-panel__field .dw-input {
  width: 100%;
}

.yarn-apps-panel__field :deep(.dw-select__trigger),
.yarn-apps-panel__field .dw-input.dw-input--sm,
.yarn-apps-panel__apply {
  height: var(--dw-control-h-sm) !important;
  min-height: var(--dw-control-h-sm) !important;
  max-height: var(--dw-control-h-sm) !important;
  box-sizing: border-box;
  box-shadow: none;
}

:deep(.yarn-apps-panel__detail) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
  border-radius: 0;
}

.yarn-apps-panel__detail-body {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
  padding: 0.65rem 0.75rem 0.75rem;
}

:deep(.yarn-apps-panel__detail) dl {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--dw-space-4) var(--dw-space-6);
  margin: 0;
}

:deep(.yarn-apps-panel__detail) dt {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

:deep(.yarn-apps-panel__detail) dd {
  margin: var(--dw-space-1) 0 0;
  font-size: var(--dw-text-sm);
  font-weight: 500;
  word-break: break-all;
}

.yarn-apps-panel__diagnostics {
  white-space: pre-wrap;
  font-family: var(--dw-font-mono);
  font-size: var(--dw-text-xs);
  font-weight: 400;
}

.yarn-apps-panel__detail-loading {
  margin: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.yarn-apps-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-sm);
}

.yarn-apps-panel__ops {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
}

.yarn-apps-panel__ops-row {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  min-width: 0;
}

.yarn-apps-panel__ops-row .dw-input {
  flex: 1;
  min-width: 0;
  width: auto;
}

.yarn-apps-panel__ops-row .yarn-apps-panel__apply {
  flex-shrink: 0;
}

.yarn-apps-panel__body.dw-split-pane--stacked :deep(.yarn-apps-panel__detail) {
  border-left: 0;
  border-top: 1px solid var(--dw-border);
}
</style>
