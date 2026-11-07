<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {EmptyState, DwInlineAlert} from '@/core/components'
import {explorerApi} from '@/api'
import type {JenkinsNodeSummary} from '@/features/explorer/services/jenkins-jobs.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import '@/features/workspace/components/shared/connector-browse-panel.css'

const props = defineProps<{ connectionId: string }>()
const {t} = useI18n()

const nodes = ref<JenkinsNodeSummary[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const filter = ref<'all' | 'online' | 'offline'>('all')

const visibleNodes = computed(() => {
  if (filter.value === 'online') {
    return nodes.value.filter((node) => !node.offline && !node.temporarilyOffline)
  }
  if (filter.value === 'offline') {
    return nodes.value.filter((node) => node.offline || node.temporarilyOffline)
  }
  return nodes.value
})

const statusText = computed(() => {
  if (loading.value) return t('explorer.jenkinsNodes.loading')
  return t('explorer.jenkinsNodes.status', {
    shown: visibleNodes.value.length,
    total: nodes.value.length,
  })
})

function nodeStatus(node: JenkinsNodeSummary): string {
  if (node.temporarilyOffline) return t('explorer.jenkinsNodes.statusTempOffline')
  if (node.offline) return t('explorer.jenkinsNodes.statusOffline')
  if (!node.idle || node.busyExecutors > 0) return t('explorer.jenkinsNodes.statusBusy')
  return t('explorer.jenkinsNodes.statusIdle')
}

async function refresh() {
  if (!props.connectionId) return
  loading.value = true
  error.value = null
  try {
    const result = await explorerApi.fetchJenkinsNodes(props.connectionId)
    nodes.value = result.nodes
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.jenkinsNodes.loadFailed')
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
  <div class="connector-browse-panel connector-workbench-pane jenkins-nodes-panel">
    <DwInlineAlert v-if="error" density="banner" variant="error" :message="error"/>

    <div class="connector-browse-panel__body">
      <div class="connector-browse-panel__pane">
        <div class="connector-list">
          <div class="connector-list__filters jenkins-nodes-panel__filters">
            <button
                type="button"
                class="jenkins-nodes-panel__chip"
                :class="{ 'is-active': filter === 'all' }"
                @click="filter = 'all'"
            >
              {{ t('explorer.jenkinsNodes.filterAll') }}
            </button>
            <button
                type="button"
                class="jenkins-nodes-panel__chip"
                :class="{ 'is-active': filter === 'online' }"
                @click="filter = 'online'"
            >
              {{ t('explorer.jenkinsNodes.filterOnline') }}
            </button>
            <button
                type="button"
                class="jenkins-nodes-panel__chip"
                :class="{ 'is-active': filter === 'offline' }"
                @click="filter = 'offline'"
            >
              {{ t('explorer.jenkinsNodes.filterOffline') }}
            </button>
            <button class="connector-list__refresh" type="button" :disabled="loading" @click="refresh">
              {{ t('explorer.jenkinsNodes.refresh') }}
            </button>
          </div>
          <div class="connector-list__scroll">
            <EmptyState v-if="!loading && visibleNodes.length === 0" :title="t('explorer.jenkinsNodes.empty')"/>
            <table v-else class="connector-browse-panel__table">
              <thead>
              <tr>
                <th>{{ t('explorer.jenkinsNodes.columns.name') }}</th>
                <th>{{ t('explorer.jenkinsNodes.columns.status') }}</th>
                <th>{{ t('explorer.jenkinsNodes.columns.executors') }}</th>
                <th>{{ t('explorer.jenkinsNodes.columns.busy') }}</th>
                <th>{{ t('explorer.jenkinsNodes.columns.labels') }}</th>
                <th>{{ t('explorer.jenkinsNodes.columns.reason') }}</th>
              </tr>
              </thead>
              <tbody>
              <tr v-for="node in visibleNodes" :key="node.displayName || node.assignedLabels || 'node'">
                <td>{{ node.displayName ?? '—' }}</td>
                <td>
                  <span
                      class="jenkins-nodes-panel__badge"
                      :class="{
                        'is-offline': node.offline || node.temporarilyOffline,
                        'is-busy': !node.offline && !node.temporarilyOffline && (!node.idle || node.busyExecutors > 0),
                      }"
                  >
                    {{ nodeStatus(node) }}
                  </span>
                </td>
                <td>{{ node.numExecutors }}</td>
                <td>{{ node.busyExecutors }}</td>
                <td>{{ node.assignedLabels || '—' }}</td>
                <td>{{ node.offlineCauseReason || node.description || '—' }}</td>
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
.jenkins-nodes-panel__filters {
  grid-template-columns: auto auto auto 1fr auto;
}

.jenkins-nodes-panel__chip {
  height: 1.85rem;
  padding: 0 0.65rem;
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-wb-control-radius);
  background: var(--dw-bg-panel);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
}

.jenkins-nodes-panel__chip.is-active {
  color: var(--dw-text);
  font-weight: 600;
  background: var(--dw-bg-muted);
  border-color: var(--dw-border);
}

.jenkins-nodes-panel__badge {
  display: inline-flex;
  padding: 0.1rem 0.45rem;
  border-radius: var(--dw-wb-control-radius);
  background: var(--dw-success-soft);
  color: var(--dw-success-fg);
  font-size: var(--dw-text-xs);
}

.jenkins-nodes-panel__badge.is-busy {
  background: color-mix(in srgb, var(--dw-primary) 16%, transparent);
  color: var(--dw-primary);
}

.jenkins-nodes-panel__badge.is-offline {
  background: var(--dw-danger-soft);
  color: var(--dw-danger-fg);
}
</style>
