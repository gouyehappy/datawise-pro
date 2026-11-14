<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwInlineAlert, DwCodeViewer, DwSplitPane, EmptyState, IconButton, SearchInput} from '@/core/components'
import SettingsSelect from '@/core/components/SettingsSelect.vue'
import {DwIcon} from '@/core/icons'
import {explorerApi} from '@/api'
import {
  nacosConfigRowKey,
  type NacosConfigDetail,
  type NacosConfigSummary,
  type NacosNamespaceSummary,
} from '@/features/explorer/services/nacos-configs.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {fetchConnectionConfig} from '@/shared/config/connections-catalog.service'
import {readSavedNacosNamespace, readVisibleNacosNamespaces} from '@/features/connection/utils/nacos-endpoint'
import {registerStatelessConnectorUse} from '@/features/explorer/services/register-connection-health.service'
import {useLayoutStore} from '@/features/layout/stores/layout'
import type {ConnectorNamespaceOption} from '@/features/workspace/components/shared/ConnectorNamespaceBar.vue'
import {
  confirmDiscardConfigEdits,
  isConfigContentDirty,
} from '@/features/workspace/components/shared/config-content-edit'
import '@/features/workspace/components/shared/connector-browse-panel.css'

const props = defineProps<{
  connectionId: string
  preferredNamespace?: string | null
}>()
const {t} = useI18n()
const layout = useLayoutStore()

const namespaces = ref<NacosNamespaceSummary[]>([])
const visibleNamespaceIds = ref<string[] | null>(null)
const namespaceId = ref('')
const lastNamespaceId = ref('')
const configs = ref<NacosConfigSummary[]>([])
const configsCache = ref(new Map<string, NacosConfigSummary[]>())
const selectedKey = ref<string | null>(null)
const selected = ref<NacosConfigDetail | null>(null)
const loading = ref(false)
const detailLoading = ref(false)
const error = ref<string | null>(null)
const bootstrapped = ref(false)
const editing = ref(false)
const saving = ref(false)
const draftContent = ref('')
const filterDataId = ref('')
const filterGroup = ref('')
const filterApp = ref('')

const namespaceOptions = computed((): ConnectorNamespaceOption[] => {
  const allowPublic = visibleNamespaceIds.value == null || visibleNamespaceIds.value.includes('')
  const chips: ConnectorNamespaceOption[] = allowPublic
      ? [{value: '', label: t('explorer.nacosConfigs.publicNamespace')}]
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
  emit('namespace-label', match?.label || t('explorer.nacosConfigs.publicNamespace'))
}, {immediate: true})

const filteredConfigs = computed(() => {
  const dataId = filterDataId.value.trim().toLowerCase()
  const group = filterGroup.value.trim().toLowerCase()
  const app = filterApp.value.trim().toLowerCase()
  if (!dataId && !group && !app) return configs.value
  return configs.value.filter((item) => {
    if (dataId && !(item.dataId ?? '').toLowerCase().includes(dataId)) return false
    if (group && !(item.group ?? '').toLowerCase().includes(group)) return false
    if (app && !(item.appName ?? '').toLowerCase().includes(app)) return false
    return true
  })
})

const statusText = computed(() => {
  if (loading.value) return t('explorer.nacosConfigs.loading')
  if (
      filterDataId.value.trim()
      || filterGroup.value.trim()
      || filterApp.value.trim()
  ) {
    return t('explorer.nacosConfigs.filterStatus', {
      shown: filteredConfigs.value.length,
      total: configs.value.length,
    })
  }
  return t('explorer.nacosConfigs.status', {count: configs.value.length})
})

const contentTitle = computed(() => t('explorer.nacosConfigs.contentTitle'))
const contentSubtitle = computed(() => {
  if (!selected.value?.dataId) return undefined
  return `${selected.value.group ?? 'DEFAULT_GROUP'} / ${selected.value.dataId}`
})

const isDirty = computed(() =>
    isConfigContentDirty(editing.value, selected.value?.content, draftContent.value),
)

function clearSelection() {
  selected.value = null
  selectedKey.value = null
  exitEdit(false)
}

function exitEdit(restoreDraft = true) {
  editing.value = false
  saving.value = false
  if (restoreDraft) {
    draftContent.value = selected.value?.content ?? ''
  }
}

function resetState() {
  namespaces.value = []
  visibleNamespaceIds.value = null
  namespaceId.value = ''
  lastNamespaceId.value = ''
  configs.value = []
  configsCache.value = new Map()
  clearSelection()
  error.value = null
  bootstrapped.value = false
}

async function confirmLeaveEdit(): Promise<boolean> {
  const ok = await confirmDiscardConfigEdits(
      isDirty.value,
      t('common.codeViewer.discardConfirm'),
  )
  if (ok) exitEdit()
  return ok
}

function startEdit() {
  if (!selected.value || detailLoading.value || saving.value) return
  draftContent.value = selected.value.content ?? ''
  editing.value = true
}

async function cancelEdit() {
  if (saving.value) return
  if (!(await confirmLeaveEdit())) return
}

