<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwSplitPane, EmptyState} from '@/core/components'
import {explorerApi} from '@/api'
import type {
  K8sDeploymentSummary,
  K8sNamespaceSummary,
} from '@/features/explorer/services/k8s-workloads.service'
import {toK8sNamespaceOptions} from '@/features/explorer/services/k8s-namespace-options'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import K8sResourceBrowsePanel from './K8sResourceBrowsePanel.vue'

const props = defineProps<{
  connectionId: string
  preferredNamespace?: string | null
}>()

const {t} = useI18n()

const namespaces = ref<K8sNamespaceSummary[]>([])
const namespace = ref('default')
const deployments = ref<K8sDeploymentSummary[]>([])
const selected = ref<K8sDeploymentSummary | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const namespaceOptions = computed(() =>
    toK8sNamespaceOptions(namespaces.value, {
      currentValue: namespace.value
    }),
)

const statusText = computed(() => {
  if (loading.value) return t('explorer.k8sDeployments.loading')
  return t('explorer.k8sDeployments.status', {count: deployments.value.length})
})

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
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.k8sDeployments.loadFailed')
  }
}

async function loadDeployments() {
  if (!props.connectionId) return
  selected.value = null
  if (!namespace.value.trim()) {
    deployments.value = []
    error.value = null
    loading.value = false
    return
  }
  loading.value = true
  error.value = null
  try {
    const result = await explorerApi.fetchK8sDeployments(props.connectionId, namespace.value, {limit: 200})
    deployments.value = result.deployments
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.k8sDeployments.loadFailed')
    deployments.value = []
  } finally {
    loading.value = false
  }
}

async function restartSelected() {
  if (!props.connectionId || !selected.value?.name || !selected.value.namespace) return
  try {
    await explorerApi.restartK8sDeployment(
        props.connectionId,
        selected.value.namespace,
        selected.value.name,
    )
    await loadDeployments()
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.k8sDeployments.restartFailed')
  }
}

async function refresh() {
  await loadNamespaces()
  await loadDeployments()
}

defineExpose({refresh})

onMounted(() => {
  void refresh()
})

watch(
    () => props.preferredNamespace,
    async (next) => {
      const preferred = next?.trim()
      if (!preferred || preferred === namespace.value) return
      namespace.value = preferred
      await refresh()
    },
)
watch(
    () => props.connectionId,
    () => {
      void refresh()
    },
)
</script>

<template>
  <K8sResourceBrowsePanel
      class="k8s-deployments-panel"
      v-model:namespace="namespace"
      :namespace-options="namespaceOptions"
      :status-text="statusText"
      :error="error"
      :loading="loading"
      :empty="false"
      fill-list
      @namespace-change="loadDeployments"
      @refresh="refresh"
  >
    <DwSplitPane
        class="k8s-deployments-panel__body"
        storage-key="dw.split.k8s-deployments"
        :default-width="360"
        :min-width="260"
        :max-width="640"
        :end-min-width="240"
        :stack-below="900"
        start-class="k8s-deployments-panel__list"
        end-class="k8s-deployments-panel__detail"
    >
      <template #start>
        <EmptyState v-if="!loading && deployments.length === 0" :title="t('explorer.k8sDeployments.empty')"/>
        <table v-else class="k8s-resource-panel__table">
          <thead>
          <tr>
            <th>{{ t('explorer.k8sDeployments.columns.name') }}</th>
            <th>{{ t('explorer.k8sDeployments.columns.ready') }}</th>
            <th>{{ t('explorer.k8sDeployments.columns.updated') }}</th>
            <th>{{ t('explorer.k8sDeployments.columns.available') }}</th>
          </tr>
          </thead>
          <tbody>
          <tr
              v-for="item in deployments"
              :key="`${item.namespace}/${item.name}`"
              :class="{ 'is-selected': selected?.name === item.name }"
              @click="selected = item"
          >
            <td>{{ item.name }}</td>
            <td>{{ item.readyReplicas }}/{{ item.replicas }}</td>
            <td>{{ item.updatedReplicas }}</td>
            <td>{{ item.availableReplicas }}</td>
          </tr>
          </tbody>
        </table>
      </template>

      <template #end>
        <template v-if="selected">
          <header class="k8s-deployments-panel__detail-head">
            <strong>{{ selected.name }}</strong>
            <DwButton size="sm" @click="restartSelected">
              {{ t('explorer.k8sDeployments.restartAction') }}
            </DwButton>
          </header>
          <dl class="k8s-deployments-panel__meta">
            <div>
              <dt>{{ t('explorer.k8sDeployments.columns.ready') }}</dt>
              <dd>{{ selected.readyReplicas }}/{{ selected.replicas }}</dd>
            </div>
            <div>
              <dt>{{ t('explorer.k8sDeployments.created') }}</dt>
              <dd>{{ selected.creationTimestamp || '-' }}</dd>
            </div>
          </dl>
        </template>
        <EmptyState v-else :title="t('explorer.k8sDeployments.selectHint')"/>
      </template>
    </DwSplitPane>
  </K8sResourceBrowsePanel>
</template>

<style src="./k8s-resource-panel.css"></style>
<style scoped>
.k8s-deployments-panel__body {
  min-height: 0;
  flex: 1;
}
:deep(.k8s-deployments-panel__list) { min-height: 0; overflow: auto; }
:deep(.k8s-deployments-panel__list) tbody tr { cursor: pointer; }
:deep(.k8s-deployments-panel__list) tbody tr.is-selected,
:deep(.k8s-deployments-panel__list) tbody tr:hover { background: var(--dw-bg-hover); }
:deep(.k8s-deployments-panel__detail) {
  min-height: 0; overflow: auto; border-left: 1px solid var(--dw-border);
  background: var(--dw-bg-panel); padding: 0.75rem;
}
.k8s-deployments-panel__detail-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 0.5rem; margin-bottom: 0.75rem;
}
.k8s-deployments-panel__meta {
  display: grid; grid-template-columns: auto 1fr; gap: 0.35rem 0.75rem;
  margin: 0; font-size: var(--dw-text-sm);
}
.k8s-deployments-panel__meta dt { color: var(--dw-text-muted); }
.k8s-deployments-panel__meta dd { margin: 0; }
</style>
