<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwButton, DwCheckbox, DwInput, EmptyState, FormField} from '@/core/components'
import DwSelect from '@/core/components/DwSelect.vue'
import type {SelectOption} from '@/core/components/select.types'
import {DwIcon} from '@/core/icons'
import MigrationWizardSteps from '@/features/workspace/components/migration/MigrationWizardSteps.vue'
import VisualQueryCanvas from '@/features/workspace/components/VisualQueryCanvas.vue'
import VisualQueryFieldBoard from '@/features/workspace/components/VisualQueryFieldBoard.vue'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {
    ensureDatabaseTablesLoaded,
    ensureTableColumnsLoaded,
} from '@/features/workspace/services/sql-schema-loader'
import {
    buildVisualQuerySql,
    createEmptyVisualJoin,
    createEmptyVisualQueryState,
    moveSelectedColumnKey,
    removeSelectedColumnKey,
    suggestTableAlias,
    upsertSelectedColumnKey,
    visualColumnKey,
    type VisualJoinType,
    type VisualQueryBuilderState,
} from '@/features/workspace/services/visual-query-builder.service'

type VqbStep = 'table' | 'columns' | 'join' | 'filter'

const props = defineProps<{
  open: boolean
  connectionId?: string
  database?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  apply: [sql: string, mode: 'replace' | 'insert']
  'apply-and-run': [sql: string]
  'text-to-sql': [prompt: string]
}>()

const {t} = useI18n()
const explorer = useExplorerStore()
const layout = useLayoutStore()

const wizardStep = ref<VqbStep>('table')
const state = ref<VisualQueryBuilderState>(createEmptyVisualQueryState())
const tableNames = ref<string[]>([])
const tableIds = ref<Record<string, string>>({})
const fromColumns = ref<string[]>([])
/** Per-JOIN column lists keyed by join index */
const joinColumnsByIndex = ref<Record<number, string[]>>({})
const selectedColumnKeys = ref<string[]>([])
const loadingTables = ref(false)
const loadingColumns = ref(false)
const tableFilter = ref('')
const textToSqlPrompt = ref('')

const JOIN_TYPES: VisualJoinType[] = ['INNER', 'LEFT', 'RIGHT', 'CROSS']
const MAX_JOINS = 8
const joinViewMode = ref<'form' | 'canvas'>('canvas')

const wizardSteps = computed(() => [
  {id: 'table' as const, label: t('console.visualQuery.steps.table'), number: 1},
  {id: 'columns' as const, label: t('console.visualQuery.steps.columns'), number: 2},
  {id: 'join' as const, label: t('console.visualQuery.steps.join'), number: 3},
  {id: 'filter' as const, label: t('console.visualQuery.steps.filter'), number: 4},
])

const filteredTables = computed(() => {
  const query = tableFilter.value.trim().toLowerCase()
  if (!query) return tableNames.value
  return tableNames.value.filter((name) => name.toLowerCase().includes(query))
})

const joinTypeOptions = computed<SelectOption[]>(() =>
    JOIN_TYPES.map((type) => ({
      value: type,
      label: t(`console.visualQuery.joinTypes.${type}`),
    })),
)

const configuredJoins = computed(() =>
    state.value.joins.filter((join) => join.table.trim()),
)

const previewColumns = computed(() =>
    selectedColumnKeys.value.map((key) => {
      const dot = key.indexOf('.')
      if (dot <= 0) {
        return {tableAlias: state.value.fromAlias, column: key}
      }
      return {
        tableAlias: key.slice(0, dot),
        column: key.slice(dot + 1),
      }
    }),
)

const previewSql = computed(() =>
    buildVisualQuerySql({
      ...state.value,
      columns: previewColumns.value,
    }),
)

const canApply = computed(() => Boolean(state.value.fromTable.trim() && previewSql.value.trim()))

const selectedColumnCount = computed(() => selectedColumnKeys.value.length)

const canAddJoin = computed(() => state.value.joins.length < MAX_JOINS)

const summaryBits = computed(() => {
  const bits: string[] = []
  if (state.value.fromTable) {
    bits.push(t('console.visualQuery.summary.table', {table: state.value.fromTable}))
  }
  if (selectedColumnCount.value > 0) {
    bits.push(t('console.visualQuery.summary.columns', {count: selectedColumnCount.value}))
  } else if (state.value.fromTable) {
    bits.push(t('console.visualQuery.summary.allColumns'))
  }
  for (const join of configuredJoins.value) {
    bits.push(t('console.visualQuery.summary.join', {
      type: t(`console.visualQuery.joinTypes.${join.type}`),
      table: join.table,
    }))
  }
  if (state.value.where?.trim()) bits.push(t('console.visualQuery.summary.where'))
  if (state.value.orderBy?.trim()) bits.push(t('console.visualQuery.summary.orderBy'))
  if (state.value.limit != null && state.value.limit > 0) {
    bits.push(t('console.visualQuery.summary.limit', {count: state.value.limit}))
  }
  return bits
})

