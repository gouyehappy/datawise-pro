<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwCodeViewer, DwPanelState, EmptyState, StatusPill} from '@/core/components'
import {DwIcon} from '@/core/icons'
import type {StatusVariant} from '@/core/utils/status-variant'
import type {WorkspaceTab} from '@/core/types'
import TableDataTab from '@/features/workspace/components/tabs/TableDataTab.vue'
import TableRelationsPanel from '@/features/workspace/components/tabs/TableRelationsPanel.vue'
import TableRelationGraphPanel from '@/features/workspace/components/tabs/TableRelationGraphPanel.vue'
import AlterColumnDialog from '@/features/workspace/components/AlterColumnDialog.vue'
import TableStructureColumnsEditor from '@/features/workspace/components/TableStructureColumnsEditor.vue'
import ColumnLightLineagePanel from '@/features/workspace/components/ColumnLightLineagePanel.vue'
import VectorPreviewDialog from '@/features/workspace/components/VectorPreviewDialog.vue'
import {useTableDetail} from '@/features/workspace/composables/useTableDetail'
import {useTableRelations} from '@/features/workspace/composables/useTableRelations'
import {useShortcutPanelStore} from '@/features/layout/stores/shortcut-panel-store'
import {
  buildColumnLightLineage,
  summarizeLightLineageCounts,
  type LightLineageSummary,
} from '@/features/workspace/services/column-light-lineage.service'
import {isVectorColumnType} from '@/features/workspace/services/vector-preview-sql.service'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useTeamStore} from '@/features/team/stores/team-store'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {supportsAlterColumnWizard} from '@/features/workspace/services/alter-column-ddl.service'
import {executeAlterColumnSql} from '@/features/workspace/services/execute-alter-column.service'
import {parseColumnDataType} from '@/features/workspace/services/column-data-type-options.service'
import {supportsSqlExecute} from '@/shared/capabilities/db-type-capabilities'
import {useDatasourceCatalogStore} from '@/features/datasource/stores/datasource-catalog'
import {canDdlConnection} from '@/features/team/services/connection-access.service'
import {isProductionEnvironment} from '@/features/connection/services/connection-environment.service'
import type {ModalFeedback} from '@/core/composables/useModalFeedback'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const props = defineProps<{ tab: WorkspaceTab }>()
const {t} = useI18n()
const layout = useLayoutStore()
const explorer = useExplorerStore()
const workspace = useWorkspaceStore()
const teamStore = useTeamStore()
const auth = useAuthStore()
const catalogStore = useDatasourceCatalogStore()
const shortcutPanel = useShortcutPanelStore()

type TableView = NonNullable<WorkspaceTab['tableView']>
type TableSection = NonNullable<WorkspaceTab['tableSection']>

const views: TableView[] = ['properties', 'data', 'ddl', 'relations', 'relationGraph']
const sections: TableSection[] = ['columns', 'indexes', 'foreignKeys']

const activeView = computed({
  get: () => props.tab.tableView ?? 'properties',
  set: (value: TableView) => {
    props.tab.tableView = value
  },
})

const activeSection = computed({
  get: () => props.tab.tableSection ?? 'columns',
  set: (value: TableSection) => {
    props.tab.tableSection = value
  },
})

const shouldLoadViewDdlForLineage = computed(() =>
    (props.tab.relationKind ?? 'table') === 'view'
    && activeView.value === 'properties'
    && activeSection.value === 'columns',
)

const {
  properties,
  ddl,
  loadingProperties,
  loadingDdl,
  propertiesError,
  ddlError,
  loadProperties,
  loadDdl,
} = useTableDetail(props.tab, {
  shouldLoadDdl: () => activeView.value === 'ddl' || shouldLoadViewDdlForLineage.value,
})

const {relations} = useTableRelations(props.tab, {
  shouldLoad: () => activeView.value === 'properties' && activeSection.value === 'columns',
})

const lineageColumn = ref<string | null>(null)
const vectorPreviewColumn = ref<string | null>(null)

watch(shouldLoadViewDdlForLineage, (need) => {
  if (need && !ddl.value) void loadDdl()
})

const lineageInput = computed(() => ({
  tableName: props.tab.tableName ?? '',
  foreignKeys: properties.value.foreignKeys,
  relations: relations.value,
  viewDdl: (props.tab.relationKind ?? 'table') === 'view' ? ddl.value?.ddl : null,
  sqlLogs: shortcutPanel.sqlLogs,
}))