async function saveEdit() {
  if (!props.connectionId || !selected.value?.dataId || !editing.value || saving.value) return
  saving.value = true
  error.value = null
  try {
    const updated = await explorerApi.updateNacosConfig(props.connectionId, {
      dataId: selected.value.dataId,
      group: selected.value.group ?? undefined,
      namespaceId: namespaceId.value || selected.value.namespaceId || undefined,
      content: draftContent.value,
      type: selected.value.type ?? undefined,
    })
    selected.value = updated
    draftContent.value = updated.content ?? ''
    editing.value = false
    registerStatelessConnectorUse(props.connectionId, 'nacos', 'ok')
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.nacosConfigs.saveFailed')
    registerStatelessConnectorUse(props.connectionId, 'nacos', 'error')
  } finally {
    saving.value = false
  }
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
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.nacosConfigs.loadFailed')
    registerStatelessConnectorUse(props.connectionId, 'nacos', 'error')
  }
}

async function loadConfigs(options?: {force?: boolean; preserveSelection?: boolean}) {
  if (!props.connectionId) return
  const nsKey = namespaceId.value
  const force = options?.force === true
  const preserve = options?.preserveSelection !== false
  const keepKey = preserve ? selectedKey.value : null
  if (!preserve) clearSelection()

  if (!force && configsCache.value.has(nsKey)) {
    configs.value = configsCache.value.get(nsKey) ?? []
    if (keepKey) {
      const match = configs.value.find((item) => nacosConfigRowKey(item) === keepKey)
      if (match) {
        await selectConfig(match, {quiet: true, skipIfSame: true})
      } else {
        clearSelection()
      }
    }
    return
  }

  loading.value = true
  error.value = null
  try {
    const result = await explorerApi.fetchNacosConfigs(props.connectionId, {
      namespaceId: nsKey || undefined,
      limit: 200,
    })
    configs.value = result.configs
    configsCache.value.set(nsKey, result.configs)
    registerStatelessConnectorUse(props.connectionId, 'nacos', 'ok')
    if (keepKey) {
      const match = configs.value.find((item) => nacosConfigRowKey(item) === keepKey)
      if (match) {
        await selectConfig(match, {quiet: true, skipIfSame: true})
      } else {
        clearSelection()
      }
    }
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.nacosConfigs.loadFailed')
    registerStatelessConnectorUse(props.connectionId, 'nacos', 'error')
    configs.value = []
  } finally {
    loading.value = false
  }
}

async function onNamespaceSelect(next: string) {
  if (next === namespaceId.value) return
  if (!(await confirmLeaveEdit())) return
  namespaceId.value = next
  lastNamespaceId.value = next
  clearSelection()
  await loadConfigs({preserveSelection: false})
}

async function selectConfig(
    config: NacosConfigSummary,
    options?: {quiet?: boolean; skipIfSame?: boolean},
) {
  if (!props.connectionId || !config.dataId) return
  const key = nacosConfigRowKey(config)
  if (options?.skipIfSame && key === selectedKey.value && selected.value) return
  if (!options?.quiet && !(await confirmLeaveEdit())) return
  if (!options?.quiet) detailLoading.value = true
  error.value = null
  try {
    selected.value = await explorerApi.fetchNacosConfig(props.connectionId, {
      dataId: config.dataId,
      group: config.group ?? undefined,
      namespaceId: namespaceId.value || config.namespaceId || undefined,
    })
    selectedKey.value = key
    draftContent.value = selected.value.content ?? ''
    editing.value = false
    registerStatelessConnectorUse(props.connectionId, 'nacos', 'ok')
  } catch (err) {
    if (!options?.quiet) {
      error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.nacosConfigs.detailFailed')
      registerStatelessConnectorUse(props.connectionId, 'nacos', 'error')
    }
  } finally {
    if (!options?.quiet) detailLoading.value = false
  }
}

async function refresh() {
  if (!(await confirmLeaveEdit())) return
  configsCache.value = new Map()
  await loadNamespaces()
  lastNamespaceId.value = namespaceId.value
  await loadConfigs({force: true, preserveSelection: false})
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
      lastNamespaceId.value = preferred
      return
    }
  }
  const saved = readSavedNacosNamespace(config?.advancedConfig)
  const allowed = visibleNamespaceIds.value
  if (saved && (allowed == null || allowed.includes(saved))) {
    namespaceId.value = saved
    lastNamespaceId.value = saved
    return
  }
  if (allowed && !allowed.includes('')) {
    namespaceId.value = allowed.find((id) => id) ?? allowed[0] ?? ''
    lastNamespaceId.value = namespaceId.value
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
      if (!(await confirmLeaveEdit())) return
      namespaceId.value = next
      lastNamespaceId.value = next
      clearSelection()
      await loadConfigs({force: true, preserveSelection: false})
    },
)
watch(selected, (detail) => {
  if (!editing.value) {
    draftContent.value = detail?.content ?? ''
  }
})
</script>

