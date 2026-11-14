<script setup lang="ts">
/**
 * Form / table switch inside `.grid-body` (C7).
 * Parent passes `v-bind` / `v-on` objects so multi-arg table emits stay intact.
 */
import DwDataGridTable from './DwDataGridTable.vue'
import GridRowFormView from './GridRowFormView.vue'

defineProps<{
  layoutMode: 'grid' | 'form'
  /** Opaque bind bag from DataGrid (keeps DwDataGridTable prop surface out of the facade). */
  formBind: object
  formOn: Record<string, Function>
  tableBind: object
  tableOn: Record<string, Function>
}>()
</script>

<template>
  <GridRowFormView
      v-if="layoutMode === 'form'"
      v-bind="formBind as any"
      v-on="formOn"
  />
  <DwDataGridTable
      v-else
      v-bind="tableBind as any"
      v-on="tableOn"
  />
</template>
