<script setup lang="ts">
import {computed, markRaw, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwCheckbox, DwInlineAlert, DwInput} from '@/core/components'
import DwSelect from '@/core/components/DwSelect.vue'
import {
  DwGraphCanvas,
  type GraphCanvasEdge,
  type GraphCanvasNode,
  type NodeTypesObject,
} from '@/core/graph-canvas'
import {
  MIGRATION_BATCH_SIZE_MAX,
  MIGRATION_BATCH_SIZE_MIN,
  MIGRATION_THROTTLE_MAX_MS,
  type TableMigrationWizardForm,
} from '@/features/explorer/services/table-migration.service'
import {
  layoutMigrationCanvas,
  nextIncompleteMigrationNode,
  resolveMigrationNodeStatuses,
  type MigrationCanvasNodeKind,
  type MigrationCanvasPositionOverrides,
} from '@/features/workspace/services/migration-canvas.service'
import {useMigrationWizard} from '@/features/workspace/composables/useMigrationWizardInject'
import MigrationFlowNode from './MigrationFlowNode.vue'

const {t} = useI18n()
const w = useMigrationWizard()

const selectedNodeId = ref<MigrationCanvasNodeKind>('tables')
const positionOverrides = ref<MigrationCanvasPositionOverrides>({})
const flowNodes = ref<GraphCanvasNode[]>([])
const flowEdges = ref<GraphCanvasEdge[]>([])
const dragOver = ref(false)

const nodeTypes = {migration: markRaw(MigrationFlowNode)} as NodeTypesObject

const migrationModes: Array<{value: TableMigrationWizardForm['mode']; labelKey: string}> = [
  {value: 'FULL_APPEND', labelKey: 'explorer.tableMigrationWizard.modeFullAppend'},
  {value: 'FULL_REPLACE', labelKey: 'explorer.tableMigrationWizard.modeFullReplace'},
  {value: 'INCR_APPEND', labelKey: 'explorer.tableMigrationWizard.modeIncrAppend'},
  {value: 'PK_UPSERT', labelKey: 'explorer.tableMigrationWizard.modePkUpsert'},
]

const conflictStrategies: Array<{value: TableMigrationWizardForm['conflictStrategy']; labelKey: string}> = [
  {value: 'OVERWRITE', labelKey: 'explorer.tableMigrationWizard.conflictOverwrite'},
  {value: 'SKIP', labelKey: 'explorer.tableMigrationWizard.conflictSkip'},
  {value: 'FAIL', labelKey: 'explorer.tableMigrationWizard.conflictFail'},
]

const statuses = computed(() =>
    resolveMigrationNodeStatuses({
      hasSource: Boolean(w.source),
      selectedTableCount: w.form.selectedTables.length,
      targetConnectionId: w.form.targetConnectionId,
      targetDatabase: w.form.targetDatabase,
    }),
)

const modeLabel = computed(() => {
  const key = migrationModes.find((item) => item.value === w.form.mode)?.labelKey
  return key ? t(key) : w.form.mode
})

const readyCount = computed(
    () => Object.values(statuses.value).filter((status) => status === 'ready').length,
)

const checklistHint = computed(() => {
  const incomplete = nextIncompleteMigrationNode(statuses.value, selectedNodeId.value)
  if (statuses.value.source !== 'ready') {
    return t('explorer.tableMigrationWizard.canvasHintSource')
  }
  if (incomplete === 'tables') {
    return t('explorer.tableMigrationWizard.canvasHintTables')
  }
  if (incomplete === 'target') {
    return t('explorer.tableMigrationWizard.canvasHintTarget')
  }
  return t('explorer.tableMigrationWizard.canvasHintReady')
})

const inspectorTitle = computed(() => {
  const keys: Record<MigrationCanvasNodeKind, string> = {
    source: 'explorer.tableMigrationWizard.canvasInspectorSource',
    tables: 'explorer.tableMigrationWizard.canvasInspectorTables',
    mode: 'explorer.tableMigrationWizard.canvasInspectorMode',
    target: 'explorer.tableMigrationWizard.canvasInspectorTarget',
  }
  return t(keys[selectedNodeId.value])
})