const lineageByColumn = computed(() => {
  const map = new Map<string, ReturnType<typeof summarizeLightLineageCounts>>()
  if (!lineageInput.value.tableName) return map
  for (const column of properties.value.columns) {
    map.set(
        column.name,
        summarizeLightLineageCounts(buildColumnLightLineage({
          ...lineageInput.value,
          column: column.name,
        })),
    )
  }
  return map
})

const activeLineageSummary = computed<LightLineageSummary | null>(() => {
  if (!lineageColumn.value || !lineageInput.value.tableName) return null
  return buildColumnLightLineage({
    ...lineageInput.value,
    column: lineageColumn.value,
  })
})

function lineageCountsFor(columnName: string) {
  return lineageByColumn.value.get(columnName) ?? {upstream: 0, downstream: 0, certain: 0, possible: 0}
}

function toggleLineage(columnName: string) {
  lineageColumn.value = lineageColumn.value === columnName ? null : columnName
}

function openVectorPreview(columnName: string) {
  vectorPreviewColumn.value = columnName
}

function openVectorPreviewSql(sql: string) {
  vectorPreviewColumn.value = null
  void workspace.openConsole({
    connectionId: props.tab.connectionId,
    database: props.tab.database,
    instanceId: props.tab.instanceId,
    sql,
    title: t('workspace.tableDetail.vectorPreview.consoleTitle', {
      table: props.tab.tableName ?? '',
    }),
  })
}

const alterColumnOpen = ref(false)
const alterExecuting = ref(false)
const alterActionFeedback = ref<ModalFeedback | null>(null)

const connectionNode = computed(() => {
  if (!props.tab.connectionId) return undefined
  return explorer.findNode(props.tab.connectionId)
})

const connectionDbType = computed(() => connectionNode.value?.dbType)

const canAlterColumn = computed(() => {
  if ((props.tab.relationKind ?? 'table') !== 'table') return false
  if (!supportsAlterColumnWizard(connectionDbType.value)) return false
  return supportsSqlExecute(connectionDbType.value, catalogStore.items)
})

const canExecuteAlter = computed(() => {
  if (auth.isGuest) return false
  if (!props.tab.connectionId) return false
  return canDdlConnection(props.tab.connectionId, teamStore.teams)
})

const alterExecuteDisabledHint = computed(() => {
  if (auth.isGuest) return t('workspace.tableDetail.alterColumn.guestDenied')
  if (!canExecuteAlter.value) return t('workspace.tableDetail.alterColumn.writeDenied')
  return undefined
})

const alterProductionEnv = computed(() =>
    isProductionEnvironment(connectionNode.value?.env, connectionNode.value?.envCustom),
)

const databaseName = computed(() => props.tab.database?.trim() || undefined)

/** Design-mode column editor when dialect + DDL permission allow. */
const canDesignColumns = computed(() => canAlterColumn.value && canExecuteAlter.value)

function columnTypeParts(column: {dataType?: string | null}) {
  return parseColumnDataType(column.dataType || '')
}

function openAlterSqlInConsole(sql: string) {
  void workspace.openConsole({
    connectionId: props.tab.connectionId,
    instanceId: props.tab.instanceId,
    database: databaseName.value,
    sql,
  })
}

async function executeAlterColumn(sql: string) {
  if (!props.tab.connectionId || alterExecuting.value) return
  if (!canExecuteAlter.value) {
    alterActionFeedback.value = {
      variant: 'warning',
      message: alterExecuteDisabledHint.value ?? t('workspace.tableDetail.alterColumn.writeDenied'),
    }
    return
  }
  alterExecuting.value = true
  alterActionFeedback.value = null
  try {
    const result = await executeAlterColumnSql(sql, {
      connectionId: props.tab.connectionId,
      database: databaseName.value,
      dbType: connectionDbType.value,
    })
    if (!result.ok) {
      alterActionFeedback.value = {
        variant: 'error',
        message: t('workspace.tableDetail.alterColumn.failedWithDetail', {message: result.message}),
      }
      layout.showErrorToast(
          t('workspace.tableDetail.alterColumn.failedWithDetail', {message: result.message}),
      )
      return
    }
    alterColumnOpen.value = false
    await loadProperties()
    if (activeView.value === 'ddl') {
      await loadDdl()
    }
    workspace.bumpTableDataRefresh(props.tab.id)
    layout.showSuccessToast(t('workspace.tableDetail.alterColumn.success'))
  } catch (error) {
    const message = resolveCaughtApiErrorMessage(error, t, 'workspace.tableDetail.alterColumn.failed')
    alterActionFeedback.value = {
      variant: 'error',
      message: t('workspace.tableDetail.alterColumn.failedWithDetail', {message}),
    }
    layout.showErrorToast(t('workspace.tableDetail.alterColumn.failedWithDetail', {message}))
  } finally {
    alterExecuting.value = false
  }
}

