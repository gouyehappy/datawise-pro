<script setup lang="ts">
import {Handle, Position} from '@vue-flow/core'
import {DwGraphNodeShell} from '@/core/graph-canvas'

defineProps<{
  data: {
    kind: 'from' | 'join'
    joinIndex?: number
    table: string
    alias: string
    roleLabel: string
    selected?: boolean
  }
  selected?: boolean
}>()
</script>

<template>
  <DwGraphNodeShell
      :title="data.table"
      :subtitle="data.alias"
      :badge="data.roleLabel"
      :accent="data.kind === 'from'"
      :selected="Boolean(selected || data.selected)"
      :width="168"
  >
    <template #handles>
      <Handle id="in" type="target" :position="Position.Left" class="vqb-handle"/>
      <Handle id="out" type="source" :position="Position.Right" class="vqb-handle"/>
    </template>
  </DwGraphNodeShell>
</template>

<style scoped>
.vqb-handle {
  width: 8px !important;
  height: 8px !important;
  background: var(--dw-bg-panel) !important;
  border: 1px solid var(--dw-border) !important;
}
</style>
