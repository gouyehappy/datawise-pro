<script setup lang="ts">
/**
 * Presentational export dialog — masking toggles via props; no host entitlement / i18n.
 */
import {computed, ref, watch} from 'vue'
import {AppModal, ModalActions} from '@datawise/overlays'
import {CollapsibleSection} from '@datawise/chrome'
import {DwCheckbox, DwSelect, useDwI18n, type SelectOption} from '@datawise/ui'
import {
  createDefaultExportMaskConfig,
  type DataMaskTemplate,
  type ExportColumn,
  type ExportColumnMaskRule,
  type GridExportMaskConfig,
} from '../services/data-masking.service'
import {
  DEFAULT_GRID_EXPORT_DIALOG_LABELS,
  formatGridExportLabel,
  type GridExportDialogLabels,
  type GridExportFormat,
} from './grid-export-dialog.types'

const props = withDefaults(
  defineProps<{
    open: boolean
    columns: ExportColumn[]
    /** Host entitlement / feature flag — when false, hide mask section. */
    maskExportEnabled?: boolean
    /** When true, pre-enable guessed sensitive columns. */
    suggestMask?: boolean
    /**
     * Optional host override for default mask rules.
     * Defaults to package `createDefaultExportMaskConfig`.
     */
    createDefaultMaskConfig?: (
      columns: readonly ExportColumn[],
      suggestMask: boolean,
    ) => GridExportMaskConfig
    exporting?: boolean
    /** Result hit a hard row cap — export is incomplete. */
    truncatedAtCap?: boolean
    /** Optional project label for production mask hint. */
    projectName?: string
    labels?: Partial<GridExportDialogLabels>
  }>(),
  {
    projectName: '',
    maskExportEnabled: true,
    suggestMask: false,
    exporting: false,
    truncatedAtCap: false,
  },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  export: [payload: {format: GridExportFormat; mask?: GridExportMaskConfig; incomplete?: boolean}]
}>()

const t = useDwI18n()

const labels = computed<GridExportDialogLabels>(() => ({
  ...DEFAULT_GRID_EXPORT_DIALOG_LABELS,
  cancel: t('common.cancel'),
  ...props.labels,
}))

const projectName = computed(() => props.projectName.trim() || 'project')

const EXPORT_FORMATS: GridExportFormat[] = ['csv', 'xlsx', 'json', 'tsv', 'sql']

const format = ref<GridExportFormat>('csv')
const maskEnabled = ref(false)
const columnRules = ref<ExportColumnMaskRule[]>([])

const formatOptions = computed<SelectOption[]>(() => {
  const map: Record<GridExportFormat, string> = {
    csv: labels.value.formatCsv,
    xlsx: labels.value.formatXlsx,
    json: labels.value.formatJson,
    tsv: labels.value.formatTsv,
    sql: labels.value.formatSql,
  }
  return EXPORT_FORMATS.map((item) => ({
    value: item,
    label: map[item],
  }))
})

const templateOptions = computed<SelectOption[]>(() => [
  {value: 'phone', label: labels.value.templatePhone},
  {value: 'email', label: labels.value.templateEmail},
  {value: 'idCard', label: labels.value.templateIdCard},
])

const enabledColumnCount = computed(() => columnRules.value.filter((rule) => rule.enabled).length)

const showMaskSection = computed(() => props.maskExportEnabled !== false)

const canExport = computed(() => props.columns.length > 0 && !props.exporting)

const prodHint = computed(() =>
  formatGridExportLabel(labels.value.maskProdHint, {project: projectName.value}),
)

const selectedCountLabel = computed(() =>
  formatGridExportLabel(labels.value.maskSelectedCount, {count: enabledColumnCount.value}),
)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    format.value = 'csv'
    const factory = props.createDefaultMaskConfig ?? createDefaultExportMaskConfig
    const defaults = factory(props.columns, showMaskSection.value && (props.suggestMask ?? false))
    maskEnabled.value = defaults.enabled
    columnRules.value = defaults.columns.map((rule) => ({...rule}))
  },
)

function close() {
  emit('update:open', false)
}

