<script setup lang="ts">
import {computed, markRaw, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwCheckbox, DwInput, DwPanelState} from '@/core/components'
import {DwIcon} from '@/core/icons'
import {
  DwGraphCanvas,
  type GraphCanvasEdge,
  type GraphCanvasNode,
  type NodeTypesObject,
} from '@/core/graph-canvas'
import SchemaErTableFlowNode from '@/features/workspace/components/SchemaErTableFlowNode.vue'
import type {DbType, WorkspaceTab} from '@/core/types'
import type {ModalFeedback} from '@/core/composables/useModalFeedback'
import {findNodeById} from '@/core/utils/tree'
import {useSchemaErColumns} from '@/features/workspace/composables/useSchemaErColumns'
import {useSchemaRelations} from '@/features/workspace/composables/useSchemaRelations'
import {
  buildSchemaRelationGraph,
  hasSchemaErGraphContent,
  layoutSchemaRelationGraphPositions,
  schemaErHiddenColumnCount,
  schemaErNodeHeight,
  schemaErNodeTitle,
  schemaErVisibleColumns,
  SCHEMA_ER_NODE_WIDTH,
} from '@/features/workspace/services/schema-relation-graph.service'
import {
  type RelationGraphPoint,
  type TableRelationGraphColumn,
  type TableRelationGraphEdge,
  type TableRelationGraphNode,
} from '@/features/workspace/services/table-relation-graph.service'
import {
  buildSchemaErModelSvg,
  downloadSchemaErPngFromSvgXml,
  downloadSchemaErSvgXml,
} from '@/features/workspace/services/schema-er-model-export.service'
import {
  buildAddForeignKeySql,
  buildDropForeignKeySql,
  type SchemaErFkDraft,
} from '@/features/workspace/services/schema-er-fk-ddl.service'
import {
  supportsAlterColumnWizard,
  buildBatchAlterColumnDdl,
  buildBatchCommentColumnDdl,
  parseBatchAddColumnLines,
  parseBatchModifyColumnLines,
  parseBatchRenameColumnLines,
  parseBatchCommentColumnLines,
  type AlterColumnOperation,
} from '@/features/workspace/services/alter-column-ddl.service'
import {executeAlterColumnSql} from '@/features/workspace/services/execute-alter-column.service'
import SchemaErFkDdlDialog from '@/features/workspace/components/SchemaErFkDdlDialog.vue'
import SchemaErBatchAlterDdlDialog from '@/features/workspace/components/SchemaErBatchAlterDdlDialog.vue'
import AlterColumnDialog from '@/features/workspace/components/AlterColumnDialog.vue'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useTeamStore} from '@/features/team/stores/team-store'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useDatasourceCatalogStore} from '@/features/datasource/stores/datasource-catalog'
import {supportsSqlExecute} from '@/shared/capabilities/db-type-capabilities'
import {canDdlConnection} from '@/features/team/services/connection-access.service'
import {isProductionEnvironment} from '@/features/connection/services/connection-environment.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const props = defineProps<{ tab: WorkspaceTab }>()
const {t} = useI18n()
const layoutStore = useLayoutStore()
const workspace = useWorkspaceStore()
const explorer = useExplorerStore()
const teamStore = useTeamStore()
const auth = useAuthStore()
const catalogStore = useDatasourceCatalogStore()

const {schema, loading, error, databaseName} = useSchemaRelations(props.tab, {
  shouldLoad: () => true,
})

const baseGraph = computed(() => buildSchemaRelationGraph(schema.value, props.tab.tableName))
const {enrichedGraph, columnsByTable, loadingColumns, reloadColumns} = useSchemaErColumns(
    props.tab,
    baseGraph,
    schema,
    databaseName,
)

const hasContent = computed(() => hasSchemaErGraphContent(enrichedGraph.value))
const isLoading = computed(() => loading.value || loadingColumns.value)

const layout = computed(() => layoutSchemaRelationGraphPositions(enrichedGraph.value))
const canvasWidth = computed(() => layout.value.width)
const canvasHeight = computed(() => layout.value.height)
const positions = ref<Record<string, RelationGraphPoint>>({})
const locked = ref(false)
const canvasRef = ref<{fitView: (o?: object) => void; zoomIn: () => void; zoomOut: () => void} | null>(null)
const flowNodes = ref<GraphCanvasNode[]>([])
const flowEdges = ref<GraphCanvasEdge[]>([])
const nodeTypes = {'er-table': markRaw(SchemaErTableFlowNode)} as NodeTypesObject
const FLOW_ID = 'schema-er-flow'

const linkMode = ref(false)
const selectedEdgeId = ref<string | null>(null)
const selectedColumnTarget = ref<{table: string; column: string} | null>(null)
const linkFrom = ref<{nodeId: string; table: string; column: string} | null>(null)
const fkDialogOpen = ref(false)
const fkDialogTitle = ref('')
const fkDialogSql = ref('')
const fkDialogSummary = ref<string[]>([])

const alterColumnOpen = ref(false)
const alterTableName = ref('')
const alterInitialOperation = ref<AlterColumnOperation>('modify')
const alterInitialColumnName = ref('')
const alterExecuting = ref(false)
const alterActionFeedback = ref<ModalFeedback | null>(null)

const batchSelectedColumns = ref<Set<string>>(new Set())
const batchDdlOpen = ref(false)
const batchDdlTitle = ref('')
const batchDdlSql = ref('')
const batchDdlSummary = ref<string[]>([])
const batchAddDraft = ref('note VARCHAR(64)\nlegacy_flag INT')
const batchRenameDraft = ref('old_name new_name')
const batchCommentDraft = ref("note: customer memo\nflag IS active flag")

const dbType = computed<DbType | undefined>(() => {
  if (props.tab.dbType) return props.tab.dbType
  const connectionId = props.tab.connectionId
  if (!connectionId) return undefined
  return findNodeById(explorer.tree, connectionId)?.dbType
})

