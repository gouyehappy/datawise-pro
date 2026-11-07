<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwInlineAlert, DwSplitPane, EmptyState, SearchInput} from '@/core/components'
import SettingsSelect from '@/core/components/SettingsSelect.vue'
import {explorerApi} from '@/api'
import type {NacosNamespaceSummary} from '@/features/explorer/services/nacos-configs.service'
import {
  nacosServiceRowKey,
  type NacosInstanceSummary,
  type NacosServiceSummary,
} from '@/features/explorer/services/nacos-services.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {fetchConnectionConfig} from '@/shared/config/connections-catalog.service'
import {readSavedNacosNamespace, readVisibleNacosNamespaces} from '@/features/connection/utils/nacos-endpoint'
import {registerStatelessConnectorUse} from '@/features/explorer/services/register-connection-health.service'
import type {ConnectorNamespaceOption} from '@/features/workspace/components/shared/ConnectorNamespaceBar.vue'
import '@/features/workspace/components/shared/connector-browse-panel.css'

const props = defineProps<{
  connectionId: string
  preferredNamespace?: string | null
}>()
const {t} = useI18n()

const namespaces = ref<NacosNamespaceSummary[]>([])
const visibleNamespaceIds = ref<string[] | null>(null)
const namespaceId = ref('')
const services = ref<NacosServiceSummary[]>([])
const servicesCache = ref(new Map<string, NacosServiceSummary[]>())
const instances = ref<NacosInstanceSummary[]>([])
const instancesCache = ref(new Map<string, NacosInstanceSummary[]>())
const selectedKey = ref<string | null>(null)
const loading = ref(false)
const instancesLoading = ref(false)
const error = ref<string | null>(null)
const bootstrapped = ref(false)

const filterName = ref('')

const namespaceOptions = computed((): ConnectorNamespaceOption[] => {
  const allowPublic = visibleNamespaceIds.value == null || visibleNamespaceIds.value.includes('')
  const chips: ConnectorNamespaceOption[] = allowPublic
      ? [{value: '', label: t('explorer.nacosServices.publicNamespace')}]
      : []
  for (const item of namespaces.value) {
    const value = item.namespace ?? ''
    if (!value) continue
    const label = (item.namespaceShowName ?? item.namespace ?? '').trim() || value
    chips.push({value, label})
  }
  return chips
})

const emit = defineEmits<{
  'namespace-label': [label: string]
}>()

watch([namespaceId, namespaceOptions], () => {
  const match = namespaceOptions.value.find((item) => item.value === namespaceId.value)
  emit('namespace-label', match?.label || t('explorer.nacosServices.publicNamespace'))
}, {immediate: true})

const filteredServices = computed(() => {
  const q = filterName.value.trim().toLowerCase()
  if (!q) return services.value
  return services.value.filter((item) => {
    const name = (item.name ?? '').toLowerCase()
    const group = (item.groupName ?? '').toLowerCase()
    return name.includes(q) || group.includes(q)
  })
})

const statusText = computed(() => {
  if (loading.value) return t('explorer.nacosServices.loading')
  if (filterName.value.trim()) {
    return t('explorer.nacosServices.filterStatus', {
      shown: filteredServices.value.length,
      total: services.value.length,
    })
  }
  return t('explorer.nacosServices.status', {count: services.value.length})
})

const instancesStatusText = computed(() => {
  if (instancesLoading.value) return t('explorer.nacosServices.loadingInstances')
  return t('explorer.nacosServices.instancesStatus', {count: instances.value.length})
})

function clearServiceSelection() {
  selectedKey.value = null
  instances.value = []
}

function resetState() {
  namespaces.value = []
  visibleNamespaceIds.value = null
  namespaceId.value = ''
  services.value = []
  servicesCache.value = new Map()
  instancesCache.value = new Map()
  clearServiceSelection()
  error.value = null
  bootstrapped.value = false
}