const stepTip = computed(() => t(`console.visualQuery.tips.${wizardStep.value}`))

function isStepCompleted(step: string): boolean {
  if (step === 'table') return Boolean(state.value.fromTable)
  if (step === 'columns') return Boolean(state.value.fromTable)
  if (step === 'join') return Boolean(state.value.fromTable)
  if (step === 'filter') return canApply.value
  return false
}

function isStepAccessible(step: string): boolean {
  if (step === 'table') return true
  return Boolean(state.value.fromTable)
}

function goToStep(step: string) {
  if (!isStepAccessible(step) && wizardStep.value !== step) return
  wizardStep.value = step as VqbStep
}

function goNext() {
  if (wizardStep.value === 'table') {
    if (!state.value.fromTable) return
    wizardStep.value = 'columns'
    return
  }
  if (wizardStep.value === 'columns') {
    wizardStep.value = 'join'
    return
  }
  if (wizardStep.value === 'join') {
    wizardStep.value = 'filter'
  }
}

function goBack() {
  if (wizardStep.value === 'columns') wizardStep.value = 'table'
  else if (wizardStep.value === 'join') wizardStep.value = 'columns'
  else if (wizardStep.value === 'filter') wizardStep.value = 'join'
}

const canGoNext = computed(() => {
  if (wizardStep.value === 'table') return Boolean(state.value.fromTable)
  if (wizardStep.value === 'columns' || wizardStep.value === 'join') return Boolean(state.value.fromTable)
  return false
})

const showNext = computed(() => wizardStep.value !== 'filter')

async function loadTables() {
  const connectionId = props.connectionId?.trim()
  const database = props.database?.trim()
  if (!connectionId || !database) {
    tableNames.value = []
    tableIds.value = {}
    return
  }
  loadingTables.value = true
  try {
    const result = await ensureDatabaseTablesLoaded(explorer, connectionId, database)
    tableNames.value = result.tables
    tableIds.value = result.tableIds
  } finally {
    loadingTables.value = false
  }
}

async function loadFromColumns(table: string) {
  const tableId = tableIds.value[table]
  if (!tableId) {
    fromColumns.value = []
    return
  }
  loadingColumns.value = true
  try {
    const result = await ensureTableColumnsLoaded(explorer, tableId)
    fromColumns.value = result.columns.map((column) => column.name).filter(Boolean)
  } finally {
    loadingColumns.value = false
  }
}

async function loadJoinColumns(index: number, table: string) {
  const tableId = tableIds.value[table]
  if (!tableId) {
    joinColumnsByIndex.value = {...joinColumnsByIndex.value, [index]: []}
    return
  }
  loadingColumns.value = true
  try {
    const result = await ensureTableColumnsLoaded(explorer, tableId)
    joinColumnsByIndex.value = {
      ...joinColumnsByIndex.value,
      [index]: result.columns.map((column) => column.name).filter(Boolean),
    }
  } finally {
    loadingColumns.value = false
  }
}

function resetState() {
  wizardStep.value = 'table'
  state.value = createEmptyVisualQueryState()
  selectedColumnKeys.value = []
  fromColumns.value = []
  joinColumnsByIndex.value = {}
  tableFilter.value = ''
  textToSqlPrompt.value = ''
  joinViewMode.value = 'canvas'
}

watch(
    () => props.open,
    async (open) => {
      if (!open) return
      resetState()
      await loadTables()
    },
)

watch(
    () => state.value.fromTable,
    async (table) => {
      if (!table) {
        state.value.fromAlias = ''
        fromColumns.value = []
        selectedColumnKeys.value = []
        state.value.joins = []
        joinColumnsByIndex.value = {}
        return
      }
      state.value.fromAlias = suggestTableAlias(table, [])
      selectedColumnKeys.value = []
      state.value.joins = []
      joinColumnsByIndex.value = {}
      await loadFromColumns(table)
    },
)

function usedAliases(exceptIndex?: number): string[] {
  const aliases = [state.value.fromAlias]
  state.value.joins.forEach((join, index) => {
    if (index === exceptIndex) return
    if (join.alias.trim()) aliases.push(join.alias)
  })
  return aliases.filter(Boolean)
}

function usedTables(exceptIndex?: number): Set<string> {
  const used = new Set<string>()
  if (state.value.fromTable) used.add(state.value.fromTable)
  state.value.joins.forEach((join, index) => {
    if (index === exceptIndex) return
    if (join.table.trim()) used.add(join.table)
  })
  return used
}

function joinTableOptionsFor(index: number): SelectOption[] {
  const used = usedTables(index)
  return [
    {value: '', label: t('console.visualQuery.selectTable')},
    ...tableNames.value
        .filter((name) => !used.has(name))
        .map((name) => ({value: name, label: name})),
  ]
}

