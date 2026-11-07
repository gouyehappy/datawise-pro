<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwCheckbox, EmptyState} from '@/core/components'
import DwSelect from '@/core/components/DwSelect.vue'
import type {SelectOption} from '@/core/components/select.types'
import type {TableColumn, TableRow} from '@/core/types'
import {DwIcon} from '@/core/icons'
import type {DwIconName} from '@/core/icons'
import AiAnalysisChart from '@/shared/charts/EchartsPanel.vue'
import {buildChartOption as buildAiChartOption} from '@/shared/charts/build-chart-option'
import SaveChartToDashboardDialog from '@/features/dashboard/components/SaveChartToDashboardDialog.vue'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {
  buildDefaultQueryResultChartConfig,
  inferQueryResultChartFields,
  limitQueryResultChartRows,
  pivotQueryResultRows,
  toAiChartSpec,
  type QueryResultChartConfig,
  type QueryResultChartType,
} from '@/features/workspace/services/query-result-chart.service'

const props = defineProps<{
  columns: TableColumn[]
  rows: TableRow[]
  title?: string
}>()

const viewMode = defineModel<'grid' | 'chart'>('viewMode', {default: 'chart'})

const {t} = useI18n()
const layout = useLayoutStore()

const chartTypes: QueryResultChartType[] = ['bar', 'line', 'pie']
const chartTypeIcons: Record<QueryResultChartType, DwIconName> = {
  bar: 'chart-bar',
  line: 'chart-line',
  pie: 'chart-pie',
}
const config = ref<QueryResultChartConfig | null>(null)
const pivotEnabled = ref(false)
const saveDialogOpen = ref(false)

const chartSourceRows = computed(() => limitQueryResultChartRows(props.rows))

const fields = computed(() => inferQueryResultChartFields(props.columns, chartSourceRows.value))

const dimensionOptions = computed<SelectOption[]>(() =>
    fields.value
        .filter((field) => field.kind === 'dimension')
        .map((field) => ({value: field.key, label: field.label})),
)

const measureOptions = computed<SelectOption[]>(() =>
    fields.value
        .filter((field) => field.kind === 'measure')
        .map((field) => ({value: field.key, label: field.label})),
)

const chartRows = computed(() => {
  if (!config.value) return chartSourceRows.value
  if (!pivotEnabled.value) return chartSourceRows.value
  return pivotQueryResultRows(chartSourceRows.value, config.value.xField, config.value.yFields)
})

const chartSpec = computed(() => {
  if (!config.value) return null
  return toAiChartSpec(config.value, props.columns)
})

const chartOption = computed(() => {
  if (!chartSpec.value) return null
  return buildAiChartOption(chartSpec.value, props.columns, chartRows.value)
})

const selectedMeasureKey = computed({
  get: () => config.value?.yFields[0] ?? '',
  set: (value: string) => {
    if (!config.value || !value) return
    config.value = {...config.value, yFields: [value]}
  },
})

const selectedDimensionKey = computed({
  get: () => config.value?.xField ?? '',
  set: (value: string) => {
    if (!config.value || !value) return
    config.value = {...config.value, xField: value}
  },
})

const selectedChartType = computed({
  get: () => config.value?.chartType ?? 'bar',
  set: (value: QueryResultChartType) => {
    if (!config.value) return
    config.value = {...config.value, chartType: value}
  },
})

function resetConfig() {
  config.value = buildDefaultQueryResultChartConfig(
      props.columns,
      chartSourceRows.value,
      props.title?.trim() || t('queryResult.chart.defaultTitle'),
  )
  pivotEnabled.value = false
}

function onChartSaved(title: string) {
  layout.showSuccessToast(t('queryResult.chart.savedToDashboard', {title}))
}

watch(
    () => [props.columns, props.rows, props.title] as const,
    () => resetConfig(),
    {immediate: true},
)
</script>

