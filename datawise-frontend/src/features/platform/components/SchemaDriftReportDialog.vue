<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwCheckbox, EmptyState, ModalActions} from '@/core/components'
import type {SchemaDriftReport} from '@/features/platform/types/platform.types'
import type {SchemaScope} from '@/features/schema-compare/types/schema-compare.types'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {extractConnectionsFromTree} from '@/features/explorer/utils/tree-targets'
import type {DbType} from '@/core/types'

const props = defineProps<{
    open: boolean
    report: SchemaDriftReport | null
}>()

const emit = defineEmits<{
    'update:open': [value: false]
}>()

const {t} = useI18n()
const layout = useLayoutStore()
const workspace = useWorkspaceStore()
const explorer = useExplorerStore()

const selectedTables = ref<string[]>([])

const driftTables = computed(() =>
    (props.report?.tables ?? []).filter((table) => table.status !== 'match'),
)

watch(
    () => props.report,
    (report) => {
        selectedTables.value = driftTables.value.map((table) => table.tableName)
    },
    {immediate: true},
)

function close() {
    emit('update:open', false)
}

function toggleTable(name: string) {
    if (selectedTables.value.includes(name)) {
        selectedTables.value = selectedTables.value.filter((item) => item !== name)
    } else {
        selectedTables.value = [...selectedTables.value, name]
    }
}

function resolveMigrationSource(report: SchemaDriftReport): SchemaScope | null {
    if (!report.sourceConnectionId || !report.sourceDatabase) return null
    const connection = extractConnectionsFromTree(explorer.tree).find(
        (item) => item.id === report.sourceConnectionId,
    )
    return {
        connectionId: report.sourceConnectionId,
        database: report.sourceDatabase,
        connectionLabel: connection?.label ?? report.sourceConnectionId,
        dbType: (connection?.dbType ?? 'mysql') as DbType,
    }
}

function openMigration() {
    const report = props.report
    const source = report ? resolveMigrationSource(report) : null
    if (!source) return
    layout.setModule('database')
    workspace.openTableMigration({
        source,
        preselectedTables: selectedTables.value.length ? selectedTables.value : undefined,
    })
    close()
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('platform.drift.reportTitle')"
      width="640px"
      @close="close"
  >
    <p v-if="report" class="drift-report__summary">
      {{
        t('platform.drift.reportSummary', {
          count: report.driftTableCount,
          source: `${report.sourceConnectionId}/${report.sourceDatabase}`,
          target: `${report.targetConnectionId}/${report.targetDatabase}`,
        })
      }}
    </p>

    <ul v-if="driftTables.length" class="drift-report__list">
      <li v-for="table in driftTables" :key="table.tableName" class="drift-report__row">
        <DwCheckbox
            :model-value="selectedTables.includes(table.tableName)"
            @update:model-value="toggleTable(table.tableName)"
        >
          <span class="drift-report__name">{{ table.tableName }}</span>
          <span class="drift-report__status">{{ table.status }}</span>
        </DwCheckbox>
        <pre v-if="table.suggestedAlterSql" class="drift-report__alter">{{ table.suggestedAlterSql }}</pre>
      </li>
    </ul>
    <EmptyState
        v-else
        embedded
        compact
        :title="t('platform.drift.reportNoDrift')"
    />

    <template #footer>
      <ModalActions
          :confirm-label="t('platform.drift.openMigration')"
          :confirm-disabled="!report?.sourceConnectionId"
          @cancel="close"
          @confirm="openMigration"
      />
    </template>
  </AppModal>
</template>

<style scoped>
.drift-report__summary {
    margin: 0 0 var(--dw-space-6);
    font-size: var(--dw-text-md);
    color: var(--dw-text-muted);
}

.drift-report__list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--dw-gap);
    max-height: 360px;
    overflow: auto;
}

.drift-report__row :deep(.dw-checkbox),
.drift-report__row label {
    display: flex;
    align-items: center;
    gap: var(--dw-gap);
    font-size: var(--dw-text-md);
}

.drift-report__name {
    font-family: var(--dw-font-mono);
}

.drift-report__status {
    color: var(--dw-text-muted);
    font-size: var(--dw-text-sm);
}

.drift-report__alter {
    margin: var(--dw-space-3) 0 0 var(--dw-space-10);
    padding: var(--dw-pad-tight);
    border-radius: var(--dw-control-radius-sm);
    background: var(--dw-bg-subtle);
    font-size: var(--dw-text-xs);
    white-space: pre-wrap;
}
</style>