const canvasAvailableTables = computed(() => {
  const used = usedTables()
  return tableNames.value.filter((name) => !used.has(name))
})

function leftOnOptionsFor(index: number): SelectOption[] {
  const options: SelectOption[] = [
    {value: '', label: t('console.visualQuery.selectColumn')},
  ]
  const fromAlias = state.value.fromAlias
  for (const column of fromColumns.value) {
    const value = `${fromAlias}.${column}`
    options.push({value, label: value})
  }
  for (let i = 0; i < index; i += 1) {
    const join = state.value.joins[i]
    if (!join?.alias || !join.table) continue
    for (const column of joinColumnsByIndex.value[i] ?? []) {
      const value = `${join.alias}.${column}`
      options.push({value, label: value})
    }
  }
  return options
}

function rightOnOptionsFor(index: number): SelectOption[] {
  const join = state.value.joins[index]
  const alias = join?.alias || 't'
  return [
    {value: '', label: t('console.visualQuery.selectColumn')},
    ...(joinColumnsByIndex.value[index] ?? []).map((column) => {
      const value = `${alias}.${column}`
      return {value, label: value}
    }),
  ]
}

function pickTable(table: string) {
  state.value.fromTable = table
}

function toggleColumn(alias: string, column: string) {
  const key = visualColumnKey(alias, column)
  if (selectedColumnKeys.value.includes(key)) {
    selectedColumnKeys.value = removeSelectedColumnKey(selectedColumnKeys.value, key)
  } else {
    selectedColumnKeys.value = upsertSelectedColumnKey(selectedColumnKeys.value, key)
  }
}

function isColumnSelected(alias: string, column: string) {
  return selectedColumnKeys.value.includes(visualColumnKey(alias, column))
}

function onColumnDragStart(event: DragEvent, alias: string, column: string) {
  const key = visualColumnKey(alias, column)
  event.dataTransfer?.setData('text/vqb-column', key)
  event.dataTransfer?.setData('text/plain', key)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}

function onFieldBoardReorder(fromIndex: number, toIndex: number) {
  selectedColumnKeys.value = moveSelectedColumnKey(selectedColumnKeys.value, fromIndex, toIndex)
}

function onFieldBoardDropKey(key: string, toIndex: number) {
  selectedColumnKeys.value = upsertSelectedColumnKey(selectedColumnKeys.value, key, toIndex)
}

function onFieldBoardRemove(key: string) {
  selectedColumnKeys.value = removeSelectedColumnKey(selectedColumnKeys.value, key)
}

function submitTextToSql() {
  const prompt = textToSqlPrompt.value.trim()
  if (!prompt) return
  emit('text-to-sql', prompt)
  textToSqlPrompt.value = ''
  close()
}

async function copyPreviewSql() {
  const sql = previewSql.value.trim()
  if (!sql) return
  try {
    await navigator.clipboard.writeText(sql)
    layout.showSuccessToast(t('console.visualQuery.copySqlDone'))
  } catch {
    layout.showErrorToast(t('console.visualQuery.copySqlFailed'))
  }
}

function refineWithAi() {
  const sql = previewSql.value.trim()
  if (!sql) return
  const prompt = t('console.visualQuery.refineAiPrompt', {sql})
  emit('text-to-sql', prompt)
  close()
}

function selectAllFromColumns() {
  const alias = state.value.fromAlias || suggestTableAlias(state.value.fromTable)
  const fromKeys = fromColumns.value.map((column) => visualColumnKey(alias, column))
  const keepJoin = selectedColumnKeys.value.filter((key) => !key.startsWith(`${alias}.`))
  selectedColumnKeys.value = [...fromKeys, ...keepJoin]
}

function selectAllJoinColumns(index: number) {
  const join = state.value.joins[index]
  if (!join?.alias) return
  const joinKeys = (joinColumnsByIndex.value[index] ?? []).map(
      (column) => visualColumnKey(join.alias, column),
  )
  const keepOthers = selectedColumnKeys.value.filter(
      (key) => !key.startsWith(`${join.alias}.`),
  )
  selectedColumnKeys.value = [...keepOthers, ...joinKeys]
}

function clearColumns() {
  selectedColumnKeys.value = []
}

function addJoin() {
  if (!canAddJoin.value) return
  state.value.joins = [...state.value.joins, createEmptyVisualJoin('LEFT')]
}

async function dropTableOnCanvas(table: string) {
  const name = table.trim()
  if (!name) return
  if (!state.value.fromTable) {
    pickTable(name)
    return
  }
  if (name === state.value.fromTable) return
  if (state.value.joins.some((join) => join.table === name)) return
  if (!canAddJoin.value) return
  const index = state.value.joins.length
  state.value.joins = [...state.value.joins, createEmptyVisualJoin('LEFT')]
  await setJoinTable(index, name)
}