<template>
  <section v-if="config" class="result-chart">
    <header class="result-chart__head">
      <div class="result-chart__controls">
        <label class="result-chart__field">
          <span class="result-chart__field-label">{{ t('queryResult.chart.dimension') }}</span>
          <DwSelect
              v-model="selectedDimensionKey"
              class="result-chart__select"
              size="compact"
              :options="dimensionOptions"
          />
        </label>
        <label class="result-chart__field">
          <span class="result-chart__field-label">{{ t('queryResult.chart.measure') }}</span>
          <DwSelect
              v-model="selectedMeasureKey"
              class="result-chart__select"
              size="compact"
              :options="measureOptions"
          />
        </label>
        <div class="dw-segment" role="tablist" :aria-label="t('queryResult.chart.type')">
          <button
              v-for="chartType in chartTypes"
              :key="chartType"
              type="button"
              class="dw-segment__btn dw-segment__btn--label"
              :class="{ 'is-active': selectedChartType === chartType }"
              role="tab"
              :aria-selected="selectedChartType === chartType"
              @click="selectedChartType = chartType"
          >
            <DwIcon
                class="result-chart__ico"
                :name="chartTypeIcons[chartType]"
                fit
                :stroke-width="1.5"
            />
            <span>{{ t(`queryResult.chart.types.${chartType}`) }}</span>
          </button>
        </div>
      </div>
      <div class="result-chart__head-actions">
        <DwCheckbox
            v-if="selectedChartType !== 'pie'"
            v-model="pivotEnabled"
            class="result-chart__chip"
            :class="{ 'is-active': pivotEnabled }"
        >
          <DwIcon class="result-chart__ico" name="layers" fit :stroke-width="1.5"/>
          <span>{{ t('queryResult.chart.pivot') }}</span>
        </DwCheckbox>
        <div class="dw-segment" role="tablist" :aria-label="t('queryResult.chart.viewMode')">
          <button
              type="button"
              class="dw-segment__btn dw-segment__btn--label"
              :class="{ 'is-active': viewMode === 'grid' }"
              role="tab"
              :aria-selected="viewMode === 'grid'"
              @click="viewMode = 'grid'"
          >
            <DwIcon class="result-chart__ico" name="table" fit :stroke-width="1.5"/>
            <span>{{ t('queryResult.chart.grid') }}</span>
          </button>
          <button
              type="button"
              class="dw-segment__btn dw-segment__btn--label"
              :class="{ 'is-active': viewMode === 'chart' }"
              role="tab"
              :aria-selected="viewMode === 'chart'"
              @click="viewMode = 'chart'"
          >
            <DwIcon class="result-chart__ico" name="chart" fit :stroke-width="1.5"/>
            <span>{{ t('queryResult.chart.chart') }}</span>
          </button>
        </div>
      </div>
    </header>

    <AiAnalysisChart v-if="chartOption" :option="chartOption"/>

    <EmptyState
        v-else
        embedded
        bordered
        :title="t('queryResult.chart.unavailable')"
    />

    <footer class="result-chart__foot">
      <span class="result-chart__meta">
        {{ t('queryResult.chart.meta', {rows: chartRows.length, columns: props.columns.length}) }}
      </span>
      <div class="result-chart__foot-actions">
        <DwButton
            variant="secondary"
            size="sm"
            type="button"
            :disabled="!chartOption"
            @click="saveDialogOpen = true"
        >
          {{ t('queryResult.chart.saveToDashboard') }}
        </DwButton>
        <DwButton variant="ghost" size="sm" type="button" @click="resetConfig">
          {{ t('queryResult.chart.reset') }}
        </DwButton>
      </div>
    </footer>

    <SaveChartToDashboardDialog
        v-if="config"
        v-model:open="saveDialogOpen"
        :columns="props.columns"
        :rows="props.rows"
        :config="config"
        :pivot-enabled="pivotEnabled"
        @saved="onChartSaved"
    />
  </section>
</template>

<style scoped>
.result-chart {
  --rc-h: 30px;
  --rc-ico: 16px;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  border-top: var(--dw-border-width) solid var(--dw-border-light);
  background: var(--dw-bg-panel);
}

