<script setup lang="ts">
/**
 * DataGrid full-toolbar trailing actions: edit DML, generate-DML/export tools, load-more.
 * Extracted from DataGrid.vue to shrink the host facade (C7).
 */
import IconButton from '@/core/components/IconButton.vue'
import {DwIcon} from '@/core/icons'

defineProps<{
  loadedRowsWarning: boolean
  loadedRowsCount: number
  cursorWindowTrimmed: boolean
  cursorTrimmedRows?: number | null
  productionPerfActive: boolean
  truncatedAtCap: boolean
  truncatedCapRows?: number
  editable: boolean
  submitActionTitle: string
  submitEnabled: boolean
  discardActionTitle: string
  discardEnabled: boolean
  deleteActionTitle: string
  deleteEnabled: boolean
  inlineEnabled: boolean
  readOnlyHint?: string
  showDmlActions: boolean
  exportEnabled: boolean
  showExport: boolean
  hasMore: boolean
  canRaiseMaxRows: boolean
  cursorLoading: boolean
}>()

const emit = defineEmits<{
  submit: []
  discard: []
  'add-row': []
  'delete-row': []
  'generate-dml': []
  export: []
  'raise-max-rows': []
  'load-more': []
}>()
</script>

<template>
  <span v-if="loadedRowsWarning" class="loaded-rows-hint">
    {{ $t('dataGrid.loadedRowsWarning', {count: loadedRowsCount}) }}
  </span>
  <span v-if="cursorWindowTrimmed" class="loaded-rows-hint">
    {{ $t('dataGrid.cursorWindowTrimmed', {count: cursorTrimmedRows ?? 0}) }}
  </span>
  <span v-if="productionPerfActive" class="loaded-rows-hint">
    {{ $t('dataGrid.productionPerfActive') }}
  </span>
  <span v-if="truncatedAtCap" class="loaded-rows-hint loaded-rows-hint--warn" role="status">
    {{
      truncatedCapRows
        ? $t('dataGrid.truncatedAtCapWithLimit', {count: loadedRowsCount, limit: truncatedCapRows})
        : $t('dataGrid.truncatedAtCap', {count: loadedRowsCount})
    }}
  </span>
  <div v-if="editable" class="grid-toolbar-group" role="group" :aria-label="$t('dataGrid.editGroup')">
    <IconButton
        class="grid-action-save"
        :title="submitActionTitle"
        :disabled="!submitEnabled"
        @click="emit('submit')"
    >
      <DwIcon class="grid-glyph" name="submit" fit :stroke-width="3.2"/>
    </IconButton>
    <IconButton
        class="grid-action-cancel"
        :title="discardActionTitle"
        :disabled="!discardEnabled"
        @click="emit('discard')"
    >
      <DwIcon class="grid-glyph" name="rollback" fit :stroke-width="3.2"/>
    </IconButton>
    <IconButton class="grid-action-neutral" :title="$t('dataGrid.addRow')" @click="emit('add-row')">
      <DwIcon class="grid-glyph" name="plus" fit :stroke-width="3.2"/>
    </IconButton>
    <IconButton
        class="grid-action-neutral"
        :title="deleteActionTitle"
        :disabled="!deleteEnabled"
        @click="emit('delete-row')"
    >
      <DwIcon class="grid-glyph" name="minus" fit :stroke-width="3.2"/>
    </IconButton>
    <span
        v-if="inlineEnabled"
        class="grid-hint-tip"
        :title="$t('dataGrid.editHint')"
        :aria-label="$t('dataGrid.editHint')"
    >
      <DwIcon class="grid-glyph" name="help" fit :stroke-width="1.5"/>
    </span>
  </div>
  <span
      v-if="readOnlyHint && !editable"
      class="grid-hint-tip"
      :title="readOnlyHint"
      :aria-label="readOnlyHint"
  >
    <DwIcon class="grid-glyph" name="help" fit :stroke-width="1.5"/>
  </span>
  <div
      v-if="showDmlActions || $slots['toolbar-extra'] || (exportEnabled && showExport) || $slots['toolbar-tail']"
      class="grid-toolbar-group"
      role="group"
      :aria-label="$t('dataGrid.toolsGroup')"
  >
    <slot name="toolbar-extra"/>
    <button
        v-if="showDmlActions"
        type="button"
        class="grid-label-btn"
        :title="$t('dataGrid.generateDmlSelectedHint')"
        @click="emit('generate-dml')"
    >
      <DwIcon class="grid-glyph" name="ddl" fit :stroke-width="1.75"/>
      <span>{{ $t('dataGrid.generateDml') }}</span>
    </button>
    <button
        v-if="exportEnabled && showExport"
        type="button"
        class="grid-label-btn"
        @click="emit('export')"
    >
      <DwIcon class="grid-glyph" name="export" fit :stroke-width="1.75"/>
      <span>{{ $t('dataGrid.export') }}</span>
    </button>
    <slot name="toolbar-tail"/>
  </div>
  <div
      v-if="(hasMore && !truncatedAtCap) || (truncatedAtCap && canRaiseMaxRows)"
      class="grid-toolbar-group"
      role="group"
      :aria-label="$t('dataGrid.loadGroup')"
  >
    <button
        v-if="truncatedAtCap && canRaiseMaxRows"
        type="button"
        class="grid-label-btn"
        @click="emit('raise-max-rows')"
    >
      <DwIcon class="grid-glyph" name="arrow-up-down" fit :stroke-width="1.5"/>
      <span>{{ $t('dataGrid.raiseMaxRows') }}</span>
    </button>
    <button
        v-if="hasMore && !truncatedAtCap"
        type="button"
        class="grid-label-btn"
        :disabled="cursorLoading"
        @click="emit('load-more')"
    >
      <DwIcon
          class="grid-glyph"
          :class="{ 'grid-glyph--spin': cursorLoading }"
          :name="cursorLoading ? 'refresh' : 'chevrons-down'"
          fit
          :stroke-width="1.5"
      />
      <span>{{ cursorLoading ? $t('dataGrid.loadingMore') : $t('dataGrid.loadMore') }}</span>
    </button>
  </div>
</template>

<style scoped src="./styles/data-grid-facade.css"></style>