function removeJoin(index: number) {
  const removed = state.value.joins[index]
  state.value.joins = state.value.joins.filter((_, i) => i !== index)
  const nextColumns: Record<number, string[]> = {}
  state.value.joins.forEach((_, i) => {
    const sourceIndex = i < index ? i : i + 1
    nextColumns[i] = joinColumnsByIndex.value[sourceIndex] ?? []
  })
  joinColumnsByIndex.value = nextColumns
  if (removed?.alias) {
    selectedColumnKeys.value = selectedColumnKeys.value.filter(
        (key) => !key.startsWith(`${removed.alias}.`),
    )
  }
}

function setJoinType(index: number, type: string) {
  const join = state.value.joins[index]
  if (!join) return
  join.type = type as VisualJoinType
  if (type === 'CROSS') {
    join.onLeft = ''
    join.onRight = ''
  }
}

async function setJoinTable(index: number, table: string) {
  const join = state.value.joins[index]
  if (!join) return
  const previousAlias = join.alias
  join.table = table
  join.onLeft = ''
  join.onRight = ''
  if (!table) {
    join.alias = ''
    joinColumnsByIndex.value = {...joinColumnsByIndex.value, [index]: []}
    if (previousAlias) {
      selectedColumnKeys.value = selectedColumnKeys.value.filter(
          (key) => !key.startsWith(`${previousAlias}.`),
      )
    }
    return
  }
  join.alias = suggestTableAlias(table, usedAliases(index))
  if (previousAlias && previousAlias !== join.alias) {
    selectedColumnKeys.value = selectedColumnKeys.value.filter(
        (key) => !key.startsWith(`${previousAlias}.`),
    )
  }
  await loadJoinColumns(index, table)
}

function setJoinOnLeft(index: number, value: string) {
  const join = state.value.joins[index]
  if (!join) return
  join.onLeft = value
}

function setJoinOnRight(index: number, value: string) {
  const join = state.value.joins[index]
  if (!join) return
  join.onRight = value
}

function close() {
  emit('update:open', false)
}

function apply(mode: 'replace' | 'insert') {
  if (!canApply.value) return
  emit('apply', previewSql.value, mode)
  close()
}

function runInConsole() {
  if (!canApply.value) return
  emit('apply-and-run', previewSql.value)
  close()
}

const limitModel = computed({
  get: () => (state.value.limit == null ? '' : String(state.value.limit)),
  set: (value: string) => {
    const parsed = Number(value)
    state.value.limit = value.trim() && Number.isFinite(parsed) ? parsed : null
  },
})

const scopeLabel = computed(() => {
  const database = props.database?.trim()
  return database || '—'
})
</script>

