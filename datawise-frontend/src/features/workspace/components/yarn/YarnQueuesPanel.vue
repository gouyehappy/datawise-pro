<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwInlineAlert, DwSelect, DwInput, DwSplitPane, EmptyState, ConfirmDialog} from '@/core/components'
import type {SelectOption} from '@/core/components/select.types'
import {explorerApi} from '@/api'
import type {YarnQueueSummary} from '@/features/explorer/services/yarn-applications.service'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import '@/features/workspace/components/shared/connector-browse-panel.css'

const props = defineProps<{ connectionId: string }>()
const {t} = useI18n()
const layout = useLayoutStore()

const queues = ref<YarnQueueSummary[]>([])
const schedulerType = ref<string | null>(null)
const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const selectedQueueName = ref<string | null>(null)
const queueState = ref('RUNNING')
const queueCapacity = ref('')
const queueMaxCapacity = ref('')
const removeConfirmOpen = ref(false)

const queueStateOptions: SelectOption[] = [
  {value: 'RUNNING', label: 'RUNNING'},
  {value: 'STOPPED', label: 'STOPPED'},
]

const selectedQueue = computed(() =>
    queues.value.find((queue) => queue.name === selectedQueueName.value) ?? null,
)

const statusText = computed(() => {
  if (loading.value) return t('explorer.yarnQueues.loading')
  if (schedulerType.value) {
    return `${t('explorer.yarnQueues.status', {count: queues.value.length})} · ${t('explorer.yarnQueues.scheduler', {type: schedulerType.value})}`
  }
  return t('explorer.yarnQueues.status', {count: queues.value.length})
})

function selectQueue(queue: YarnQueueSummary) {
  selectedQueueName.value = queue.name
  queueState.value = queue.state ?? 'RUNNING'
  queueCapacity.value = queue.capacity > 0 ? String(queue.capacity) : ''
  queueMaxCapacity.value = ''
}

async function refresh() {
  if (!props.connectionId) return
  loading.value = true
  error.value = null
  try {
    const result = await explorerApi.fetchYarnQueues(props.connectionId)
    queues.value = result.queues
    schedulerType.value = result.schedulerType
    if (selectedQueueName.value) {
      const match = result.queues.find((queue) => queue.name === selectedQueueName.value)
      if (!match) selectedQueueName.value = null
      else selectQueue(match)
    }
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.yarnQueues.loadFailed')
    queues.value = []
  } finally {
    loading.value = false
  }
}

async function applyQueueChanges() {
  if (!props.connectionId || !selectedQueueName.value) return
  const params: Record<string, string> = {}
  if (queueState.value.trim()) params.state = queueState.value.trim().toUpperCase()
  if (queueCapacity.value.trim()) params.capacity = queueCapacity.value.trim()
  if (queueMaxCapacity.value.trim()) params['maximum-capacity'] = queueMaxCapacity.value.trim()
  if (!Object.keys(params).length) return

  saving.value = true
  error.value = null
  try {
    const result = await explorerApi.updateYarnQueue(props.connectionId, {
      queueName: selectedQueueName.value,
      params,
    })
    layout.showSuccessToast(result.message ?? t('explorer.yarnQueues.updateSuccess'))
    await refresh()
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.yarnQueues.updateFailed')
  } finally {
    saving.value = false
  }
}

async function removeSelectedQueue() {
  if (!props.connectionId || !selectedQueueName.value) return
  removeConfirmOpen.value = false
  saving.value = true
  error.value = null
  try {
    const result = await explorerApi.removeYarnQueue(props.connectionId, {
      queueName: selectedQueueName.value,
    })
    layout.showSuccessToast(result.message ?? t('explorer.yarnQueues.removeSuccess'))
    selectedQueueName.value = null
    await refresh()
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.yarnQueues.removeFailed')
  } finally {
    saving.value = false
  }
}

defineExpose({refresh})
onMounted(() => { void refresh() })
watch(() => props.connectionId, () => { void refresh() })
</script>

