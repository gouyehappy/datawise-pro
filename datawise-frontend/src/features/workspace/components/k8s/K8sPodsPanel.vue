<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwLogViewer, EmptyState, IconButton, SearchInput} from '@/core/components'
import {DwIcon} from '@/core/icons'
import K8sResourceBrowsePanel from './K8sResourceBrowsePanel.vue'
import {explorerApi} from '@/api'
import type {
  K8sNamespaceSummary,
  K8sPodDetail,
  K8sPodSummary,
} from '@/features/explorer/services/k8s-workloads.service'
import {toK8sNamespaceOptions} from '@/features/explorer/services/k8s-namespace-options'
import {isK8sPodGoneError} from '@/features/explorer/services/k8s-pod-error'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {registerStatelessConnectorUse} from '@/features/explorer/services/register-connection-health.service'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {planOpenK8sExec} from '@/features/workspace/services/workspace-platform-open.service'
import '@/features/workspace/components/shared/connector-browse-panel.css'

const props = defineProps<{
  connectionId: string
  preferredNamespace?: string | null
}>()
const emit = defineEmits<{
  'namespace-label': [label: string]
}>()
const {t} = useI18n()
const workspace = useWorkspaceStore()
const layout = useLayoutStore()

const namespaces = ref<K8sNamespaceSummary[]>([])
const namespace = ref('default')
const filterName = ref('')
const pods = ref<K8sPodSummary[]>([])
const selected = ref<K8sPodDetail | null>(null)
const selectedKey = ref<string | null>(null)
const logs = ref('')
const loading = ref(false)
const detailLoading = ref(false)
const logLoading = ref(false)
const logFollowing = ref(true)
const error = ref<string | null>(null)
const logViewerRef = ref<{scrollToBottom: () => Promise<void>; openFullscreen: () => void} | null>(null)

let logPollTimer: ReturnType<typeof setTimeout> | null = null
const LOG_POLL_MS = 3000
const LOG_TAIL_LINES = 500

const filteredPods = computed(() => {
  const q = filterName.value.trim().toLowerCase()
  if (!q) return pods.value
  return pods.value.filter((pod) => (pod.name ?? '').toLowerCase().includes(q))
})

const statusText = computed(() => {
  if (loading.value) return t('explorer.k8sPods.loading')
  if (filterName.value.trim()) {
    return t('explorer.k8sPods.filterStatus', {
      shown: filteredPods.value.length,
      total: pods.value.length,
    })
  }
  return t('explorer.k8sPods.status', {count: pods.value.length})
})

const namespaceOptions = computed(() =>
    toK8sNamespaceOptions(namespaces.value, {
      currentValue: namespace.value
    }),
)

function emitNamespaceLabel() {
  emit('namespace-label', namespace.value.trim())
}

const logTitle = computed(() => t('explorer.k8sPods.logs'))

const logSubtitle = computed(() => {
  if (!selected.value?.name) return undefined
  const container = selected.value.containers[0]?.name
  return container
      ? `${selected.value.namespace}/${selected.value.name} / ${container}`
      : `${selected.value.namespace}/${selected.value.name}`
})

function podKey(namespaceName: string | null | undefined, name: string | null | undefined): string | null {
  if (!namespaceName || !name) return null
  return `${namespaceName}/${name}`
}

function clearLogPoll() {
  if (logPollTimer != null) {
    clearTimeout(logPollTimer)
    logPollTimer = null
  }
}

async function clearGonePodSelection(podLabel: string) {
  clearLogPoll()
  selected.value = null
  selectedKey.value = null
  logs.value = ''
  error.value = null
  layout.showWarningToast(t('explorer.k8sPods.podGone', {pod: podLabel}))
  await loadPods({preserveSelection: false})
}

function onLogCopied(ok: boolean) {
  if (!ok) layout.showErrorToast(t('common.logViewer.copyFailed'))
}

async function loadNamespaces() {
  if (!props.connectionId) return
  try {
    const result = await explorerApi.fetchK8sNamespaces(props.connectionId, {limit: 200})
    namespaces.value = result.namespaces
    if (props.preferredNamespace?.trim()) {
      namespace.value = props.preferredNamespace.trim()
    }
    if (namespace.value && !namespaces.value.some((item) => item.name === namespace.value) && namespaces.value[0]?.name) {
      namespace.value = namespaces.value[0].name
    }
    emitNamespaceLabel()
    registerStatelessConnectorUse(props.connectionId, 'kubernetes', 'ok')
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.k8sPods.loadFailed')
    registerStatelessConnectorUse(props.connectionId, 'kubernetes', 'error')
  }
}

