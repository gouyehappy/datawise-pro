<script setup lang="ts">
/**
 * DataGrid leading toolbar actions: solo pager, wrap/form toggles, refresh.
 * Pair with DataGridToolbarEnd (C7).
 */
import IconButton from '@/core/components/IconButton.vue'
import {DwIcon} from '@/core/icons'

defineProps<{
  fullToolbar: boolean
  externalViewOptions: boolean
  wrapCells: boolean
  layoutMode: 'grid' | 'form'
  loading: boolean
  hasFilteredRows: boolean
  currentPage: number
  displayTotal: number
}>()

const emit = defineEmits<{
  'toggle-wrap': []
  'toggle-layout': []
  refresh: []
}>()
</script>

<template>
  <template v-if="!fullToolbar">
    <span class="page-indicator page-indicator--solo">{{ currentPage }}</span>
    <span class="pager-total">{{ $t('dataGrid.total', {count: displayTotal}) }}</span>
  </template>
  <IconButton
      v-if="!externalViewOptions"
      class="grid-action-neutral"
      :active="wrapCells"
      :title="wrapCells ? $t('dataGrid.unwrapCells') : $t('dataGrid.wrapCells')"
      @click="emit('toggle-wrap')"
  >
    <DwIcon class="grid-glyph" name="format" fit :stroke-width="1.75"/>
  </IconButton>
  <IconButton
      v-if="!externalViewOptions && fullToolbar && hasFilteredRows"
      class="grid-action-neutral"
      :active="layoutMode === 'form'"
      :title="layoutMode === 'form' ? $t('dataGrid.formView.showGrid') : $t('dataGrid.formView.showForm')"
      @click="emit('toggle-layout')"
  >
    <DwIcon class="grid-glyph" name="table" fit :stroke-width="1.75"/>
  </IconButton>
  <template v-if="fullToolbar">
    <IconButton
        class="grid-action-neutral"
        :title="$t('dataGrid.refresh')"
        :disabled="loading"
        @click="emit('refresh')"
    >
      <DwIcon class="grid-glyph" name="refresh" fit :stroke-width="1.75"/>
    </IconButton>
  </template>
</template>

<style scoped src="./styles/data-grid-facade.css"></style>
