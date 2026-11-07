<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwInlineAlert, DwCodeViewer, DwSplitPane, EmptyState, IconButton, SearchInput} from '@/core/components'
import SettingsSelect from '@/core/components/SettingsSelect.vue'
import {DwIcon} from '@/core/icons'
import {explorerApi} from '@/api'
import type {PolarisNamespaceSummary} from '@/features/explorer/services/polaris-services.service'
import {
  polarisConfigRowKey,
  type PolarisConfigDetail,
  type PolarisConfigSummary,
} from '@/features/explorer/services/polaris-configs.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
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
const emit = defineEmits<{
  'namespace-label': [label: string]
}>()
const {t} = useI18n()
const layout = useLayoutStore()

const namespaces = ref<PolarisNamespaceSummary[]>([])
const namespace = ref('')
const lastNamespace = ref('')
const configs = ref<PolarisConfigSummary[]>([])
const configsCache = ref(new Map<string, PolarisConfigSummary[]>())
const selectedKey = ref<string | null>(null)
const selected = ref<PolarisConfigDetail | null>(null)
const loading = ref(false)
const detailLoading = ref(false)
const error = ref<string | null>(null)
const bootstrapped = ref(false)
const editing = ref(false)
const saving = ref(false)
const draftContent = ref('')
const filterName = ref('')
const filterGroup = ref('')

const namespaceOptions = computed((): ConnectorNamespaceOption[] => {
  return namespaces.value
      .map((item) => {
        const value = (item.name ?? '').trim()
        return {value, label: value}
      })
      .filter((item) => item.value)
})

const filteredConfigs = computed(() => {
  const nameQ = filterName.value.trim().toLowerCase()
  const groupQ = filterGroup.value.trim().toLowerCase()
  return configs.value.filter((item) => {
    if (nameQ && !(item.name ?? '').toLowerCase().includes(nameQ)) return false
    if (groupQ && !(item.group ?? '').toLowerCase().includes(groupQ)) return false
    return true
  })
})

const statusText = computed(() => {
  if (loading.value) return t('explorer.polarisConfigs.loading')
  if (filterName.value.trim() || filterGroup.value.trim()) {
    return t('explorer.polarisConfigs.filterStatus', {
      shown: filteredConfigs.value.length,
      total: configs.value.length,
    })
  }
  return t('explorer.polarisConfigs.status', {count: configs.value.length})
})

const contentTitle = computed(() => t('explorer.polarisConfigs.contentTitle'))
const contentSubtitle = computed(() => {
  if (!selected.value?.name) return undefined
  return `${selected.value.group ?? '—'} / ${selected.value.name}`
})

const isDirty = computed(() =>
    isConfigContentDirty(editing.value, selected.value?.content, draftContent.value),
)

function emitNamespaceLabel() {
  const match = namespaceOptions.value.find((item) => item.value === namespace.value)
  emit('namespace-label', match?.label || namespace.value)
}

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
  namespace.value = ''
  lastNamespace.value = ''
  configs.value = []
  configsCache.value = new Map()
  filterName.value = ''
  filterGroup.value = ''
  clearSelection()
  error.value = null
  bootstrapped.value = false
}