async function loadPods(options?: {preserveSelection?: boolean}) {
  if (!props.connectionId) return
  const preserve = options?.preserveSelection !== false
  const keepKey = preserve ? selectedKey.value : null
  if (!preserve) {
    selected.value = null
    selectedKey.value = null
    logs.value = ''
    clearLogPoll()
  }
  if (!namespace.value.trim()) {
    pods.value = []
    selected.value = null
    selectedKey.value = null
    logs.value = ''
    clearLogPoll()
    error.value = null
    loading.value = false
    return
  }
  loading.value = true
  error.value = null
  try {
    const result = await explorerApi.fetchK8sPods(props.connectionId, namespace.value, {limit: 200})
    pods.value = result.pods
    registerStatelessConnectorUse(props.connectionId, 'kubernetes', 'ok')
    if (keepKey) {
      const match = pods.value.find((pod) => podKey(pod.namespace, pod.name) === keepKey)
      if (match) {
        await selectPod(match, {quiet: true, skipIfSame: true})
      } else {
        selected.value = null
        selectedKey.value = null
        logs.value = ''
        clearLogPoll()
      }
    }
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.k8sPods.loadFailed')
    registerStatelessConnectorUse(props.connectionId, 'kubernetes', 'error')
    pods.value = []
  } finally {
    loading.value = false
  }
}

async function loadLogs(options?: {quiet?: boolean; forceScroll?: boolean}) {
  if (!props.connectionId || !selected.value?.name || !selected.value.namespace) return
  const podLabel = `${selected.value.namespace}/${selected.value.name}`
  if (!options?.quiet) logLoading.value = true
  try {
    const logResult = await explorerApi.fetchK8sPodLogs(
        props.connectionId,
        selected.value.namespace,
        selected.value.name,
        {
          container: selected.value.containers[0]?.name ?? undefined,
          tailLines: LOG_TAIL_LINES,
          silent: options?.quiet === true,
        },
    )
    const next = logResult.content ?? ''
    const changed = next !== logs.value
    logs.value = next
    registerStatelessConnectorUse(props.connectionId, 'kubernetes', 'ok')
    if (logFollowing.value && (options?.forceScroll || changed)) {
      await logViewerRef.value?.scrollToBottom()
    }
  } catch (err) {
    if (isK8sPodGoneError(err)) {
      await clearGonePodSelection(podLabel)
      return
    }
    if (!options?.quiet) {
      error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.k8sPods.detailFailed')
      registerStatelessConnectorUse(props.connectionId, 'kubernetes', 'error')
    }
  } finally {
    if (!options?.quiet) logLoading.value = false
  }
}

function scheduleLogPoll() {
  clearLogPoll()
  if (!selected.value) return
  logPollTimer = setTimeout(() => {
    void (async () => {
      await loadLogs({quiet: true})
      if (selected.value) scheduleLogPoll()
    })()
  }, LOG_POLL_MS)
}

async function selectPod(
    pod: K8sPodSummary,
    options?: {quiet?: boolean; skipIfSame?: boolean},
) {
  if (!props.connectionId || !pod.name || !pod.namespace) return
  const key = podKey(pod.namespace, pod.name)
  if (options?.skipIfSame && key && key === selectedKey.value && selected.value) {
    return
  }
  clearLogPoll()
  if (!options?.quiet) detailLoading.value = true
  error.value = null
  const podLabel = `${pod.namespace}/${pod.name}`
  try {
    selected.value = await explorerApi.fetchK8sPodDetail(
        props.connectionId,
        pod.namespace,
        pod.name,
        {silent: options?.quiet === true},
    )
    selectedKey.value = key
    registerStatelessConnectorUse(props.connectionId, 'kubernetes', 'ok')
    await loadLogs({forceScroll: true})
    if (selected.value) scheduleLogPoll()
  } catch (err) {
    if (isK8sPodGoneError(err)) {
      await clearGonePodSelection(podLabel)
      return
    }
    if (!options?.quiet) {
      error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.k8sPods.detailFailed')
      registerStatelessConnectorUse(props.connectionId, 'kubernetes', 'error')
    }
  } finally {
    if (!options?.quiet) detailLoading.value = false
  }
}

async function refreshLogs() {
  logFollowing.value = true
  await loadLogs({forceScroll: true})
}

async function deleteSelected() {
  if (!props.connectionId || !selected.value?.name || !selected.value.namespace) return
  try {
    await explorerApi.deleteK8sPod(props.connectionId, selected.value.namespace, selected.value.name)
    selected.value = null
    selectedKey.value = null
    logs.value = ''
    clearLogPoll()
    registerStatelessConnectorUse(props.connectionId, 'kubernetes', 'ok')
    await loadPods({preserveSelection: false})
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.k8sPods.deleteFailed')
    registerStatelessConnectorUse(props.connectionId, 'kubernetes', 'error')
  }
}

