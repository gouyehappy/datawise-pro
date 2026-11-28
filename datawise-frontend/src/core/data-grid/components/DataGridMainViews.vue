<script setup lang="ts">
/**
 * Form / table switch inside `.grid-body` (C7).
 * Parent passes `v-bind` / `v-on` objects so multi-arg table emits stay intact.
 */
import DwDataGridTable from './DwDataGridTable.vue'
import GridRowFormView from './GridRowFormView.vue'

type FormBind = InstanceType<typeof GridRowFormView>['$props']
type TableBind = InstanceType<typeof DwDataGridTable>['$props']

defineProps<{
  layoutMode: 'grid' | 'form'
  formBind: FormBind
  formOn: Record<string, Function>
  tableBind: TableBind
  tableOn: Record<string, Function>
}>()
</script>

<template>
  <GridRowFormView
      v-if="layoutMode === 'form'"
      v-bind="formBind"
      v-on="formOn"
  />
  <DwDataGridTable
      v-else
      v-bind="tableBind"
      v-on="tableOn"
  />
</template>