async function onStructureApplied() {
  await loadProperties()
  if (activeView.value === 'ddl') {
    await loadDdl()
  }
  workspace.bumpTableDataRefresh(props.tab.id)
}

watch(
    activeView,
    (view) => {
      if (view === 'ddl') {
        void loadDdl()
      }
    },
    {immediate: true},
)

const tableTitle = computed(() => properties.value.tableName || props.tab.tableName || '—')

const tableComment = computed(() => properties.value.comment?.trim() || '')

const statFields = computed(() => {
  const p = properties.value
  return [
    {key: 'engine', value: p.engine, icon: 'engine'},
    {key: 'autoIncrement', value: p.autoIncrement, icon: 'counter'},
    {key: 'charset', value: p.charset, icon: 'charset'},
    {key: 'collation', value: p.collation, icon: 'collation'},
  ].filter((item) => item.value)
})

const sectionCounts = computed(() => ({
  columns: properties.value.columns.length,
  indexes: properties.value.indexes.length,
  foreignKeys: properties.value.foreignKeys.length,
}))

const activeSectionCount = computed(() => sectionCounts.value[activeSection.value])

const ddlLineCount = computed(() => {
  const text = ddl.value?.ddl?.trim()
  if (!text) return 0
  return text.split('\n').length
})

function keyTypeVariant(keyType?: string | null): StatusVariant {
  const normalized = (keyType ?? '').trim().toUpperCase()
  if (normalized === 'PRI') return 'warn'
  if (normalized === 'UNI') return 'primary'
  return 'neutral'
}

function onDdlCopied(ok: boolean) {
  if (ok) {
    layout.showSuccessToast(t('workspace.tableDetail.copyDdlSuccess'))
  } else {
    layout.showErrorToast(t('workspace.tableDetail.copyDdlFailed'))
  }
}
</script>

