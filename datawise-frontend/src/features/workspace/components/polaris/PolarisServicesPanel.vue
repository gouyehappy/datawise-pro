<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwInlineAlert, DwSplitPane, EmptyState, SearchInput} from '@/core/components'
import SettingsSelect from '@/core/components/SettingsSelect.vue'
import {explorerApi} from '@/api'
import {
  polarisServiceRowKey,
  type PolarisInstanceSummary,
  type PolarisNamespaceSummary,
  type PolarisServiceSummary,
} from '@/features/explorer/services/polaris-services.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {registerStatelessConnectorUse} from '@/features/explorer/services/register-connection-health.service'
import type {ConnectorNamespaceOption} from '@/features/workspace/components/shared/ConnectorNamespaceBar.vue'
import '@/features/workspace/components/shared/connector-browse-panel.css'

const props = defineProps<{
  connectionId: string
  preferredNamespace?: string | null
}>()
const emit = defineEmits<{
  'namespace-label': [label: string]
}>()
const {t} = useI18n()

const namespaces = ref<PolarisNamespaceSummary[]>([])
const namespace = ref('')
const services = ref<PolarisServiceSummary[]>([])
const servicesCache = ref(new Map<string, PolarisServiceSummary[]>())
const instances = ref<PolarisInstanceSummary[]>([])
const instancesCache = ref(new Map<string, PolarisInstanceSummary[]>())
const selectedKey = ref<string | null>(null)
const loading = ref(false)
const instancesLoading = ref(false)
const error = ref<string | null>(null)
const bootstrapped = ref(false)
const filterName = ref('')

const namespaceOptions = computed((): ConnectorNamespaceOption[] => {
  return namespaces.value
      .map((item) => {
        const value = (item.name ?? '').trim()
        return {value, label: value}
      })
      .filter((item) => item.value)
})

const filteredServices = computed(() => {
  const q = filterName.value.trim().toLowerCase()
  if (!q) return services.value
  return services.value.filter((item) => (item.name ?? '').toLowerCase().includes(q))
})

const statusText = computed(() => {
  if (loading.value) return t('explorer.polarisServices.loading')
  if (filterName.value.trim()) {
    return t('explorer.polarisServices.filterStatus', {
      shown: filteredServices.value.length,
      total: services.value.length,
    })
  }
  return t('explorer.polarisServices.status', {count: services.value.length})
})

const instancesStatusText = computed(() => {
  if (instancesLoading.value) return t('explorer.polarisServices.loadingInstances')
  return t('explorer.polarisServices.instancesStatus', {count: instances.value.length})
})

function emitNamespaceLabel() {
  const match = namespaceOptions.value.find((item) => item.value === namespace.value)
  emit('namespace-label', match?.label || namespace.value)
}

function clearServiceSelection() {
  selectedKey.value = null
  instances.value = []
}

function resetState() {
  namespaces.value = []
  namespace.value = ''
  services.value = []
  servicesCache.value = new Map()
  instancesCache.value = new Map()
  filterName.value = ''
  clearServiceSelection()
  error.value = null
  bootstrapped.value = false
}

function applyPreferredNamespace() {
  if (props.preferredNamespace == null) return
  const preferred = props.preferredNamespace.trim()
  if (!preferred) return
  if (namespaces.value.some((item) => item.name === preferred) || !namespaces.value.length) {
    namespace.value = preferred
  }
}

async function loadNamespaces() {
  if (!props.connectionId) return
  try {
    const result = await explorerApi.fetchPolarisNamespaces(props.connectionId)
    namespaces.value = result.namespaces
    applyPreferredNamespace()
    if (namespace.value && !namespaces.value.some((item) => item.name === namespace.value) && namespaces.value[0]?.name) {
      namespace.value = namespaces.value[0].name
    } else if (!namespace.value && namespaces.value[0]?.name) {
      namespace.value = namespaces.value[0].name
    }
    emitNamespaceLabel()
    registerStatelessConnectorUse(props.connectionId, 'polaris', 'ok')
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.polarisServices.loadFailed')
    registerStatelessConnectorUse(props.connectionId, 'polaris', 'error')
  }
}

async function loadServices(options?: {force?: boolean}) {
  if (!props.connectionId) return
  clearServiceSelection()
  const ns = namespace.value.trim()
  if (!ns) {
    services.value = []
    error.value = null
    loading.value = false
    return
  }

  if (!options?.force && servicesCache.value.has(ns)) {
    services.value = servicesCache.value.get(ns) ?? []
    return
  }

  loading.value = true
  error.value = null
  try {
    const result = await explorerApi.fetchPolarisServices(props.connectionId, {
      namespace: ns,
      limit: 200,
    })
    services.value = result.services
    servicesCache.value.set(ns, result.services)
    registerStatelessConnectorUse(props.connectionId, 'polaris', 'ok')
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.polarisServices.loadFailed')
    registerStatelessConnectorUse(props.connectionId, 'polaris', 'error')
    services.value = []
  } finally {
    loading.value = false
  }
}

async function onNamespaceSelect(next: string) {
  if (next === namespace.value) return
  namespace.value = next
  emitNamespaceLabel()
  await loadServices()
}

