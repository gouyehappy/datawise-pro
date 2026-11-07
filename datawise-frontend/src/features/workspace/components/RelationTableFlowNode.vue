<script setup lang="ts">
import {DwErTableNode, type DwErTableColumn} from '@/core/graph-canvas'

defineProps<{
  data: {
    tableName: string
    roleLabel: string
    role: string
    columns: DwErTableColumn[]
  }
  selected?: boolean
}>()
</script>

<template>
  <DwErTableNode
      :title="data.tableName"
      :role-label="data.roleLabel"
      :columns="data.columns"
      :accent="data.role === 'center'"
      :selected="selected"
      :max-rows="14"
  />
</template>