<template>
  <div class="table-detail dw-workbench-page" data-wb-recipe="wb-extension">
    <header class="table-detail__header">
      <nav class="table-detail__views" :aria-label="t('workspace.tableDetail.views')">
        <button
            v-for="view in views"
            :key="view"
            type="button"
            class="table-detail__view-btn"
            :class="{ active: activeView === view }"
            @click="activeView = view"
        >
          {{ t(`workspace.tableDetail.${view}`) }}
        </button>
      </nav>
    </header>

    <div v-if="activeView === 'properties'" class="table-detail__properties">
      <DwPanelState
          v-if="loadingProperties"
          status="loading"
          fill
          :message="t('workspace.tableDetail.loading')"
      />
      <DwPanelState
          v-else-if="propertiesError"
          status="error"
          fill
          :message="propertiesError"
      />
      <template v-else>
        <section class="table-detail__hero">
          <div class="table-detail__hero-icon" aria-hidden="true">
            <DwIcon name="table" size="lg" :stroke-width="1.5"/>
          </div>
          <div class="table-detail__hero-text">
            <span class="table-detail__hero-kind">{{ t('workspace.tableDetail.tableObject') }}</span>
            <h2 class="table-detail__hero-title">{{ tableTitle }}</h2>
            <p v-if="tableComment" class="table-detail__hero-desc">{{ tableComment }}</p>
            <p v-else class="table-detail__hero-desc table-detail__hero-desc--muted">
              {{ t('workspace.tableDetail.noDescription') }}
            </p>
          </div>
        </section>

        <div v-if="statFields.length" class="table-detail__stats">
          <article
              v-for="field in statFields"
              :key="field.key"
              class="table-detail__stat"
          >
            <span class="table-detail__stat-label">{{ t(`workspace.tableDetail.${field.key}`) }}</span>
            <span class="table-detail__stat-value">{{ field.value }}</span>
          </article>
        </div>

        <div class="table-detail__properties-body">
          <aside class="table-detail__sidebar">
            <button
                v-for="section in sections"
                :key="section"
                type="button"
                class="table-detail__section-btn"
                :class="{ active: activeSection === section }"
                @click="activeSection = section"
            >
              <span class="table-detail__section-label">
                <DwIcon v-if="section === 'columns'" name="comment-column" size="sm" :stroke-width="1.2"/>
                <DwIcon v-else-if="section === 'indexes'" name="list-ordered" size="sm" :stroke-width="1.2"/>
                <DwIcon v-else name="link" size="sm" :stroke-width="1.2"/>
                {{ t(`workspace.tableDetail.${section}`) }}
              </span>
              <span class="table-detail__section-badge">{{ sectionCounts[section] }}</span>
            </button>
          </aside>

          <section class="table-detail__panel">
            <header class="table-detail__panel-head">
              <h3>{{ t(`workspace.tableDetail.${activeSection}`) }}</h3>
              <div class="table-detail__panel-actions">
                <span class="table-detail__panel-count">
                  {{ t('workspace.tableDetail.itemCount', {count: activeSectionCount}) }}
                </span>
              </div>
            </header>

            <ColumnLightLineagePanel
                v-if="activeSection === 'columns'"
                :summary="activeLineageSummary"
                @close="lineageColumn = null"
            />

            <TableStructureColumnsEditor
                v-if="activeSection === 'columns' && canDesignColumns"
                :columns="properties.columns"
                :db-type="connectionDbType"
                :table-name="properties.tableName || tab.tableName || ''"
                :database="databaseName"
                :connection-id="tab.connectionId"
                :can-execute="canExecuteAlter"
                :execute-disabled-hint="alterExecuteDisabledHint"
                :production-env="alterProductionEnv"
                :lineage-column="lineageColumn"
                :lineage-counts-for="lineageCountsFor"
                :show-vector-for="isVectorColumnType"
                @applied="onStructureApplied"
                @toggle-lineage="toggleLineage"
                @open-vector="openVectorPreview"
            />

            <div
                v-else-if="activeSection === 'columns'"
                class="table-detail__grid-wrap"
            >
              <table class="table-detail__grid">
                <thead>
                <tr>
                  <th class="col-narrow">#</th>
                  <th class="col-name">{{ t('workspace.tableDetail.columnName') }}</th>
                  <th class="col-lineage">{{ t('workspace.tableDetail.lightLineage.column') }}</th>
                  <th class="col-data-type">{{ t('workspace.tableDetail.dataType') }}</th>
                  <th class="col-length">{{ t('workspace.tableDetail.length') }}</th>
                  <th class="col-scale">{{ t('workspace.tableDetail.scale') }}</th>
                  <th class="col-center col-flag">{{ t('workspace.tableDetail.nullable') }}</th>
                  <th class="col-center col-flag">{{ t('workspace.tableDetail.autoIncrement') }}</th>
                  <th class="col-key">{{ t('workspace.tableDetail.key') }}</th>
                  <th class="col-default">{{ t('workspace.tableDetail.default') }}</th>
                  <th class="col-extra">{{ t('workspace.tableDetail.extra') }}</th>
                  <th class="col-comment">{{ t('workspace.tableDetail.comment') }}</th>
                </tr>
                </thead>
                <tbody>
                <tr v-for="column in properties.columns" :key="column.name">
                  <td class="col-narrow col-muted">{{ column.ordinal }}</td>
                  <td class="mono col-name" :title="column.name">{{ column.name }}</td>
                  <td class="col-lineage">
                    <button
                        type="button"
                        class="table-detail__lineage-btn"
                        :class="{ 'is-active': lineageColumn === column.name }"
                        :title="t('workspace.tableDetail.lightLineage.open')"
                        @click="toggleLineage(column.name)"
                    >
                      {{ t('workspace.tableDetail.lightLineage.counts', {
                        up: lineageCountsFor(column.name).upstream,
                        down: lineageCountsFor(column.name).downstream,
                      }) }}
                    </button>
                    <button
                        v-if="isVectorColumnType(column.dataType)"
                        type="button"
                        class="table-detail__lineage-btn"
                        :title="t('workspace.tableDetail.vectorPreview.open')"
                        @click="openVectorPreview(column.name)"
                    >
                      {{ t('workspace.tableDetail.vectorPreview.short') }}
                    </button>
                  </td>
                  <td class="mono col-data-type">
                    {{ columnTypeParts(column).baseType || column.dataType }}
                  </td>
                  <td class="mono col-length col-muted">
                    {{ columnTypeParts(column).length || '—' }}
                  </td>
                  <td class="mono col-scale col-muted">
                    {{ columnTypeParts(column).scale || '—' }}
                  </td>
                  <td class="col-center col-flag">
                    <StatusPill
                        v-if="!column.nullable"
                        variant="success"
                        :title="t('workspace.tableDetail.nullable')"
                    >
                      ✓
                    </StatusPill>
                    <span v-else class="col-muted">—</span>
                  </td>
                  <td class="col-center col-flag">
                    <StatusPill v-if="column.autoIncrement" variant="primary">✓</StatusPill>
                  </td>
                  <td class="col-key">
                    <StatusPill v-if="column.keyType" :variant="keyTypeVariant(column.keyType)">
                      {{ column.keyType }}
                    </StatusPill>
                  </td>
                  <td
                      class="mono col-muted col-default"
                      :title="column.defaultValue != null ? String(column.defaultValue) : undefined"
                  >
                    {{ column.defaultValue ?? '—' }}
                  </td>
                  <td class="mono col-muted col-extra" :title="column.extra || undefined">
                    {{ column.extra ?? '—' }}
                  </td>
                  <td class="col-comment" :title="column.comment || undefined">
                    {{ column.comment || '—' }}
                  </td>
                </tr>
                <tr v-if="!properties.columns.length">
                  <td colspan="12">
                    <EmptyState embedded compact :title="t('workspace.tableDetail.emptySection')"/>
                  </td>
                </tr>
                </tbody>
              </table>
            </div>

            <div v-else-if="activeSection === 'indexes'" class="table-detail__grid-wrap">
              <table class="table-detail__grid">
                <thead>
                <tr>
                  <th>{{ t('workspace.tableDetail.indexName') }}</th>
                  <th class="col-center">{{ t('workspace.tableDetail.unique') }}</th>
                  <th>{{ t('workspace.tableDetail.columns') }}</th>
                </tr>
                </thead>
                <tbody>
                <tr v-for="index in properties.indexes" :key="index.name">
                  <td class="mono col-name">{{ index.name }}</td>
                  <td class="col-center">
                    <StatusPill :variant="index.unique ? 'primary' : 'neutral'">
                      {{ index.unique ? t('workspace.tableDetail.uniqueYes') : t('workspace.tableDetail.uniqueNo') }}
                    </StatusPill>
                  </td>
                  <td class="mono">{{ index.columns }}</td>
                </tr>
                <tr v-if="!properties.indexes.length">
                  <td colspan="3">
                    <EmptyState embedded compact :title="t('workspace.tableDetail.emptySection')"/>
                  </td>
                </tr>
                </tbody>
              </table>
            </div>

            <div v-else class="table-detail__grid-wrap">
              <table class="table-detail__grid">
                <thead>
                <tr>
                  <th>{{ t('workspace.tableDetail.fkName') }}</th>
                  <th>{{ t('workspace.tableDetail.columns') }}</th>
                  <th>{{ t('workspace.tableDetail.referenceTable') }}</th>
                  <th>{{ t('workspace.tableDetail.referenceColumns') }}</th>
                </tr>
                </thead>
                <tbody>
                <tr v-for="fk in properties.foreignKeys" :key="fk.name + fk.columns">
                  <td class="mono col-name">{{ fk.name }}</td>
                  <td class="mono">{{ fk.columns }}</td>
                  <td class="mono">{{ fk.referenceTable }}</td>
                  <td class="mono">{{ fk.referenceColumns || '—' }}</td>
                </tr>
                <tr v-if="!properties.foreignKeys.length">
                  <td colspan="4">
                    <EmptyState embedded compact :title="t('workspace.tableDetail.emptySection')"/>
                  </td>
                </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </template>
    </div>

    <TableDataTab v-else-if="activeView === 'data'" class="table-detail__data" :tab="tab"/>

    <TableRelationsPanel v-else-if="activeView === 'relations'" :tab="tab"/>

    <TableRelationGraphPanel v-else-if="activeView === 'relationGraph'" :tab="tab"/>

    <section v-else-if="activeView === 'ddl'" class="table-detail__ddl">
      <DwPanelState
          v-if="loadingDdl"
          status="loading"
          fill
          :message="t('workspace.tableDetail.loading')"
      />
      <DwPanelState
          v-else-if="ddlError"
          status="error"
          fill
          :message="ddlError"
      />
      <DwCodeViewer
          v-else-if="ddl?.ddl"
          class="table-detail__ddl-viewer"
          :content="ddl.ddl"
          language="sql"
          :title="t('workspace.tableDetail.ddlTitle', {name: tableTitle})"
          :subtitle="t('workspace.tableDetail.ddlLines', {count: ddlLineCount})"
          :empty-text="t('workspace.tableDetail.noDdl')"
          dark
          readonly
          @copied="onDdlCopied"
      />
      <DwPanelState
          v-else
          status="empty"
          :message="t('workspace.tableDetail.noDdl')"
      />
    </section>

    <AlterColumnDialog
        v-model:open="alterColumnOpen"
        :db-type="connectionDbType"
        :table-name="properties.tableName || tab.tableName || ''"
        :database="databaseName"
        :columns="properties.columns"
        :can-execute="canExecuteAlter"
        :execute-disabled-hint="alterExecuteDisabledHint"
        :executing="alterExecuting"
        :production-env="alterProductionEnv"
        :action-feedback="alterActionFeedback"
        @open-console="openAlterSqlInConsole"
        @execute="executeAlterColumn"
        @clear-action-feedback="alterActionFeedback = null"
    />

    <VectorPreviewDialog
        :open="!!vectorPreviewColumn"
        :db-type="connectionDbType"
        :database="tab.database"
        :table-name="tab.tableName ?? ''"
        :column-name="vectorPreviewColumn ?? ''"
        @close="vectorPreviewColumn = null"
        @open-sql="openVectorPreviewSql"
    />

  </div>
