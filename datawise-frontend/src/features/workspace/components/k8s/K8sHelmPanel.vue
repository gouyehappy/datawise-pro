<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {EmptyState} from '@/core/components'
import {explorerApi} from '@/api'
import type {K8sHelmReleaseSummary, K8sNamespaceSummary} from '@/features/explorer/services/k8s-workloads.service'
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
const releases = ref<K8sHelmReleaseSummary[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const namespaceOptions = computed(() =>
    toK8sNamespaceOptions(namespaces.value, {
      currentValue: namespace.value
    }),
)

const statusText = computed(() => {
  if (loading.value) return t('explorer.k8sHelm.loading')
  return t('explorer.k8sHelm.status', {count: releases.value.length})
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
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.k8sHelm.loadFailed')
  }
}

async function loadReleases() {
  if (!props.connectionId) return
  if (!namespace.value.trim()) {
    releases.value = []
    error.value = null
    loading.value = false
    return
  }
  loading.value = true
  error.value = null
  try {
    const result = await explorerApi.fetchK8sHelmReleases(props.connectionId, namespace.value, {limit: 200})
    releases.value = result.releases
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.k8sHelm.loadFailed')
    releases.value = []
  } finally {
    loading.value = false
  }
}

async function refresh() {
  await loadNamespaces()
  await loadReleases()
}

defineExpose({refresh})
onMounted(() => { void refresh() })

watch(
    () => props.preferredNamespace,
    async (next) => {
      const preferred = next?.trim()
      if (!preferred || preferred === namespace.value) return
      namespace.value = preferred
      await refresh()
    },
)
watch(() => props.connectionId, () => { void refresh() })
</script>

<template>
  <K8sResourceBrowsePanel
      v-model:namespace="namespace"
      :namespace-options="namespaceOptions"
      :status-text="statusText"
      :error="error"
      :loading="loading"
      :empty="false"
      @namespace-change="loadReleases"
      @refresh="refresh"
  >
    <p class="k8s-helm-panel__hint">{{ t('explorer.k8sHelm.hint') }}</p>
    <EmptyState v-if="!loading && releases.length === 0" :title="t('explorer.k8sHelm.empty')"/>
    <table v-else class="k8s-resource-panel__table">
      <thead>
      <tr>
        <th>{{ t('explorer.k8sHelm.columns.name') }}</th>
        <th>{{ t('explorer.k8sHelm.columns.status') }}</th>
        <th>{{ t('explorer.k8sHelm.columns.chart') }}</th>
        <th>{{ t('explorer.k8sHelm.columns.revision') }}</th>
        <th>{{ t('explorer.k8sHelm.columns.updated') }}</th>
      </tr>
      </thead>
      <tbody>
      <tr v-for="item in releases" :key="`${item.namespace}/${item.name}`">
        <td>{{ item.name }}</td>
        <td>{{ item.status }}</td>
        <td>{{ item.chart }}</td>
        <td>{{ item.revision }}</td>
        <td>{{ item.updated }}</td>
      </tr>
      </tbody>
    </table>
  </K8sResourceBrowsePanel>
</template>

<style src="./k8s-resource-panel.css"></style>
<style scoped>
.k8s-helm-panel__hint {
  margin: 0;
  padding: 0.45rem 0.65rem 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}
</style>