<template>
  <AppModal
      :open="open"
      :title="t('console.visualQuery.title')"
      :subtitle="t('console.visualQuery.subtitle')"
      width="960px"
      max-height="88vh"
      @close="close"
  >
    <div class="vqb">
      <MigrationWizardSteps
          :steps="wizardSteps"
          :active-step="wizardStep"
          :ariaLabel="t('console.visualQuery.flowAria')"
          :is-step-accessible="isStepAccessible"
          :is-step-completed="isStepCompleted"
          @step-click="goToStep"
      />

      <div class="vqb__layout">
        <div class="vqb__main">
          <div class="vqb__tip modal-body-hint">
            <DwIcon name="info" size="sm" :stroke-width="1.5"/>
            <p>{{ stepTip }}</p>
          </div>

          <!-- Step 1: table -->
          <section v-if="wizardStep === 'table'" class="vqb__panel">
            <header class="vqb__panel-head">
              <div>
                <h3>{{ t('console.visualQuery.fromTable') }}</h3>
                <p>{{ t('console.visualQuery.fromTableHint', {database: scopeLabel}) }}</p>
              </div>
              <DwInput
                  v-model="tableFilter"
                  class="vqb__search"
                  type="search"
                  :placeholder="t('console.visualQuery.filterTables')"
              />
            </header>

            <EmptyState
                v-if="loadingTables"
                embedded
                bordered
                :title="t('console.visualQuery.loadingTables')"
            />
            <EmptyState
                v-else-if="!filteredTables.length"
                embedded
                bordered
                :title="tableFilter.trim()
                  ? t('console.visualQuery.noFilterMatch')
                  : t('console.visualQuery.noTables')"
            />
            <ul v-else class="vqb__table-list" role="listbox">
              <li v-for="table in filteredTables" :key="table">
                <button
                    type="button"
                    class="vqb__table-item"
                    :class="{ 'is-active': state.fromTable === table }"
                    role="option"
                    :aria-selected="state.fromTable === table"
                    @click="pickTable(table)"
                    @dblclick="pickTable(table); goNext()"
                >
                  <DwIcon name="table" size="sm" :stroke-width="1.4"/>
                  <span class="vqb__table-name">{{ table }}</span>
                  <DwIcon
                      v-if="state.fromTable === table"
                      class="vqb__table-check"
                      name="check"
                      size="xs"
                      :stroke-width="1.8"
                  />
                </button>
              </li>
            </ul>
            <p v-if="state.fromAlias" class="vqb__meta">
              {{ t('console.visualQuery.alias', {alias: state.fromAlias}) }}
            </p>
          </section>

          <!-- Step 2: columns -->
          <section v-else-if="wizardStep === 'columns'" class="vqb__panel">
            <header class="vqb__panel-head">
              <div>
                <h3>{{ t('console.visualQuery.columns') }}</h3>
                <p>{{ t('console.visualQuery.columnsHint') }}</p>
              </div>
              <div class="vqb__section-actions">
                <button type="button" class="vqb__link" @click="selectAllFromColumns">
                  {{ t('console.visualQuery.selectAll') }}
                </button>
                <button type="button" class="vqb__link" @click="clearColumns">
                  {{ t('console.visualQuery.clear') }}
                </button>
              </div>
            </header>

            <div class="vqb__columns-layout">
              <div class="vqb__columns-source">
                <div class="vqb__col-group">
                  <div class="vqb__col-group-title">
                    {{ t('console.visualQuery.fromColumns', {table: state.fromTable, alias: state.fromAlias}) }}
                  </div>
                  <div class="vqb__columns" :class="{ 'is-loading': loadingColumns }">
                    <DwCheckbox
                        v-for="column in fromColumns"
                        :key="`from-${column}`"
                        class="vqb__column"
                        :class="{ 'is-checked': isColumnSelected(state.fromAlias, column) }"
                        :model-value="isColumnSelected(state.fromAlias, column)"
                        draggable="true"
                        @dragstart="onColumnDragStart($event, state.fromAlias, column)"
                        @update:model-value="toggleColumn(state.fromAlias, column)"
                    >
                      {{ column }}
                    </DwCheckbox>
                  </div>
                </div>

                <div
                    v-for="(join, index) in state.joins"
                    :key="`join-cols-${index}-${join.alias}`"
                    class="vqb__col-group"
                >
                  <template v-if="join.table && join.alias">
                    <div class="vqb__col-group-title">
                      <span>
                        {{ t('console.visualQuery.joinColumns', {table: join.table, alias: join.alias}) }}
                      </span>
                      <button type="button" class="vqb__link" @click="selectAllJoinColumns(index)">
                        {{ t('console.visualQuery.selectAll') }}
                      </button>
                    </div>
                    <div class="vqb__columns">
                      <DwCheckbox
                          v-for="column in (joinColumnsByIndex[index] ?? [])"
                          :key="`join-${index}-${column}`"
                          class="vqb__column"
                          :class="{ 'is-checked': isColumnSelected(join.alias, column) }"
                          :model-value="isColumnSelected(join.alias, column)"
                          draggable="true"
                          @dragstart="onColumnDragStart($event, join.alias, column)"
                          @update:model-value="toggleColumn(join.alias, column)"
                      >
                        {{ column }}
                      </DwCheckbox>
                    </div>
                  </template>
                </div>
              </div>

              <VisualQueryFieldBoard
                  :keys="selectedColumnKeys"
                  @reorder="onFieldBoardReorder"
                  @drop-key="onFieldBoardDropKey"
                  @remove="onFieldBoardRemove"
              />
            </div>
          </section>

          <!-- Step 3: join -->
          <section v-else-if="wizardStep === 'join'" class="vqb__panel">
            <header class="vqb__panel-head">
              <div>
                <h3>{{ t('console.visualQuery.join') }}</h3>
                <p>{{ t('console.visualQuery.joinHint') }}</p>
              </div>
              <div class="vqb__join-toolbar">
                <div class="dw-segment" role="tablist" :aria-label="t('console.visualQuery.joinView')">
                  <button
                      type="button"
                      class="dw-segment__btn"
                      :class="{ 'is-active': joinViewMode === 'canvas' }"
                      role="tab"
                      :aria-selected="joinViewMode === 'canvas'"
                      @click="joinViewMode = 'canvas'"
                  >
                    {{ t('console.visualQuery.joinViewCanvas') }}
                  </button>
                  <button
                      type="button"
                      class="dw-segment__btn"
                      :class="{ 'is-active': joinViewMode === 'form' }"
                      role="tab"
                      :aria-selected="joinViewMode === 'form'"
                      @click="joinViewMode = 'form'"
                  >
                    {{ t('console.visualQuery.joinViewForm') }}
                  </button>
                </div>
                <DwButton
                    v-if="joinViewMode === 'form'"
                    variant="secondary"
                    size="sm"
                    type="button"
                    :disabled="!canAddJoin"
                    @click="addJoin"
                >
                  {{ t('console.visualQuery.addJoin') }}
                </DwButton>
              </div>
            </header>

            <VisualQueryCanvas
                v-if="joinViewMode === 'canvas'"
                :from-table="state.fromTable"
                :from-alias="state.fromAlias"
                :joins="state.joins"
                :available-tables="canvasAvailableTables"
                :join-type-options="joinTypeOptions"
                :left-on-options="leftOnOptionsFor"
                :right-on-options="rightOnOptionsFor"
                :can-add-join="canAddJoin"
                @drop-table="dropTableOnCanvas"
                @remove-join="removeJoin"
                @set-join-type="setJoinType"
                @set-join-on-left="setJoinOnLeft"
                @set-join-on-right="setJoinOnRight"
            />

            <template v-else>
              <div v-if="!state.joins.length" class="vqb__skip-card">
                <DwIcon name="info" size="sm" :stroke-width="1.6"/>
                <div>
                  <strong>{{ t('console.visualQuery.skipJoinTitle') }}</strong>
                  <p>{{ t('console.visualQuery.skipJoinBody') }}</p>
                </div>
              </div>

              <div v-else class="vqb__join-list">
                <article
                    v-for="(join, index) in state.joins"
                    :key="`join-card-${index}`"
                    class="vqb__join-card"
                >
                  <header class="vqb__join-card-head">
                    <strong>{{ t('console.visualQuery.joinCardTitle', {n: index + 1}) }}</strong>
                    <button type="button" class="vqb__link" @click="removeJoin(index)">
                      {{ t('console.visualQuery.removeJoin') }}
                    </button>
                  </header>

                  <div class="vqb__join-form">
                    <FormField :label="t('console.visualQuery.joinType')">
                      <DwSelect
                          :model-value="join.type"
                          size="sm"
                          :options="joinTypeOptions"
                          @update:model-value="setJoinType(index, $event)"
                      />
                    </FormField>
                    <FormField :label="t('console.visualQuery.joinTable')">
                      <DwSelect
                          :model-value="join.table"
                          size="sm"
                          :options="joinTableOptionsFor(index)"
                          @update:model-value="setJoinTable(index, $event)"
                      />
                    </FormField>
                    <div v-if="join.type !== 'CROSS'" class="vqb__join-on">
                      <FormField :label="t('console.visualQuery.joinOnLeft')">
                        <DwSelect
                            :model-value="join.onLeft"
                            size="sm"
                            :options="leftOnOptionsFor(index)"
                            @update:model-value="setJoinOnLeft(index, $event)"
                        />
                      </FormField>
                      <span class="vqb__eq-row" aria-hidden="true">=</span>
                      <FormField :label="t('console.visualQuery.joinOnRight')">
                        <DwSelect
                            :model-value="join.onRight"
                            size="sm"
                            :options="rightOnOptionsFor(index)"
                            @update:model-value="setJoinOnRight(index, $event)"
                        />
                      </FormField>
                    </div>
                    <p v-if="join.alias" class="vqb__meta vqb__join-hint">
                      {{ t('console.visualQuery.alias', {alias: join.alias}) }}
                      · {{ t('console.visualQuery.joinOnHint') }}
                    </p>
                  </div>
                </article>

                <DwButton
                    v-if="canAddJoin"
                    variant="ghost"
                    size="sm"
                    type="button"
                    class="vqb__add-join"
                    @click="addJoin"
                >
                  {{ t('console.visualQuery.addAnotherJoin') }}
                </DwButton>
              </div>
            </template>
          </section>

          <!-- Step 4: filter -->
          <section v-else class="vqb__panel">
            <header class="vqb__panel-head">
              <div>
                <h3>{{ t('console.visualQuery.filterTitle') }}</h3>
                <p>{{ t('console.visualQuery.filterHint') }}</p>
              </div>
            </header>

            <div class="vqb__filter-grid">
              <FormField :label="t('console.visualQuery.where')">
                <DwInput
                    v-model="state.where"
                    type="text"
                    :placeholder="t('console.visualQuery.wherePlaceholder')"
                />
              </FormField>
              <FormField :label="t('console.visualQuery.orderBy')">
                <DwInput
                    v-model="state.orderBy"
                    type="text"
                    :placeholder="t('console.visualQuery.orderByPlaceholder')"
                />
              </FormField>
              <FormField :label="t('console.visualQuery.limit')">
                <DwInput v-model="limitModel" type="number" :min="1" :step="1"/>
              </FormField>
            </div>
            <p class="vqb__meta">{{ t('console.visualQuery.filterOptional') }}</p>
          </section>
        </div>

        <aside class="vqb__side">
          <div class="modal-preview-section vqb__side-block">
            <header class="modal-preview-section__head">
              <span>{{ t('console.visualQuery.checklist') }}</span>
            </header>
            <ul v-if="summaryBits.length" class="vqb__checklist">
              <li v-for="(bit, index) in summaryBits" :key="index">{{ bit }}</li>
            </ul>
            <p v-else class="vqb__side-empty">{{ t('console.visualQuery.checklistEmpty') }}</p>
          </div>

          <div class="modal-preview-section vqb__side-block vqb__side-block--preview">
            <header class="modal-preview-section__head">
              <span>{{ t('console.visualQuery.preview') }}</span>
              <span v-if="canApply" class="modal-preview-section__meta">{{ t('console.visualQuery.livePreview') }}</span>
            </header>
            <pre class="modal-code-block modal-code-block--preview vqb__preview">{{ previewSql || t('console.visualQuery.previewEmpty') }}</pre>
          </div>

          <div class="modal-preview-section vqb__side-block vqb__side-block--text">
            <header class="modal-preview-section__head">
              <span>{{ t('console.visualQuery.textToSqlTitle') }}</span>
            </header>
            <p class="vqb__text-hint">{{ t('console.visualQuery.textToSqlHint') }}</p>
            <DwInput
                v-model="textToSqlPrompt"
                class="vqb__text-input"
                :rows="3"
                :placeholder="t('console.visualQuery.textToSqlPlaceholder')"
                @keydown.enter.exact.prevent="submitTextToSql"
            />
            <DwButton
                variant="secondary"
                type="button"
                size="sm"
                :disabled="!textToSqlPrompt.trim()"
                @click="submitTextToSql"
            >
              {{ t('console.visualQuery.textToSqlSubmit') }}
            </DwButton>
            <DwButton
                variant="ghost"
                type="button"
                size="sm"
                :disabled="!canApply"
                @click="refineWithAi"
            >
              {{ t('console.visualQuery.refineWithAi') }}
            </DwButton>
          </div>
        </aside>
      </div>
    </div>

    <template #footer>
      <div class="modal-footer-row">
        <div class="modal-footer-row__end">
          <DwButton
              v-if="wizardStep !== 'table'"
              variant="ghost"
              type="button"
              @click="goBack"
          >
            {{ t('console.visualQuery.back') }}
          </DwButton>
          <DwButton
              v-if="showNext"
              variant="secondary"
              type="button"
              :disabled="!canGoNext"
              @click="goNext"
          >
            {{ t('console.visualQuery.next') }}
          </DwButton>
        </div>
        <div class="modal-footer-row__end">
          <DwButton variant="ghost" type="button" @click="close">
            {{ t('common.cancel') }}
          </DwButton>
          <DwButton
              variant="ghost"
              type="button"
              :disabled="!canApply"
              @click="copyPreviewSql"
          >
            {{ t('console.visualQuery.copySql') }}
          </DwButton>
          <DwButton
              variant="secondary"
              type="button"
              :disabled="!canApply"
              @click="apply('insert')"
          >
            {{ t('console.visualQuery.insert') }}
          </DwButton>
          <DwButton
              variant="secondary"
              type="button"
              :disabled="!canApply"
              @click="apply('replace')"
          >
            {{ t('console.visualQuery.replace') }}
          </DwButton>
          <DwButton
              variant="primary"
              type="button"
              :disabled="!canApply"
              @click="runInConsole"
          >
            {{ t('console.visualQuery.runInConsole') }}
          </DwButton>
        </div>
      </div>
    </template>
  </AppModal>
