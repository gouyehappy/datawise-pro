<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import DwDataGrid from '@/core/components/DwDataGrid.vue'
import {DwIcon} from '@/core/icons'
import type {DwDataGridColumn, DwDataGridLabels} from '@/core/components/dw-data-grid.types'
import type {WorkspaceTab} from '@/core/types'
import {fetchAiTableTags, updateAiTableTags} from '@/features/ai/tag/services/ai-table-tag.service'
import {notifyAiTableTagsChanged} from '@/features/ai/tag/services/ai-table-tag.events'
import {rebuildAiRagIndex} from '@/features/ai/rag/services/ai-rag.service'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useSchemaTables} from '@/features/workspace/composables/useSchemaTables'
import {
  displaySchemaTableText,
  formatSchemaTableCreateTime,
  formatSchemaTableDataLength,
  formatSchemaTableRowCount,
} from '@/features/workspace/services/schema-tables.service'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import type {SchemaTableSummary} from '@/shared/api/types'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

type SchemaTableRow = SchemaTableSummary & {aiTagged: boolean}

const props = defineProps<{ tab: WorkspaceTab }>()
const {t} = useI18n()
const workspace = useWorkspaceStore()
const layout = useLayoutStore()

const {rows, loading, error, databaseName, loadSchemaTables} = useSchemaTables(props.tab)
const selectedKeys = ref<string[]>([])
const syncingToAi = ref(false)
const tagging = ref(false)
const taggedTableNames = ref<string[]>([])

const scopeDatabase = computed(() => props.tab.database ?? databaseName.value ?? '')

const gridRows = computed<SchemaTableRow[]>(() => {
  const tagged = new Set(taggedTableNames.value)
  return rows.value.map((row) => ({
    ...row,
    aiTagged: tagged.has(row.tableName),
  }))
})

const canTag = computed(() =>
    selectedKeys.value.some((tableName) => !taggedTableNames.value.includes(tableName)),
)

const canUntag = computed(() =>
    selectedKeys.value.some((tableName) => taggedTableNames.value.includes(tableName)),
)

const columns = computed<DwDataGridColumn<SchemaTableRow>[]>(() => [
  {
    key: 'aiTagged',
    label: t('workspace.schemaTables.aiTagged'),
    align: 'center',
    headerClass: 'col-ai-tag',
    cellClass: 'col-ai-tag',
    format: (row) => (row.aiTagged ? t('common.yes') : t('common.no')),
  },
  {
    key: 'tableName',
    label: t('workspace.schemaTables.tableName'),
    mono: true,
    cellClass: 'col-name',
  },
  {
    key: 'rowCount',
    label: t('workspace.schemaTables.rowCount'),
    align: 'right',
    headerClass: 'col-num',
    cellClass: 'col-num',
    format: (row) => formatSchemaTableRowCount(row.rowCount),
  },
  {
    key: 'engine',
    label: t('workspace.schemaTables.engine'),
    format: (row) => displaySchemaTableText(row.engine),
  },
  {
    key: 'collation',
    label: t('workspace.schemaTables.collation'),
    mono: true,
    cellClass: 'col-collation',
    format: (row) => displaySchemaTableText(row.collation),
  },
  {
    key: 'dataLength',
    label: t('workspace.schemaTables.dataLength'),
    align: 'right',
    headerClass: 'col-num',
    cellClass: 'col-num',
    format: (row) => formatSchemaTableDataLength(row.dataLength),
  },
  {
    key: 'createTime',
    label: t('workspace.schemaTables.createTime'),
    headerClass: 'col-time',
    cellClass: 'col-time',
    mono: true,
    format: (row) => formatSchemaTableCreateTime(row.createTime),
  },
  {
    key: 'comment',
    label: t('workspace.schemaTables.comment'),
    cellClass: 'col-comment',
    format: (row) => displaySchemaTableText(row.comment),
  },
])

const gridLabels = computed<Partial<DwDataGridLabels>>(() => ({
  filter: t('workspace.schemaTables.filter'),
  empty: t('workspace.schemaTables.empty'),
  noMatch: t('workspace.schemaTables.noMatch'),
  loading: t('workspace.tableDetail.loading'),
}))

async function loadAiTableTags() {
  if (import.meta.env.VITE_DATAWISE_EDITION === 'standard') {
    taggedTableNames.value = []
    return
  }
  const connectionId = props.tab.connectionId
  const database = scopeDatabase.value
  if (!connectionId || !database) {
    taggedTableNames.value = []
    return
  }
  try {
    taggedTableNames.value = await fetchAiTableTags(connectionId, database)
  } catch {
    taggedTableNames.value = []
  }
}

watch(
    () => [props.tab.connectionId, scopeDatabase.value, rows.value.length] as const,
    () => {
      void loadAiTableTags()
    },
    {immediate: true},
)