function confirmLeaveEdit(): boolean {
  const ok = confirmDiscardConfigEdits(
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

function cancelEdit() {
  if (saving.value) return
  if (!confirmLeaveEdit()) return
}

async function saveEdit() {
  if (!props.connectionId || !selected.value?.name || !editing.value || saving.value) return
  saving.value = true
  error.value = null
  try {
    const updated = await explorerApi.updatePolarisConfig(props.connectionId, {
      name: selected.value.name,
      group: selected.value.group ?? undefined,
      namespace: namespace.value || selected.value.namespace || undefined,
      content: draftContent.value,
      format: selected.value.format ?? undefined,
    })
    selected.value = updated
    draftContent.value = updated.content ?? ''
    editing.value = false
    layout.showSuccessToast(t('explorer.polarisConfigs.saveSuccess'))
    registerStatelessConnectorUse(props.connectionId, 'polaris', 'ok')
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.polarisConfigs.saveFailed')
    registerStatelessConnectorUse(props.connectionId, 'polaris', 'error')
  } finally {
    saving.value = false
  }
}

function applyPreferredNamespace() {
  if (props.preferredNamespace == null) return
  const preferred = props.preferredNamespace.trim()
  if (!preferred) return
  if (namespaces.value.some((item) => item.name === preferred) || !namespaces.value.length) {
    namespace.value = preferred
    lastNamespace.value = preferred
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
    lastNamespace.value = namespace.value
    emitNamespaceLabel()
    registerStatelessConnectorUse(props.connectionId, 'polaris', 'ok')
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.polarisConfigs.loadFailed')
    registerStatelessConnectorUse(props.connectionId, 'polaris', 'error')
  }
}

async function loadConfigs(options?: {force?: boolean; preserveSelection?: boolean}) {
  if (!props.connectionId) return
  const ns = namespace.value.trim()
  const force = options?.force === true
  const preserve = options?.preserveSelection !== false
  const keepKey = preserve ? selectedKey.value : null
  if (!preserve) clearSelection()

  if (!ns) {
    configs.value = []
    error.value = null
    loading.value = false
    return
  }

  if (!force && configsCache.value.has(ns)) {
    configs.value = configsCache.value.get(ns) ?? []
    if (keepKey) {
      const match = configs.value.find((item) => polarisConfigRowKey(item) === keepKey)
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
    const result = await explorerApi.fetchPolarisConfigs(props.connectionId, {
      namespace: ns,
      limit: 200,
    })
    configs.value = result.configs
    configsCache.value.set(ns, result.configs)
    registerStatelessConnectorUse(props.connectionId, 'polaris', 'ok')
    if (keepKey) {
      const match = configs.value.find((item) => polarisConfigRowKey(item) === keepKey)
      if (match) {
        await selectConfig(match, {quiet: true, skipIfSame: true})
      } else {
        clearSelection()
      }
    }
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.polarisConfigs.loadFailed')
    registerStatelessConnectorUse(props.connectionId, 'polaris', 'error')
    configs.value = []
  } finally {
    loading.value = false
  }
}

async function onNamespaceSelect(next: string) {
  if (next === namespace.value) return
  if (!confirmLeaveEdit()) return
  namespace.value = next
  lastNamespace.value = next
  clearSelection()
  emitNamespaceLabel()
  await loadConfigs({preserveSelection: false})
}

async function selectConfig(
    config: PolarisConfigSummary,
    options?: {quiet?: boolean; skipIfSame?: boolean},
) {
  if (!props.connectionId || !config.name) return
  const key = polarisConfigRowKey(config)
  if (options?.skipIfSame && key === selectedKey.value && selected.value) return
  if (!options?.quiet && !confirmLeaveEdit()) return
  if (!options?.quiet) detailLoading.value = true
  error.value = null
  try {
    selected.value = await explorerApi.fetchPolarisConfig(props.connectionId, {
      name: config.name,
      group: config.group ?? undefined,
      namespace: namespace.value || config.namespace || undefined,
    })
    selectedKey.value = key
    draftContent.value = selected.value.content ?? ''
    editing.value = false
    registerStatelessConnectorUse(props.connectionId, 'polaris', 'ok')
  } catch (err) {
    if (!options?.quiet) {
      error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.polarisConfigs.detailFailed')
      registerStatelessConnectorUse(props.connectionId, 'polaris', 'error')
    }
  } finally {
    if (!options?.quiet) detailLoading.value = false
  }
}

async function refresh() {
  if (!confirmLeaveEdit()) return
  configsCache.value = new Map()
  await loadNamespaces()
  lastNamespace.value = namespace.value
  await loadConfigs({force: true, preserveSelection: false})
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
      if (!confirmLeaveEdit()) return
      namespace.value = next
      lastNamespace.value = next
      emitNamespaceLabel()
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
  <div class="connector-browse-panel connector-workbench-pane polaris-configs-panel">
    <DwInlineAlert v-if="error" density="banner" variant="error" :message="error"/>

    <DwSplitPane
        class="connector-browse-panel__body connector-browse-panel__body--split"
        storage-key="dw.split.polaris-configs"
        :default-width="320"
        :min-width="240"
        :max-width="560"
        :end-min-width="300"
        :stack-below="900"
        start-class="connector-browse-panel__pane"
        end-class="connector-browse-panel__pane connector-browse-panel__pane--flush"
    >
      <template #start>
        <div class="connector-list">
          <div class="connector-list__filters connector-list__filters--configs">
            <SettingsSelect
                :model-value="namespace"
                size="sm"
                searchable
                :options="namespaceOptions"
                :disabled="loading"
                :placeholder="t('explorer.polarisConfigs.namespace')"
                @update:model-value="onNamespaceSelect"
            />
            <SearchInput
                v-model="filterName"
                size="sm"
                :placeholder="t('explorer.polarisConfigs.filters.name')"
            />
            <SearchInput
                v-model="filterGroup"
                size="sm"
                :placeholder="t('explorer.polarisConfigs.filters.group')"
            />
            <button class="connector-list__refresh" type="button" :disabled="loading" @click="refresh">
              {{ t('explorer.polarisConfigs.refresh') }}
            </button>
          </div>
          <div class="connector-list__scroll">
            <table class="connector-browse-panel__table">
              <thead>
              <tr>
                <th>{{ t('explorer.polarisConfigs.columns.name') }}</th>
                <th>{{ t('explorer.polarisConfigs.columns.group') }}</th>
                <th>{{ t('explorer.polarisConfigs.columns.format') }}</th>
                <th>{{ t('explorer.polarisConfigs.columns.comment') }}</th>
              </tr>
              </thead>
              <tbody>
              <tr v-if="!loading && filteredConfigs.length === 0">
                <td class="connector-list__empty" colspan="4">
                  <EmptyState
                      embedded
                      compact
                      :title="configs.length === 0 ? t('explorer.polarisConfigs.empty') : t('explorer.polarisConfigs.filterEmpty')"
                  />
                </td>
              </tr>
              <tr
                  v-for="item in filteredConfigs"
                  :key="polarisConfigRowKey(item)"
                  class="is-clickable"
                  :class="{ 'is-selected': polarisConfigRowKey(item) === selectedKey }"
                  @click="selectConfig(item)"
              >
                <td>{{ item.name ?? '—' }}</td>
                <td>{{ item.group ?? '—' }}</td>
                <td>{{ item.format ?? '—' }}</td>
                <td>{{ item.comment ?? '—' }}</td>
              </tr>
              </tbody>
            </table>
          </div>
          <div class="connector-list__foot">{{ statusText }}</div>
        </div>
      </template>

      <template #end>
        <EmptyState
            v-if="!selected && !detailLoading"
            class="connector-editor-empty"
            embedded
            compact
            :title="t('explorer.polarisConfigs.selectHint')"
        />
        <DwCodeViewer
            v-else
            v-model:content="draftContent"
            :title="contentTitle"
            :subtitle="contentSubtitle"
            :type-hint="selected?.format"
            :filename="selected?.name"
            :loading="detailLoading"
            :readonly="!editing"
            dark
            card
            :empty-text="t('explorer.polarisConfigs.emptyContent')"
        >
          <template #actions>
            <span
                v-if="editing && isDirty"
                class="polaris-configs-panel__dirty"
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
.polaris-configs-panel__dirty {
  margin-right: 4px;
  font-size: var(--dw-text-xs);
  color: var(--dw-warning);
  white-space: nowrap;
}
</style>