</template>

<style scoped>
.vqb {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-5);
  min-height: 0;
}

.vqb :deep(.migration-flow) {
  margin-top: 0;
}

.vqb__layout {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(240px, 0.85fr);
  gap: var(--dw-space-6);
  min-height: 0;
}

.vqb__main {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-4);
  min-width: 0;
}

.vqb__tip {
  display: flex;
  align-items: flex-start;
  gap: var(--dw-gap);
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading);
}

.vqb__tip p {
  margin: 0;
}

.vqb__panel {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-4);
  min-height: 260px;
}

.vqb__panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--dw-gap);
}

.vqb__panel-head h3 {
  margin: 0 0 var(--dw-space-1);
  font-size: var(--dw-text-md);
  font-weight: 600;
  color: var(--dw-text);
}

.vqb__panel-head p {
  margin: 0;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
}

.vqb__search,
:deep(.vqb__search) {
  width: min(220px, 40%);
  flex-shrink: 0;
}

.vqb__section-actions {
  display: inline-flex;
  gap: var(--dw-gap);
  flex-shrink: 0;
}

.vqb__table-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 300px;
  overflow: auto;
  border: var(--dw-border-width) solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg);
}

.vqb__table-item {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
  width: 100%;
  padding: var(--dw-pad-control-lg);
  border: none;
  border-bottom: var(--dw-border-width) solid var(--dw-border-light);
  background: transparent;
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
  text-align: left;
  cursor: pointer;
  transition: var(--dw-transition-colors);
}