const connectionNode = computed(() => {
  if (!props.tab.connectionId) return undefined
  return findNodeById(explorer.tree, props.tab.connectionId)
})

const canAlterColumn = computed(() => {
  if (!supportsAlterColumnWizard(dbType.value)) return false
  return supportsSqlExecute(dbType.value, catalogStore.items)
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

const alterDialogColumns = computed(
    () => columnsByTable.value.get(alterTableName.value) ?? [],
)

const inspectorTableColumns = computed(() => {
  const table = selectedColumnTarget.value?.table
  if (!table) return []
  return columnsByTable.value.get(table) ?? []
})

const batchSelectionCount = computed(() => batchSelectedColumns.value.size)

const canGenerateBatchDdl = computed(
    () => canAlterColumn.value && batchSelectionCount.value > 0,
)

watch(
    layout,
    (next) => {
      positions.value = {...next.positions}
      syncFlowGraph()
    },
    {immediate: true},
)

watch(
    [linkMode, linkFrom, selectedColumnTarget, selectedEdgeId, locked, enrichedGraph],
    () => syncFlowGraph(),
    {deep: true},
)

watch(linkMode, (enabled) => {
  if (!enabled) linkFrom.value = null
})

const nodeById = computed(() => {
  const map = new Map<string, TableRelationGraphNode>()
  for (const node of enrichedGraph.value.nodes) {
    map.set(node.id, node)
  }
  return map
})

const selectedEdge = computed(() =>
    enrichedGraph.value.edges.find((edge) => edge.id === selectedEdgeId.value) ?? null,
)

const selectedEdgeDraft = computed<SchemaErFkDraft | null>(() => {
  const edge = selectedEdge.value
  if (!edge) return null
  const fromNode = nodeById.value.get(edge.fromNodeId)
  const toNode = nodeById.value.get(edge.toNodeId)
  if (!fromNode || !toNode) return null
  return {
    sourceTable: fromNode.tableName,
    sourceColumn: edge.sourceColumn,
    targetTable: toNode.tableName,
    targetColumn: edge.targetColumn,
    constraintName: edge.constraintName,
  }
})

function resetLayout() {
  positions.value = {...layout.value.positions}
  syncFlowGraph()
  canvasRef.value?.fitView({padding: 0.12})
}

function fitView() {
  canvasRef.value?.fitView({padding: 0.12})
}

function zoomIn() {
  canvasRef.value?.zoomIn()
}

function zoomOut() {
  canvasRef.value?.zoomOut()
}

const exportBaseName = computed(() =>
    `er_${databaseName.value || enrichedGraph.value.centerTableName || 'schema'}`,
)

function buildExportModel() {
  const nodes = enrichedGraph.value.nodes.map((node) => {
    const pos = positions.value[node.id] ?? {x: 0, y: 0}
    const cols = schemaErVisibleColumns(node)
    return {
      x: pos.x,
      y: pos.y,
      width: SCHEMA_ER_NODE_WIDTH,
      height: schemaErNodeHeight(node),
      title: truncateText(schemaErNodeTitle(node), 28),
      columns: cols.map((column) => ({
        name: column.name,
        typeLabel: columnTypeLabel(column),
        comment: column.comment,
      })),
    }
  })
  const edges = enrichedGraph.value.edges.map((edge) => {
    const from = positions.value[edge.fromNodeId] ?? {x: 0, y: 0}
    const to = positions.value[edge.toNodeId] ?? {x: 0, y: 0}
    return {
      x1: from.x + SCHEMA_ER_NODE_WIDTH,
      y1: from.y + 40,
      x2: to.x,
      y2: to.y + 40,
      label: edge.label,
    }
  })
  return {
    width: Math.max(canvasWidth.value, 800),
    height: Math.max(canvasHeight.value, 600),
    nodes,
    edges,
  }
}

function exportSvg() {
  try {
    const xml = buildSchemaErModelSvg(buildExportModel())
    downloadSchemaErSvgXml(xml, exportBaseName.value)
    layoutStore.showSuccessToast(t('workspace.schemaEr.exportSvgDone'))
  } catch (error) {
    const message = resolveCaughtApiErrorMessage(error, t, 'workspace.schemaEr.exportFailed')
    layoutStore.showErrorToast(message)
  }
}

async function exportPng() {
  try {
    const xml = buildSchemaErModelSvg(buildExportModel())
    await downloadSchemaErPngFromSvgXml(xml, exportBaseName.value)
    layoutStore.showSuccessToast(t('workspace.schemaEr.exportPngDone'))
  } catch (error) {
    const message = resolveCaughtApiErrorMessage(error, t, 'workspace.schemaEr.exportFailed')
    layoutStore.showErrorToast(message)
  }
}

function truncateText(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

function columnTypeLabel(column: {
  dataType: string
  keyType?: string | null
  highlighted?: boolean
}): string {
  if (column.keyType === 'PRI') return 'PK'
  if (column.highlighted && column.keyType !== 'PRI') return 'FK'
  return column.dataType
}

function selectEdge(edge: TableRelationGraphEdge, event?: Event) {
  event?.stopPropagation()
  selectedEdgeId.value = edge.id
  selectedColumnTarget.value = null
  linkMode.value = false
  linkFrom.value = null
}

function clearSelection() {
  selectedEdgeId.value = null
  selectedColumnTarget.value = null
  batchSelectedColumns.value = new Set()
}

function toggleBatchColumn(columnName: string, checked: boolean) {
  const next = new Set(batchSelectedColumns.value)
  if (checked) next.add(columnName)
  else next.delete(columnName)
  batchSelectedColumns.value = next
}

function openBatchDropDdl() {
  const target = selectedColumnTarget.value
  if (!target || !canAlterColumn.value) return
  const columnNames = [...batchSelectedColumns.value].sort((a, b) => a.localeCompare(b))
  const sql = buildBatchAlterColumnDdl('drop', {
    dbType: dbType.value,
    tableName: target.table,
    database: databaseName.value,
    columnNames,
  })
  if (!sql?.trim()) return
  batchDdlTitle.value = t('workspace.schemaEr.batchAlterDropTitle')
  batchDdlSql.value = sql
  batchDdlSummary.value = [
    t('workspace.schemaEr.batchAlterSummaryTable', {table: target.table, count: columnNames.length}),
    ...columnNames.map((column) =>
        t('workspace.schemaEr.batchAlterSummaryColumn', {column}),
    ),
  ]
  batchDdlOpen.value = true
}

function openBatchAddDdl() {
  const target = selectedColumnTarget.value
  if (!target || !canAlterColumn.value) return
  const columns = parseBatchAddColumnLines(batchAddDraft.value)
  const sql = buildBatchAlterColumnDdl('add', {
    dbType: dbType.value,
    tableName: target.table,
    database: databaseName.value,
    columns,
  })
  if (!sql?.trim()) {
    workspace.setStatus(t('workspace.schemaEr.batchAlterAddEmpty'))
    return
  }
  batchDdlTitle.value = t('workspace.schemaEr.batchAlterAddTitle')
  batchDdlSql.value = sql
  batchDdlSummary.value = [
    t('workspace.schemaEr.batchAlterAddSummaryTable', {table: target.table, count: columns.length}),
    ...columns.map((column) =>
        t('workspace.schemaEr.batchAlterAddSummaryColumn', {
          column: column.name,
          type: column.dataType,
        }),
    ),
  ]
  batchDdlOpen.value = true
}

function openBatchModifyDdl() {
  const target = selectedColumnTarget.value
  if (!target || !canAlterColumn.value) return
  const columns = parseBatchModifyColumnLines(batchAddDraft.value)
  const sql = buildBatchAlterColumnDdl('modify', {
    dbType: dbType.value,
    tableName: target.table,
    database: databaseName.value,
    columns,
  })
  if (!sql?.trim()) {
    workspace.setStatus(t('workspace.schemaEr.batchAlterModifyEmpty'))
    return
  }
  batchDdlTitle.value = t('workspace.schemaEr.batchAlterModifyTitle')
  batchDdlSql.value = sql
  batchDdlSummary.value = [
    t('workspace.schemaEr.batchAlterModifySummaryTable', {table: target.table, count: columns.length}),
    ...columns.map((column) =>
        t('workspace.schemaEr.batchAlterModifySummaryColumn', {
          column: column.name,
          type: column.dataType,
        }),
    ),
  ]
  batchDdlOpen.value = true
}

function openBatchRenameDdl() {
  const target = selectedColumnTarget.value
  if (!target || !canAlterColumn.value) return
  const renames = parseBatchRenameColumnLines(batchRenameDraft.value)
  const sql = buildBatchAlterColumnDdl('rename', {
    dbType: dbType.value,
    tableName: target.table,
    database: databaseName.value,
    renames,
  })
  if (!sql?.trim()) {
    workspace.setStatus(t('workspace.schemaEr.batchAlterRenameEmpty'))
    return
  }
  batchDdlTitle.value = t('workspace.schemaEr.batchAlterRenameTitle')
  batchDdlSql.value = sql
  batchDdlSummary.value = [
    t('workspace.schemaEr.batchAlterRenameSummaryTable', {table: target.table, count: renames.length}),
    ...renames.map((item) =>
        t('workspace.schemaEr.batchAlterRenameSummaryColumn', {
          from: item.from,
          to: item.to,
        }),
    ),
  ]
  batchDdlOpen.value = true
}

function openBatchCommentDdl() {
  const target = selectedColumnTarget.value
  if (!target || !canAlterColumn.value) return
  const comments = parseBatchCommentColumnLines(batchCommentDraft.value)
  const sql = buildBatchCommentColumnDdl({
    dbType: dbType.value,
    tableName: target.table,
    database: databaseName.value,
    comments,
    columnMeta: inspectorTableColumns.value.map((column) => ({
      name: column.name,
      dataType: column.dataType,
      nullable: column.nullable,
    })),
  })
  if (!sql?.trim()) {
    workspace.setStatus(t('workspace.schemaEr.batchAlterCommentEmpty'))
    return
  }
  batchDdlTitle.value = t('workspace.schemaEr.batchAlterCommentTitle')
  batchDdlSql.value = sql
  batchDdlSummary.value = [
    t('workspace.schemaEr.batchAlterCommentSummaryTable', {table: target.table, count: comments.length}),
    ...comments.map((item) =>
        t('workspace.schemaEr.batchAlterCommentSummaryColumn', {
          column: item.name,
          comment: item.comment,
        }),
    ),
  ]
  batchDdlOpen.value = true
}

function openBatchDdlInConsole() {
  const sql = batchDdlSql.value.trim()
  if (!sql) return
  void workspace.openConsole({
    connectionId: props.tab.connectionId,
    instanceId: props.tab.instanceId,
    database: databaseName.value,
    sql,
    title: t('workspace.schemaEr.batchAlterConsoleTitle'),
  })
  layoutStore.showSuccessToast(t('workspace.schemaEr.batchAlterOpenedConsole'))
}

function toggleLinkMode() {
  linkMode.value = !linkMode.value
  selectedEdgeId.value = null
  selectedColumnTarget.value = null
  linkFrom.value = null
}

function isColumnLinkSelected(nodeId: string, column: string): boolean {
  return linkFrom.value?.nodeId === nodeId && linkFrom.value.column === column
}

function isColumnInspected(table: string, column: string): boolean {
  return selectedColumnTarget.value?.table === table && selectedColumnTarget.value.column === column
}

function openAlterColumn(
    tableName: string,
    operation: AlterColumnOperation = 'modify',
    columnName = '',
) {
  if (!canAlterColumn.value) {
    workspace.setStatus(t('workspace.tableDetail.alterColumn.unsupported'))
    return
  }
  alterTableName.value = tableName
  alterInitialOperation.value = operation
  alterInitialColumnName.value = columnName
  alterActionFeedback.value = null
  alterColumnOpen.value = true
}

function onColumnClick(event: Event, node: TableRelationGraphNode, column: TableRelationGraphColumn) {
  event.stopPropagation()
  if (!linkMode.value) {
    selectedEdgeId.value = null
    const prevTable = selectedColumnTarget.value?.table
    selectedColumnTarget.value = {table: node.tableName, column: column.name}
    if (prevTable !== node.tableName) {
      batchSelectedColumns.value = new Set([column.name])
    } else {
      batchSelectedColumns.value = new Set([...batchSelectedColumns.value, column.name])
    }
    return
  }
  const pick = {nodeId: node.id, table: node.tableName, column: column.name}
  if (!linkFrom.value) {
    linkFrom.value = pick
    return
  }
  if (linkFrom.value.nodeId === pick.nodeId && linkFrom.value.column === pick.column) {
    linkFrom.value = null
    return
  }
  if (linkFrom.value.table === pick.table) {
    linkFrom.value = pick
    return
  }
  const draft: SchemaErFkDraft = {
    sourceTable: linkFrom.value.table,
    sourceColumn: linkFrom.value.column,
    targetTable: pick.table,
    targetColumn: pick.column,
  }
  openAddFkDialog(draft)
  linkFrom.value = null
  linkMode.value = false
}

function onColumnDblClick(event: Event, node: TableRelationGraphNode, column: TableRelationGraphColumn) {
  event.stopPropagation()
  if (linkMode.value) return
  openAlterColumn(node.tableName, 'modify', column.name)
}

function openAlterFromInspector(operation: AlterColumnOperation) {
  const target = selectedColumnTarget.value
  if (!target) return
  openAlterColumn(
      target.table,
      operation,
      operation === 'add' ? '' : target.column,
  )
}

function openAlterSqlInConsole(sql: string) {
  void workspace.openConsole({
    connectionId: props.tab.connectionId,
    instanceId: props.tab.instanceId,
    database: databaseName.value,
    sql,
    title: t('workspace.schemaEr.alterConsoleTitle'),
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
      dbType: dbType.value,
    })
    if (!result.ok) {
      alterActionFeedback.value = {
        variant: 'error',
        message: t('workspace.tableDetail.alterColumn.failedWithDetail', {message: result.message}),
      }
      return
    }
    alterColumnOpen.value = false
    await reloadColumns()
    layoutStore.showSuccessToast(t('workspace.tableDetail.alterColumn.success'))
  } catch (error) {
    const message = resolveCaughtApiErrorMessage(error, t, 'workspace.tableDetail.alterColumn.failed')
    alterActionFeedback.value = {
      variant: 'error',
      message: t('workspace.tableDetail.alterColumn.failedWithDetail', {message}),
    }
  } finally {
    alterExecuting.value = false
  }
}

function openAddFkDialog(draft: SchemaErFkDraft) {
  const sql = buildAddForeignKeySql(draft, {
    dbType: dbType.value,
    database: databaseName.value,
  })
  if (!sql.trim()) return
  fkDialogTitle.value = t('workspace.schemaEr.fkAddTitle')
  fkDialogSql.value = sql
  fkDialogSummary.value = [
    t('workspace.schemaEr.fkSummarySource', {
      table: draft.sourceTable,
      column: draft.sourceColumn,
    }),
    t('workspace.schemaEr.fkSummaryTarget', {
      table: draft.targetTable,
      column: draft.targetColumn,
    }),
  ]
  fkDialogOpen.value = true
}

function openDropFkDialog() {
  const draft = selectedEdgeDraft.value
  if (!draft) return
  const sql = buildDropForeignKeySql(draft, {
    dbType: dbType.value,
    database: databaseName.value,
  })
  if (!sql.trim()) return
  fkDialogTitle.value = t('workspace.schemaEr.fkDropTitle')
  fkDialogSql.value = sql
  fkDialogSummary.value = [
    t('workspace.schemaEr.fkSummaryConstraint', {name: draft.constraintName || '?'}),
    t('workspace.schemaEr.fkSummarySource', {
      table: draft.sourceTable,
      column: draft.sourceColumn,
    }),
    t('workspace.schemaEr.fkSummaryTarget', {
      table: draft.targetTable,
      column: draft.targetColumn,
    }),
  ]
  fkDialogOpen.value = true
}

async function applyFkDialog() {
  const sql = fkDialogSql.value.trim()
  if (!sql) return
  await workspace.openConsole({
    connectionId: props.tab.connectionId,
    database: databaseName.value,
    sql,
    title: t('workspace.schemaEr.fkConsoleTitle'),
  })
  layoutStore.showSuccessToast(t('workspace.schemaEr.fkOpenedConsole'))
}

function syncFlowGraph() {
  // Cast: Vue Flow Node generics make this map hit TS2589 (excessively deep).
  flowNodes.value = enrichedGraph.value.nodes.map((node) => {
    const pos = positions.value[node.id] ?? {x: 40, y: 40}
    const cols = schemaErVisibleColumns(node)
    return {
      id: node.id,
      type: 'er-table',
      position: {x: pos.x, y: pos.y},
      draggable: !locked.value && !linkMode.value,
      data: {
        title: truncateText(schemaErNodeTitle(node), 28),
        role: node.role,
        width: SCHEMA_ER_NODE_WIDTH,
        moreCount: schemaErHiddenColumnCount(node),
        moreLabel: t('workspace.tableDetail.relationGraphMoreColumns', {
          count: schemaErHiddenColumnCount(node),
        }),
        linkMode: linkMode.value,
        linkColumn: linkFrom.value?.nodeId === node.id ? linkFrom.value.column : null,
        inspectedColumn:
            selectedColumnTarget.value?.table === node.tableName
                ? selectedColumnTarget.value.column
                : null,
        columns: cols.map((column) => ({
          ...column,
          typeLabel: columnTypeLabel(column),
        })),
        onColumnClick: (column: TableRelationGraphColumn, event: MouseEvent) => {
          onColumnClick(event, node, column)
        },
        onColumnDblClick: (column: TableRelationGraphColumn, event: MouseEvent) => {
          onColumnDblClick(event, node, column)
        },
      },
    }
  }) as GraphCanvasNode[]

  flowEdges.value = enrichedGraph.value.edges.map((edge) => ({
    id: edge.id,
    source: edge.fromNodeId,
    target: edge.toNodeId,
    sourceHandle: edge.sourceColumn ? `out:${edge.sourceColumn}` : undefined,
    targetHandle: edge.targetColumn ? `in:${edge.targetColumn}` : undefined,
    label: edge.label,
    type: 'smoothstep',
    selected: selectedEdgeId.value === edge.id,
    data: {constraintName: edge.constraintName},
  })) as GraphCanvasEdge[]
}

function onFlowNodeDragStop(event: {node: GraphCanvasNode}) {
  positions.value = {
    ...positions.value,
    [event.node.id]: {
      x: Math.round(event.node.position.x),
      y: Math.round(event.node.position.y),
    },
  }
}

function onFlowEdgeClick(event: {edge: GraphCanvasEdge}) {
  const edge = enrichedGraph.value.edges.find((item) => item.id === event.edge.id)
  if (edge) selectEdge(edge)
}

function onFlowPaneClick() {
  clearSelection()
}
</script>

<template>
  <div class="schema-er-graph dw-workbench-page" data-wb-recipe="wb-canvas">
    <DwPanelState
        v-if="isLoading"
        status="loading"
        :message="t('workspace.tableDetail.loading')"
        fill
    />
    <DwPanelState
        v-else-if="error"
        status="error"
        :message="error"
        fill
    />
    <DwPanelState
        v-else-if="!hasContent"
        status="empty"
        :message="t('workspace.tableDetail.schemaErEmpty')"
        compact
        fill
    />
    <div
        v-else
        class="schema-er-graph__canvas-wrap"
        :class="{ 'is-link-mode': linkMode }"
    >
      <div v-if="linkMode" class="schema-er-graph__banner">
        <DwIcon name="info" size="xs" :stroke-width="1.5"/>
        <span>{{ linkFrom ? t('workspace.schemaEr.linkPickTarget') : t('workspace.schemaEr.linkPickSource') }}</span>
        <button type="button" class="schema-er-graph__banner-cancel" @click="toggleLinkMode">
          {{ t('common.cancel') }}
        </button>
      </div>

      <DwGraphCanvas
          ref="canvasRef"
          class="schema-er-graph__flow"
          :flow-id="FLOW_ID"
          v-model:nodes="flowNodes"
          v-model:edges="flowEdges"
          :node-types="nodeTypes"
          :show-controls="false"
          :nodes-draggable="!locked && !linkMode"
          :fit-view-on-init="true"
          :min-zoom="0.25"
          :max-zoom="1.8"
          @node-drag-stop="onFlowNodeDragStop"
          @edge-click="onFlowEdgeClick"
          @pane-click="onFlowPaneClick"
      />

      <aside v-if="selectedColumnTarget" class="schema-er-graph__inspector">
        <header class="schema-er-graph__inspector-head">
          <div>
            <p class="schema-er-graph__inspector-kicker">{{ t('workspace.schemaEr.columnInspector') }}</p>
            <h3>{{ selectedColumnTarget.table }}.{{ selectedColumnTarget.column }}</h3>
          </div>
          <button type="button" class="schema-er-graph__inspector-close" @click="clearSelection">
            <DwIcon name="close" size="xs" :stroke-width="1.5"/>
          </button>
        </header>
        <p class="schema-er-graph__inspector-hint">{{ t('workspace.schemaEr.columnInspectorHint') }}</p>
        <p class="schema-er-graph__inspector-hint">
          {{ t('workspace.schemaEr.batchAlterHint', {count: batchSelectionCount}) }}
        </p>
        <ul v-if="inspectorTableColumns.length" class="schema-er-graph__batch-list">
          <li v-for="column in inspectorTableColumns" :key="column.name">
            <DwCheckbox
                class="schema-er-graph__batch-item"
                :model-value="batchSelectedColumns.has(column.name)"
                @update:model-value="toggleBatchColumn(column.name, $event)"
            >
              <span class="schema-er-graph__batch-name">{{ column.name }}</span>
              <span class="schema-er-graph__batch-type">{{ columnTypeLabel(column) }}</span>
            </DwCheckbox>
          </li>
        </ul>
        <div class="schema-er-graph__inspector-actions">
          <DwButton
              variant="primary"
              size="sm"
              type="button"
              :disabled="!canAlterColumn"
              @click="openAlterFromInspector('modify')"
          >
            {{ t('workspace.schemaEr.columnEditAction') }}
          </DwButton>
          <DwButton
              variant="secondary"
              size="sm"
              type="button"
              :disabled="!canAlterColumn"
              @click="openAlterFromInspector('add')"
          >
            {{ t('workspace.schemaEr.columnAddAction') }}
          </DwButton>
          <DwButton
              variant="ghost"
              size="sm"
              type="button"
              :disabled="!canAlterColumn"
              @click="openAlterFromInspector('drop')"
          >
            {{ t('workspace.schemaEr.columnDropAction') }}
          </DwButton>
          <DwButton
              variant="secondary"
              size="sm"
              type="button"
              :disabled="!canGenerateBatchDdl"
              @click="openBatchDropDdl"
          >
            {{ t('workspace.schemaEr.batchAlterDropAction') }}
          </DwButton>
        </div>
        <label class="schema-er-graph__batch-add">
          <span>{{ t('workspace.schemaEr.batchAlterAddHint') }}</span>
          <DwInput
              v-model="batchAddDraft"
              class="schema-er-graph__batch-add-input"
              variant="mono"
              :rows="3"
              :spellcheck="false"
              :placeholder="t('workspace.schemaEr.batchAlterAddPlaceholder')"
          />
        </label>
        <div class="schema-er-graph__inspector-actions">
          <DwButton
              variant="secondary"
              size="sm"
              type="button"
              :disabled="!canAlterColumn"
              @click="openBatchAddDdl"
          >
            {{ t('workspace.schemaEr.batchAlterAddAction') }}
          </DwButton>
          <DwButton
              variant="secondary"
              size="sm"
              type="button"
              :disabled="!canAlterColumn"
              @click="openBatchModifyDdl"
          >
            {{ t('workspace.schemaEr.batchAlterModifyAction') }}
          </DwButton>
        </div>
        <label class="schema-er-graph__batch-add">
          <span>{{ t('workspace.schemaEr.batchAlterRenameHint') }}</span>
          <DwInput
              v-model="batchRenameDraft"
              class="schema-er-graph__batch-add-input"
              variant="mono"
              :rows="3"
              :spellcheck="false"
              :placeholder="t('workspace.schemaEr.batchAlterRenamePlaceholder')"
          />
        </label>
        <div class="schema-er-graph__inspector-actions">
          <DwButton
              variant="secondary"
              size="sm"
              type="button"
              :disabled="!canAlterColumn"
              @click="openBatchRenameDdl"
          >
            {{ t('workspace.schemaEr.batchAlterRenameAction') }}
          </DwButton>
        </div>
        <label class="schema-er-graph__batch-add">
          <span>{{ t('workspace.schemaEr.batchAlterCommentHint') }}</span>
          <DwInput
              v-model="batchCommentDraft"
              class="schema-er-graph__batch-add-input"
              variant="mono"
              :rows="3"
              :spellcheck="false"
              :placeholder="t('workspace.schemaEr.batchAlterCommentPlaceholder')"
          />
        </label>
        <div class="schema-er-graph__inspector-actions">
          <DwButton
              variant="secondary"
              size="sm"
              type="button"
              :disabled="!canAlterColumn"
              @click="openBatchCommentDdl"
          >
            {{ t('workspace.schemaEr.batchAlterCommentAction') }}
          </DwButton>
        </div>
      </aside>

      <aside v-else-if="selectedEdge && selectedEdgeDraft" class="schema-er-graph__inspector">
        <header class="schema-er-graph__inspector-head">
          <div>
            <p class="schema-er-graph__inspector-kicker">{{ t('workspace.schemaEr.fkInspector') }}</p>
            <h3>{{ selectedEdge.constraintName || t('workspace.schemaEr.fkUntitled') }}</h3>
          </div>
          <button type="button" class="schema-er-graph__inspector-close" @click="clearSelection">
            <DwIcon name="close" size="xs" :stroke-width="1.5"/>
          </button>
        </header>
        <dl class="schema-er-graph__inspector-meta">
          <div>
            <dt>{{ t('workspace.schemaEr.fkFrom') }}</dt>
            <dd>{{ selectedEdgeDraft.sourceTable }}.{{ selectedEdgeDraft.sourceColumn }}</dd>
          </div>
          <div>
            <dt>{{ t('workspace.schemaEr.fkTo') }}</dt>
            <dd>{{ selectedEdgeDraft.targetTable }}.{{ selectedEdgeDraft.targetColumn }}</dd>
          </div>
        </dl>
        <div class="schema-er-graph__inspector-actions">
          <DwButton variant="secondary" size="sm" type="button" @click="openDropFkDialog">
            {{ t('workspace.schemaEr.fkDropAction') }}
          </DwButton>
        </div>
      </aside>

      <div class="schema-er-graph__dock" role="toolbar" :aria-label="t('workspace.schemaEr.canvasControls')">
        <button
            type="button"
            class="dw-icon-btn dw-icon-btn--lg"
            :class="{ 'is-active': linkMode }"
            :title="t('workspace.schemaEr.linkMode')"
            @click="toggleLinkMode"
        >
          <DwIcon name="link" fit :stroke-width="1.75"/>
        </button>
        <button type="button" class="dw-icon-btn dw-icon-btn--lg" :title="t('workspace.schemaEr.zoomIn')" @click="zoomIn">
          <DwIcon name="plus" fit :stroke-width="1.75"/>
        </button>
        <button type="button" class="dw-icon-btn dw-icon-btn--lg" :title="t('workspace.schemaEr.zoomOut')" @click="zoomOut">
          <DwIcon name="minus" fit :stroke-width="1.75"/>
        </button>
        <button type="button" class="dw-icon-btn dw-icon-btn--lg" :title="t('workspace.schemaEr.fitView')" @click="fitView">
          <DwIcon name="locate" fit :stroke-width="1.75"/>
        </button>
        <button
            type="button"
            class="dw-icon-btn dw-icon-btn--lg"
            :class="{ 'is-active': locked }"
            :title="locked ? t('workspace.schemaEr.unlock') : t('workspace.schemaEr.lock')"
            @click="locked = !locked"
        >
          <DwIcon v-if="locked" name="lock" fit :stroke-width="1.75"/>
          <DwIcon v-else name="unlock" fit :stroke-width="1.75"/>
        </button>
        <button type="button" class="dw-icon-btn dw-icon-btn--lg" :title="t('workspace.tableDetail.relationGraphReset')" @click="resetLayout">
          <DwIcon name="refresh" fit :stroke-width="1.75"/>
        </button>
        <button type="button" class="dw-icon-btn dw-icon-btn--lg" :title="t('workspace.schemaEr.exportSvg')" @click="exportSvg">
          <DwIcon name="export" fit :stroke-width="1.75"/>
        </button>
        <button type="button" class="dw-icon-btn dw-icon-btn--lg" :title="t('workspace.schemaEr.exportPng')" @click="exportPng">
          <DwIcon name="save-as" fit :stroke-width="1.75"/>
        </button>
      </div>
    </div>

    <SchemaErFkDdlDialog
        v-model:open="fkDialogOpen"
        :title="fkDialogTitle"
        :sql="fkDialogSql"
        :summary-bits="fkDialogSummary"
        @apply="applyFkDialog"
    />

    <AlterColumnDialog
        v-model:open="alterColumnOpen"
        :db-type="dbType"
        :table-name="alterTableName"
        :database="databaseName"
        :columns="alterDialogColumns"
        :initial-operation="alterInitialOperation"
        :initial-column-name="alterInitialColumnName"
        :can-execute="canExecuteAlter"
        :execute-disabled-hint="alterExecuteDisabledHint"
        :executing="alterExecuting"
        :production-env="alterProductionEnv"
        :action-feedback="alterActionFeedback"
        @open-console="openAlterSqlInConsole"
        @execute="executeAlterColumn"
        @clear-action-feedback="alterActionFeedback = null"
    />

    <SchemaErBatchAlterDdlDialog
        v-model:open="batchDdlOpen"
        :title="batchDdlTitle"
        :sql="batchDdlSql"
        :summary-bits="batchDdlSummary"
        @open-console="openBatchDdlInConsole"
    />
  </div>
</template>

<style scoped>
.schema-er-graph {
  --erg-canvas-bg: var(--dw-bg-rail);
  --erg-grid-stroke: color-mix(in srgb, var(--dw-on-accent) 10%, transparent);
  --erg-node-fill: var(--dw-bg-hover);
  --erg-node-stroke: var(--dw-text-secondary);
  --erg-header-fill: var(--dw-graph-node-dark);
  --erg-center-header: color-mix(in srgb, var(--dw-info) 22%, var(--dw-graph-node-dark) 78%);
  --erg-text: var(--dw-border-light);
  --erg-text-type: var(--dw-text-muted);
  --erg-text-comment: var(--dw-text-muted);
  --erg-text-more: var(--dw-text-muted);
  --erg-fk-bg: color-mix(in srgb, var(--dw-info) 18%, transparent);
  --erg-pk-bg: color-mix(in srgb, var(--dw-warning) 14%, transparent);
  --erg-key: var(--dw-warning);

  flex: 1;
  min-height: 0;
  min-width: 0;
  background: var(--erg-canvas-bg);
}

[data-theme='light'] .schema-er-graph {
  --erg-canvas-bg: color-mix(in srgb, var(--dw-bg-editor) 94%, var(--dw-border-light) 6%);
  --erg-grid-stroke: color-mix(in srgb, var(--dw-border) 70%, var(--dw-text-muted) 30%);
  --erg-node-fill: var(--dw-bg);
  --erg-node-stroke: color-mix(in srgb, var(--dw-border) 75%, var(--dw-text-secondary) 25%);
  --erg-header-fill: color-mix(in srgb, var(--dw-bg-muted) 45%, var(--dw-on-accent) 55%);
  --erg-center-header: color-mix(in srgb, var(--dw-info) 12%, var(--dw-on-accent) 88%);
  --erg-text: var(--dw-text);
  --erg-text-type: var(--dw-text-secondary);
  --erg-text-comment: var(--dw-text-secondary);
  --erg-text-more: var(--dw-text-secondary);
  --erg-fk-bg: color-mix(in srgb, var(--dw-info) 14%, transparent);
  --erg-pk-bg: color-mix(in srgb, var(--dw-warning) 12%, transparent);
  --erg-key: var(--dw-warning-fg);
}

.schema-er-graph__canvas-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  cursor: default;
}

.schema-er-graph__flow {
  width: 100%;
  height: 100%;
  min-height: 480px;
  border: none;
  border-radius: 0;
}

.schema-er-graph__canvas-wrap.is-panning {
  cursor: grabbing;
}

.schema-er-graph__canvas-wrap.is-link-mode {
  cursor: crosshair;
}

.schema-er-graph__banner {
  position: absolute;
  z-index: var(--dw-z-raised);
  top: var(--dw-space-4);
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap);
  max-width: min(520px, calc(100% - var(--dw-space-8)));
  padding: var(--dw-space-2) var(--dw-space-4);
  border: 1px solid color-mix(in srgb, var(--dw-primary) 28%, var(--dw-border-light));
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-bg-panel) 88%, transparent);
  color: var(--dw-text);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  box-shadow: var(--dw-shadow-md);
  backdrop-filter: blur(10px);
}