function toggleColumnRule(columnName: string, checked: boolean) {
  columnRules.value = columnRules.value.map((rule) =>
    rule.columnName === columnName ? {...rule, enabled: checked} : rule,
  )
}

function updateColumnTemplate(columnName: string, template: DataMaskTemplate) {
  columnRules.value = columnRules.value.map((rule) =>
    rule.columnName === columnName ? {...rule, template} : rule,
  )
}

function submit() {
  if (!canExport.value) return
  const mask: GridExportMaskConfig | undefined = maskEnabled.value
    ? {
        enabled: true,
        columns: columnRules.value.map((rule) => ({...rule})),
      }
    : undefined
  emit('export', {
    format: format.value,
    mask,
    incomplete: props.truncatedAtCap === true,
  })
  close()
}
</script>

<template>
  <AppModal
      :open="open"
      :title="labels.title"
      :subtitle="labels.subtitle"
      width="560px"
      @close="close"
  >
    <label class="export-dialog__field">
      <span>{{ labels.format }}</span>
      <DwSelect v-model="format" size="sm" :options="formatOptions"/>
    </label>

    <p v-if="truncatedAtCap" class="export-dialog__warn" role="status">
      {{ labels.truncatedWarning }}
    </p>

    <CollapsibleSection
        v-if="showMaskSection"
        :title="labels.maskTitle"
        :description="labels.maskDescription"
        :default-open="suggestMask"
        joined="single"
    >
      <p v-if="suggestMask" class="export-dialog__warn">{{ prodHint }}</p>

      <DwCheckbox v-model="maskEnabled" class="export-dialog__check-toggle">
        {{ labels.maskEnable }}
      </DwCheckbox>

      <div v-if="maskEnabled" class="export-dialog__check-list">
        <header class="export-dialog__check-list-head">
          <span>{{ labels.maskColumns }}</span>
          <span>{{ selectedCountLabel }}</span>
        </header>
        <ul class="export-dialog__check-list-items">
          <li v-for="rule in columnRules" :key="rule.columnName">
            <DwCheckbox
                class="export-dialog__check-row"
                :model-value="rule.enabled"
                @update:model-value="toggleColumnRule(rule.columnName, $event)"
            >
              <span class="export-dialog__check-row-name">{{ rule.columnName }}</span>
            </DwCheckbox>
            <DwSelect
                :model-value="rule.template"
                size="sm"
                :disabled="!rule.enabled"
                :options="templateOptions"
                @update:model-value="updateColumnTemplate(rule.columnName, $event as DataMaskTemplate)"
            />
          </li>
        </ul>
      </div>
    </CollapsibleSection>

    <template #footer>
      <ModalActions
          :cancel-label="labels.cancel"
          :confirm-label="exporting ? labels.exporting : labels.export"
          :confirm-disabled="!canExport"
          @cancel="close"
          @confirm="submit"
      />
    </template>
  </AppModal>
</template>

<style scoped>
.export-dialog__field {
  display: grid;
  gap: var(--dw-gap-sm);
  margin-bottom: clamp(10px, 1.2vmin, 12px);
  font-size: var(--dw-text-xs);
  color: var(--dw-text-secondary);
}

.export-dialog__field :deep(.dw-select) {
  width: 100%;
}

.export-dialog__warn {
  margin: 0 0 var(--dw-gap);
  padding: var(--dw-pad-control-lg);
  border-radius: var(--dw-panel-radius);
  border: 1px solid color-mix(in srgb, var(--dw-warning) 24%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-warning) 8%, var(--dw-bg));
  font-size: var(--dw-text-md);
  line-height: var(--dw-leading);
  color: var(--dw-text-secondary);
}

.export-dialog__check-toggle {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
  font-size: var(--dw-text-md);
}

.export-dialog__check-list {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
  margin-top: var(--dw-gap);
}

.export-dialog__check-list-head {
  display: flex;
  justify-content: space-between;
  gap: var(--dw-gap);
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.export-dialog__check-list-items {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 220px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
}

.export-dialog__check-list-items li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 160px;
  gap: var(--dw-gap);
  align-items: center;
}

.export-dialog__check-row {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
  min-width: 0;
  font-size: var(--dw-text-xs);
}

.export-dialog__check-row-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