async function selectService(service: PolarisServiceSummary) {
  if (!props.connectionId || !service.name) return
  const key = polarisServiceRowKey(service)
  selectedKey.value = key
  const cacheKey = `${service.namespace ?? namespace.value}::${service.name}`
  if (instancesCache.value.has(cacheKey)) {
    instances.value = instancesCache.value.get(cacheKey) ?? []
    return
  }
  instancesLoading.value = true
  error.value = null
  try {
    const result = await explorerApi.fetchPolarisInstances(props.connectionId, {
      namespace: service.namespace ?? namespace.value,
      service: service.name,
      limit: 200,
    })
    instances.value = result.instances
    instancesCache.value.set(cacheKey, result.instances)
    registerStatelessConnectorUse(props.connectionId, 'polaris', 'ok')
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.polarisServices.instancesFailed')
    registerStatelessConnectorUse(props.connectionId, 'polaris', 'error')
    instances.value = []
  } finally {
    instancesLoading.value = false
  }
}

async function refresh() {
  servicesCache.value = new Map()
  instancesCache.value = new Map()
  await loadNamespaces()
  await loadServices({force: true})
  bootstrapped.value = true
}

async function ensureBootstrapped() {
  if (bootstrapped.value || !props.connectionId) return
  applyPreferredNamespace()
  await refresh()
}

defineExpose({refresh})
onMounted(() => { void ensureBootstrapped() })
watch(
    () => props.connectionId,
    () => {
      resetState()
      void ensureBootstrapped()
    },
)
watch(
    () => props.preferredNamespace,
    async (next) => {
      if (!bootstrapped.value || next == null || next === namespace.value) return
      namespace.value = next
      emitNamespaceLabel()
      await loadServices({force: true})
    },
)
</script>

<template>
  <div class="connector-browse-panel connector-workbench-pane polaris-services-panel">
    <DwInlineAlert v-if="error" density="banner" variant="error" :message="error"/>

    <DwSplitPane
        class="connector-browse-panel__body connector-browse-panel__body--split"
        storage-key="dw.split.polaris-services"
        :default-width="320"
        :min-width="240"
        :max-width="560"
        :end-min-width="300"
        :stack-below="900"
        start-class="connector-browse-panel__pane"
        end-class="connector-browse-panel__pane"
    >
      <template #start>
        <div class="connector-list">
          <div class="connector-list__filters connector-list__filters--services">
            <SettingsSelect
                :model-value="namespace"
                size="sm"
                searchable
                :options="namespaceOptions"
                :disabled="loading"
                :placeholder="t('explorer.polarisServices.namespace')"
                @update:model-value="onNamespaceSelect"
            />
            <SearchInput
                v-model="filterName"
                size="sm"
                :placeholder="t('explorer.polarisServices.filters.name')"
            />
            <button class="connector-list__refresh" type="button" :disabled="loading" @click="refresh">
              {{ t('explorer.polarisServices.refresh') }}
            </button>
          </div>
          <div class="connector-list__scroll">
            <table class="connector-browse-panel__table">
              <thead>
              <tr>
                <th>{{ t('explorer.polarisServices.columns.name') }}</th>
                <th>{{ t('explorer.polarisServices.columns.ports') }}</th>
                <th>{{ t('explorer.polarisServices.columns.metadata') }}</th>
              </tr>
              </thead>
              <tbody>
              <tr v-if="!loading && filteredServices.length === 0">
                <td class="connector-list__empty" colspan="3">
                  <EmptyState
                      embedded
                      compact
                      :title="services.length === 0 ? t('explorer.polarisServices.empty') : t('explorer.polarisServices.filterEmpty')"
                  />
                </td>
              </tr>
              <tr
                  v-for="item in filteredServices"
                  :key="polarisServiceRowKey(item)"
                  class="is-clickable"
                  :class="{ 'is-selected': polarisServiceRowKey(item) === selectedKey }"
                  @click="selectService(item)"
              >
                <td>{{ item.name ?? '—' }}</td>
                <td>{{ item.ports ?? '—' }}</td>
                <td>{{ item.metadata ?? '—' }}</td>
              </tr>
              </tbody>
            </table>
          </div>
          <div class="connector-list__foot">{{ statusText }}</div>
        </div>
      </template>

      <template #end>
        <div class="connector-list">
          <div class="connector-list__foot connector-list__foot--head">
            <strong>{{ t('explorer.polarisServices.instancesTitle') }}</strong>
            <span>{{ instancesStatusText }}</span>
          </div>
          <div class="connector-list__scroll">
            <table class="connector-browse-panel__table">
              <thead>
              <tr>
                <th>{{ t('explorer.polarisServices.columns.host') }}</th>
                <th>{{ t('explorer.polarisServices.columns.port') }}</th>
                <th>{{ t('explorer.polarisServices.columns.healthy') }}</th>
                <th>{{ t('explorer.polarisServices.columns.weight') }}</th>
              </tr>
              </thead>
              <tbody>
              <tr v-if="!selectedKey && !instancesLoading">
                <td class="connector-list__empty" colspan="4">
                  <EmptyState
                      embedded
                      compact
                      :title="t('explorer.polarisServices.selectHint')"
                  />
                </td>
              </tr>
              <tr v-else-if="!instancesLoading && instances.length === 0">
                <td class="connector-list__empty" colspan="4">
                  <EmptyState
                      embedded
                      compact
                      :title="t('explorer.polarisServices.emptyInstances')"
                  />
                </td>
              </tr>
              <tr v-for="(item, index) in instances" :key="`${item.host}:${item.port}:${index}`">
                <td>{{ item.host ?? '—' }}</td>
                <td>{{ item.port }}</td>
                <td>
                  <span
                      class="connector-browse-panel__badge"
                      :class="{ 'is-unhealthy': !item.healthy }"
                  >
                    {{ item.healthy ? t('explorer.polarisServices.healthy') : t('explorer.polarisServices.unhealthy') }}
                  </span>
                </td>
                <td>{{ item.weight }}</td>
              </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </DwSplitPane>
  </div>
</template>