.schema-er-graph__banner-cancel {
  margin-left: var(--dw-space-2);
  border: none;
  background: transparent;
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}

.schema-er-graph__inspector {
  position: absolute;
  z-index: var(--dw-z-raised);
  top: var(--dw-space-5);
  right: var(--dw-space-5);
  width: min(300px, calc(100% - var(--dw-space-10)));
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-4);
  padding: var(--dw-space-5);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: color-mix(in srgb, var(--dw-bg-panel) 92%, transparent);
  box-shadow: var(--dw-shadow-float);
  backdrop-filter: blur(12px);
}

.schema-er-graph__inspector-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--dw-gap);
}

.schema-er-graph__inspector-kicker {
  margin: 0 0 var(--dw-space-1);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dw-text-muted);
}

.schema-er-graph__inspector-head h3 {
  margin: 0;
  font-size: var(--dw-text-sm);
  font-weight: 700;
  color: var(--dw-text);
  word-break: break-word;
}

.schema-er-graph__inspector-close {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dw-control-h);
  height: var(--dw-control-h);
  border: none;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-text-muted);
  cursor: pointer;
}

.schema-er-graph__inspector-close:hover {
  background: var(--dw-bg-hover);
  color: var(--dw-text);
}

.schema-er-graph__inspector-meta {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-3);
}