<template>
  <div class="connector-browse-panel nacos-workbench-pane nacos-configs-panel">
    <DwInlineAlert v-if="error" density="banner" variant="error" :message="error"/>

    <DwSplitPane
        class="connector-browse-panel__body connector-browse-panel__body--split"
        storage-key="dw.split.nacos-configs"
        :default-width="320"
        :min-width="240"
        :max-width="560"
        :end-min-width="300"
        :stack-below="900"
        start-class="connector-browse-panel__pane"
        end-class="connector-browse-panel__pane connector-browse-panel__pane--flush"
    >
      <template #start>
        <div class="nacos-list">
          <div class="nacos-list__filters">
            <SettingsSelect
                :model-value="namespaceId"
                size="sm"
                searchable
                :options="namespaceOptions"
                :disabled="loading"
                :placeholder="t('explorer.nacosConfigs.namespace')"
                @update:model-value="onNamespaceSelect"
            />
            <SearchInput
                v-model="filterDataId"
                size="sm"
                :placeholder="t('explorer.nacosConfigs.filters.dataId')"
            />
            <SearchInput
                v-model="filterGroup"
                size="sm"
                :placeholder="t('explorer.nacosConfigs.filters.group')"
            />
            <SearchInput
                v-model="filterApp"
                size="sm"
                :placeholder="t('explorer.nacosConfigs.filters.app')"
            />
            <button class="nacos-list__refresh" type="button" :disabled="loading" @click="refresh">
              {{ t('explorer.nacosConfigs.refresh') }}
            </button>
          </div>
          <div class="nacos-list__scroll">
            <table class="connector-browse-panel__table">
              <thead>
              <tr>
                <th>{{ t('explorer.nacosConfigs.columns.dataId') }}</th>
                <th>{{ t('explorer.nacosConfigs.columns.group') }}</th>
                <th>{{ t('explorer.nacosConfigs.columns.appName') }}</th>
                <th>{{ t('explorer.nacosConfigs.columns.type') }}</th>
              </tr>
              </thead>
              <tbody>
              <tr v-if="!loading && filteredConfigs.length === 0">
                <td class="nacos-list__empty" colspan="4">
                  <EmptyState
                      embedded
                      compact
                      :title="configs.length === 0 ? t('explorer.nacosConfigs.empty') : t('explorer.nacosConfigs.filterEmpty')"
                  />
                </td>
              </tr>
              <tr
                  v-for="item in filteredConfigs"
                  :key="nacosConfigRowKey(item)"
                  class="is-clickable"
                  :class="{ 'is-selected': nacosConfigRowKey(item) === selectedKey }"
                  @click="selectConfig(item)"
              >
                <td>{{ item.dataId ?? '—' }}</td>
                <td>{{ item.group ?? '—' }}</td>
                <td>{{ item.appName ?? '—' }}</td>
                <td>{{ item.type ?? '—' }}</td>
              </tr>
              </tbody>
            </table>
          </div>
          <div class="nacos-list__foot">{{ statusText }}</div>
        </div>
      </template>

      <template #end>
        <EmptyState
            v-if="!selected && !detailLoading"
            class="nacos-editor-empty"
            embedded
            compact
            :title="t('explorer.nacosConfigs.selectHint')"
            :hint="t('explorer.nacosConfigs.selectHintDesc')"
        />
        <DwCodeViewer
            v-else
            v-model:content="draftContent"
            :title="contentTitle"
            :subtitle="contentSubtitle"
            :type-hint="selected?.type"
            :filename="selected?.dataId"
            :loading="detailLoading"
            :readonly="!editing"
            dark
            card
            :empty-text="t('explorer.nacosConfigs.emptyContent')"
        >
          <template #actions>
            <span
                v-if="editing && isDirty"
                class="nacos-configs-panel__dirty"
            >{{ t('common.codeViewer.dirty') }}</span>
            <template v-if="!editing">
              <IconButton
                  size="sm"
                  class="dw-code-viewer__icon-btn"
                  :title="t('common.codeViewer.edit')"
                  :disabled="!selected || detailLoading"
                  @click="startEdit"
              >
                <DwIcon name="edit" size="sm"/>
              </IconButton>
            </template>
            <template v-else>
              <IconButton
                  size="sm"
                  class="dw-code-viewer__icon-btn"
                  :title="saving ? t('common.codeViewer.saving') : t('common.codeViewer.save')"
                  :disabled="saving || !isDirty"
                  @click="saveEdit"
              >
                <DwIcon name="save" size="sm"/>
              </IconButton>
              <IconButton
                  size="sm"
                  class="dw-code-viewer__icon-btn"
                  :title="t('common.codeViewer.cancel')"
                  :disabled="saving"
                  @click="cancelEdit"
              >
                <DwIcon name="close" size="sm"/>
              </IconButton>
            </template>
          </template>
        </DwCodeViewer>
      </template>
    </DwSplitPane>
  </div>
</template>

<style scoped>
.nacos-configs-panel__dirty {
  margin-right: 4px;
  font-size: var(--dw-text-xs);
  color: var(--dw-warning);
  white-space: nowrap;
}
</style>
