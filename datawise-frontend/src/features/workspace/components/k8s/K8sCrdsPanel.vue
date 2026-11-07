<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {explorerApi} from '@/api'
import type {K8sCrdSummary} from '@/features/explorer/services/k8s-workloads.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import K8sResourceBrowsePanel from '@/features/workspace/components/k8s/K8sResourceBrowsePanel.vue'

const props = defineProps<{ connectionId: string }>()
const {t} = useI18n()

const crds = ref<K8sCrdSummary[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const statusText = computed(() => {
  if (loading.value) return t('explorer.k8sCrds.loading')
  return t('explorer.k8sCrds.status', {count: crds.value.length})
})

async function loadCrds() {
  if (!props.connectionId) return
  loading.value = true
  error.value = null
  try {
    const result = await explorerApi.fetchK8sCrds(props.connectionId, {limit: 500})
    crds.value = result.crds
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.k8sCrds.loadFailed')
    crds.value = []
  } finally {
    loading.value = false
  }
}

async function refresh() {
  await loadCrds()
}

defineExpose({refresh})
onMounted(() => { void refresh() })
watch(() => props.connectionId, () => { void refresh() })
</script>

<template>
  <K8sResourceBrowsePanel
      namespace=""
      :namespace-options="[]"
      :show-namespace="false"
      :status-text="statusText"
      :error="error"
      :loading="loading"
      :empty="crds.length === 0"
      :empty-title="t('explorer.k8sCrds.empty')"
      @refresh="refresh"
  >
    <table class="k8s-resource-panel__table">
      <thead>
      <tr>
        <th>{{ t('explorer.k8sCrds.columns.name') }}</th>
        <th>{{ t('explorer.k8sCrds.columns.group') }}</th>
        <th>{{ t('explorer.k8sCrds.columns.version') }}</th>
        <th>{{ t('explorer.k8sCrds.columns.kind') }}</th>
        <th>{{ t('explorer.k8sCrds.columns.scope') }}</th>
      </tr>
      </thead>
      <tbody>
      <tr v-for="item in crds" :key="item.name ?? ''">
        <td>{{ item.name }}</td>
        <td>{{ item.group }}</td>
        <td>{{ item.version }}</td>
        <td>{{ item.kind }}</td>
        <td>{{ item.scope }}</td>
      </tr>
      </tbody>
    </table>
  </K8sResourceBrowsePanel>
</template>