.schema-er-graph__inspector-meta div {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-1);
}

.schema-er-graph__inspector-meta dt {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.schema-er-graph__inspector-meta dd {
  margin: 0;
  font-family: var(--dw-font-mono);
  font-size: var(--dw-text-xs);
  color: var(--dw-text-secondary);
  word-break: break-all;
}

.schema-er-graph__inspector-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-sm);
}

.schema-er-graph__batch-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-1);
  max-height: 220px;
  overflow: auto;
}

.schema-er-graph__batch-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: var(--dw-gap-sm);
  font-size: var(--dw-text-xs);
  color: var(--dw-text-secondary);
  cursor: pointer;
}

.schema-er-graph__batch-item :deep(.dw-checkbox__label) {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--dw-gap-sm);
  min-width: 0;
}

.schema-er-graph__batch-name {
  font-family: var(--dw-font-mono);
  color: var(--dw-text-primary);
}

.schema-er-graph__batch-type {
  margin-left: auto;
  color: var(--dw-text-muted);
}

.schema-er-graph__batch-add {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.schema-er-graph__batch-add-input,
:deep(.schema-er-graph__batch-add-input) {
  font-family: var(--dw-font-mono);
  resize: vertical;
  min-height: 4.5rem;
}

.schema-er-graph__inspector-hint {
  margin: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  line-height: var(--dw-leading);
}

.schema-er-graph__canvas {
  display: block;
  width: 100%;
  min-height: 100%;
  touch-action: none;
  user-select: none;
}

.schema-er-graph__grid-bg {
  fill: url(#schema-er-grid);
}

.schema-er-graph__grid-line {
  stroke: var(--erg-grid-stroke);
  stroke-width: 1;
}

.schema-er-graph__edge-hit {
  fill: none;
  stroke: transparent;
  stroke-width: 12;
  cursor: pointer;
  pointer-events: stroke;
}

.schema-er-graph__edge {
  fill: none;
  stroke: var(--dw-info);
  stroke-width: 1.6;
  opacity: 0.9;
  cursor: pointer;
  transition: stroke var(--dw-duration) var(--dw-ease), stroke-width var(--dw-duration) var(--dw-ease);
}

.schema-er-graph__edge.is-selected {
  stroke: var(--dw-primary);
  stroke-width: 2.4;
  opacity: 1;
}

.schema-er-graph__arrow {
  fill: var(--dw-info);
}

.schema-er-graph__anchor {
  fill: var(--dw-info);
  stroke: var(--erg-node-fill);
  stroke-width: 1.5;
}

.schema-er-graph__anchor.is-selected {
  fill: var(--dw-primary);
}

.schema-er-graph__node {
  cursor: grab;
}

.schema-er-graph__node.is-locked,
.schema-er-graph__node.is-locked.is-dragging {
  cursor: default;
}

.schema-er-graph__node.is-dragging {
  cursor: grabbing;
}

.schema-er-graph__node-shell {
  fill: var(--erg-node-fill);
  stroke: var(--erg-node-stroke);
  stroke-width: 1.5;
}

.schema-er-graph__node-header {
  fill: var(--erg-header-fill);
  stroke: none;
}

.schema-er-graph__node-header-fill {
  fill: var(--erg-header-fill);
}

.schema-er-graph__node--center .schema-er-graph__node-header,
.schema-er-graph__node--center .schema-er-graph__node-header-fill {
  fill: var(--erg-center-header);
}

.schema-er-graph__node--center .schema-er-graph__node-shell {
  stroke: var(--dw-info);
  stroke-width: 2;
}

.schema-er-graph__node-title {
  fill: var(--erg-text);
  font-size: var(--dw-text-sm);
  font-weight: 700;
  pointer-events: none;
}

.schema-er-graph__row-bg {
  fill: transparent;
}

.schema-er-graph__row.is-pk .schema-er-graph__row-bg {
  fill: var(--erg-pk-bg);
}

.schema-er-graph__row.is-fk .schema-er-graph__row-bg {
  fill: var(--erg-fk-bg);
}

.schema-er-graph__row.is-linkable {
  cursor: crosshair;
}

.schema-er-graph__row:not(.is-linkable) {
  cursor: pointer;
}

.schema-er-graph__row.is-inspected .schema-er-graph__row-bg {
  fill: color-mix(in srgb, var(--dw-primary) 18%, transparent);
  stroke: var(--dw-primary);
  stroke-width: 1;
}

.schema-er-graph__row.is-link-pick .schema-er-graph__row-bg {
  fill: color-mix(in srgb, var(--dw-primary) 22%, var(--erg-node-fill));
  stroke: color-mix(in srgb, var(--dw-primary) 45%, transparent);
  stroke-width: 1;
}

.schema-er-graph__col-name {
  fill: var(--erg-text);
  font-size: var(--dw-text-xs);
  pointer-events: none;
}

.schema-er-graph__col-type {
  fill: var(--erg-key);
  font-size: var(--dw-text-xs);
  pointer-events: none;
}

.schema-er-graph__col-comment {
  fill: var(--erg-text-comment);
  font-size: var(--dw-text-xs);
  pointer-events: none;
}

.schema-er-graph__more {
  fill: var(--erg-text-more);
  font-size: var(--dw-text-xs);
  pointer-events: none;
}

.schema-er-graph__dock {
  position: absolute;
  left: 16px;
  bottom: 16px;
  z-index: var(--dw-z-raised);
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-sm);
  padding: var(--dw-space-3);
  border-radius: var(--dw-panel-radius);
  background: color-mix(in srgb, var(--dw-bg-panel) 88%, transparent);
  border: 1px solid var(--dw-border-light);
  box-shadow: var(--dw-shadow);
}

.schema-er-graph__dock .dw-icon-btn {
  width: var(--dw-density-lg);
  height: var(--dw-density-lg);
}

.schema-er-graph__dock .dw-icon-btn :deep(svg) {
  width: var(--dw-icon-size-lg);
  height: var(--dw-icon-size-lg);
}

</style>