</template>

<style scoped>
.table-detail {
  min-height: 0;
  min-width: 0;
}

.table-detail__header {
  flex-shrink: 0;
  border-bottom: 1px solid var(--dw-border-light);
  background: var(--dw-wb-card-bg);
}

.table-detail__views {
  display: flex;
  gap: var(--dw-gap-xs);
  padding: var(--dw-space-4) var(--dw-space-6) 0;
}

.table-detail__view-btn {
  position: relative;
  padding: var(--dw-space-3) var(--dw-space-7) var(--dw-space-4);
  border: none;
  border-radius: var(--dw-control-radius) var(--dw-control-radius) 0 0;
  background: transparent;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
  font-weight: 500;
  cursor: pointer;
}

.table-detail__view-btn:hover {
  color: var(--dw-text-primary);
  background: color-mix(in srgb, var(--dw-bg-muted) 70%, transparent);
}

.table-detail__view-btn.active {
  color: var(--dw-primary);
  background: var(--dw-bg-editor);
  font-weight: 600;
}

.table-detail__view-btn.active::after {
  content: '';
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 0;
  height: 2px;
  border-radius: var(--dw-radius-xs) var(--dw-radius-xs) 0 0;
  background: var(--dw-primary);
}

.table-detail__properties {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: var(--dw-space-6);
  padding: var(--dw-space-6);
  overflow: auto;
}

