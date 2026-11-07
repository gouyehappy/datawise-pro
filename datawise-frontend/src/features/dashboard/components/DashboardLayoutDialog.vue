<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwButton, DwCheckbox, DwSelect, EmptyState} from '@/core/components'
import type {SelectOption} from '@/core/components/select.types'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {
    createDefaultDashboardPreferences,
    reorderWidgetInColumn,
    setWidgetColumn,
    setWidgetVisibility,
    widgetsForColumn,
    type DashboardPreferences,
    type DashboardWidgetColumn,
    type DashboardWidgetConfig,
    type DashboardWidgetId,
} from '@/features/dashboard/services/dashboard-widget.service'
import {
    normalizeChartWidgets,
    setChartWidgetColumn,
    setChartWidgetVisibility,
    type DashboardChartWidget,
} from '@/features/dashboard/services/dashboard-chart-widget.service'

const props = defineProps<{
    open: boolean
}>()

const emit = defineEmits<{
    'update:open': [value: boolean]
}>()

const {t} = useI18n()
const appConfig = useAppConfigStore()

const draft = ref<DashboardPreferences>(createDefaultDashboardPreferences())
const dragColumn = ref<DashboardWidgetColumn | null>(null)
const dragIndex = ref<number | null>(null)

const columns: DashboardWidgetColumn[] = ['left', 'main', 'right']

const columnOptions = computed<SelectOption[]>(() =>
    columns.map((col) => ({
      value: col,
      label: t(`dashboard.layoutDialog.columns.${col}`),
    })),
)

watch(
    () => props.open,
    (isOpen) => {
        if (!isOpen) return
        draft.value = {
            widgets: appConfig.dashboardPreferences.widgets.map((widget: DashboardWidgetConfig) => ({...widget})),
            chartWidgets: normalizeChartWidgets(appConfig.dashboardPreferences.chartWidgets).map((widget) => ({
                ...widget,
                config: {...widget.config, yFields: [...widget.config.yFields]},
                columns: widget.columns.map((column) => ({...column})),
                rows: widget.rows.map((row) => ({...row})),
            })),
        }
    },
    {immediate: true},
)

function close() {
    emit('update:open', false)
}

function save() {
    appConfig.patchDashboardPreferences({
        widgets: draft.value.widgets,
        chartWidgets: draft.value.chartWidgets,
    })
    close()
}

function resetDefaults() {
    draft.value = {
        ...createDefaultDashboardPreferences(),
        chartWidgets: draft.value.chartWidgets,
    }
}

function chartWidgetsForLayoutColumn(column: DashboardWidgetColumn): DashboardChartWidget[] {
    return draft.value.chartWidgets.filter((widget) => widget.column === column)
}

function toggleChartVisible(id: string, visible: boolean) {
    draft.value = setChartWidgetVisibility(draft.value, id, visible)
}

function onChartColumnChange(id: string, column: DashboardWidgetColumn) {
    draft.value = setChartWidgetColumn(draft.value, id, column)
}

function columnWidgets(column: DashboardWidgetColumn): DashboardWidgetConfig[] {
    return widgetsForColumn(draft.value, column)
}

function allColumnWidgets(column: DashboardWidgetColumn): DashboardWidgetConfig[] {
    return draft.value.widgets.filter((widget) => widget.column === column)
}

function widgetLabel(id: DashboardWidgetId): string {
    return t(`dashboard.widgets.${id}`)
}

function toggleVisible(id: DashboardWidgetId, visible: boolean) {
    draft.value = setWidgetVisibility(draft.value, id, visible)
}

function onColumnChange(id: DashboardWidgetId, column: DashboardWidgetColumn) {
    draft.value = setWidgetColumn(draft.value, id, column)
}

function onDragStart(column: DashboardWidgetColumn, index: number) {
    dragColumn.value = column
    dragIndex.value = index
}