function openErDiagram() {
  if (!props.tab.connectionId) return
  workspace.openSchemaEr({
    connectionId: props.tab.connectionId,
    database: scopeDatabase.value,
    instanceId: props.tab.instanceId ?? undefined,
    explorerNodeId: props.tab.explorerNodeId,
  })
}

async function syncToAiDataset() {
  if (import.meta.env.VITE_DATAWISE_EDITION === 'standard') return
  if (!props.tab.connectionId || syncingToAi.value) return
  syncingToAi.value = true
  try {
    const result = await rebuildAiRagIndex(
        props.tab.connectionId,
        scopeDatabase.value,
    )
  } catch {
    layout.showErrorToast(t('workspace.schemaTables.syncToAiFailed'))
  } finally {
    syncingToAi.value = false
  }
}

async function updateSelectedTags(tagged: boolean) {
  if (import.meta.env.VITE_DATAWISE_EDITION === 'standard') return
  const connectionId = props.tab.connectionId
  const database = scopeDatabase.value
  if (!connectionId || !database || !selectedKeys.value.length || tagging.value) return
  tagging.value = true
  try {
    taggedTableNames.value = await updateAiTableTags(
        connectionId,
        database,
        selectedKeys.value,
        tagged,
    )
    notifyAiTableTagsChanged()
  } catch (err) {
    layout.showErrorToast(resolveCaughtApiErrorMessage(err, t, 'workspace.schemaTables.tagForAiFailed'))
  } finally {
    tagging.value = false
  }
}
</script>

<template>
  <div class="schema-tables-tab dw-workbench-page" data-wb-recipe="wb-extension">
    <DwDataGrid
        v-model:selected-keys="selectedKeys"
        :rows="gridRows"
        :columns="columns"
        row-key="tableName"
        :loading="loading"
        :error="error"
        :labels="gridLabels"
    >
      <template #toolbar-actions>
        <button
            class="dw-text-btn" type="button"
            :disabled="loading"
            @click="loadSchemaTables"
        >
          <DwIcon name="refresh" size="sm" :stroke-width="1.5"/>
          {{ t('workspace.schemaTables.refresh') }}
        </button>
        <button
            class="dw-text-btn dw-text-btn--accent" type="button"
            :disabled="loading || tagging || !canTag"
            @click="updateSelectedTags(true)"
        >
          <DwIcon name="ai" size="sm" :stroke-width="1.5"/>
          {{ t('workspace.schemaTables.tagForAi') }}
        </button>
        <button
            class="dw-text-btn" type="button"
            :disabled="loading || tagging || !canUntag"
            @click="updateSelectedTags(false)"
        >
          <DwIcon name="minus" size="sm" :stroke-width="1.5"/>
          {{ t('workspace.schemaTables.untagForAi') }}
        </button>
        <button
            class="dw-text-btn dw-text-btn--accent" type="button"
            :disabled="loading || syncingToAi"
            @click="syncToAiDataset"
        >
          <DwIcon name="refresh" size="sm" :stroke-width="1.5"/>
          {{ syncingToAi ? t('workspace.schemaTables.syncingToAi') : t('workspace.schemaTables.syncToAi') }}
        </button>
        <button
            class="dw-text-btn" type="button"
            @click="openErDiagram"
        >
          <DwIcon name="tab-schema-er" size="sm" :stroke-width="1.5"/>
          {{ t('workspace.schemaTables.openEr') }}
        </button>
      </template>

      <template #toolbar-end>
        <span class="schema-tables-tab__hint" :title="t('workspace.schemaTables.aiTagHint')">
          {{ t('workspace.schemaTables.aiTagHint') }}
        </span>
        <div class="dw-data-grid__end-chip" :title="databaseName || '—'">
          <DwIcon name="database" size="sm" :stroke-width="1.3"/>
          <strong>{{ databaseName || '—' }}</strong>
          <DwIcon name="chevron-down" size="xs" :stroke-width="1.5" style="opacity: 0.65; flex-shrink: 0"/>
        </div>
      </template>
    </DwDataGrid>
  </div>
</template>

<style scoped>
.schema-tables-tab {
  min-width: 0;
}

.schema-tables-tab :deep(.dw-data-grid) {
  flex: 1;
  min-height: 0;
}

.schema-tables-tab :deep(.schema-tables-tab__hint) {
  max-width: min(320px, 36vw);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-snug);
  color: var(--dw-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.col-ai-tag) {
  width: 72px;
  white-space: nowrap;
}

:deep(.col-name) {
  font-weight: 600;
  white-space: nowrap;
}

:deep(.col-comment) {
  color: var(--dw-text-secondary);
  min-width: 180px;
}

:deep(.col-collation) {
  font-size: var(--dw-text-xs);
}

:deep(.col-num) {
  width: 88px;
  white-space: nowrap;
}

:deep(.col-time) {
  width: 168px;
  white-space: nowrap;
  color: var(--dw-text-secondary);
}
</style>
