<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/chrome` ResizableTable. */
import {
  ResizableTable as PackageResizableTable,
  type ResizableColumnDef,
} from '@datawise/chrome'

export type {ResizableColumnDef}

withDefaults(
  defineProps<{
    columns: ResizableColumnDef[]
    storageKey?: string
    tableClass?: string
  }>(),
  {tableClass: ''},
)
</script>

<template>
  <PackageResizableTable
      :columns="columns"
      :storage-key="storageKey"
      :table-class="tableClass"
  >
    <slot/>
  </PackageResizableTable>
</template>