function execSelected() {
  if (!props.connectionId || !selected.value?.name || !selected.value.namespace) return
  workspace.openWithPlan(
    planOpenK8sExec,
    {
      connectionId: props.connectionId,
      namespace: selected.value.namespace,
      podName: selected.value.name,
      container: selected.value.containers[0]?.name ?? undefined,
    },
    'kubernetes',
  )
}

async function onNamespaceChanged() {
  selected.value = null
  selectedKey.value = null
  logs.value = ''
  clearLogPoll()
  emitNamespaceLabel()
  await loadPods({preserveSelection: false})
}

async function onNamespaceSelect(next: string) {
  if (next === namespace.value) return
  namespace.value = next
  await onNamespaceChanged()
}

async function refresh() {
  const keepKey = selectedKey.value
  await loadNamespaces()
  await loadPods({preserveSelection: true})
  if (keepKey && selectedKey.value === keepKey) {
    logFollowing.value = true
    await loadLogs({forceScroll: true})
    if (selected.value) scheduleLogPoll()
  }
}

defineExpose({refresh})

onMounted(() => {
  registerStatelessConnectorUse(props.connectionId, 'kubernetes', 'ok')
  void refresh()
})

onUnmounted(() => {
  clearLogPoll()
})

watch(
    () => props.connectionId,
    () => {
      selected.value = null
      selectedKey.value = null
      logs.value = ''
      clearLogPoll()
      registerStatelessConnectorUse(props.connectionId, 'kubernetes', 'ok')
      void refresh()
    },
)
watch(
    () => props.preferredNamespace,
    async (next) => {
      const preferred = next?.trim()
      if (!preferred || preferred === namespace.value) return
      await onNamespaceSelect(preferred)
    },
)
</script>