.vqb__table-list li:last-child .vqb__table-item {
  border-bottom: none;
}

.vqb__table-item:hover {
  background: var(--dw-bg-hover);
}

.vqb__table-item.is-active {
  background: var(--dw-primary-soft);
  color: var(--dw-primary);
  font-weight: 600;
}

.vqb__table-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--dw-font-mono);
  font-size: var(--dw-text-xs);
}

.vqb__table-check {
  flex-shrink: 0;
  color: var(--dw-primary);
}

.vqb__meta {
  margin: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.vqb__col-group {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-sm);
}

.vqb__col-group-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  color: var(--dw-text-secondary);
}

.vqb__columns-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(200px, 0.9fr);
  gap: var(--dw-space-4);
  align-items: start;
}

.vqb__columns-source {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-4);
  min-width: 0;
}

.vqb__columns {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: var(--dw-gap-xs);
  max-height: 200px;
  overflow: auto;
  padding: var(--dw-space-3);
  border: var(--dw-border-width) solid var(--dw-border-light);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg);
}

.vqb__column {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  padding: var(--dw-space-2) var(--dw-space-3);
  border-radius: var(--dw-radius-xs);
  font-size: var(--dw-text-sm);
  color: var(--dw-text);
  cursor: grab;
}

.vqb__column.is-checked {
  background: var(--dw-primary-soft);
  color: var(--dw-primary);
  font-weight: 600;
}

