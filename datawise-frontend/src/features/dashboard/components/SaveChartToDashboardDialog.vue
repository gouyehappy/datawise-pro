<script setup lang="ts">
import {computed, ref, toRef, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwButton, DwInlineAlert, DwSelect, DwInput, FormField} from '@/core/components'
import type {SelectOption} from '@/core/components/select.types'
import type {TableColumn, TableRow} from '@/core/types'
import AiAnalysisChart from '@/shared/charts/EchartsPanel.vue'
import {buildChartOption as buildAiChartOption} from '@/shared/charts/build-chart-option'
import {useModalFeedback} from '@/core/composables/useModalFeedback'
import {
    addDashboardChartWidget,
    createDashboardChartWidget,
    type DashboardChartWidgetColumn,
} from '@/features/dashboard/services/dashboard-chart-widget.service'
import {asDashboardPreferences} from '@/features/dashboard/services/dashboard-widget.service'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {
    pivotQueryResultRows,
    toAiChartSpec,
    type QueryResultChartConfig,
} from '@/features/workspace/services/query-result-chart.service'

const props = defineProps<{
  open: boolean
  columns: TableColumn[]
  rows: TableRow[]
  config: QueryResultChartConfig
  pivotEnabled: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  saved: [title: string]
}>()

const {t} = useI18n()
const appConfig = useAppConfigStore()
const {feedback, showError, clearFeedback} = useModalFeedback(toRef(props, 'open'))

const title = ref('')
const column = ref<DashboardChartWidgetColumn>('main')

const columnOptions = computed<SelectOption[]>(() => ([
    {value: 'left', label: t('dashboard.layoutDialog.columns.left')},
    {value: 'main', label: t('dashboard.layoutDialog.columns.main')},
    {value: 'right', label: t('dashboard.layoutDialog.columns.right')},
] as const))

const previewRows = computed(() => {
  if (!props.pivotEnabled) return props.rows
  return pivotQueryResultRows(props.rows, props.config.xField, props.config.yFields)
})

const previewOption = computed(() => {
  const spec = toAiChartSpec(props.config, props.columns)
  return buildAiChartOption(spec, props.columns, previewRows.value)
})

watch(
    () => props.open,
    (open) => {
        if (!open) return
        title.value = props.config.title.trim()
        column.value = 'main'
        clearFeedback()
    },
)

function close() {
  emit('update:open', false)
}

function save() {
  const trimmed = title.value.trim()
  if (!trimmed) {
    showError(t('dashboard.savedChart.titleRequired'))
    return
  }
  const widget = createDashboardChartWidget({
    title: trimmed,
    column: column.value,
    config: props.config,
    pivotEnabled: props.pivotEnabled,
    columns: props.columns,
    rows: props.rows,
  })
  appConfig.patchDashboardPreferences(
      addDashboardChartWidget(asDashboardPreferences(appConfig.dashboardPreferences), widget),
  )
  close()
  emit('saved', trimmed)
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('dashboard.savedChart.saveTitle')"
      :subtitle="t('dashboard.savedChart.saveSubtitle')"
      width="640px"
      max-height="85vh"
      @close="close"
  >
    <div class="modal-form">
      <DwInlineAlert
          v-if="feedback"
          density="banner"
          :variant="feedback.variant"
          :message="feedback.message"
      />

      <FormField :label="t('dashboard.savedChart.titleLabel')">
        <DwInput
            v-model="title"
            type="text"
            :placeholder="t('dashboard.savedChart.titlePlaceholder')"
        />
      </FormField>

      <FormField :label="t('dashboard.savedChart.columnLabel')">
        <DwSelect v-model="column" size="sm" :options="columnOptions"/>
      </FormField>

      <section class="modal-preview-section">
        <h3 class="modal-preview-section__title">{{ t('dashboard.savedChart.preview') }}</h3>
        <div class="saved-chart-preview">
          <AiAnalysisChart v-if="previewOption" :option="previewOption"/>
        </div>
        <p class="modal-body-hint">{{ t('dashboard.savedChart.snapshotNote') }}</p>
      </section>
    </div>

    <template #footer>
      <DwButton variant="secondary" type="button" @click="close">
        {{ t('common.cancel') }}
      </DwButton>
      <DwButton variant="primary" type="button" @click="save">
        {{ t('dashboard.savedChart.saveAction') }}
      </DwButton>
    </template>
  </AppModal>
</template>

<style scoped>
.saved-chart-preview {
  min-height: 260px;
  padding: var(--dw-space-4);
  border: 1px solid var(--dw-panel-outline, var(--dw-border-light));
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-panel);
}

.saved-chart-preview :deep(.echarts-panel) {
  min-height: 220px;
  height: 240px;
}
</style>