watch(
    () =>
        [
          w.source?.connectionLabel,
          w.source?.database,
          w.form.selectedTables.length,
          w.form.mode,
          modeLabel.value,
          w.form.targetConnectionId,
          w.targetConnectionLabel,
          w.form.targetDatabase,
          selectedNodeId.value,
          statuses.value.source,
          statuses.value.tables,
          statuses.value.mode,
          statuses.value.target,
          Object.entries(positionOverrides.value)
              .map(([id, pos]) => `${id}:${pos.x},${pos.y}`)
              .join(';'),
        ] as const,
    () => {
      const layout = layoutMigrationCanvas({
        sourceLabel: w.source?.connectionLabel ?? '',
        sourceDatabase: w.source?.database ?? '',
        selectedTableCount: w.form.selectedTables.length,
        modeLabel: modeLabel.value,
        targetLabel: w.targetConnectionLabel,
        targetDatabase: w.form.targetDatabase,
        labels: {
          sourceBadge: t('explorer.tableMigrationWizard.source'),
          tablesBadge: t('explorer.tableMigrationWizard.tables'),
          modeBadge: t('explorer.tableMigrationWizard.migrationMode'),
          targetBadge: t('explorer.tableMigrationWizard.target'),
          tablesSubtitle: w.form.selectedTables.length
              ? w.selectedCountLabel
              : t('explorer.tableMigrationWizard.canvasTablesEmpty'),
          tablesEmpty: t('explorer.tableMigrationWizard.canvasTablesEmpty'),
          targetEmpty: t('explorer.tableMigrationWizard.pickConnection'),
          edgeRead: t('explorer.tableMigrationWizard.canvasEdgeRead'),
          edgeTables: t('explorer.tableMigrationWizard.canvasEdgeTables'),
          edgeWrite: t('explorer.tableMigrationWizard.canvasEdgeWrite'),
        },
        statuses: statuses.value,
        positionOverrides: positionOverrides.value,
      })

      const statusLabels: Record<string, string> = {
        ready: t('explorer.tableMigrationWizard.canvasStatusReady'),
        incomplete: t('explorer.tableMigrationWizard.canvasStatusIncomplete'),
        idle: t('explorer.tableMigrationWizard.canvasStatusIdle'),
      }

      flowNodes.value = layout.nodes.map((node) => ({
        id: node.id,
        type: 'migration',
        position: {x: node.x, y: node.y},
        style: {width: `${node.width}px`, height: `${node.height}px`},
        data: {
          kind: node.kind,
          title: node.kind === 'tables'
              ? t('explorer.tableMigrationWizard.canvasTablesTitle')
              : node.title,
          subtitle: node.kind === 'tables' ? node.title : node.subtitle,
          badge: node.badge,
          status: node.status,
          statusLabel: statusLabels[node.status] ?? node.status,
          selected: node.id === selectedNodeId.value,
        },
        draggable: true,
      }))

      flowEdges.value = layout.edges.map((edge) => ({
        id: edge.id,
        source: edge.fromId,
        target: edge.toId,
        sourceHandle: 'out',
        targetHandle: 'in',
        label: edge.label || undefined,
        type: 'smoothstep',
        animated: Boolean(edge.animated),
      }))
    },
    {immediate: true},
)

function selectNode(kind: MigrationCanvasNodeKind) {
  selectedNodeId.value = kind
}

function onNodeClick(event: {node: GraphCanvasNode}) {
  const kind = (event.node.data as {kind?: MigrationCanvasNodeKind} | undefined)?.kind
  if (kind) selectNode(kind)
}

function onNodeDragStop(event: {node: GraphCanvasNode}) {
  positionOverrides.value = {
    ...positionOverrides.value,
    [event.node.id]: {
      x: Math.round(event.node.position.x),
      y: Math.round(event.node.position.y),
    },
  }
}

function resetLayout() {
  positionOverrides.value = {}
}

function onPaletteDragStart(event: DragEvent, table: string) {
  event.dataTransfer?.setData('text/migration-table', table)
  event.dataTransfer?.setData('text/plain', table)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}

function onPaneDragOver() {
  dragOver.value = true
}