.table-detail__hero {
  display: flex;
  align-items: flex-start;
  gap: var(--dw-space-6);
  padding: var(--dw-space-7) var(--dw-space-8);
  border: 1px solid var(--dw-wb-card-border);
  border-radius: var(--dw-panel-radius);
  background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--dw-primary) 7%, var(--dw-bg-panel)) 0%,
      var(--dw-bg-panel) 58%
  );
  box-shadow: var(--dw-panel-shadow);
}

.table-detail__hero-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--dw-density-lg);
  height: var(--dw-density-lg);
  border-radius: var(--dw-control-radius);
  background: var(--dw-primary-soft);
  color: var(--dw-primary);
}

.table-detail__hero-text {
  min-width: 0;
}

.table-detail__hero-kind {
  display: block;
  margin-bottom: var(--dw-space-1);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.table-detail__hero-title {
  margin: 0;
  font-size: var(--dw-text-2xl);
  font-weight: 650;
  line-height: var(--dw-leading-snug);
  word-break: break-all;
}

.table-detail__hero-desc {
  margin: var(--dw-space-3) 0 0;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-relaxed);
}

.table-detail__hero-desc--muted {
  color: var(--dw-text-muted);
  font-style: italic;
}

.table-detail__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--dw-gap);
}

.table-detail__stat {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-xs);
  padding: var(--dw-pad-control-lg);
  border: 1px solid var(--dw-wb-card-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-wb-card-bg);
}