.vqb__join-toolbar {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap);
  flex-shrink: 0;
}




.vqb__join-list {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-4);
}

.vqb__join-card {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-3);
  padding: var(--dw-pad-control-lg);
  border: var(--dw-border-width) solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg);
}

.vqb__join-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
}

.vqb__join-card-head strong {
  font-size: var(--dw-text-sm);
  color: var(--dw-text);
}

.vqb__add-join {
  align-self: flex-start;
}

.vqb__skip-card {
  display: flex;
  gap: var(--dw-gap);
  align-items: flex-start;
  padding: var(--dw-pad-control-lg);
  border: var(--dw-border-width) solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-muted);
}

.vqb__skip-card strong {
  display: block;
  margin-bottom: var(--dw-space-1);
  font-size: var(--dw-text-sm);
  color: var(--dw-text);
}

.vqb__skip-card p {
  margin: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.vqb__join-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--dw-space-4);
  align-items: end;
}

.vqb__join-on {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: var(--dw-space-3);
  align-items: end;
}

.vqb__join-hint {
  grid-column: 1 / -1;
}

.vqb__eq-row {
  padding-bottom: var(--dw-space-3);
  color: var(--dw-text-muted);
  font-weight: 700;
}

.vqb__filter-grid {
  display: grid;
  grid-template-columns: 1.4fr 1.2fr 0.6fr;
  gap: var(--dw-space-4);
}

.vqb__link {
  border: none;
  background: transparent;
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}

.vqb__link:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.vqb__side {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-5);
  min-width: 0;
  padding-left: var(--dw-space-5);
  border-left: var(--dw-border-width) solid var(--dw-border-light);
}

.vqb__side-block {
  min-height: 0;
}

.vqb__side-block--preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.vqb__side-block--text {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-3);
}

.vqb__text-hint {
  margin: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  line-height: var(--dw-leading);
}

.vqb__text-input,
:deep(.vqb__text-input) {
  width: 100%;
  resize: vertical;
  min-height: 4.5rem;
}

.vqb__checklist {
  margin: 0;
  padding-left: var(--dw-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
  font-size: var(--dw-text-sm);
  color: var(--dw-text-secondary);
}

.vqb__side-empty {
  margin: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.vqb__preview {
  margin: 0;
  flex: 1;
  min-height: 160px;
  max-height: 340px;
  overflow: auto;
  padding: var(--dw-space-4);
  border: var(--dw-border-width) solid var(--dw-border-light);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-muted);
  color: var(--dw-text-secondary);
  white-space: pre-wrap;
}

@media (max-width: 860px) {
  .vqb__layout {
    grid-template-columns: 1fr;
  }

  .vqb__columns-layout {
    grid-template-columns: 1fr;
  }

  .vqb__side {
    padding-left: 0;
    border-left: none;
    border-top: var(--dw-border-width) solid var(--dw-border-light);
    padding-top: var(--dw-space-5);
  }

  .vqb__filter-grid,
  .vqb__join-form,
  .vqb__join-on {
    grid-template-columns: 1fr;
  }

  .vqb__search,
  :deep(.vqb__search) {
    width: 100%;
  }

  .vqb__panel-head {
    flex-direction: column;
  }
}
</style>
