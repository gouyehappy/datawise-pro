<script setup lang="ts">
/**
 * Host thin wrapper — maps vue-i18n + TableColumn into package props.
 * Canonical UI: `@datawise/data-grid` `GridExportDialog`.
 */
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import type {TableColumn} from '@/core/types'
import {
  GridExportDialog as PkgGridExportDialog,
  type ExportColumn,
  type GridExportDialogLabels,
  type GridExportFormat,
  type GridExportMaskConfig,
} from '@datawise/data-grid'

const props = withDefaults(
  defineProps<{
    open: boolean
    columns: TableColumn[]
    suggestMask?: boolean
    maskExportEnabled?: boolean
    exporting?: boolean
    /** Result hit a hard row cap (federated JOIN / maxRows) — export is incomplete. */
    truncatedAtCap?: boolean
    /** Optional project label for production mask hint. */
    projectName?: string
  }>(),
  {
    projectName: '',
  },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  export: [payload: {format: GridExportFormat; mask?: GridExportMaskConfig; incomplete?: boolean}]
}>()

const {t} = useI18n()

const exportColumns = computed<ExportColumn[]>(() =>
  props.columns.map((column) => ({name: column.name})),
)

const labels = computed<Partial<GridExportDialogLabels>>(() => ({
  title: t('dataGrid.exportDialog.title'),
  subtitle: t('dataGrid.exportDialog.subtitle'),
  format: t('dataGrid.exportDialog.format'),
  truncatedWarning: t('dataGrid.exportDialog.truncatedWarning'),
  export: t('dataGrid.exportDialog.export'),
  exporting: t('dataGrid.exportDialog.exporting'),
  cancel: t('common.cancel'),
  maskTitle: t('dataGrid.exportMask.title'),
  maskDescription: t('dataGrid.exportMask.description'),
  maskProdHint: t('dataGrid.exportMask.prodHint'),
  maskEnable: t('dataGrid.exportMask.enable'),
  maskColumns: t('dataGrid.exportMask.columns'),
  maskSelectedCount: t('dataGrid.exportMask.selectedCount'),
  formatCsv: t('dataGrid.exportFormats.csv'),
  formatXlsx: t('dataGrid.exportFormats.xlsx'),
  formatJson: t('dataGrid.exportFormats.json'),
  formatTsv: t('dataGrid.exportFormats.tsv'),
  formatSql: t('dataGrid.exportFormats.sql'),
  templatePhone: t('dataGrid.exportMask.templates.phone'),
  templateEmail: t('dataGrid.exportMask.templates.email'),
  templateIdCard: t('dataGrid.exportMask.templates.idCard'),
}))
</script>

<template>
  <PkgGridExportDialog
      :open="props.open"
      :columns="exportColumns"
      :suggest-mask="props.suggestMask"
      :mask-export-enabled="props.maskExportEnabled"
      :exporting="props.exporting"
      :truncated-at-cap="props.truncatedAtCap"
      :project-name="props.projectName"
      :labels="labels"
      @update:open="emit('update:open', $event)"
      @export="emit('export', $event)"
  />
</template>