.table-detail__stat-label {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.table-detail__stat-value {
  font-family: var(--dw-mono);
  font-size: var(--dw-text-sm);
  font-weight: 500;
  line-height: var(--dw-leading-snug);
  word-break: break-word;
}

.table-detail__properties-body {
  display: flex;
  flex: 1;
  min-height: 280px;
  border: 1px solid var(--dw-wb-card-border);
  border-radius: var(--dw-panel-radius);
  overflow: hidden;
  background: var(--dw-wb-card-bg);
  box-shadow: var(--dw-panel-shadow);
}

.table-detail__sidebar {
  flex-shrink: 0;
  width: 148px;
  padding: var(--dw-space-5);
  background: color-mix(in srgb, var(--dw-bg-muted) 35%, var(--dw-bg-panel));
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-xs);
}

.table-detail__section-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
  width: 100%;
  padding: var(--dw-pad-control);
  border: 1px solid transparent;
  border-radius: var(--dw-wb-card-radius);
  box-shadow: var(--dw-wb-card-shadow);
  background: transparent;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
  text-align: left;
  cursor: pointer;
}

.table-detail__section-btn:hover {
  background: var(--dw-bg-muted);
  color: var(--dw-text-primary);
}

.table-detail__section-btn.active {
  border-color: color-mix(in srgb, var(--dw-primary) 22%, var(--dw-border-light));
  background: var(--dw-wb-card-bg);
  color: var(--dw-primary);
  box-shadow: var(--dw-shadow-xs);
}

.table-detail__section-label {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-3);
  min-width: 0;
}

.table-detail__section-label .dw-icon-root {
  flex-shrink: 0;
  opacity: 0.85;
}

.table-detail__section-badge {
  flex-shrink: 0;
  min-width: var(--dw-icon-size-xl);
  padding: var(--dw-space-1) var(--dw-space-3);
  border-radius: var(--dw-radius-pill);
  background: var(--dw-bg-muted);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  text-align: center;
}

.table-detail__section-btn.active .table-detail__section-badge {
  background: var(--dw-primary-soft);
  color: var(--dw-primary);
}

.table-detail__panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.table-detail__panel :deep(.structure-editor) {
  flex: 1;
  min-height: 0;
  padding: 8px 12px 10px;
}

.table-detail__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap-md);
  padding: var(--dw-space-5) var(--dw-space-7);
  border-bottom: 1px solid var(--dw-border-light);
  background: color-mix(in srgb, var(--dw-bg-muted) 25%, var(--dw-bg-panel));
}

.table-detail__panel-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  flex-shrink: 0;
}

.table-detail__panel-head h3 {
  margin: 0;
  font-size: var(--dw-text-md);
  font-weight: 600;
}

.table-detail__panel-count {
  padding: var(--dw-pad-chip);
  border-radius: var(--dw-radius-pill);
  background: var(--dw-bg-muted);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
}

.table-detail__inline-hint {
  margin: 0;
  padding: 0 var(--dw-space-7) var(--dw-space-3);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-snug);
}

.table-detail__inline-confirm-preview {
  margin-top: var(--dw-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
}

.table-detail__inline-confirm-preview header {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
}

.table-detail__inline-confirm-preview pre {
  margin: 0;
  padding: var(--dw-space-4) var(--dw-space-5);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-editor);
  color: var(--dw-text-primary);
  font-family: var(--dw-mono);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-relaxed);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 12rem;
  overflow: auto;
}

.table-detail__grid-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.table-detail__grid {
  width: max-content;
  min-width: 100%;
  table-layout: auto;
  border-collapse: collapse;
  font-size: var(--dw-text-sm);
}

.table-detail__grid th,
.table-detail__grid td {
  padding: var(--dw-space-4) var(--dw-space-6);
  border-bottom: 1px solid var(--dw-border-light);
  text-align: left;
  vertical-align: middle;
  white-space: nowrap;
}

.table-detail__grid th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--dw-wb-card-bg);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
}

.table-detail__grid tbody tr:nth-child(even) {
  background: color-mix(in srgb, var(--dw-bg-muted) 28%, transparent);
}

.table-detail__grid tbody tr:hover {
  background: color-mix(in srgb, var(--dw-primary) 5%, var(--dw-bg-panel));
}

.table-detail__grid tbody tr.is-inline-busy {
  opacity: 0.7;
  pointer-events: none;
}

.table-detail__grid td.is-editable {
  position: relative;
  cursor: text;
}