<template>
  <K8sResourceBrowsePanel
      class="connector-browse-panel connector-workbench-pane k8s-pods-panel"
      v-model:namespace="namespace"
      :namespace-options="namespaceOptions"
      :status-text="statusText"
      :error="error"
      :loading="loading"
      :empty="false"
      fill-list
      @namespace-change="onNamespaceChanged"
      @refresh="refresh"
  >
    <template #toolbar-extra>
      <SearchInput
          v-model="filterName"
          class="k8s-pods-panel__name-filter"
          size="sm"
          :placeholder="t('explorer.k8sPods.filters.name')"
          :aria-label="t('explorer.k8sPods.filters.name')"
      />
    </template>

    <div
        class="connector-browse-panel__body"
        :class="selected ? 'k8s-pods-panel__body--logged' : 'k8s-pods-panel__body--solo'"
    >
      <div class="k8s-pods-panel__upper" :class="{ 'is-split': selected }">
        <div class="connector-browse-panel__pane">
          <div class="connector-list">
            <div class="connector-list__scroll">
              <table class="connector-browse-panel__table">
                <thead>
                <tr>
                  <th>{{ t('explorer.k8sPods.columns.name') }}</th>
                  <th>{{ t('explorer.k8sPods.columns.phase') }}</th>
                  <th>{{ t('explorer.k8sPods.columns.ready') }}</th>
                  <th>{{ t('explorer.k8sPods.columns.restarts') }}</th>
                  <th>{{ t('explorer.k8sPods.columns.node') }}</th>
                </tr>
                </thead>
                <tbody>
                <tr v-if="!loading && filteredPods.length === 0">
                  <td class="connector-list__empty" colspan="5">
                    <EmptyState
                        embedded
                        compact
                        :title="pods.length === 0 ? t('explorer.k8sPods.empty') : t('explorer.k8sPods.filterEmpty')"
                    />
                  </td>
                </tr>
                <tr
                    v-for="pod in filteredPods"
                    :key="`${pod.namespace}/${pod.name}`"
                    class="is-clickable"
                    :class="{ 'is-selected': selectedKey === podKey(pod.namespace, pod.name) }"
                    @click="selectPod(pod)"
                >
                  <td>{{ pod.name }}</td>
                  <td><span class="k8s-pods-panel__badge">{{ pod.phase }}</span></td>
                  <td>{{ pod.ready }}</td>
                  <td>{{ pod.restartCount }}</td>
                  <td>{{ pod.nodeName }}</td>
                </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div v-if="selected" class="connector-browse-panel__pane k8s-pods-panel__detail">
          <div class="connector-list__foot connector-list__foot--head">
            <strong>{{ selected.name }}</strong>
          </div>
          <div class="k8s-pods-panel__detail-body">
            <dl>
              <div>
                <dt>{{ t('explorer.k8sPods.columns.phase') }}</dt>
                <dd>{{ selected.phase }}</dd>
              </div>
              <div>
                <dt>IP</dt>
                <dd>{{ selected.podIp || '-' }}</dd>
              </div>
              <div>
                <dt>{{ t('explorer.k8sPods.columns.node') }}</dt>
                <dd>{{ selected.nodeName || '-' }}</dd>
              </div>
              <div v-if="selected.containers[0]?.name">
                <dt>{{ t('explorer.k8sPods.container') }}</dt>
                <dd>{{ selected.containers[0].name }}</dd>
              </div>
            </dl>
            <p v-if="detailLoading" class="k8s-pods-panel__detail-loading">
              {{ t('explorer.k8sPods.loadingDetail') }}
            </p>
            <div class="k8s-pods-panel__ops">
              <DwButton size="sm" variant="primary" @click="execSelected">
                {{ t('explorer.k8sPods.execAction') }}
              </DwButton>
              <DwButton size="sm" variant="danger" @click="deleteSelected">
                {{ t('explorer.k8sPods.deleteAction') }}
              </DwButton>
              <DwButton size="sm" variant="secondary" @click="logViewerRef?.openFullscreen()">
                {{ t('common.logViewer.openFullscreen') }}
              </DwButton>
            </div>
          </div>
        </div>

        <div v-else class="connector-browse-panel__pane k8s-pods-panel__detail k8s-pods-panel__detail--empty">
          <EmptyState
              class="connector-editor-empty"
              embedded
              compact
              :title="t('explorer.k8sPods.selectHint')"
          />
        </div>
      </div>

      <DwLogViewer
          v-if="selected"
          ref="logViewerRef"
          class="k8s-pods-panel__console"
          :content="logs"
          :title="logTitle"
          :subtitle="logSubtitle"
          :loading="logLoading"
          :live="logFollowing"
          v-model:follow="logFollowing"
          :empty-text="t('explorer.k8sPods.noLogs')"
          @copied="onLogCopied"
      >
        <template #actions>
          <IconButton
              size="sm"
              class="k8s-pods-panel__log-icon"
              :title="logLoading ? t('explorer.k8sPods.refreshingLogs') : t('explorer.k8sPods.refreshLogs')"
              :disabled="logLoading"
              @click="refreshLogs"
          >
            <DwIcon name="refresh" size="sm"/>
          </IconButton>
        </template>
      </DwLogViewer>
    </div>
  </K8sResourceBrowsePanel>
</template>

<style scoped>
.k8s-pods-panel {
  gap: 0;
}

.k8s-pods-panel__name-filter {
  flex: 0 1 12rem;
  min-width: 8rem;
  max-width: 16rem;
}

.k8s-pods-panel__body--solo,
.k8s-pods-panel__body--logged {
  display: flex;
  flex-direction: column;
  gap: 0;
  height: 100%;
  min-height: 0;
}

.k8s-pods-panel__upper {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 0.72fr);
  gap: 0;
  min-height: 0;
  flex: 1 1 auto;
}

.k8s-pods-panel__body--logged .k8s-pods-panel__upper {
  flex: 0 1 42%;
  max-height: 46%;
  border-bottom: 1px solid var(--dw-border);
}

.k8s-pods-panel__detail {
  overflow: auto;
}

.k8s-pods-panel__detail--empty {
  display: flex;
}

.k8s-pods-panel__detail-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
}

.k8s-pods-panel__detail-body dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.35rem 0.75rem;
  margin: 0;
  font-size: var(--dw-text-sm);
}

.k8s-pods-panel__detail-body dt {
  color: var(--dw-text-muted);
}

.k8s-pods-panel__detail-body dd {
  margin: 0;
}

.k8s-pods-panel__ops {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.k8s-pods-panel__detail-loading {
  margin: 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.k8s-pods-panel__badge {
  display: inline-flex;
  padding: 0.1rem 0.4rem;
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-muted);
  font-size: var(--dw-text-xs);
}

.k8s-pods-panel__console {
  flex: 1 1 auto;
  min-height: 0;
  border: 0;
  border-radius: 0;
}

.k8s-pods-panel__log-icon {
  margin-left: 0.25rem;
}

@media (max-width: 900px) {
  .k8s-pods-panel__upper {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(140px, 1fr) minmax(120px, 0.8fr);
  }
}
</style>