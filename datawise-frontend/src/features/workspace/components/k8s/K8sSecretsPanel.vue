<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {explorerApi} from '@/api'
import type {K8sNamespaceSummary, K8sSecretSummary} from '@/features/explorer/services/k8s-workloads.service'
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
const secrets = ref<K8sSecretSummary[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const namespaceOptions = computed(() =>
    toK8sNamespaceOptions(namespaces.value, {currentValue: namespace.value}),
)

const statusText = computed(() => {
  if (loading.value) return t('explorer.k8sSecrets.loading')
  return t('explorer.k8sSecrets.status', {count: secrets.value.length})
})

async function loadNamespaces() {
  if (!props.connectionId) return
  try {
    const result = await explorerApi.fetchK8sNamespaces(props.connectionId, {limit: 200})
    namespaces.value = result.namespaces
    if (props.preferredNamespace?.trim()) namespace.value = props.preferredNamespace.trim()
    if (namespace.value && !namespaces.value.some((item) => item.name === namespace.value) && namespaces.value[0]?.name) {
      namespace.value = namespaces.value[0].name
    }
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.k8sSecrets.loadFailed')
  }
}

async function loadSecrets() {
  if (!props.connectionId) return
  if (!namespace.value.trim()) {
    secrets.value = []
    error.value = null
    loading.value = false
    return
  }
  loading.value = true
  error.value = null
  try {
    const result = await explorerApi.fetchK8sSecrets(props.connectionId, namespace.value, {limit: 200})
    secrets.value = result.secrets
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.k8sSecrets.loadFailed')
    secrets.value = []
  } finally {
    loading.value = false
  }
}

async function refresh() {
  await loadNamespaces()
  await loadSecrets()
}

defineExpose({refresh})
onMounted(() => { void refresh() })
watch(() => props.preferredNamespace, async (next) => {
  const preferred = next?.trim()
  if (!preferred || preferred === namespace.value) return
  namespace.value = preferred
  await refresh()
})
watch(() => props.connectionId, () => { void refresh() })
</script>

<template>
  <div class="k8s-secrets-wrap">
    <p class="k8s-resource-panel__status k8s-secrets-wrap__hint">{{ t('explorer.k8sSecrets.metadataOnlyHint') }}</p>
    <K8sResourceBrowsePanel
        v-model:namespace="namespace"
        :namespace-options="namespaceOptions"
        :status-text="statusText"
        :error="error"
        :loading="loading"
        :empty="secrets.length === 0"
        :empty-title="t('explorer.k8sSecrets.empty')"
        @refresh="refresh"
        @namespace-change="loadSecrets"
    >
      <table class="k8s-resource-panel__table">
        <thead>
        <tr>
          <th>{{ t('explorer.k8sSecrets.columns.name') }}</th>
          <th>{{ t('explorer.k8sSecrets.columns.type') }}</th>
          <th>{{ t('explorer.k8sSecrets.columns.keys') }}</th>
          <th>{{ t('explorer.k8sSecrets.columns.count') }}</th>
        </tr>
        </thead>
        <tbody>
        <tr v-for="item in secrets" :key="`${item.namespace}/${item.name}`">
          <td>{{ item.name }}</td>
          <td>{{ item.type }}</td>
          <td>{{ (item.keys ?? []).join(', ') }}</td>
          <td>{{ item.dataCount }}</td>
        </tr>
        </tbody>
      </table>
    </K8sResourceBrowsePanel>
  </div>
</template>

<style scoped>
.k8s-secrets-wrap {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.k8s-secrets-wrap__hint {
  flex-shrink: 0;
  margin: 0;
  padding: var(--dw-space-2) var(--dw-space-3);
}

.k8s-secrets-wrap :deep(.k8s-resource-panel) {
  flex: 1;
  min-height: 0;
}
</style>