.table-detail__grid td.is-editable:hover:not(.is-editing) {
  background: color-mix(in srgb, var(--dw-primary) 8%, transparent);
}

.table-detail__grid td.is-editing {
  z-index: 2;
  color: var(--dw-text-primary);
  background: var(--dw-bg-editor);
}

.table-detail__grid td.col-data-type.is-editing {
  min-width: 7.5rem;
}

.table-detail__grid td.col-length.is-editing,
.table-detail__grid td.col-scale.is-editing {
  min-width: 3.5rem;
}

.table-detail__grid td.col-length.is-editable,
.table-detail__grid td.col-scale.is-editable {
  cursor: text;
}

.table-detail__cell-text {
  display: block;
  line-height: 1.5;
}

.table-detail__cell-text.is-ghost {
  visibility: hidden;
}

.table-detail__type-text {
  color: var(--dw-info);
  font-weight: 600;
}

.table-detail__cell-input {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: inherit;
  border: 0;
  border-radius: 0;
  background: var(--dw-bg-editor);
  color: inherit;
  font: inherit;
  font-size: inherit;
  font-weight: inherit;
  font-family: inherit;
  letter-spacing: inherit;
  line-height: 1.5;
  outline: none;
  box-shadow: inset 0 0 0 1px var(--dw-primary);
  appearance: none;
  -webkit-appearance: none;
}

.table-detail__cell-input.mono {
  font-family: var(--dw-mono);
}

.table-detail__grid .mono {
  font-family: var(--dw-mono);
}

.table-detail__grid .col-narrow {
  width: 2.25rem;
  min-width: 2.25rem;
  text-align: center;
  color: var(--dw-text-muted);
}

.table-detail__grid .col-name {
  min-width: 7rem;
  font-weight: 600;
  color: var(--dw-text-primary);
}

.table-detail__grid .col-data-type {
  min-width: 5.5rem;
}

.table-detail__grid .col-length,
.table-detail__grid .col-scale {
  width: 3.5rem;
  min-width: 3.5rem;
  text-align: center;
  color: var(--dw-text-secondary);
  font-variant-numeric: tabular-nums;
}

.table-detail__grid .col-length.is-empty,
.table-detail__grid .col-scale.is-empty {
  color: var(--dw-text-muted);
}

.table-detail__grid .col-length.is-editable:not(.is-empty),
.table-detail__grid .col-scale.is-editable:not(.is-empty) {
  color: var(--dw-text-primary);
}

.table-detail__cell-input--num {
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.table-detail__grid .col-flag {
  width: 3.25rem;
  min-width: 3.25rem;
  text-align: center;
}

.table-detail__grid .col-key {
  width: 3.5rem;
  min-width: 3.5rem;
  text-align: center;
}

.table-detail__grid .col-default,
.table-detail__grid .col-extra,
.table-detail__grid .col-comment {
  min-width: 4.5rem;
}

.table-detail__grid .col-center,
.col-center {
  text-align: center;
}

.table-detail__grid .col-muted {
  color: var(--dw-text-secondary);
}

.table-detail__grid-wrap :deep(.dw-empty--compact) {
  min-height: 80px;
  padding: var(--dw-space-8) var(--dw-space-6);
}

.table-detail__data {
  flex: 1;
  min-height: 0;
}

.table-detail__ddl {
  flex: 1;
  min-height: 0;
  padding: var(--dw-space-6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.table-detail__ddl-viewer {
  flex: 1;
  min-height: 0;
  height: 100%;
  box-shadow: var(--dw-panel-shadow);
}

.table-detail__ddl-viewer :deep(.dw-code-viewer__body),
.table-detail__ddl-viewer :deep(.monaco-host) {
  min-height: 0;
  height: 100%;
}

.table-detail__grid .col-lineage {
  width: 88px;
  white-space: nowrap;
}

.table-detail__lineage-btn {
  border: 1px solid color-mix(in srgb, var(--dw-text) 12%, transparent);
  border-radius: var(--dw-radius-pill);
  background: transparent;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  font-variant-numeric: tabular-nums;
  padding: 2px 8px;
  cursor: pointer;
}

.table-detail__lineage-btn:hover,
.table-detail__lineage-btn.is-active {
  border-color: color-mix(in srgb, var(--dw-text) 28%, transparent);
  color: var(--dw-text);
  background: color-mix(in srgb, var(--dw-text) 6%, transparent);
}
</style>
