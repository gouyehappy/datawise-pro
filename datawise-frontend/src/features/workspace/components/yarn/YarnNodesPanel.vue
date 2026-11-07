<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {EmptyState, DwInlineAlert} from '@/core/components'
import {explorerApi} from '@/api'
import type {YarnNodeSummary} from '@/features/explorer/services/yarn-applications.service'
import {formatYarnMemory} from '@/features/explorer/services/yarn-applications.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import '@/features/workspace/components/shared/connector-browse-panel.css'

const props = defineProps<{ connectionId: string }>()
const {t} = useI18n()

const nodes = ref<YarnNodeSummary[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const statusText = computed(() => {
  if (loading.value) return t('explorer.yarnNodes.loading')
  return t('explorer.yarnNodes.status', {count: nodes.value.length})
})

async function refresh() {
  if (!props.connectionId) return
  loading.value = true
  error.value = null
  try {
    const result = await explorerApi.fetchYarnNodes(props.connectionId, {limit: 500})
    nodes.value = result.nodes
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.yarnNodes.loadFailed')
    nodes.value = []
  } finally {
    loading.value = false
  }
}

defineExpose({refresh})
onMounted(() => { void refresh() })
watch(() => props.connectionId, () => { void refresh() })
</script>

<template>
  <div class="connector-browse-panel connector-workbench-pane yarn-nodes-panel">
    <DwInlineAlert v-if="error" density="banner" variant="error" :message="error"/>
    <div class="connector-browse-panel__body">
      <div class="connector-browse-panel__pane">
        <div class="connector-list">
          <div class="connector-list__filters yarn-nodes-panel__filters">
            <button class="connector-list__refresh" type="button" :disabled="loading" @click="refresh">
              {{ t('explorer.yarnNodes.refresh') }}
            </button>
          </div>
          <div class="connector-list__scroll">
            <EmptyState v-if="!loading && nodes.length === 0" :title="t('explorer.yarnNodes.empty')"/>
            <table v-else class="connector-browse-panel__table">
              <thead>
              <tr>
                <th>{{ t('explorer.yarnNodes.columns.id') }}</th>
                <th>{{ t('explorer.yarnNodes.columns.state') }}</th>
                <th>{{ t('explorer.yarnNodes.columns.health') }}</th>
                <th>{{ t('explorer.yarnNodes.columns.containers') }}</th>
                <th>{{ t('explorer.yarnNodes.columns.usedMemory') }}</th>
                <th>{{ t('explorer.yarnNodes.columns.availMemory') }}</th>
                <th>{{ t('explorer.yarnNodes.columns.vcores') }}</th>
              </tr>
              </thead>
              <tbody>
              <tr v-for="node in nodes" :key="node.id ?? node.state ?? 'node'">
                <td>{{ node.id ?? '—' }}</td>
                <td>{{ node.state ?? '—' }}</td>
                <td>{{ node.nodeHealthStatus ?? '—' }}</td>
                <td>{{ node.numContainers }}</td>
                <td>{{ formatYarnMemory(node.usedMemoryMb) }}</td>
                <td>{{ formatYarnMemory(node.availMemoryMb) }}</td>
                <td>{{ node.usedVirtualCores }} / {{ node.availableVirtualCores }}</td>
              </tr>
              </tbody>
            </table>
          </div>
          <div class="connector-list__foot">{{ statusText }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.yarn-nodes-panel__filters {
  grid-template-columns: 1fr auto;
  justify-items: end;
}
</style>