.result-chart__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-space-4);
  min-height: calc(var(--rc-h) + var(--dw-space-6));
  padding: var(--dw-space-3) var(--dw-space-6);
  border-bottom: var(--dw-border-width) solid var(--dw-border-light);
  background: var(--dw-bg-muted);
}

.result-chart__controls,
.result-chart__head-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-2);
  flex-wrap: wrap;
  min-width: 0;
}

.result-chart__head-actions {
  flex-shrink: 0;
}

.result-chart__field {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-2);
  height: var(--rc-h);
  padding: 0 var(--dw-space-2) 0 var(--dw-space-3);
  border: 1px solid color-mix(in srgb, var(--dw-border-light) 85%, transparent);
  border-radius: var(--dw-btn-radius);
  background: color-mix(in srgb, var(--dw-bg) 88%, var(--dw-bg-muted));
  min-width: 0;
}

.result-chart__field-label {
  flex-shrink: 0;
  font-size: var(--dw-text-xs);
  font-weight: 600;
  color: var(--dw-text-muted);
  letter-spacing: 0.02em;
}

.result-chart__field :deep(.dw-select--compact) {
  width: auto;
  min-width: 112px;
  max-width: 180px;
}

.result-chart__field :deep(.dw-select--compact .dw-select__trigger) {
  width: 100%;
  min-width: 0;
  max-width: none;
  height: calc(var(--rc-h) - 2px);
  min-height: calc(var(--rc-h) - 2px);
  padding: 0 var(--dw-space-2) 0 var(--dw-space-1);
  border: none;
  border-radius: calc(var(--dw-btn-radius) - 1px);
  background: transparent;
  box-shadow: none;
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
  font-weight: 500;
}

.result-chart__field :deep(.dw-select--compact .dw-select__trigger:hover:not(:disabled)),
.result-chart__field :deep(.dw-select.is-open .dw-select__trigger) {
  background: color-mix(in srgb, var(--dw-primary) 8%, transparent);
  color: var(--dw-primary);
}

.result-chart__field :deep(.dw-select--compact .dw-select__chevron) {
  width: var(--dw-icon-size-sm);
  height: var(--dw-icon-size-sm);
}

.result-chart__field :deep(.dw-select--compact .dw-select__menu) {
  min-width: 160px;
}

.result-chart__chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--dw-gap-xs);
  height: var(--rc-h);
  padding: 0 var(--dw-space-3);
  border: 1px solid color-mix(in srgb, var(--dw-border-light) 85%, transparent);
  border-radius: var(--dw-btn-radius);
  background: color-mix(in srgb, var(--dw-bg) 88%, var(--dw-bg-muted));
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: var(--dw-transition-colors);
  position: relative;
  user-select: none;
}

.result-chart__chip:hover:not(.is-active) {
  color: var(--dw-primary);
  background: color-mix(in srgb, var(--dw-primary) 8%, transparent);
}

.result-chart__chip.is-active {
  border-color: color-mix(in srgb, var(--dw-primary) 28%, var(--dw-border-light));
  background: var(--dw-primary-softer);
  color: var(--dw-primary);
  font-weight: 600;
  box-shadow: none;
}

.result-chart__chip-input,
.result-chart__chip :deep(.dw-checkbox__control) {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}

.result-chart__chip :deep(.dw-checkbox__label) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--dw-gap-xs);
}

.result-chart__ico {
  display: block;
  width: var(--rc-ico);
  height: var(--rc-ico);
  flex-shrink: 0;
}

.result-chart :deep(.echarts-panel) {
  flex: 1;
  min-height: 280px;
  height: auto;
}

.result-chart__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
  padding: var(--dw-space-3) var(--dw-space-6);
  border-top: var(--dw-border-width) solid var(--dw-border-light);
  background: var(--dw-bg-muted);
}

.result-chart__foot-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  flex-shrink: 0;
}

.result-chart__meta {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}
</style>