<template>
  <div class="connector-browse-panel connector-workbench-pane yarn-queues-panel">
    <DwInlineAlert v-if="error" density="banner" variant="error" :message="error"/>

    <div v-if="!selectedQueue" class="connector-browse-panel__body">
      <div class="connector-browse-panel__pane">
        <div class="connector-list">
          <div class="connector-list__filters yarn-queues-panel__filters">
            <button class="connector-list__refresh" type="button" :disabled="loading" @click="refresh">
              {{ t('explorer.yarnQueues.refresh') }}
            </button>
          </div>
          <div class="connector-list__scroll">
            <EmptyState v-if="!loading && queues.length === 0" :title="t('explorer.yarnQueues.empty')"/>
            <table v-else class="connector-browse-panel__table">
              <thead>
              <tr>
                <th>{{ t('explorer.yarnQueues.columns.name') }}</th>
                <th>{{ t('explorer.yarnQueues.columns.state') }}</th>
                <th>{{ t('explorer.yarnQueues.columns.capacity') }}</th>
                <th>{{ t('explorer.yarnQueues.columns.usedCapacity') }}</th>
                <th>{{ t('explorer.yarnQueues.columns.apps') }}</th>
              </tr>
              </thead>
              <tbody>
              <tr
                  v-for="queue in queues"
                  :key="queue.name ?? queue.state ?? 'queue'"
                  :class="{ 'is-selected': selectedQueueName === queue.name }"
                  @click="selectQueue(queue)"
              >
                <td>{{ queue.name ?? '—' }}</td>
                <td>{{ queue.state ?? '—' }}</td>
                <td>{{ queue.capacity?.toFixed?.(1) ?? 0 }}%</td>
                <td>{{ queue.usedCapacity?.toFixed?.(1) ?? 0 }}%</td>
                <td>{{ queue.numApplications }}</td>
              </tr>
              </tbody>
            </table>
          </div>
          <div class="connector-list__foot">{{ statusText }}</div>
        </div>
      </div>
    </div>

    <DwSplitPane
        v-else
        class="connector-browse-panel__body connector-browse-panel__body--split"
        storage-key="dw.split.yarn-queues"
        :default-width="320"
        :min-width="240"
        :max-width="560"
        :end-min-width="300"
        :stack-below="900"
        start-class="connector-browse-panel__pane"
        end-class="connector-browse-panel__pane yarn-queues-panel__editor"
    >
      <template #start>
        <div class="connector-list">
          <div class="connector-list__filters yarn-queues-panel__filters">
            <button class="connector-list__refresh" type="button" :disabled="loading" @click="refresh">
              {{ t('explorer.yarnQueues.refresh') }}
            </button>
          </div>
          <div class="connector-list__scroll">
            <EmptyState v-if="!loading && queues.length === 0" :title="t('explorer.yarnQueues.empty')"/>
            <table v-else class="connector-browse-panel__table">
              <thead>
              <tr>
                <th>{{ t('explorer.yarnQueues.columns.name') }}</th>
                <th>{{ t('explorer.yarnQueues.columns.state') }}</th>
                <th>{{ t('explorer.yarnQueues.columns.capacity') }}</th>
                <th>{{ t('explorer.yarnQueues.columns.usedCapacity') }}</th>
                <th>{{ t('explorer.yarnQueues.columns.apps') }}</th>
              </tr>
              </thead>
              <tbody>
              <tr
                  v-for="queue in queues"
                  :key="queue.name ?? queue.state ?? 'queue'"
                  :class="{ 'is-selected': selectedQueueName === queue.name }"
                  @click="selectQueue(queue)"
              >
                <td>{{ queue.name ?? '—' }}</td>
                <td>{{ queue.state ?? '—' }}</td>
                <td>{{ queue.capacity?.toFixed?.(1) ?? 0 }}%</td>
                <td>{{ queue.usedCapacity?.toFixed?.(1) ?? 0 }}%</td>
                <td>{{ queue.numApplications }}</td>
              </tr>
              </tbody>
            </table>
          </div>
          <div class="connector-list__foot">{{ statusText }}</div>
        </div>
      </template>

      <template #end>
        <div class="connector-list__foot connector-list__foot--head">
          <strong>{{ t('explorer.yarnQueues.editorTitle', {name: selectedQueue.name ?? ''}) }}</strong>
        </div>
        <div class="yarn-queues-panel__form">
          <label>
            <span>{{ t('explorer.yarnQueues.form.state') }}</span>
            <DwSelect
                v-model="queueState"
                size="sm"
                :options="queueStateOptions"
                :searchable="false"
                :clearable="false"
            />
          </label>
          <label>
            <span>{{ t('explorer.yarnQueues.form.capacity') }}</span>
            <DwInput v-model="queueCapacity" variant="sm" type="number" :min="0" :max="100" :step="0.1"/>
          </label>
          <label>
            <span>{{ t('explorer.yarnQueues.form.maxCapacity') }}</span>
            <DwInput v-model="queueMaxCapacity" variant="sm" type="number" :min="0" :max="100" :step="0.1"/>
          </label>
          <div class="yarn-queues-panel__actions">
            <DwButton size="sm" :disabled="saving" @click="applyQueueChanges">
              {{ t('explorer.yarnQueues.applyChanges') }}
            </DwButton>
            <DwButton size="sm" variant="danger" :disabled="saving" @click="removeConfirmOpen = true">
              {{ t('explorer.yarnQueues.removeQueue') }}
            </DwButton>
          </div>
          <p class="yarn-queues-panel__hint">{{ t('explorer.yarnQueues.mutableHint') }}</p>
        </div>
      </template>
    </DwSplitPane>

    <ConfirmDialog
        v-model:open="removeConfirmOpen"
        :title="t('explorer.yarnQueues.removeQueue')"
        :message="t('explorer.yarnQueues.removeConfirm', {name: selectedQueueName ?? ''})"
        :confirm-label="t('explorer.yarnQueues.removeQueue')"
        :confirm-loading="saving"
        confirm-variant="danger"
        @confirm="removeSelectedQueue"
    />
  </div>
</template>

<style scoped>
.yarn-queues-panel__filters {
  grid-template-columns: 1fr auto;
  justify-items: end;
}

:deep(.yarn-queues-panel__editor) {
  background: var(--dw-bg-panel);
}

.yarn-queues-panel__form {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.65rem 0.75rem;
  overflow: auto;
}

.yarn-queues-panel__form label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.yarn-queues-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.yarn-queues-panel__hint {
  margin: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  line-height: 1.45;
}

.yarn-queues-panel :deep(.connector-browse-panel__table tbody tr) {
  cursor: pointer;
}

.yarn-queues-panel :deep(.connector-browse-panel__table tbody tr.is-selected),
.yarn-queues-panel :deep(.connector-browse-panel__table tbody tr:hover) {
  background: color-mix(in srgb, var(--dw-text) 4%, transparent);
}
</style>