async function loadNamespaces() {
  if (!props.connectionId) return
  try {
    const result = await explorerApi.fetchNacosNamespaces(props.connectionId)
    const allowed = visibleNamespaceIds.value
    namespaces.value = allowed
        ? result.namespaces.filter((item) => allowed.includes(item.namespace ?? ''))
        : result.namespaces
    registerStatelessConnectorUse(props.connectionId, 'nacos', 'ok')
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.nacosServices.loadFailed')
    registerStatelessConnectorUse(props.connectionId, 'nacos', 'error')
  }
}

async function loadServices(options?: {force?: boolean}) {
  if (!props.connectionId) return
  clearServiceSelection()
  const nsKey = namespaceId.value

  if (!options?.force && servicesCache.value.has(nsKey)) {
    services.value = servicesCache.value.get(nsKey) ?? []
    return
  }

  loading.value = true
  error.value = null
  try {
    const result = await explorerApi.fetchNacosServices(props.connectionId, {
      namespaceId: nsKey || undefined,
      limit: 200,
    })
    services.value = result.services
    servicesCache.value.set(nsKey, result.services)
    registerStatelessConnectorUse(props.connectionId, 'nacos', 'ok')
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.nacosServices.loadFailed')
    registerStatelessConnectorUse(props.connectionId, 'nacos', 'error')
    services.value = []
  } finally {
    loading.value = false
  }
}

async function onNamespaceSelect(next: string) {
  if (next === namespaceId.value) return
  namespaceId.value = next
  await loadServices()
}

