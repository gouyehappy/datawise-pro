<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {explorerApi} from '@/api'
import type {K8sNamespaceSummary, K8sServiceSummary} from '@/features/explorer/services/k8s-workloads.service'
import {toK8sNamespaceOptions} from '@/features/explorer/services/k8s-namespace-options'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import K8sResourceBrowsePanel from '@/features/workspace/components/k8s/K8sResourceBrowsePanel.vue'

const props = defineProps<{
  connectionId: string
  preferredNamespace?: string | null
}>()
const {t} = useI18n()

const namespaces = ref<K8sNamespaceSummary[]>([])
const namespace = ref('default')
const services = ref<K8sServiceSummary[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const namespaceOptions = computed(() =>
    toK8sNamespaceOptions(namespaces.value, {
      currentValue: namespace.value,
    }),
)

const statusText = computed(() => {
  if (loading.value) return t('explorer.k8sServices.loading')
  return t('explorer.k8sServices.status', {count: services.value.length})
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
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.k8sServices.loadFailed')
  }
}

async function loadServices() {
  if (!props.connectionId) return
  if (!namespace.value.trim()) {
    services.value = []
    error.value = null
    loading.value = false
    return
  }
  loading.value = true
  error.value = null
  try {
    const result = await explorerApi.fetchK8sServices(props.connectionId, namespace.value, {limit: 200})
    services.value = result.services
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.k8sServices.loadFailed')
    services.value = []
  } finally {
    loading.value = false
  }
}

async function refresh() {
  await loadNamespaces()
  await loadServices()
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
      :empty="services.length === 0"
      :empty-title="t('explorer.k8sServices.empty')"
      @refresh="refresh"
      @namespace-change="loadServices"
  >
    <table class="k8s-resource-panel__table">
      <thead>
      <tr>
        <th>{{ t('explorer.k8sServices.columns.name') }}</th>
        <th>{{ t('explorer.k8sServices.columns.type') }}</th>
        <th>{{ t('explorer.k8sServices.columns.clusterIp') }}</th>
        <th>{{ t('explorer.k8sServices.columns.ports') }}</th>
      </tr>
      </thead>
      <tbody>
      <tr v-for="item in services" :key="`${item.namespace}/${item.name}`">
        <td>{{ item.name }}</td>
        <td>{{ item.type }}</td>
        <td>{{ item.clusterIp }}</td>
        <td>{{ item.ports }}</td>
      </tr>
      </tbody>
    </table>
  </K8sResourceBrowsePanel>
</template>
