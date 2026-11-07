<script setup lang="ts">
/**
 * Host thin wrapper — maps vue-i18n into package `labels` props.
 * Canonical UI: `@datawise/data-grid` `GridCellDetailDialog`.
 */
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {
  GridCellDetailDialog as PkgGridCellDetailDialog,
  type GridCellDetailLabels,
  type GridCellEditorKind,
} from '@datawise/data-grid'

const props = withDefaults(
  defineProps<{
    open: boolean
    columnName: string
    rowLabel: string
    content: string
    title?: string
    editable?: boolean
    editorKind?: GridCellEditorKind
  }>(),
  {
    editable: false,
    editorKind: 'longText',
  },
)

const emit = defineEmits<{
  close: []
  apply: [value: string]
}>()

const {t} = useI18n()

const labels = computed<Partial<GridCellDetailLabels>>(() => ({
  titleTemplate: t('dataGrid.cellDetailTitle'),
  copy: t('dataGrid.cellDetailCopy'),
  copied: t('dataGrid.cellDetailCopied'),
  chars: t('dataGrid.cellDetailChars'),
  bytes: t('dataGrid.cellDetailBytes'),
  close: t('common.close'),
  nullValue: t('common.nullValue'),
  apply: t('dataGrid.cellEditor.apply'),
  formatJson: t('dataGrid.cellEditor.formatJson'),
  invalidJson: t('dataGrid.cellEditor.invalidJson'),
  binaryHint: t('dataGrid.cellEditor.binaryHint'),
  binaryHex: t('dataGrid.cellEditor.binaryHex'),
  binaryImage: t('dataGrid.cellEditor.binaryImage'),
  binaryRaw: t('dataGrid.cellEditor.binaryRaw'),
  binaryImageAlt: t('dataGrid.cellEditor.binaryImageAlt'),
}))
</script>

<template>
  <PkgGridCellDetailDialog
      :open="props.open"
      :column-name="props.columnName"
      :row-label="props.rowLabel"
      :content="props.content"
      :title="props.title"
      :editable="props.editable"
      :editor-kind="props.editorKind"
      :labels="labels"
      @close="emit('close')"
      @apply="emit('apply', $event)"
  />
</template>