function onDrop(column: DashboardWidgetColumn, index: number) {
    if (dragColumn.value !== column || dragIndex.value == null) return
    draft.value = reorderWidgetInColumn(draft.value, column, dragIndex.value, index)
    dragColumn.value = null
    dragIndex.value = null
}

function onDragEnd() {
    dragColumn.value = null
    dragIndex.value = null
}

const hasHiddenWidgets = computed(() =>
    draft.value.widgets.some((widget) => !widget.visible)
        || draft.value.chartWidgets.some((widget) => !widget.visible),
)
const hasSavedCharts = computed(() => draft.value.chartWidgets.length > 0)
</script>

<template>
  <AppModal
      :open="open"
      :title="t('dashboard.layoutDialog.title')"
      :subtitle="t('dashboard.layoutDialog.subtitle')"
      width="560px"
      @close="close"
  >
    <div class="modal-sort-editor">
      <p v-if="hasHiddenWidgets" class="modal-body-hint">
        {{ t('dashboard.layoutDialog.hiddenHint') }}
      </p>

      <section
          v-for="column in columns"
          :key="column"
          class="modal-sort-section"
      >
        <h3 class="modal-sort-section__title">
          {{ t(`dashboard.layoutDialog.columns.${column}`) }}
        </h3>
        <EmptyState
            v-if="!columnWidgets(column).length"
            embedded
            compact
            :title="t('dashboard.layoutDialog.emptyColumn')"
        />
        <ul class="modal-sort-list">
          <li
              v-for="(widget, index) in allColumnWidgets(column)"
              :key="widget.id"
              class="modal-sort-item"
              :class="{
                'is-hidden': !widget.visible,
                'is-dragging': dragColumn === column && dragIndex === index,
              }"
              draggable="true"
              @dragstart="onDragStart(column, index)"
              @dragover.prevent
              @drop="onDrop(column, index)"
              @dragend="onDragEnd"
          >
            <span class="modal-sort-item__handle" aria-hidden="true">⋮⋮</span>
            <DwCheckbox
                class="modal-sort-item__label"
                :model-value="widget.visible"
                @update:model-value="toggleVisible(widget.id, $event)"
            >
              {{ widgetLabel(widget.id) }}
            </DwCheckbox>
            <DwSelect
                :model-value="widget.column"
                size="sm"
                :options="columnOptions"
                @update:model-value="onColumnChange(widget.id, $event as DashboardWidgetColumn)"
            />
          </li>
        </ul>

        <ul v-if="chartWidgetsForLayoutColumn(column).length" class="modal-sort-list modal-sort-list--charts">
          <li
              v-for="chartWidget in chartWidgetsForLayoutColumn(column)"
              :key="chartWidget.id"
              class="modal-sort-item"
              :class="{'is-hidden': !chartWidget.visible}"
          >
            <span class="modal-sort-item__handle modal-sort-item__handle--static" aria-hidden="true">▦</span>
            <DwCheckbox
                class="modal-sort-item__label"
                :model-value="chartWidget.visible"
                @update:model-value="toggleChartVisible(chartWidget.id, $event)"
            >
              {{ chartWidget.title }}
            </DwCheckbox>
            <DwSelect
                :model-value="chartWidget.column"
                size="sm"
                :options="columnOptions"
                @update:model-value="onChartColumnChange(chartWidget.id, $event as DashboardWidgetColumn)"
            />
          </li>
        </ul>
      </section>

      <section v-if="hasSavedCharts" class="modal-sort-section modal-sort-section--hint">
        <p class="modal-body-hint">{{ t('dashboard.layoutDialog.savedChartsHint') }}</p>
      </section>
    </div>

    <template #footer>
      <DwButton variant="ghost" type="button" @click="resetDefaults">
        {{ t('dashboard.layoutDialog.reset') }}
      </DwButton>
      <DwButton variant="secondary" type="button" @click="close">
        {{ t('common.cancel') }}
      </DwButton>
      <DwButton variant="primary" type="button" @click="save">
        {{ t('common.save') }}
      </DwButton>
    </template>
  </AppModal>
</template>
