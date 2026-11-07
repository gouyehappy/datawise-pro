<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwButton, DwCheckbox, DwInput, EmptyState, ModalActions} from '@/core/components'
import {fetchConnectionHost} from '@/features/explorer/services/resolve-connection-host'
import type {DatabaseConsoleContext} from '@/features/explorer/services/sql-editor-actions.service'
import {
  createNewSqlEditor,
  openSqlScriptFile,
} from '@/features/explorer/services/sql-editor-actions.service'
import {
  filterSqlScripts,
  formatScriptModifiedTime,
  listInstanceSqlScripts,
} from '@/features/explorer/services/sql-script.service'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useLayoutStore} from '@/features/layout/stores/layout'
import type {InstanceSqlFileItem} from '@/shared/api/types'

const props = defineProps<{
  open: boolean
  context: DatabaseConsoleContext | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  opened: []
}>()

const {t} = useI18n()
const explorer = useExplorerStore()
const layout = useLayoutStore()

const search = ref('')
const showAllConnections = ref(false)
const loading = ref(false)
const scripts = ref<InstanceSqlFileItem[]>([])
const selectedId = ref<string | null>(null)

const hostLabel = computed(() => props.context?.connectionHost ?? props.context?.connectionName ?? '')

const dialogTitle = computed(() =>
    t('explorer.recentSqlDialog.title', {host: hostLabel.value || '—'}),
)

const filteredScripts = computed(() => filterSqlScripts(scripts.value, search.value))

const selectedScript = computed(() =>
    filteredScripts.value.find((item) => scriptKey(item) === selectedId.value) ?? null,
)

function scriptKey(item: InstanceSqlFileItem) {
  return `${item.connectionId}:${item.instanceName}:${item.fileName}`
}

async function loadScripts() {
  if (!props.context) return
  loading.value = true
  try {
    scripts.value = await listInstanceSqlScripts({
      connectionId: props.context.connectionId,
      instanceName: props.context.databaseNode.label,
      allConnections: showAllConnections.value,
    })
    selectedId.value = scripts.value[0] ? scriptKey(scripts.value[0]) : null
  } finally {
    loading.value = false
  }
}

function close() {
  emit('update:open', false)
}

async function openSelected() {
  if (!props.context || !selectedScript.value) return
  const script = selectedScript.value
  const baseCtx = props.context

  let databaseNode = baseCtx.databaseNode
  if (script.connectionId !== baseCtx.connectionId || script.instanceName !== baseCtx.databaseNode.label) {
    const connectionNode = explorer.findNode(script.connectionId)
    databaseNode = connectionNode?.children?.find(
        (node) => node.type === 'database' && node.label === script.instanceName,
    ) ?? {id: script.instanceName, label: script.instanceName}
  }

  const connectionHost = await fetchConnectionHost(script.connectionId, baseCtx.connectionName)
  const ctx: DatabaseConsoleContext = {
    connectionId: script.connectionId,
    connectionName: baseCtx.connectionName,
    connectionHost,
    databaseNode,
  }

  await openSqlScriptFile(ctx, script.fileName)
  await explorer.reloadWorkspacesFolder(script.connectionId, script.instanceName)
  emit('opened')
  close()
}

async function createNewScript() {
  if (!props.context) return
  const ctx = props.context
  layout.setModule('database')
  emit('opened')
  close()
  void createNewSqlEditor(explorer.tree, ctx.databaseNode, ctx.connectionName)
      .catch(() => layout.showErrorToast(t('console.loadSqlFileFailed')))
}

function onRowDblClick(item: InstanceSqlFileItem) {
  selectedId.value = scriptKey(item)
  void openSelected()
}

watch(
    () => [props.open, props.context?.connectionId, props.context?.databaseNode.label] as const,
    ([isOpen]) => {
      if (!isOpen) return
      search.value = ''
      showAllConnections.value = false
      void loadScripts()
    },
)

watch(showAllConnections, () => {
  if (props.open) void loadScripts()
})
</script>

<template>
  <AppModal
      :open="open"
      :title="dialogTitle"
      width="760px"
      @close="close"
  >
    <div class="modal-picker">
      <DwInput
          v-model="search"
          type="search"
          :placeholder="t('explorer.recentSqlDialog.searchPlaceholder')"
      />

      <div class="modal-picker__toolbar">
        <DwButton variant="secondary" size="sm" type="button" @click="createNewScript">
          {{ t('explorer.recentSqlDialog.newScript') }}
        </DwButton>
        <DwCheckbox v-model="showAllConnections" class="modal-check-label">
          {{ t('explorer.recentSqlDialog.showAllConnections') }}
        </DwCheckbox>
      </div>

      <div class="modal-data-table-wrap modal-data-table-wrap--grow">
        <table class="modal-data-table modal-data-table--selectable">
          <thead>
          <tr>
            <th>{{ t('explorer.recentSqlDialog.columns.script') }}</th>
            <th>{{ t('explorer.recentSqlDialog.columns.time') }}</th>
            <th>{{ t('explorer.recentSqlDialog.columns.info') }}</th>
            <th>{{ t('explorer.recentSqlDialog.columns.folder') }}</th>
          </tr>
          </thead>
          <tbody>
          <tr v-if="loading">
            <td colspan="4">
              <EmptyState embedded compact :title="t('explorer.recentSqlDialog.loading')"/>
            </td>
          </tr>
          <tr v-else-if="filteredScripts.length === 0">
            <td colspan="4">
              <EmptyState embedded compact :title="t('explorer.recentSqlDialog.empty')"/>
            </td>
          </tr>
          <tr
              v-for="item in filteredScripts"
              v-else
              :key="scriptKey(item)"
              :class="{ 'is-selected': selectedId === scriptKey(item) }"
              @click="selectedId = scriptKey(item)"
              @dblclick="onRowDblClick(item)"
          >
            <td class="is-name">{{ item.fileName }}</td>
            <td class="is-tabular">{{ formatScriptModifiedTime(item.modifiedAt) }}</td>
            <td class="is-ellipsis">{{ item.preview }}</td>
            <td class="is-muted">{{ item.instanceName }}</td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>

    <template #footer>
      <ModalActions
          :confirm-label="t('common.confirm')"
          :cancel-label="t('common.cancel')"
          :confirm-disabled="!selectedScript"
          @confirm="openSelected"
          @cancel="close"
      />
    </template>
  </AppModal>
</template>