async function selectService(service: NacosServiceSummary) {
  if (!props.connectionId || !service.name) return
  const key = nacosServiceRowKey(service)
  selectedKey.value = key
  const cacheKey = `${namespaceId.value}::${key}`
  if (instancesCache.value.has(cacheKey)) {
    instances.value = instancesCache.value.get(cacheKey) ?? []
    return
  }
  instancesLoading.value = true
  error.value = null
  try {
    const result = await explorerApi.fetchNacosInstances(props.connectionId, {
      serviceName: service.name,
      groupName: service.groupName ?? undefined,
      namespaceId: namespaceId.value || undefined,
    })
    instances.value = result.instances
    instancesCache.value.set(cacheKey, result.instances)
    registerStatelessConnectorUse(props.connectionId, 'nacos', 'ok')
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.nacosServices.instancesFailed')
    registerStatelessConnectorUse(props.connectionId, 'nacos', 'error')
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

async function applySavedNamespace() {
  const config = await fetchConnectionConfig(props.connectionId)
  visibleNamespaceIds.value = readVisibleNacosNamespaces(config?.advancedConfig)
  if (props.preferredNamespace != null) {
    const preferred = props.preferredNamespace
    const allowed = visibleNamespaceIds.value
    if (allowed == null || allowed.includes(preferred)) {
      namespaceId.value = preferred
      return
    }
  }
  const saved = readSavedNacosNamespace(config?.advancedConfig)
  const allowed = visibleNamespaceIds.value
  if (saved && (allowed == null || allowed.includes(saved))) {
    namespaceId.value = saved
    return
  }
  if (allowed && !allowed.includes('')) {
    namespaceId.value = allowed.find((id) => id) ?? allowed[0] ?? ''
  }
}

async function ensureBootstrapped() {
  if (bootstrapped.value || !props.connectionId) return
  await applySavedNamespace()
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
      if (!bootstrapped.value || next == null || next === namespaceId.value) return
      namespaceId.value = next
      await loadServices({force: true})
    },
)
</script>

<template>
  <div class="connector-browse-panel nacos-workbench-pane nacos-services-panel">
    <DwInlineAlert v-if="error" density="banner" variant="error" :message="error"/>

    <DwSplitPane
        class="connector-browse-panel__body connector-browse-panel__body--split"
        storage-key="dw.split.nacos-services"
        :default-width="320"
        :min-width="240"
        :max-width="560"
        :end-min-width="300"
        :stack-below="900"
        start-class="connector-browse-panel__pane"
        end-class="connector-browse-panel__pane"
    >
      <template #start>
        <div class="nacos-list">
          <div class="nacos-list__filters nacos-list__filters--services">
            <SettingsSelect
                :model-value="namespaceId"
                size="sm"
                searchable
                :options="namespaceOptions"
                :disabled="loading"
                :placeholder="t('explorer.nacosServices.namespace')"
                @update:model-value="onNamespaceSelect"
            />
            <SearchInput
                v-model="filterName"
                size="sm"
                :placeholder="t('explorer.nacosServices.filters.name')"
            />
            <button class="nacos-list__refresh" type="button" :disabled="loading" @click="refresh">
              {{ t('explorer.nacosServices.refresh') }}
            </button>
          </div>
          <div class="nacos-list__scroll">
            <table class="connector-browse-panel__table">
              <thead>
              <tr>
                <th>{{ t('explorer.nacosServices.columns.name') }}</th>
                <th>{{ t('explorer.nacosServices.columns.group') }}</th>
                <th>{{ t('explorer.nacosServices.columns.clusterCount') }}</th>
              </tr>
              </thead>
              <tbody>
              <tr v-if="!loading && filteredServices.length === 0">
                <td class="nacos-list__empty" colspan="3">
                  <EmptyState
                      embedded
                      compact
                      :title="services.length === 0 ? t('explorer.nacosServices.empty') : t('explorer.nacosServices.filterEmpty')"
                  />
                </td>
              </tr>
              <tr
                  v-for="item in filteredServices"
                  :key="nacosServiceRowKey(item)"
                  class="is-clickable"
                  :class="{ 'is-selected': nacosServiceRowKey(item) === selectedKey }"
                  @click="selectService(item)"
              >
                <td>{{ item.name ?? '—' }}</td>
                <td>{{ item.groupName ?? '—' }}</td>
                <td>{{ item.clusterCount ?? '—' }}</td>
              </tr>
              </tbody>
            </table>
          </div>
          <div class="nacos-list__foot">{{ statusText }}</div>
        </div>
      </template>

      <template #end>
        <div class="nacos-list">
          <div class="nacos-list__foot nacos-list__foot--head">
            <strong>{{ t('explorer.nacosServices.instancesTitle') }}</strong>
            <span>{{ instancesStatusText }}</span>
          </div>
          <div class="nacos-list__scroll">
            <EmptyState
                v-if="!selectedKey && !instancesLoading"
                class="nacos-editor-empty"
                embedded
                compact
                :title="t('explorer.nacosServices.selectHint')"
            />
            <EmptyState
                v-else-if="!instancesLoading && instances.length === 0"
                class="nacos-editor-empty"
                embedded
                compact
                :title="t('explorer.nacosServices.emptyInstances')"
            />
            <table v-else class="connector-browse-panel__table">
              <thead>
              <tr>
                <th>{{ t('explorer.nacosServices.columns.ip') }}</th>
                <th>{{ t('explorer.nacosServices.columns.port') }}</th>
                <th>{{ t('explorer.nacosServices.columns.healthy') }}</th>
                <th>{{ t('explorer.nacosServices.columns.weight') }}</th>
                <th>{{ t('explorer.nacosServices.columns.cluster') }}</th>
              </tr>
              </thead>
              <tbody>
              <tr v-for="(item, index) in instances" :key="`${item.ip}:${item.port}:${index}`">
                <td>{{ item.ip ?? '—' }}</td>
                <td>{{ item.port }}</td>
                <td>
                  <span
                      class="connector-browse-panel__badge"
                      :class="{ 'is-unhealthy': !item.healthy }"
                  >
                    {{ item.healthy ? t('explorer.nacosServices.healthy') : t('explorer.nacosServices.unhealthy') }}
                  </span>
                </td>
                <td>{{ item.weight }}</td>
                <td>{{ item.clusterName ?? '—' }}</td>
              </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </DwSplitPane>
  </div>
</template>