function onPaneDragLeave() {
  dragOver.value = false
}

function onPaneDrop(event: DragEvent) {
  dragOver.value = false
  const table = (
      event.dataTransfer?.getData('text/migration-table')
      || event.dataTransfer?.getData('text/plain')
      || ''
  ).trim()
  if (!table || w.running) return
  w.toggleTable(table, true)
  selectNode('tables')
}

function goToIncomplete() {
  selectNode(nextIncompleteMigrationNode(statuses.value, selectedNodeId.value))
}
</script>

<template>
  <div class="migration-canvas migration-flow-panel migration-flow-panel--canvas">
    <div class="migration-canvas__toolbar">
      <div class="migration-canvas__checklist">
        <span class="migration-canvas__ready">
          {{ t('explorer.tableMigrationWizard.canvasReadyCount', {ready: readyCount, total: 4}) }}
        </span>
        <p class="migration-canvas__hint">{{ checklistHint }}</p>
      </div>
      <div class="migration-canvas__toolbar-actions">
        <button
            v-if="readyCount < 4"
            type="button"
            class="migration-canvas__link"
            @click="goToIncomplete"
        >
          {{ t('explorer.tableMigrationWizard.canvasGoIncomplete') }}
        </button>
        <button
            v-if="Object.keys(positionOverrides).length"
            type="button"
            class="migration-canvas__link"
            @click="resetLayout"
        >
          {{ t('explorer.tableMigrationWizard.canvasResetLayout') }}
        </button>
      </div>
    </div>

    <div class="migration-canvas__body">
      <aside class="migration-canvas__palette">
        <header class="migration-canvas__palette-head">
          <strong>{{ t('explorer.tableMigrationWizard.canvasPalette') }}</strong>
          <DwInput
              v-model="w.tableFilter"
              type="search"
              variant="sm"
              :placeholder="t('explorer.tableMigrationWizard.tableFilter')"
              :disabled="w.running || w.tablesLoading"
          />
        </header>
        <div class="migration-canvas__palette-tools">
          <DwCheckbox
              v-model="w.showSelectedOnly"
              :label="t('explorer.tableMigrationWizard.showSelectedOnly')"
              :disabled="w.running || w.tablesLoading || !w.form.selectedTables.length"
          />
          <DwCheckbox
              v-model="w.allSelected"
              :label="t('explorer.tableMigrationWizard.selectAll')"
              :disabled="w.running || w.tablesLoading || !w.filteredTables.length"
          />
        </div>
        <ul class="migration-canvas__palette-list">
          <li v-if="w.tablesLoading" class="migration-canvas__palette-empty">
            {{ t('explorer.tableMigrationWizard.loadingTables') }}
          </li>
          <li v-else-if="w.tablesLoadError" class="migration-canvas__palette-empty">
            <DwInlineAlert :message="t('explorer.tableMigrationWizard.loadTablesFailed')"/>
          </li>
          <li v-else-if="!w.filteredTables.length" class="migration-canvas__palette-empty">
            {{ t('explorer.tableMigrationWizard.noTables') }}
          </li>
          <li v-for="name in w.filteredTables" :key="name">
            <label
                class="migration-canvas__palette-item"
                :class="{ 'is-selected': w.form.selectedTables.includes(name) }"
                draggable="true"
                @dragstart="onPaletteDragStart($event, name)"
            >
              <DwCheckbox
                  :model-value="w.form.selectedTables.includes(name)"
                  :disabled="w.running"
                  @update:model-value="(checked) => { w.toggleTable(name, checked); selectNode('tables') }"
              />
              <span>{{ name }}</span>
            </label>
          </li>
        </ul>
        <footer class="migration-canvas__palette-foot">
          <span>{{ w.tablesListFooterLabel }}</span>
          <DwButton
              v-if="w.form.selectedTables.length"
              variant="ghost"
              size="sm"
              :disabled="w.running"
              @click="w.clearSelection"
          >
            {{ t('explorer.tableMigrationWizard.clearSelection') }}
          </DwButton>
        </footer>
        <p class="migration-canvas__hint">{{ t('explorer.tableMigrationWizard.canvasPaletteHint') }}</p>
      </aside>

      <div class="migration-canvas__main">
        <div class="migration-canvas__stage">
          <DwGraphCanvas
              v-model:nodes="flowNodes"
              v-model:edges="flowEdges"
              :node-types="nodeTypes"
              :drag-over="dragOver"
              :fit-view-on-init="true"
              :fit-view-max-zoom="1"
              :min-zoom="0.45"
              :max-zoom="1.6"
              @pane-drop="onPaneDrop"
              @pane-drag-over="onPaneDragOver"
              @pane-drag-leave="onPaneDragLeave"
              @node-click="onNodeClick"
              @node-drag-stop="onNodeDragStop"
          />
        </div>

        <aside class="migration-canvas__inspector">
          <header class="migration-canvas__inspector-head">
            <strong>{{ inspectorTitle }}</strong>
            <nav class="migration-canvas__node-tabs" :aria-label="t('explorer.tableMigrationWizard.canvasNodeTabs')">
              <button
                  v-for="kind in (['source', 'tables', 'mode', 'target'] as const)"
                  :key="kind"
                  type="button"
                  class="migration-canvas__node-tab"
                  :class="{
                    'is-active': selectedNodeId === kind,
                    'is-incomplete': statuses[kind] === 'incomplete',
                  }"
                  @click="selectNode(kind)"
              >
                {{ t(`explorer.tableMigrationWizard.canvasTab.${kind}`) }}
              </button>
            </nav>
          </header>

          <div v-if="selectedNodeId === 'source'" class="migration-canvas__inspector-body">
            <dl class="migration-canvas__kv">
              <div>
                <dt>{{ t('explorer.tableMigrationWizard.sourceConnection') }}</dt>
                <dd>{{ w.source!.connectionLabel }}</dd>
              </div>
              <div>
                <dt>{{ t('explorer.tableMigrationWizard.sourceDatabase') }}</dt>
                <dd>{{ w.source!.database }}</dd>
              </div>
            </dl>
            <p class="migration-canvas__hint">{{ t('explorer.tableMigrationWizard.canvasSourceHint') }}</p>
          </div>

          <div v-else-if="selectedNodeId === 'tables'" class="migration-canvas__inspector-body">
            <p class="migration-canvas__selected-count">{{ w.selectedCountLabel }}</p>
            <div v-if="w.form.selectedTables.length" class="tables-panel__chips">
              <button
                  v-for="name in w.form.selectedTables"
                  :key="name"
                  type="button"
                  class="tables-panel__chip"
                  :disabled="w.running"
                  :title="t('explorer.tableMigrationWizard.removeTable')"
                  @click="w.toggleTable(name, false)"
              >
                <span class="tables-panel__chip-label">{{ name }}</span>
                <span class="tables-panel__chip-remove" aria-hidden="true">×</span>
              </button>
            </div>
            <p v-else class="migration-canvas__hint">
              {{ t('explorer.tableMigrationWizard.canvasTablesInspectorHint') }}
            </p>
          </div>

          <div v-else-if="selectedNodeId === 'mode'" class="migration-canvas__inspector-body">
            <div class="options-field">
              <span>{{ t('explorer.tableMigrationWizard.migrationMode') }}</span>
              <div class="dw-segment" role="radiogroup" :aria-label="t('explorer.tableMigrationWizard.migrationMode')">
                <button
                    v-for="mode in migrationModes"
                    :key="mode.value"
                    type="button"
                    class="dw-segment__btn"
                    role="radio"
                    :aria-checked="w.form.mode === mode.value"
                    :class="{ 'is-active': w.form.mode === mode.value }"
                    :disabled="w.running"
                    @click="w.form.mode = mode.value"
                >
                  {{ t(mode.labelKey) }}
                </button>
              </div>
              <p class="options-field__hint">{{ t(w.modeDescriptionKey) }}</p>
            </div>

            <div v-if="w.form.mode === 'PK_UPSERT'" class="options-field">
              <span>{{ t('explorer.tableMigrationWizard.conflictStrategy') }}</span>
              <div class="dw-segment" role="radiogroup" :aria-label="t('explorer.tableMigrationWizard.conflictStrategy')">
                <button
                    v-for="item in conflictStrategies"
                    :key="item.value"
                    type="button"
                    class="dw-segment__btn"
                    role="radio"
                    :aria-checked="w.form.conflictStrategy === item.value"
                    :class="{ 'is-active': w.form.conflictStrategy === item.value }"
                    :disabled="w.running"
                    @click="w.form.conflictStrategy = item.value"
                >
                  {{ t(item.labelKey) }}
                </button>
              </div>
              <p class="options-field__hint">{{ t('explorer.tableMigrationWizard.conflictStrategyHint') }}</p>
            </div>

            <label class="options-field">
              <span>{{ t('explorer.tableMigrationWizard.targetMissingPolicy') }}</span>
              <DwSelect
                  v-model="w.form.targetMissingPolicy"
                  :options="w.targetMissingPolicyOptions"
                  :disabled="w.running"
              />
            </label>

            <div v-if="w.form.mode !== 'FULL_REPLACE'" class="options-field options-field--check">
              <DwCheckbox
                  v-model="w.form.truncateTarget"
                  :label="t('explorer.tableMigrationWizard.truncateTarget')"
                  :disabled="w.running || w.truncateLockedByMode"
              />
            </div>

            <button
                type="button"
                class="options-panel__advanced-toggle"
                :aria-expanded="w.showAdvancedOptions"
                @click="w.showAdvancedOptions = !w.showAdvancedOptions"
            >
              <span>{{ t('explorer.tableMigrationWizard.advancedOptionsTitle') }}</span>
              <span
                  class="options-panel__advanced-chevron"
                  :class="{ 'is-open': w.showAdvancedOptions }"
                  aria-hidden="true"
              />
            </button>

            <div v-show="w.showAdvancedOptions" class="options-panel__advanced">
              <label class="options-field">
                <span>{{ t('explorer.tableMigrationWizard.where') }}</span>
                <DwInput
                    v-model="w.form.whereClause"
                    type="text"
                    :placeholder="t('explorer.tableMigrationWizard.wherePlaceholder')"
                    :disabled="w.running"
                />
                <span class="options-field__hint">{{ t('explorer.tableMigrationWizard.whereHint') }}</span>
              </label>

              <label class="options-field">
                <span>{{ t('explorer.tableMigrationWizard.batchSize') }}</span>
                <DwInput
                    v-model.number="w.form.batchSize"
                    type="number"
                    :min="MIGRATION_BATCH_SIZE_MIN"
                    :max="MIGRATION_BATCH_SIZE_MAX"
                    :disabled="w.running"
                />
              </label>

              <label class="options-field">
                <span>{{ t('explorer.tableMigrationWizard.throttleMs') }}</span>
                <DwInput
                    v-model.number="w.form.throttleMs"
                    type="number"
                    :min="0"
                    :max="MIGRATION_THROTTLE_MAX_MS"
                    :disabled="w.running"
                />
              </label>
            </div>
          </div>

          <div v-else class="migration-canvas__inspector-body">
            <label class="options-field">
              <span>{{ t('explorer.tableMigrationWizard.targetConnection') }}</span>
              <DwSelect
                  v-model="w.form.targetConnectionId"
                  :placeholder="t('explorer.tableMigrationWizard.pickConnection')"
                  :options="w.targetConnectionOptions"
                  :disabled="w.running"
              />
            </label>
            <label class="options-field">
              <span>{{ t('explorer.tableMigrationWizard.targetDatabase') }}</span>
              <DwSelect
                  v-if="w.targetDatabases.length"
                  v-model="w.form.targetDatabase"
                  :placeholder="t('explorer.tableMigrationWizard.pickDatabase')"
                  :options="w.targetDatabaseOptions"
                  :disabled="w.running || !w.form.targetConnectionId"
              />
              <DwInput
                  v-else
                  v-model="w.form.targetDatabase"
                  type="text"
                  :placeholder="t('explorer.tableMigrationWizard.targetDatabaseManual')"
                  :disabled="w.running || !w.form.targetConnectionId"
              />
            </label>
            <p class="migration-canvas__hint">{{ t('explorer.tableMigrationWizard.canvasTargetHint') }}</p>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>
